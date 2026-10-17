"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BagIcon, CloseIcon, HeartIcon, MenuIcon, SearchIcon } from "@/components/ui/icons";
import { useStore } from "@/components/store/store-provider";

const links = [["Collections","/collections"],["Products","/products"],["Inspiration","/inspiration"],["About","/about"],["Consultants","/consultants"],["Contact","/contact"],["My inquiries","/portal"]];

export function Header() {
  const pathname = usePathname();
  const { cart, wishlist } = useStore();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  return <>
    <a href="#main-content" className="skip-link">Skip to content</a>
    <header className="site-header">
      <div className="header-inner">
        <button className="icon-button menu-button" onClick={() => setOpen(true)} aria-label="Open navigation"><MenuIcon /></button>
        <Link href="/" className="brand-link" aria-label="AvenFurniture home">
          <Image src="/brand/aven-furniture-logo.jpg" alt="" width={932} height={951} priority className="brand-mark" />
          <span>AvenFurniture</span>
        </Link>
        <nav className="desktop-nav" aria-label="Primary navigation" style={{ gap: "clamp(10px, 1.3vw, 24px)" }}>
          {links.map(([label, href]) => <Link key={href} href={href} className={pathname === href ? "active" : ""}>{label}</Link>)}
          <Link href="/admin" className={pathname.startsWith("/admin") ? "active" : ""}>Admin</Link>
        </nav>
        <div className="header-actions">
          <Link href="/products" className="icon-button desktop-only" aria-label="Search products"><SearchIcon /></Link>
          <Link href="/wishlist" className="icon-button desktop-only count-wrap" aria-label={`Wishlist with ${wishlist.length} items`}><HeartIcon />{wishlist.length > 0 && <span>{wishlist.length}</span>}</Link>
          <Link href="/cart" className="icon-button count-wrap" aria-label={`Cart with ${cartCount} items`}><BagIcon />{cartCount > 0 && <span>{cartCount}</span>}</Link>
        </div>
      </div>
    </header>
    <div className={`nav-scrim ${open ? "open" : ""}`} onClick={() => setOpen(false)} aria-hidden="true" />
    <aside className={`mobile-nav ${open ? "open" : ""}`} aria-hidden={!open} aria-label="Mobile navigation">
      <div className="mobile-nav-top"><span>Menu</span><button className="icon-button" onClick={() => setOpen(false)} aria-label="Close navigation"><CloseIcon /></button></div>
      <nav>{links.map(([label, href]) => <Link key={href} href={href} onClick={() => setOpen(false)}>{label}</Link>)}</nav>
      <div className="mobile-nav-meta"><Link href="/wishlist">Wishlist ({wishlist.length})</Link><Link href="/admin" onClick={() => setOpen(false)}>Admin</Link></div>
    </aside>
  </>;
}
