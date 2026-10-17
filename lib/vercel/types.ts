export type DeploymentState =
  | "QUEUED"
  | "INITIALIZING"
  | "BUILDING"
  | "READY"
  | "ERROR"
  | "CANCELED"
  | "UNKNOWN";

export interface VercelDeployment {
  uid?: string;
  id?: string;
  url?: string;
  state?: string;
  readyState?: string;
  createdAt?: number;
  meta?: Record<string, string | undefined>;
  gitSource?: { sha?: string; ref?: string; repoId?: number };
  inspectorUrl?: string;
}

export interface DeploymentObservation {
  status: DeploymentState | "NOT_FOUND" | "UNAVAILABLE";
  targetCommitSha: string;
  deployment?: VercelDeployment;
  checkedAt: string;
  message?: string;
}

export interface ObserveDeploymentOptions {
  commitSha: string;
  branch?: string;
  projectId?: string;
  teamId?: string;
  token?: string;
  fetcher?: typeof fetch;
  pollIntervalMs?: number;
  maxWaitMs?: number;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}
