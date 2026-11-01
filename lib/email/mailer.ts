import "server-only";
import type { DeferredEmailProvider, DeliveryOptions, EmailMessage, Mailer, MockEmailProvider, StagingMailerOptions } from "./types";

function validate(message: EmailMessage, options: DeliveryOptions) {
  options.signal.throwIfAborted();
  if (!options.idempotencyKey || /[\r\n]/.test(options.idempotencyKey)) throw new Error("Invalid email event key.");
  if (!/^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/.test(message.to) || message.to.length > 254) throw new Error("Invalid email recipient.");
  if (!message.subject.trim() || /[\r\n]/.test(message.subject) || !message.text.trim()) throw new Error("Invalid email content.");
}

/** No network access. Repeated event IDs return the original receipt. */
export function createMockMailer(options: { failAttempts?: Readonly<Record<string, number>> } = {}): MockEmailProvider {
  const deliveries: { message: EmailMessage; idempotencyKey: string }[] = [];
  const receipts = new Map<string, { messageId: string }>();
  const remaining = new Map(Object.entries(options.failAttempts ?? {}));
  return {
    get deliveries() { return deliveries.map((delivery) => ({ ...delivery, message: { ...delivery.message } })); },
    async send(message: EmailMessage, options: DeliveryOptions): Promise<{ messageId: string }> {
      validate(message, options);
      const existing = receipts.get(options.idempotencyKey);
      if (existing) return { ...existing };
      const failures = remaining.get(options.idempotencyKey) ?? 0;
      if (failures > 0) {
        remaining.set(options.idempotencyKey, failures - 1);
        throw new Error("Mock email delivery failed.");
      }
      const receipt = { messageId: `mock:${options.idempotencyKey}` };
      deliveries.push({ message: { ...message }, idempotencyKey: options.idempotencyKey });
      receipts.set(options.idempotencyKey, receipt);
      return { ...receipt };
    },
  };
}

/** Records the request locally and never delivers. A stable token lets tests
 * inspect retries while the outbox keeps the event pending. */
export function createDeferredMailer(): DeferredEmailProvider {
  const deferrals: { message: EmailMessage; idempotencyKey: string; token: string }[] = [];
  return {
    get deferrals() { return deferrals.map((entry) => ({ ...entry, message: { ...entry.message } })); },
    async send(message, options) {
      validate(message, options);
      const token = `deferred:${options.idempotencyKey}`;
      deferrals.push({ message: { ...message }, idempotencyKey: options.idempotencyKey, token });
      return { deferred: true, token };
    },
  };
}

/** A sandbox adapter, never a production transport selector. All envelopes go
 * to the configured test inbox; customer addresses and extra headers are dropped.
 * The caller supplies a sandbox transport, including its fixed sender. NODE_ENV
 * is deliberately not used: a staging Next.js build also runs in production mode.
 */
export function createStagingMailer(options: StagingMailerOptions): Mailer {
  const { environment, recipient, transport } = options;
  function requireSandbox() {
    if (!["development", "test", "staging"].includes(environment) || process.env.VERCEL_ENV === "production") {
      throw new Error("Staging email is disabled in production.");
    }
  }
  requireSandbox();
  validate({ to: recipient, subject: "Staging", text: "Staging" }, { idempotencyKey: "validation", signal: new AbortController().signal });
  return {
    async send(message, delivery) {
      requireSandbox();
      validate(message, delivery);
      return transport.send({ to: recipient, subject: `[STAGING] ${message.subject}`, text: message.text,
        ...(message.html === undefined ? {} : { html: message.html }) }, delivery);
    },
  };
}

/** Metadata-only logging: never print recipient addresses, content or secrets. */
export function createConsoleMailer(log: (entry: { eventId: string; messageId: string }) => void = console.info): Mailer {
  const mock = createMockMailer();
  return {
    async send(message, options) {
      const receipt = await mock.send(message, options);
      log({ eventId: options.idempotencyKey, messageId: receipt.messageId });
      return receipt;
    },
  };
}
