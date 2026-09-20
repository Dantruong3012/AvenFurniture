import type { Metadata } from "next";
import { AdminClient } from "@/components/admin/admin-client";
export const metadata:Metadata={title:"Demo Admin",robots:{index:false,follow:false}};
export default function AdminPage(){return <AdminClient/>}
