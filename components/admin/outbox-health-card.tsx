import type { OutboxHealthSummary } from "@/lib/types";

export function OutboxHealthCard({ summary }: { summary: OutboxHealthSummary }) {
  const counts = [
    { label: "Pending", value: summary.pending },
    { label: "Processing", value: summary.processing },
    { label: "Sent", value: summary.sent },
    { label: "Failed / dead letter", value: summary.deadLetter },
    { label: "Due for delivery", value: summary.retryBacklog },
  ];
  return <section className="admin-panel mt-5" aria-labelledby="outbox-health-heading">
    <div className="admin-panel-heading"><div><p className="section-note">Email delivery</p><h2 id="outbox-health-heading">Outbox health</h2></div><span className="admin-status">{summary.total} total</span></div>
    <dl className="grid grid-cols-2 gap-4 pt-5 sm:grid-cols-3 lg:grid-cols-5">
      {counts.map(({ label, value }) => <div key={label}><dt className="text-xs text-stone-600">{label}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd></div>)}
    </dl>
    <p className="mt-5 text-xs text-stone-600">Oldest pending: {summary.oldestPendingAgeSeconds === null ? "None" : `${Math.floor(summary.oldestPendingAgeSeconds / 60)} min`} · Failed among completed: {summary.failureRatePercent}%</p>
  </section>;
}
