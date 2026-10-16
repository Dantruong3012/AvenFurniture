import type { Tables } from "@/lib/supabase/database.types";

export type OutboxRecord = Tables<"email_outbox">;
export type OutboxStatus = "pending" | "processing" | "sent" | "failed";
export type EmailMessage = { to: string; subject: string; text: string; html?: string };
export type DeliveryOptions = { idempotencyKey: string; signal: AbortSignal };
export type DeliveryReceipt = { messageId: string };

/** Transports must honor cancellation and deduplicate by idempotencyKey.
 * Delivery is at least once: a process can die after sending but before saving.
 */
export interface Mailer {
  send(message: EmailMessage, options: DeliveryOptions): Promise<DeliveryReceipt>;
}

export type StagingMailerOptions = {
  environment: "development" | "test" | "staging";
  recipient: string;
  transport: Mailer;
};
export type RetryPolicy = { maxAttempts: number; baseDelayMs: number; maxDelayMs: number };
export type ClaimResult =
  | { status: "claimed"; record: OutboxRecord }
  | { status: "exhausted" | "contended" };
export type DeliveryOutcome =
  | { status: "sent"; messageId: string }
  | { status: "pending" | "failed"; error: string; nextAttemptAt: string };

/** Implementations must atomically compare status, attempts and lease before
 * each mutation. A process-local mutex is insufficient for multiple workers.
 */
export interface OutboxStore {
  listDue(now: number, limit: number): Promise<OutboxRecord[]>;
  claim(record: OutboxRecord, now: number, leaseMs: number, maxAttempts: number): Promise<ClaimResult>;
  finish(record: OutboxRecord, now: number, outcome: DeliveryOutcome): Promise<boolean>;
}

export type DispatchResult = { id: string; status: "sent" | "retry" | "failed" | "contended" | "lease_lost" };
export type OutboxWorkerOptions = {
  store: OutboxStore;
  mailer: Mailer;
  buildMessage: (record: OutboxRecord, signal: AbortSignal) => Promise<EmailMessage>;
  batchSize?: number;
  leaseMs?: number;
  deliveryTimeoutMs?: number;
  retry?: Partial<RetryPolicy>;
  now?: () => number;
  random?: () => number;
  signal?: AbortSignal;
};

export type OutboxLoopOptions = OutboxWorkerOptions & {
  signal: AbortSignal;
  pollIntervalMs?: number;
};
