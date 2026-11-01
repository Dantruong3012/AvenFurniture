"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BagIcon, CloseIcon, HeartIcon, MenuIcon, SearchIcon } from "@/components/ui/icons";
import { useStore } from "@/components/store/store-provider";
import { LanguageSwitch } from "@/components/i18n/language-switch";
import { useI18n } from "@/lib/i18n/client";


const links = [["Collections","/collections"],["Products","/products"],["Inspiration","/inspiration"],["About","/about"],["Consultants","/consultants"],["Contact","/contact"],["My inquiries","/portal"]];

export function Header() {
  const { t } = useI18n();

  const pathname = usePathname();
  const { cart, wishlist } = useStore();
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const navigation = useRef<HTMLElement>(null);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1400px)");
    const closeOnDesktop = () => { if (desktop.matches) setOpen(false); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const panel = navigation.current;
    const trigger = menuButton.current;
    const controls = () => [...(panel?.querySelectorAll<HTMLElement>("a[href], button:not(:disabled)") ?? [])];
    controls()[0]?.focus();
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
      if (event.key !== "Tab" || event.ctrlKey || event.metaKey || event.altKey) return;
      const items = controls(), first = items[0], last = items.at(-1);
      if (!panel?.contains(document.activeElement) || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault(); first?.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last?.focus();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => { document.removeEventListener("keydown", handleKey); if (trigger?.isConnected) trigger.focus(); };
  }, [open]);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  return <>
    <a href="#main-content" className="skip-link">{t("Skip to content")}</a>
    <header className="site-header">
      <div className="header-inner">
        <button ref={menuButton} className="icon-button menu-button" onClick={() => setOpen(true)} aria-label={t("Open navigation")} aria-expanded={open} aria-controls="site-mobile-navigation"><MenuIcon /></button>
        <Link href="/" className="brand-link" aria-label={t("AvenFurniture home")}>
          <Image src="/brand/aven-furniture-logo.jpg" alt="" width={932} height={951} priority className="brand-mark" />
          <span>AvenFurniture</span>
        </Link>
        <nav className="desktop-nav" aria-label={t("Primary navigation")}>
          {links.map(([label, href]) => <Link key={href} href={href} className={pathname === href ? "active" : ""}>{t(label ?? "")}</Link>)}
          <Link href="/admin" className={pathname.startsWith("/admin") ? "active" : ""}>{t("Admin")}</Link>
        </nav>
        <div className="header-actions">
          <LanguageSwitch />
          <Link href="/products" className="icon-button desktop-only" aria-label={t("Search products")}><SearchIcon /></Link>
          <Link href="/wishlist" className="icon-button desktop-only count-wrap" aria-label={t("Wishlist with {v0} items", { v0: wishlist.length })}><HeartIcon />{wishlist.length > 0 && <span>{wishlist.length}</span>}</Link>
          <Link href="/cart" className="icon-button count-wrap" aria-label={t("Cart with {v0} items", { v0: cartCount })}><BagIcon />{cartCount > 0 && <span>{cartCount}</span>}</Link>
        </div>
      </div>
    </header>
    <div className={`nav-scrim ${open ? "open" : ""}`} onClick={() => setOpen(false)} aria-hidden="true" />
    <aside ref={navigation} id="site-mobile-navigation" role="dialog" aria-modal={open ? true : undefined} inert={!open} className={`mobile-nav ${open ? "open" : ""}`} aria-hidden={!open} aria-label={t("Mobile navigation")}>
      <div className="mobile-nav-top"><span>{t("Menu")}</span><button className="icon-button" onClick={() => setOpen(false)} aria-label={t("Close navigation")}><CloseIcon /></button></div>
      <nav>{links.map(([label, href]) => <Link key={href} href={href} onClick={() => setOpen(false)}>{t(label ?? "")}</Link>)}</nav>
      <div className="mobile-nav-meta"><Link href="/wishlist" onClick={() => setOpen(false)}>{t("Wishlist (")}{wishlist.length})</Link><Link href="/admin" onClick={() => setOpen(false)}>{t("Admin")}</Link></div>
    </aside>
  </>;
}
