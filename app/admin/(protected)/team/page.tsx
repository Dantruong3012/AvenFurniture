import { requireAdmin } from "@/lib/auth/admin";
import { TeamManagement, type TeamMember } from "@/components/admin/team-management";

export default async function TeamPage() {
  const { supabase } = await requireAdmin("super_admin");
  const members: TeamMember[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase.from("admin_profiles")
      .select("user_id,display_name,role,active,created_at")
      .order("created_at", { ascending: false }).order("user_id")
      .range(start, start + 999);
    if (error) throw new Error("Team accounts could not be loaded. Please retry.");
    members.push(...data);
    if (data.length < 1000) break;
  }
  return <TeamManagement members={members} />;
}
