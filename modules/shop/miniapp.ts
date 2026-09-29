import "server-only";
import { getManySettings } from "@/modules/settings/repo";
import { rawTexts } from "@/modules/texts/repo";
import { TEXTS, type TextKey } from "@/modules/texts/catalog";
import type { Customer } from "@/modules/customers/repo";
import { getChannel, getSubscription, hasPaidBefore, listPlans } from "@/modules/vip/repo";
import { durationLabel, planPrice, vipStatus } from "@/modules/vip/state";
import { publicCatalog } from "./catalog";
import type { PublicCategory, PublicProduct } from "./types";

const MINIAPP_TEXT_KEYS = (Object.keys(TEXTS) as TextKey[]).filter((key) => /^(shop|vip|miniapp)\./.test(key) || key === "template.interest");

export type MiniAppPayload = {
  brand: { name: string; tagline: string; logoUrl: string | null; hasContact: boolean };
  texts: Record<string, string>;
  me: { firstName: string | null; vip: { status: "active" | "expired" | "none"; endsAt: string | null }; hasPaidBefore: boolean };
  inviteLink: string | null;
  plans: Array<{ id: string; name: string; description: string | null; durationLabel: string; priceCents: number; firstCents: number; renewalCents: number; isFeatured: boolean }>;
  categories: PublicCategory[];
  products: PublicProduct[];
  vipDiscountPercent: number;
};

export async function loadMiniApp(customer: Customer): Promise<MiniAppPayload> {
  const [settings, sub, paid, plans, channel, texts] = await Promise.all([
    getManySettings(["brand", "shop"] as const),
    getSubscription(customer.id),
    hasPaidBefore(customer.id),
    listPlans(),
    getChannel(),
    rawTexts(MINIAPP_TEXT_KEYS),
  ]);
  const status = vipStatus(sub);
  const catalog = await publicCatalog({ isVip: status === "active", vipDiscountPercent: settings.shop.vipDiscountPercent });
  return {
    brand: { name: settings.brand.name, tagline: settings.brand.tagline, logoUrl: settings.brand.logoUrl, hasContact: Boolean(settings.brand.contactUsername) },
    texts,
    me: { firstName: customer.first_name, vip: { status, endsAt: sub?.ends_at ?? null }, hasPaidBefore: paid },
    inviteLink: status === "active" ? channel.invite_link : null,
    plans: plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      durationLabel: durationLabel(plan.duration_days),
      priceCents: planPrice(plan, paid),
      firstCents: plan.price_first_cents,
      renewalCents: plan.price_renewal_cents,
      isFeatured: plan.is_featured,
    })),
    categories: catalog.categories,
    products: catalog.products,
    vipDiscountPercent: settings.shop.vipDiscountPercent,
  };
}
