import type { Metadata } from "next";
import Link from "next/link";
import { maxSignedUnsubscribeTokenLength } from "@/lib/newsletter/policy";

export const metadata: Metadata = {
  title: "Unsubscribe from the journal",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function UnsubscribePage({ searchParams }: {
  searchParams: Promise<{ token?: string | string[]; status?: string | string[] }>;
}) {
  const { token, status } = await searchParams;
  const canSubmit = typeof token === "string" && token.length <= maxSignedUnsubscribeTokenLength;
  return <section className="section container">
    <p className="section-note">Journal preferences</p>
    <h1>Unsubscribe</h1>
    {status === "done" ? <p>If your link was valid, your newsletter preference has been updated.</p>
      : status === "error" ? <p>We could not update your preference. Please try again later.</p>
      : canSubmit ? <><p>Confirm that you want to stop receiving our journal emails.</p>
        <form action="/api/newsletter/unsubscribe" method="post">
          <input type="hidden" name="token" value={token} />
          <button className="btn btn-primary" type="submit">Unsubscribe</button>
        </form></>
      : <p>This link could not be used. Please use the link in your latest journal email.</p>}
    <p><Link className="text-link" href="/">Return home</Link></p>
  </section>;
}
