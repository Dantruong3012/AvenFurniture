import { signOut } from "@/lib/auth/actions";
export default function AccessDeniedPage() {
  return <section className="auth-shell"><h1>Access unavailable</h1><p>Contact your administrator to check your account access.</p>
    <form action={signOut}><button className="btn">Sign out</button></form></section>;
}
