export type DeploymentState =
  | "QUEUED"
  | "INITIALIZING"
  | "BUILDING"
  | "READY"
  | "ERROR"
  | "CANCELED"
  | "UNKNOWN";

export interface VercelDeployment {
  projectId?: string;
  target?: string | null;
  uid?: string;
  id?: string;
  url?: string;
  state?: string;
  readyState?: string;
  createdAt?: number;
  created?: number;
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
  serving?: boolean;
  servingDeploymentId?: string;
  servingCommitSha?: string;
  servingReady?: boolean;
}

export interface ObserveDeploymentOptions {
  commitSha: string;
  branch?: string;
  projectId?: string;
  teamId?: string;
  token?: string;
  repository?: string;
  productionAlias?: string;
  fetcher?: typeof fetch;
  pollIntervalMs?: number;
  maxWaitMs?: number;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}
