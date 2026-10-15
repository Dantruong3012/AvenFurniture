"use server";
import { requireAdmin } from "./admin";
import { createClient } from "@/lib/supabase/server";
import { allowAuthMutation } from "./mutation";
import { readMfaState, sensitiveAuthAllowed } from "./mfa-policy";

export type MfaState = { error?: string; message?: string; factorId?: string; qr?: string };
const denied = { error: "Unable to complete MFA request. Verify your session and try again later." };

export async function enrollMfa(): Promise<MfaState> {
  const { user } = await requireAdmin();
  if (!(await allowAuthMutation("mfa-enroll", user.id, 5))) return denied;
  const client = await createClient({ writable: true });
  try {
    if (!(await sensitiveAuthAllowed(client))) return { error: "Verify your existing authenticator before adding another." };
    const { data, error } = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: `Authenticator ${new Date().toISOString()}` });
    if (error) return denied;
    return { factorId: data.id, qr: data.totp.qr_code };
  } catch { return denied; }
}

export async function verifyMfa(factorId: string, code: string): Promise<MfaState> {
  const { user } = await requireAdmin();
  if (!(await allowAuthMutation("mfa-verify", user.id)) || !/^[0-9]{6}$/.test(code)) return denied;
  const client = await createClient({ writable: true });
  try {
    const state = await readMfaState(client);
    if (!state.factors.some((factor) => factor.id === factorId && factor.factor_type === "totp")) return denied;
    const { error } = await client.auth.mfa.challengeAndVerify({ factorId, code });
    if (error) return { error: "The code could not be verified. Wait for a new code and try again." };
    return { message: "Authenticator verified. This session is now AAL2." };
  } catch { return denied; }
}

export async function removeMfa(factorId: string): Promise<MfaState> {
  const { user } = await requireAdmin();
  if (!(await allowAuthMutation("mfa-remove", user.id, 5))) return denied;
  const client = await createClient({ writable: true });
  try {
    const state = await readMfaState(client);
    const factor = state.factors.find((factor) => factor.id === factorId);
    if (!factor) return denied;
    if (state.enrolled && !state.aal2) return { error: "Verify your authenticator before removing a factor." };
    const { error } = await client.auth.mfa.unenroll({ factorId });
    return error ? denied : { message: "Authenticator removed." };
  } catch { return denied; }
}
