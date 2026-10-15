import Link from "next/link";

export function Footer() {
  return <footer className="site-footer">
    <div className="container footer-grid">
      <div className="footer-brand"><Link href="/">AvenFurniture</Link><p>Furniture with quiet presence, made for rooms that become part of your story.</p></div>
      <div><h2>Explore</h2><Link href="/products">All products</Link><Link href="/collections">Collections</Link><Link href="/inspiration">Journal</Link><Link href="/wishlist">Wishlist</Link></div>
      <div><h2>Company</h2><Link href="/about">Our studio</Link><Link href="/contact">Showroom</Link><Link href="/contact">Trade programme</Link><Link href="/admin">Admin</Link></div>
      <div><h2>Visit</h2><p>48 Nguyen Hue<br/>District 1, Ho Chi Minh City</p><p>Mon–Sat, 9:00–18:00</p></div>
    </div>
    <div className="container footer-bottom"><span>© 2026 AvenFurniture</span><span>Frontend demonstration</span></div>
  </footer>;
}
