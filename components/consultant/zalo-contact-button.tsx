import { zaloContactUrl } from "@/lib/validation/consultant";

export function ZaloContactButton({ phone, name }: { phone: string; name: string }) {
  const href = zaloContactUrl(phone);
  if (!href) return <p> Zalo contact unavailable.</p>;
  return <a className="btn btn-primary" href={href} target="_blank" rel="noopener noreferrer" aria-label={`Contact ${name} on Zalo (opens in a new tab)`}>Chat on Zalo <span aria-hidden="true">↗</span></a>;
}
