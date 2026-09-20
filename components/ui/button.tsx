import Link from "next/link";
import type { ButtonHTMLAttributes, AnchorHTMLAttributes, ReactNode } from "react";

const variants = { primary: "btn btn-primary", secondary: "btn btn-secondary", light: "btn btn-light", text: "text-link" };

export function Button({ variant = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants }) {
  return <button className={`${variants[variant]} ${className}`} {...props} />;
}

export function ButtonLink({ href, children, variant = "primary", className = "", ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode; variant?: keyof typeof variants }) {
  return <Link href={href} className={`${variants[variant]} ${className}`} {...props}>{children}</Link>;
}
