"use client";
export default function AdminError({ reset }: { reset: () => void }) {
  return <section className="auth-shell"><h1>Temporarily unavailable</h1>
    <p>We could not verify your access. Please try again shortly.</p>
    <button className="btn" onClick={reset}>Try again</button></section>;
}
