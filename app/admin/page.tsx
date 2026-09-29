import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminIndex() {
  const space = (await cookies()).get("admin_space")?.value;
  redirect(space === "tienda" ? "/admin/tienda" : "/admin/vip");
}
