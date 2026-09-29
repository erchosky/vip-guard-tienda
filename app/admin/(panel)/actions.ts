"use server";

import { redirect } from "next/navigation";
import { logout } from "@/modules/auth/session";
import { assertSameOrigin } from "@/modules/core/security/origin";

export async function logoutAction() {
  await assertSameOrigin();
  await logout();
  redirect("/admin/login");
}
