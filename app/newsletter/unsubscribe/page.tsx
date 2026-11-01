import type { Metadata } from "next";
import Link from "next/link";
import { maxSignedUnsubscribeTokenLength } from "@/lib/newsletter/policy";
import { getI18n } from "@/lib/i18n/server";


export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
  title: t("Unsubscribe from the journal"),
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
}


export default async function UnsubscribePage({ searchParams }: {
  searchParams: Promise<{ token?: string | string[]; status?: string | string[] }>;
}) {
  const { t } = await getI18n();

  const { token, status } = await searchParams;
  const canSubmit = typeof token === "string" && token.length <= maxSignedUnsubscribeTokenLength;
  return <section className="section container">
    <p className="section-note">{t("Journal preferences")}</p>
    <h1>{t("Unsubscribe")}</h1>
    {status === "done" ? <p>{t("If your link was valid, your newsletter preference has been updated.")}</p>
      : status === "error" ? <p>{t("We could not update your preference. Please try again later.")}</p>
      : canSubmit ? <><p>{t("Confirm that you want to stop receiving our journal emails.")}</p>
        <form action="/api/newsletter/unsubscribe" method="post">
          <input type="hidden" name="token" value={token} />
          <button className="btn btn-primary" type="submit">{t("Unsubscribe")}</button>
        </form></>
      : <p>{t("This link could not be used. Please use the link in your latest journal email.")}</p>}
    <p><Link className="text-link" href="/">{t("Return home")}</Link></p>
  </section>;
}
