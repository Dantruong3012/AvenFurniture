import type { Tables } from "@/lib/supabase/database.types";

export type OutboxRecord = Tables<"email_outbox">;
export type OutboxStatus = "pending" | "processing" | "sent" | "failed";
export type EmailMessage = { to: string; subject: string; text: string; html?: string };
export type InquiryItemEmailData = { name: string; quantity: number; unitPrice?: number | null; currency?: string };
export type CustomerConfirmationData = { to: string; customerName: string; reference?: string | number; items?: InquiryItemEmailData[] };
export type ConsultantAssignmentData = { to: string; inquiryId: string; customerName: string; customerEmail?: string | null; customerPhone?: string; notes?: string; adminUrl: string };
export type StatusUpdateData = { to: string; recipient: "customer" | "staff"; inquiryId: string; customerName: string; status: string; previousStatus?: string; reference?: string | number };
export type EmailTemplatePayload =
  | { template: "customer_confirmation"; data: CustomerConfirmationData }
  | { template: "consultant_assignment"; data: ConsultantAssignmentData }
  | { template: "status_update"; data: StatusUpdateData };
export type EmailBuildResult = EmailMessage | EmailTemplatePayload;

/** A domain occurrence ID is stable across retries. A new assignment or status
 * change must use a new ID, even when it concerns the same inquiry. */
export type EmailEventPayloads = {
  "inquiry.received": { inquiryId: string; template: "customer_confirmation"; data: CustomerConfirmationData };
  "inquiry.assigned": { inquiryId: string; template: "consultant_assignment"; data: ConsultantAssignmentData };
  "inquiry.status_changed": { inquiryId: string; template: "status_update"; data: StatusUpdateData };
  "quote.requested": { inquiryId: string; to: string; customerName: string; reference?: string | number };
};
export type EmailEventType = keyof EmailEventPayloads;
export type EmailEventDraft = { [K in EmailEventType]: {
  schema_version: 1; event_type: K; occurrence_id: string; payload: EmailEventPayloads[K];
} }[EmailEventType];
export type EmailOutboxEvent = { [K in EmailEventType]: {
  id: string;
  schema_version: 1;
  event_type: K;
  payload: EmailEventPayloads[K];
  idempotency_key: string;
  status: OutboxStatus;
  attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
} }[EmailEventType];

/** Implement this inside the same database transaction as the domain change.
 * The store must enforce UNIQUE(idempotency_key) and atomically insert or read
 * the existing row. A pre-insert lookup is not sufficient for concurrent calls.
 * The current email_outbox table lacks these columns; this is the contract for
 * a future transactional adapter, not a claim that it already persists them. */
export interface EmailEventTransaction {
  insertOrGet(draft: EmailEventDraft & { idempotency_key: string }): Promise<EmailOutboxEvent>;
}
export type DeliveryOptions = { idempotencyKey: string; signal: AbortSignal };
export type DeliveryReceipt = { messageId: string; deferred?: never } | { deferred: true; token: string; messageId?: never };

/** Deferred means no external send occurred. The worker keeps the row pending. */
export interface EmailProviderClient {
  send(message: EmailMessage, options: DeliveryOptions): Promise<DeliveryReceipt>;
}
export interface MockEmailProvider extends EmailProviderClient {
  send(message: EmailMessage, options: DeliveryOptions): Promise<{ messageId: string }>;
  readonly deliveries: { message: EmailMessage; idempotencyKey: string }[];
}
export interface DeferredEmailProvider extends EmailProviderClient {
  send(message: EmailMessage, options: DeliveryOptions): Promise<{ deferred: true; token: string }>;
  readonly deferrals: { message: EmailMessage; idempotencyKey: string; token: string }[];
}

/** Transports must honor cancellation and deduplicate by idempotencyKey.
 * Delivery is at least once: a process can die after sending but before saving.
 */
export type Mailer = EmailProviderClient;

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
  buildMessage: (record: OutboxRecord, signal: AbortSignal) => Promise<EmailBuildResult>;
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
