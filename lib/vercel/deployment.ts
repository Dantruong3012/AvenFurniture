import type { DeploymentObservation, DeploymentState, ObserveDeploymentOptions, VercelDeployment } from "./types";

const API_ROOT = "https://api.vercel.com";
const TERMINAL_STATES = new Set(["READY", "ERROR", "CANCELED"]);

export function normalizeDeploymentState(deployment?: VercelDeployment): DeploymentState {
  const value = (deployment?.readyState ?? deployment?.state ?? "UNKNOWN").toUpperCase();
  if (["QUEUED", "INITIALIZING", "BUILDING", "READY", "ERROR", "CANCELED"].includes(value)) {
    return value as DeploymentState;
  }
  return "UNKNOWN";
}

function deploymentSha(deployment: VercelDeployment): string | undefined {
  return deployment.gitSource?.sha ?? deployment.meta?.githubCommitSha ?? deployment.meta?.gitlabCommitSha ?? deployment.meta?.bitbucketCommitSha;
}

function matchesCommit(deployment: VercelDeployment, commitSha: string): boolean {
  const sha = deploymentSha(deployment);
  return Boolean(sha && sha.toLowerCase() === commitSha.toLowerCase());
}

function configured(value: string | undefined, environmentName: string): string | undefined {
  return value || (typeof process !== "undefined" ? process.env[environmentName] : undefined);
}

async function fetchMatchingDeployment(options: ObserveDeploymentOptions): Promise<VercelDeployment | undefined> {
  const token = configured(options.token, "VERCEL_TOKEN");
  const projectId = configured(options.projectId, "VERCEL_PROJECT_ID");
  const teamId = configured(options.teamId, "VERCEL_TEAM_ID");
  if (!token || !projectId) throw new Error("Vercel observer is not configured (VERCEL_TOKEN and VERCEL_PROJECT_ID are required).");

  const url = new URL("/v6/deployments", API_ROOT);
  url.searchParams.set("projectId", projectId);
  url.searchParams.set("target", "production");
  url.searchParams.set("limit", "100");
  if (teamId) url.searchParams.set("teamId", teamId);
  if (options.branch) url.searchParams.set("branch", options.branch);

  const response = await (options.fetcher ?? fetch)(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Vercel deployment query failed (${response.status}).`);

  const payload: unknown = await response.json();
  const deployments = typeof payload === "object" && payload !== null && "deployments" in payload
    ? (payload as { deployments?: unknown }).deployments
    : undefined;
  if (!Array.isArray(deployments)) throw new Error("Vercel returned an unexpected deployment response.");

  return (deployments as VercelDeployment[])
    .filter((deployment) => matchesCommit(deployment, options.commitSha))
    .filter((deployment) => !options.branch || !deployment.gitSource?.ref || deployment.gitSource.ref === options.branch)
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];
}

/** Read-only bounded observer for the Production deployment created from an exact commit. */
export async function observeProductionDeployment(options: ObserveDeploymentOptions): Promise<DeploymentObservation> {
  if (!/^[\da-f]{7,64}$/i.test(options.commitSha)) {
    throw new Error("A valid target commit SHA is required.");
  }
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const pollIntervalMs = Math.max(250, options.pollIntervalMs ?? 5_000);
  const maxWaitMs = Math.max(0, options.maxWaitMs ?? 20_000);
  const startedAt = now();

  while (true) {
    const checkedAt = new Date(now()).toISOString();
    try {
      const deployment = await fetchMatchingDeployment(options);
      if (!deployment) {
        if (now() - startedAt >= maxWaitMs) {
          return { status: "NOT_FOUND", targetCommitSha: options.commitSha, checkedAt, message: "No Production deployment was found for this commit." };
        }
      } else {
        const status = normalizeDeploymentState(deployment);
        if (TERMINAL_STATES.has(status) || now() - startedAt >= maxWaitMs) {
          return { status, targetCommitSha: options.commitSha, deployment, checkedAt };
        }
      }
    } catch (error) {
      return {
        status: "UNAVAILABLE",
        targetCommitSha: options.commitSha,
        checkedAt,
        message: error instanceof Error ? error.message : "Deployment status could not be retrieved.",
      };
    }
    await sleep(Math.min(pollIntervalMs, Math.max(1, maxWaitMs - (now() - startedAt))));
  }
}
