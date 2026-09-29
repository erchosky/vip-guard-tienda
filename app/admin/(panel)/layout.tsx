import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { AdminShell, type Space } from "@/components/admin/shell";
import { requireAdmin } from "@/modules/auth/session";
import { db } from "@/modules/core/db";
import { getManySettings } from "@/modules/settings/repo";
import { logoutAction } from "./actions";

export const metadata: Metadata = { title: "Panel de control" };
export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const pathname = headerStore.get("x-pathname") ?? "";
  const space: Space = pathname.startsWith("/admin/tienda") ? "tienda" : pathname.startsWith("/admin/vip") ? "vip" : cookieStore.get("admin_space")?.value === "tienda" ? "tienda" : "vip";
  const theme = (["light", "dark", "system"].includes(cookieStore.get("admin_theme")?.value ?? "") ? cookieStore.get("admin_theme")!.value : "system") as "light" | "dark" | "system";

  const [alerts, interests, settings] = await Promise.all([
    db().from("alerts").select("id", { count: "exact", head: true }).eq("status", "open"),
    db().from("shop_interests").select("id", { count: "exact", head: true }).eq("status", "new"),
    getManySettings(["brand", "features"] as const),
  ]);

  return (
    <AdminShell
      space={space}
      theme={theme}
      counts={{ alerts: alerts.count ?? 0, interests: interests.count ?? 0 }}
      broadcasts={settings.features.broadcasts}
      brandName={settings.brand.name}
      logoutAction={logoutAction}
    >
      {children}
    </AdminShell>
  );
}
