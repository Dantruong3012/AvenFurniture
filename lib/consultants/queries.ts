import "server-only";
import { requireAdmin } from "@/lib/auth/admin";
import { listAdminConsultants, listPublicConsultants } from "@/lib/repositories/supabaseConsultantRepository";

export async function readPublicConsultants() {
  return listPublicConsultants();
}

export async function readAdminConsultants() {
  const { supabase } = await requireAdmin("super_admin");
  return listAdminConsultants(supabase);
}
