import { ConsultantManagement } from "@/components/admin/consultant-management";
import { readAdminConsultants } from "@/lib/consultants/queries";

export default async function AdminConsultantsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { profiles, members } = await readAdminConsultants();
  const params = await searchParams;
  return <ConsultantManagement profiles={profiles} members={members} edit={typeof params.edit === "string" ? params.edit : undefined} saved={params.saved === "1"} deleted={params.deleted === "1"} />;
}
