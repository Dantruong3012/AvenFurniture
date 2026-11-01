import { zaloContactUrl } from "@/lib/validation/consultant";
import { getI18n } from "@/lib/i18n/server";


export async function ZaloContactButton({ phone, name }: { phone: string; name: string }) {
  const { t } = await getI18n();

  const href = zaloContactUrl(phone);
  if (!href) return <p>{" "}{t("Zalo contact unavailable.")}</p>;
  return <a className="btn btn-primary" href={href} target="_blank" rel="noopener noreferrer" aria-label={t("Contact {v0} on Zalo (opens in a new tab)", { v0: name })}>{t("Chat on Zalo")}{" "}<span aria-hidden="true">↗</span></a>;
}
