import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
export default function ForgotPasswordPage() {
  return <section className="auth-shell"><h1>Reset your password</h1><AuthForm mode="forgot" />
    <Link className="text-link" href="/admin/login">Back to sign in</Link></section>;
}
