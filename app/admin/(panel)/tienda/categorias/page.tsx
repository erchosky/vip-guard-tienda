import type { Metadata } from "next";
import Image from "next/image";
import { PageHeader } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CategoryForm } from "@/components/admin/shop-forms";
import { listCategories } from "@/modules/shop/categories";
import { saveCategoryAction } from "../actions";

export const metadata: Metadata = { title: "Categorías" };
export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const categories = await listCategories(true);
  return (
    <>
      <PageHeader title="Categorías" description="Los filtros de la tienda (Tangas, Calcetines, Packs…). Solo se muestran las que tienen productos visibles." />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-3">
          {categories.length === 0 ? <p className="text-sm text-muted">Aún no hay categorías.</p> : null}
          {categories.map((c) => (
            <details key={c.id} className="card group overflow-hidden">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 sm:px-5">
                <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-subtle">{c.image_url ? <Image src={c.image_url} alt="" fill sizes="40px" className="object-cover" unoptimized /> : null}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-medium">{c.name}{c.status !== "visible" ? <Badge tone={c.status === "archived" ? "danger" : "neutral"}>{c.status === "hidden" ? "Oculta" : "Archivada"}</Badge> : null}</span>
                  <span className="text-xs text-muted">{c.products} producto{c.products === 1 ? "" : "s"} · orden {c.sort_order}</span>
                </span>
                <span className="text-sm text-accent group-open:hidden">Editar</span>
              </summary>
              <div className="border-t border-line px-4 py-4 sm:px-5">
                <CategoryForm action={saveCategoryAction} category={{ id: c.id, name: c.name, description: c.description, status: c.status, sort_order: c.sort_order, image: c.image_path && c.image_url ? { path: c.image_path, url: c.image_url, width: 0, height: 0 } : null }} />
              </div>
            </details>
          ))}
        </div>
        <Card className="h-fit lg:col-span-2">
          <CardHeader title="Nueva categoría" />
          <CardBody><CategoryForm action={saveCategoryAction} /></CardBody>
        </Card>
      </div>
    </>
  );
}
