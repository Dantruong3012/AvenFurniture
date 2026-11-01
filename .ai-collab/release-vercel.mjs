const shaPattern = /^[a-f0-9]{40}$/;
const idPattern = /^prj_[A-Za-z0-9]+$/;
const teamPattern = /^team_[A-Za-z0-9]+$/;
const deploymentPattern = /^dpl_[A-Za-z0-9]+$/;
const isGitPreview = (item) => item && item.source === 'git' &&
  Object.hasOwn(item, 'target') && (item.target === null || item.target === 'preview') &&
  !item.customEnvironment;

export function validateVercelConfig(config) {
  if (!config || !idPattern.test(config.vercelProjectId ?? '') ||
    (config.vercelTeamId && !teamPattern.test(config.vercelTeamId)) ||
    config.productionBranch !== 'main' || config.developmentBranch === config.productionBranch ||
    !Number.isInteger(config.previewTimeoutMs) || config.previewTimeoutMs < 1000 || config.previewTimeoutMs > 3600000 ||
    !Number.isInteger(config.previewPollIntervalMs) || config.previewPollIntervalMs < 100 || config.previewPollIntervalMs > 60000) {
    throw new Error('Invalid Vercel preview policy');
  }
  return config;
}

export function createVercelClient({ token, projectId, teamId, timeoutMs = 60000, fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now = () => Date.now() }) {
  if (typeof token !== 'string' || !token.trim() || !idPattern.test(projectId) ||
    (teamId && !teamPattern.test(teamId)) || !Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 300000) {
    throw new Error('Vercel client configuration is incomplete');
  }
  const base = 'https://api.vercel.com';
  async function get(path, params = {}, deadline = now() + timeoutMs) {
    const url = new URL(path, base);
    if (teamId) url.searchParams.set('teamId', teamId);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    let attempt = 0;
    while (true) {
      const remaining = deadline - now();
      if (remaining <= 0) throw new Error('Vercel request timed out');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, remaining));
      let response;
      try {
        response = await fetchImpl(url, { method: 'GET', headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
      } catch {
        throw new Error('Vercel request failed or timed out');
      } finally { clearTimeout(timer); }
      if (response.status === 429) {
        const raw = response.headers.get('retry-after');
        const seconds = Number(raw);
        const retryMs = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : Math.max(0, Date.parse(raw) - now());
        const backoff = Math.min(30000, 1000 * (2 ** Math.min(attempt++, 5)));
        const waitMs = Number.isFinite(retryMs) && retryMs > 0 ? retryMs : backoff;
        if (waitMs >= deadline - now()) throw new Error('Vercel rate limit exceeds the polling deadline');
        await sleep(waitMs);
        continue;
      }
      if (!response.ok) throw new Error(`Vercel read request rejected (HTTP ${response.status})`);
      try { return await response.json(); }
      catch { throw new Error('Vercel returned invalid JSON'); }
    }
  }
  async function verifyProjectConfiguration(expectedBranch = 'main', deadline) {
    const project = await get(`/v9/projects/${projectId}`, {}, deadline);
    if (project?.id !== projectId || project?.link?.productionBranch !== expectedBranch || project?.link?.type !== 'github') {
      throw new Error('Vercel project or Production Branch does not match the release policy');
    }
    return { projectId, productionBranch: expectedBranch };
  }
  async function getDeploymentByCommit(sha, branch, deadline) {
    if (!shaPattern.test(sha) || !branch || branch === 'main' || !/^[A-Za-z0-9._/-]+$/.test(branch) || branch.includes('..')) {
      throw new Error('Invalid Preview commit or branch');
    }
    const result = await get('/v7/deployments', { projectId, sha, branch, target: 'preview', limit: '100' }, deadline);
    if (!Array.isArray(result?.deployments)) throw new Error('Vercel deployment list is malformed');
    const matches = result.deployments.filter((item) => item?.projectId === projectId &&
      item?.meta?.githubCommitSha === sha && item?.meta?.githubCommitRef === branch && isGitPreview(item));
    if (matches.some((item) => !deploymentPattern.test(item.uid ?? item.id ?? ''))) throw new Error('Vercel deployment identifier is invalid');
    const match = matches.sort((a, b) => (b.createdAt ?? b.created ?? 0) - (a.createdAt ?? a.created ?? 0))[0];
    return match ? { ...match, id: match.uid ?? match.id } : null;
  }
  async function waitForDeploymentReady(deploymentId, { sha, branch, timeoutMs: pollTimeoutMs = 600000, pollIntervalMs = 5000 } = {}) {
    if (!deploymentPattern.test(deploymentId ?? '') || !shaPattern.test(sha ?? '') || !branch ||
      !Number.isInteger(pollTimeoutMs) || pollTimeoutMs < 1000 || pollTimeoutMs > 3600000 ||
      !Number.isInteger(pollIntervalMs) || pollIntervalMs < 100 || pollIntervalMs > 60000) {
      throw new Error('Invalid Preview polling arguments');
    }
    const deadline = now() + pollTimeoutMs;
    let attempt = 0;
    while (true) {
      const item = await get(`/v13/deployments/${deploymentId}`, {}, deadline);
      if (item?.id !== deploymentId || item?.projectId !== projectId || item?.meta?.githubCommitSha !== sha ||
        item?.meta?.githubCommitRef !== branch || !isGitPreview(item)) {
        throw new Error('Preview deployment identity changed or targets Production');
      }
      const state = item.readyState ?? item.status;
      if (state === 'READY') return { stage: 'PREVIEW_READY', deploymentId, sha, projectId, branch, url: item.url ?? null };
      if (['ERROR', 'CANCELED', 'BLOCKED'].includes(state)) throw new Error(`Preview deployment ended in ${state}`);
      if (!['QUEUED', 'INITIALIZING', 'BUILDING'].includes(state)) throw new Error('Unknown Preview deployment state');
      const delay = Math.min(30000, Math.round(pollIntervalMs * (1.5 ** Math.min(attempt++, 5))));
      if (delay >= deadline - now()) throw new Error('Preview deployment polling timed out');
      await sleep(delay);
    }
  }
  async function findAndWaitForPreview(sha, branch, { timeoutMs: pollTimeoutMs = 600000, pollIntervalMs = 5000 } = {}) {
    if (!Number.isInteger(pollTimeoutMs) || pollTimeoutMs < 1000 || pollTimeoutMs > 3600000 ||
      !Number.isInteger(pollIntervalMs) || pollIntervalMs < 100 || pollIntervalMs > 60000) {
      throw new Error('Invalid Preview polling arguments');
    }
    const deadline = now() + pollTimeoutMs;
    await verifyProjectConfiguration('main', deadline);
    while (true) {
      const item = await getDeploymentByCommit(sha, branch, deadline);
      if (item) return waitForDeploymentReady(item.id, { sha, branch, timeoutMs: Math.max(1000, deadline - now()), pollIntervalMs });
      if (pollIntervalMs >= deadline - now()) throw new Error('Preview deployment was not created before the deadline');
      await sleep(pollIntervalMs);
    }
  }
  return { verifyProjectConfiguration, getDeploymentByCommit, waitForDeploymentReady, findAndWaitForPreview };
}
