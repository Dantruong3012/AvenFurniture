import Link from "next/link";
export default function ResetPasswordPage() {
  return <section className="auth-shell"><h1>Set your password</h1><p>Open the link from your invitation or password reset email.</p>
    <Link className="text-link" href="/admin/forgot-password">Request a new reset link</Link></section>;
}
