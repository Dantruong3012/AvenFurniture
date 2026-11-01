import { observeProductionDeployment } from "@/lib/vercel/deployment";
import type { DeploymentObservation } from "@/lib/vercel/types";
import ErrorBoundary from "@/components/ui/error-boundary";

const LABELS: Record<DeploymentObservation["status"], string> = {
  QUEUED: "Queued",
  INITIALIZING: "Initializing",
  BUILDING: "Building",
  READY: "Ready",
  ERROR: "Build failed",
  CANCELED: "Canceled",
  UNKNOWN: "Unknown status",
  NOT_FOUND: "No matching deployment",
  UNAVAILABLE: "Status unavailable",
};

function ObservationCard({ observation }: { observation: DeploymentObservation }) {
  const failed = observation.status === "ERROR" || observation.status === "CANCELED" || observation.status === "UNAVAILABLE";
  const commit = observation.targetCommitSha;
  const deploymentUrl = observation.deployment?.url;
  return (
    <section className="admin-card" aria-label="Production deployment status" aria-live="polite">
      <h2>Production deployment</h2>
      <p role={failed ? "alert" : "status"}>
        <strong>{LABELS[observation.status]}</strong>
        {observation.message ? ` — ${observation.message}` : ""}
      </p>
      <p>Target commit: <code>{commit}</code></p>
      {observation.deployment?.createdAt ? <p>Created: {new Date(observation.deployment.createdAt).toLocaleString()}</p> : null}
      {deploymentUrl ? <p>Deployment: <a href={`https://${deploymentUrl}`} target="_blank" rel="noreferrer">{deploymentUrl}</a></p> : null}
      <p>Last checked: <time dateTime={observation.checkedAt}>{new Date(observation.checkedAt).toLocaleString()}</time></p>
    </section>
  );
}

export async function DeploymentObserver({ commitSha, branch }: { commitSha: string; branch?: string }) {
  let observation: DeploymentObservation;
  try {
    observation = await observeProductionDeployment({ commitSha, branch });
  } catch (error) {
    observation = {
      status: "UNAVAILABLE",
      targetCommitSha: commitSha,
      checkedAt: new Date().toISOString(),
      message: error instanceof Error ? error.message : "Deployment status could not be retrieved.",
    };
  }
  return <ErrorBoundary label="Deployment observer failed"><ObservationCard observation={observation} /></ErrorBoundary>;
}

export default DeploymentObserver;
