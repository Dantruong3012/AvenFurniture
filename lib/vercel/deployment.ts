import type { DeploymentObservation, DeploymentState, ObserveDeploymentOptions, VercelDeployment } from "./types";

const fullSha = /^[a-f0-9]{40}$/;
const deploymentId = /^dpl_[A-Za-z0-9]+$/;
export function normalizeDeploymentState(deployment?: VercelDeployment): DeploymentState {
  const value = (deployment?.readyState ?? deployment?.state ?? "UNKNOWN").toUpperCase();
  return ["QUEUED", "INITIALIZING", "BUILDING", "READY", "ERROR", "CANCELED"].includes(value) ? value as DeploymentState : "UNKNOWN";
}
const shaFor = (d: VercelDeployment) => d.gitSource?.sha ?? d.meta?.githubCommitSha;

/** Read-only observer. READY is build state; serving additionally verifies alias identity. */
export async function observeProductionDeployment(options: ObserveDeploymentOptions): Promise<DeploymentObservation> {
  if (!fullSha.test(options.commitSha)) throw new Error("A valid target commit SHA is required (full 40 characters).");
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const start = now(), budget = Math.min(300000, Math.max(0, options.maxWaitMs ?? 20000));
  const branch = options.branch ?? "main";
  const token = options.token ?? process.env.VERCEL_TOKEN;
  const project = options.projectId ?? process.env.VERCEL_PROJECT_ID;
  const team = options.teamId ?? process.env.VERCEL_TEAM_ID;
  const repository = options.repository ?? "Dantruong3012/AvenFurniture";
  const result = (status: DeploymentObservation["status"], fields: Partial<DeploymentObservation> = {}): DeploymentObservation => ({ status, targetCommitSha: options.commitSha, checkedAt: new Date(now()).toISOString(), ...fields });
  try {
    if (!token || !/^prj_[A-Za-z0-9]+$/.test(project ?? "") || (team && !/^team_[A-Za-z0-9]+$/.test(team))) throw Error("config");
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !/^[\w./-]+$/.test(branch) || branch.includes("..")) throw Error("identity");
    if (options.productionAlias && !/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/.test(options.productionAlias)) throw Error("alias");
    async function get(path: string, params: Record<string, string> = {}) {
      const url = new URL(path, "https://api.vercel.com");
      if (team) url.searchParams.set("teamId", team);
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
      const remaining = Math.max(1, budget - (now() - start));
      const response = await (options.fetcher ?? fetch)(url, { method: "GET", redirect: "error", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(Math.min(10000, budget ? remaining : 10000)) });
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      return response.json();
    }
    function valid(d: VercelDeployment) {
      const id = d.id ?? d.uid;
      const org = d.meta?.githubCommitOrg ?? d.meta?.githubOrg;
      const repo = d.meta?.githubCommitRepo ?? d.meta?.githubRepo;
      return deploymentId.test(id ?? "") && d.projectId === project && d.target === "production" &&
        (d.gitSource?.ref ?? d.meta?.githubCommitRef) === branch && `${org}/${repo}` === repository && fullSha.test(shaFor(d) ?? "") &&
        (!d.gitSource?.sha || !d.meta?.githubCommitSha || d.gitSource.sha === d.meta.githubCommitSha);
    }
    const p = await get(`/v9/projects/${project}`);
    if (p.id !== project || p.link?.type !== "github" || p.link.productionBranch !== branch || `${p.link.org}/${p.link.repo}` !== repository) throw Error("project");
    while (true) {
      let match: VercelDeployment | undefined, until: string | undefined;
      for (let page = 0; page < 5; page++) {
        const list = await get("/v7/deployments", { projectId: project!, sha: options.commitSha, branch, target: "production", limit: "100", ...(until ? { until } : {}) });
        if (!Array.isArray(list.deployments)) throw Error("list");
        match = (list.deployments as VercelDeployment[]).filter(d => valid(d) && shaFor(d) === options.commitSha).sort((a, b) => (b.createdAt ?? b.created ?? 0) - (a.createdAt ?? a.created ?? 0))[0];
        if (match || !list.pagination?.next) break;
        if (page === 4 || String(list.pagination.next) === until) throw Error("pagination");
        until = String(list.pagination.next);
      }
      let servingDeploymentId: string | undefined, servingCommitSha: string | undefined;
      let servingReady = false;
      if (options.productionAlias) {
        const alias = await get(`/v4/aliases/${options.productionAlias}`, { projectId: project! });
        if (alias.projectId !== project || alias.alias !== options.productionAlias || !deploymentId.test(alias.deploymentId ?? "")) throw Error("alias identity");
        const serving = await get(`/v13/deployments/${alias.deploymentId}`) as VercelDeployment;
        if (!valid(serving) || serving.id !== alias.deploymentId) throw Error("serving identity");
        servingDeploymentId = serving.id; servingCommitSha = shaFor(serving);
        servingReady = normalizeDeploymentState(serving) === "READY";
      }
      const serving = { serving: Boolean(servingReady && servingCommitSha === options.commitSha), servingReady, servingDeploymentId, servingCommitSha };
      if (match) {
        const d = await get(`/v13/deployments/${match.id ?? match.uid}`) as VercelDeployment;
        if (!valid(d) || d.id !== (match.id ?? match.uid) || shaFor(d) !== options.commitSha) throw Error("deployment identity");
        const status = normalizeDeploymentState(d);
        if (status === "UNKNOWN") throw Error("unknown state");
        if (["READY", "ERROR", "CANCELED"].includes(status) || now() - start >= budget) return result(status, { deployment: d, ...serving });
      } else if (now() - start >= budget) return result("NOT_FOUND", serving);
      const delay = Math.min(Math.max(250, options.pollIntervalMs ?? 5000), budget - (now() - start));
      if (delay <= 0) return result("NOT_FOUND", serving);
      await sleep(delay);
    }
  } catch {
    return result("UNAVAILABLE", { message: "Vercel observation or identity verification failed; credentials and response details withheld." });
  }
}
