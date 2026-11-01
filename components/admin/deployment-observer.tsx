import { observeProductionDeployment } from "@/lib/vercel/deployment";
import type { DeploymentObservation } from "@/lib/vercel/types";
import ErrorBoundary from "@/components/ui/error-boundary";
import { getI18n } from "@/lib/i18n/server";


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

async function ObservationCard({ observation }: { observation: DeploymentObservation }) {
  const { t, locale } = await getI18n();

  const failed = observation.status === "ERROR" || observation.status === "CANCELED" || observation.status === "UNAVAILABLE";
  const commit = observation.targetCommitSha;
  const deploymentUrl = observation.deployment?.url;
  return (
    <section className="admin-card" aria-label={t("Production deployment status")} aria-live="polite">
      <h2>{t("Production deployment")}</h2>
      <p role={failed ? "alert" : "status"}>
        <strong>{t(LABELS[observation.status] ?? "")}</strong>
        {observation.message ? ` — ${t(observation.message)}` : ""}
      </p>
      <p>{t("Target commit:")}{" "}<code>{commit}</code></p>
      {observation.deployment?.createdAt ? <p>{t("Created:")}{" "}{new Date(observation.deployment.createdAt).toLocaleString(locale === "vi" ? "vi-VN" : "en-GB", { timeZone: "Asia/Ho_Chi_Minh" })}</p> : null}
      {deploymentUrl ? <p>{t("Deployment:")}{" "}<a href={`https://${deploymentUrl}`} target="_blank" rel="noreferrer">{deploymentUrl}</a></p> : null}
      <p>{t("Last checked:")}{" "}<time dateTime={observation.checkedAt}>{new Date(observation.checkedAt).toLocaleString(locale === "vi" ? "vi-VN" : "en-GB", { timeZone: "Asia/Ho_Chi_Minh" })}</time></p>
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
