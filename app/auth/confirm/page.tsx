import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { recoveryType } from "@/lib/auth/validation";
export const metadata: Metadata = { title: "Set password", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ token_hash?: string; type?: string }> }) {
  const params = await searchParams;
  const type = recoveryType(params.type);
  const valid = type && /^[a-f0-9]{32,128}$/i.test(params.token_hash ?? "");
  return <section className="auth-shell"><h1>Set your password</h1>
    {valid ? <AuthForm mode="reset" tokenHash={params.token_hash} type={type} /> : <p>This link is invalid. Request a new email.</p>}
    <Link className="text-link" href="/admin/forgot-password">Request a new link</Link></section>;
}
