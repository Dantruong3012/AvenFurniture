import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;
const base = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
export const MenuIcon = (p: IconProps) => <svg {...base} {...p}><path d="M4 7h16M4 17h16" /></svg>;
export const CloseIcon = (p: IconProps) => <svg {...base} {...p}><path d="m6 6 12 12M18 6 6 18" /></svg>;
export const SearchIcon = (p: IconProps) => <svg {...base} {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>;
export const BagIcon = (p: IconProps) => <svg {...base} {...p}><path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></svg>;
export const HeartIcon = ({ fill = "none", ...p }: IconProps) => <svg {...base} {...p} fill={fill}><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg>;
export const ArrowIcon = (p: IconProps) => <svg {...base} {...p}><path d="M5 12h14M14 7l5 5-5 5"/></svg>;
export const PlusIcon = (p: IconProps) => <svg {...base} {...p}><path d="M12 5v14M5 12h14"/></svg>;
export const MinusIcon = (p: IconProps) => <svg {...base} {...p}><path d="M5 12h14"/></svg>;
export const TrashIcon = (p: IconProps) => <svg {...base} {...p}><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/></svg>;
export const FilterIcon = (p: IconProps) => <svg {...base} {...p}><path d="M4 6h16M7 12h10M10 18h4"/></svg>;
