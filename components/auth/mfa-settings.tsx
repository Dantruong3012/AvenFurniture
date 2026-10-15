"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { enrollMfa, verifyMfa, removeMfa, type MfaState } from "@/lib/auth/mfa-actions";

export function MfaSettings({ factors, aal2 }: { factors: { id: string; status: string; name: string }[]; aal2: boolean }) {
  const [state, setState] = useState<MfaState>({});
  const [enrollment, setEnrollment] = useState<MfaState>({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const run = (action: () => Promise<MfaState>, enrolling = false) => startTransition(async () => {
    try {
      const result = await action();
      setState(result.error ? { error: result.error } : { message: result.message });
      if (enrolling && result.qr) setEnrollment(result);
      if (result.message) { setEnrollment({}); router.refresh(); }
    } catch { setState({ error: "Authentication is temporarily unavailable. Reload and try again." }); }
  });
  const list = enrollment.factorId ? [{ id: enrollment.factorId, status: "unverified", name: "New authenticator" }] : factors;
  return <section aria-labelledby="mfa-heading"><h2 id="mfa-heading">Authenticator app</h2>
    <p>Session assurance: {aal2 ? "AAL2 (verified)" : "AAL1"}. Enrollment is optional during setup.</p>
    <p>If you lose access, use another enrolled authenticator or contact the project owner for identity verification. Password recovery does not remove MFA.</p>
    {enrollment.qr && <div>
      <p>Scan this code with your authenticator. Do not share it. Then enter the six-digit code.</p>
      {/* QR data is shown only to its owner, not persisted or logged. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img width={240} height={240} src={enrollment.qr.startsWith("data:image/") ? enrollment.qr : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(enrollment.qr)}`} alt="Authenticator enrollment QR code" />
    </div>}
    {list.map((factor) => <div key={factor.id}>
      <p>{factor.name} — {factor.status}</p>
      <form className="auth-form" action={(form) => run(() => verifyMfa(factor.id, String(form.get("code") ?? "")))}>
        <label>Authenticator code<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required /></label>
        <button className="btn" disabled={pending}>Verify code</button>
      </form>
      <button className="text-link" disabled={pending} onClick={() => run(() => removeMfa(factor.id))}>{factor.status === "verified" ? "Remove authenticator" : "Cancel enrollment"}</button>
    </div>)}
    {!enrollment.factorId && <button className="btn" disabled={pending} onClick={() => run(enrollMfa, true)}>Add authenticator</button>}
    {state.error && <p role="alert">{state.error}</p>}{state.message && <p role="status">{state.message}</p>}
  </section>;
}
