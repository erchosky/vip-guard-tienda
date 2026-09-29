export type ProductStatus = "draft" | "available" | "reserved" | "sold" | "hidden" | "archived";
export type Fulfillment = "physical" | "digital";

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  draft: "Borrador",
  available: "Disponible",
  reserved: "Reservado",
  sold: "Vendido",
  hidden: "Oculto",
  archived: "Archivado",
};

export type ProductRow = {
  id: string;
  category_id: string | null;
  title: string;
  description: string | null;
  size: string | null;
  color: string | null;
  price_cents: number;
  offer_price_cents: number | null;
  offer_starts_at: string | null;
  offer_ends_at: string | null;
  vip_price_cents: number | null;
  is_unique: boolean;
  fulfillment: Fulfillment;
  status: ProductStatus;
  is_featured: boolean;
  sort_order: number;
  reserved_at: string | null;
  sold_at: string | null;
  sold_visible_until: string | null;
  published_at: string | null;
  archived_at: string | null;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ImageRow = {
  id: string;
  product_id: string;
  storage_path: string;
  public_url: string;
  width: number | null;
  height: number | null;
  is_primary: boolean;
  sort_order: number;
};

export type CategoryRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  image_path: string | null;
  image_url: string | null;
  status: "visible" | "hidden" | "archived";
  sort_order: number;
};

/** Datos de producto que ve la MiniApp (ya con el precio calculado para ese cliente). */
export type PublicProduct = {
  id: string;
  categoryId: string | null;
  title: string;
  description: string | null;
  size: string | null;
  color: string | null;
  isUnique: boolean;
  fulfillment: Fulfillment;
  status: "available" | "reserved" | "sold";
  isFeatured: boolean;
  images: Array<{ url: string; width: number | null; height: number | null }>;
  price: {
    finalCents: number;
    compareAtCents: number | null;
    vipCents: number;
    offerActive: boolean;
    offerEndsAt: string | null;
    vipAdvantage: boolean;
    isVipPrice: boolean;
  };
};

export type PublicCategory = { id: string; slug: string; name: string; description: string | null; imageUrl: string | null };
