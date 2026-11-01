import { requireAdmin, teamInviteStatuses } from "@/lib/auth/admin";
import { TeamManagement, type TeamMember } from "@/components/admin/team-management";
import { redirect } from "next/navigation";

export default async function TeamPage() {
  const { supabase, user, session } = await requireAdmin();
  if (session.role !== "super_admin" && session.role !== "admin") redirect("/admin/access-denied");
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
  const inviteStatuses = await teamInviteStatuses(members.map((member) => member.user_id));
  for (const member of members) {
    member.inviteStatus = inviteStatuses[member.user_id]?.status ?? "unavailable";
    member.email = inviteStatuses[member.user_id]?.email;
  }
  return <TeamManagement members={members} managerId={user.id} managerRole={session.role} />;
}
