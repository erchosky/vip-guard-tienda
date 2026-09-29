import { applyPercent } from "@/modules/core/money";

/**
 * Cálculo de precios (lógica pura).
 *
 *  - Oferta: precio rebajado activo entre sus fechas (si las tiene).
 *  - Precio VIP: el fijo del producto o, si no hay, el descuento VIP general
 *    sobre el precio normal. El VIP paga siempre lo mejor entre oferta y VIP.
 */
export type PriceFields = {
  price_cents: number;
  offer_price_cents: number | null;
  offer_starts_at: string | null;
  offer_ends_at: string | null;
  vip_price_cents: number | null;
};

export type PriceView = {
  regularCents: number;
  publicCents: number;
  vipCents: number;
  finalCents: number;
  compareAtCents: number | null;
  offerActive: boolean;
  offerEndsAt: string | null;
  offerScheduled: boolean;
  vipAdvantage: boolean;
  isVipPrice: boolean;
};

export function isOfferActive(p: PriceFields, now = new Date()): boolean {
  if (p.offer_price_cents === null || p.offer_price_cents === undefined) return false;
  const t = now.getTime();
  if (p.offer_starts_at && new Date(p.offer_starts_at).getTime() > t) return false;
  if (p.offer_ends_at && new Date(p.offer_ends_at).getTime() <= t) return false;
  return true;
}

export function computePrice(p: PriceFields, options: { isVip: boolean; vipDiscountPercent: number; now?: Date }): PriceView {
  const now = options.now ?? new Date();
  const offerActive = isOfferActive(p, now);
  const publicCents = offerActive ? (p.offer_price_cents as number) : p.price_cents;
  const vipBase = p.vip_price_cents ?? (options.vipDiscountPercent > 0 ? applyPercent(p.price_cents, options.vipDiscountPercent) : p.price_cents);
  const vipCents = Math.min(publicCents, vipBase);
  const finalCents = options.isVip ? vipCents : publicCents;
  return {
    regularCents: p.price_cents,
    publicCents,
    vipCents,
    finalCents,
    compareAtCents: finalCents < p.price_cents ? p.price_cents : null,
    offerActive,
    offerEndsAt: offerActive ? p.offer_ends_at : null,
    offerScheduled: !offerActive && p.offer_price_cents !== null && Boolean(p.offer_starts_at) && new Date(p.offer_starts_at as string).getTime() > now.getTime(),
    vipAdvantage: vipCents < publicCents,
    isVipPrice: options.isVip && vipCents < publicCents,
  };
}
