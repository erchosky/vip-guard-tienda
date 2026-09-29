import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { BrandForm, ShopSettingsForm } from "@/components/admin/shop-forms";
import { getManySettings } from "@/modules/settings/repo";
import { saveBrandAction, saveShopSettingsAction } from "../actions";

export const metadata: Metadata = { title: "Ajustes de la tienda" };
export const dynamic = "force-dynamic";

export default async function ShopSettingsPage() {
  const { brand, shop } = await getManySettings(["brand", "shop"] as const);
  return (
    <>
      <PageHeader title="Ajustes" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Marca y contacto" />
          <CardBody><BrandForm action={saveBrandAction} brand={{ name: brand.name, tagline: brand.tagline, contactUsername: brand.contactUsername, logo: brand.logoPath && brand.logoUrl ? { path: brand.logoPath, url: brand.logoUrl, width: 0, height: 0 } : null }} /></CardBody>
        </Card>
        <Card className="h-fit">
          <CardHeader title="Precios VIP y vendidos" />
          <CardBody><ShopSettingsForm action={saveShopSettingsAction} vipDiscountPercent={shop.vipDiscountPercent} soldVisibleDays={shop.soldVisibleDays} /></CardBody>
        </Card>
      </div>
    </>
  );
}
