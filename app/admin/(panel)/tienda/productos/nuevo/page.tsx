import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/misc";
import { ProductForm } from "@/components/admin/product-form";
import { listCategories } from "@/modules/shop/categories";
import { getSettings } from "@/modules/settings/repo";
import { saveProductAction } from "../../actions";

export const metadata: Metadata = { title: "Nuevo producto" };
export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const [categories, shop] = await Promise.all([listCategories(), getSettings("shop")]);
  return (
    <>
      <PageHeader back={{ href: "/admin/tienda/productos", label: "Productos" }} title="Nuevo producto" />
      <ProductForm
        action={saveProductAction}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        vipDiscountPercent={shop.vipDiscountPercent}
        values={{ title: "", description: "", category_id: categories[0]?.id ?? "", size: "", color: "", price: "", offer_price: "", offer_starts_at: "", offer_ends_at: "", vip_price: "", is_unique: true, fulfillment: "physical", status: "available", is_featured: false, sort_order: 100, internal_notes: "", images: [] }}
      />
    </>
  );
}
