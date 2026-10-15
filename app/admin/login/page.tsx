import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ password?: string }> }) {
  const params = await searchParams;
  return <div className="admin-auth-page"><div className="admin-auth-brand">AvenFurniture <span>Management workspace</span></div><section className="auth-shell"><p className="section-note">Team access</p><h1>Welcome back.</h1><p>Sign in to manage the AvenFurniture catalog.</p>
    {params.password === "updated" && <p role="status">Your password has been updated. Sign in again.</p>}
    <AuthForm mode="login" /><Link className="text-link" href="/admin/forgot-password">Forgot password?</Link>
    <p className="auth-invite-note">Access is by invitation only.</p></section><Link className="admin-auth-back" href="/">← Back to storefront</Link></div>;
}
