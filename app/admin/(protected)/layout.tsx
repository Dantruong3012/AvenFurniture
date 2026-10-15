import { requireAdmin } from "@/lib/auth/admin";
import { CatalogShell } from "@/components/admin/catalog-shell";
export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireAdmin();
  return <CatalogShell role={profile.role} name={profile.display_name}>{children}</CatalogShell>;
}
