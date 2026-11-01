import { requireAdmin } from "@/lib/auth/admin";
import { getOutboxHealthSummary } from "@/lib/email/outbox";

export async function GET() {
  const { supabase } = await requireAdmin();
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const summary = await getOutboxHealthSummary(supabase);
    return Response.json({
      total: summary.total,
      pending: summary.pending,
      processing: summary.processing,
      sent: summary.sent,
      failed: summary.failed,
      deadLetter: summary.deadLetter,
      retryBacklog: summary.retryBacklog,
      oldestPendingAgeSeconds: summary.oldestPendingAgeSeconds,
      failureRatePercent: summary.failureRatePercent,
    }, { headers });
  } catch {
    return Response.json({ error: "Outbox health is temporarily unavailable." }, { status: 503, headers });
  }
}
