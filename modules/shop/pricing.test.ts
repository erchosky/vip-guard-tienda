import { describe, expect, it } from "vitest";
import { computePrice, isOfferActive, type PriceFields } from "./pricing";

const now = new Date("2026-10-10T12:00:00Z");
const base: PriceFields = { price_cents: 2500, offer_price_cents: null, offer_starts_at: null, offer_ends_at: null, vip_price_cents: null };

describe("precios", () => {
  it("sin oferta ni VIP: precio normal", () => {
    const p = computePrice(base, { isVip: false, vipDiscountPercent: 0, now });
    expect(p).toMatchObject({ finalCents: 2500, compareAtCents: null, offerActive: false, vipAdvantage: false });
  });

  it("oferta dentro de fechas: precio tachado", () => {
    const p = computePrice({ ...base, offer_price_cents: 1900, offer_starts_at: "2026-10-09T00:00:00Z", offer_ends_at: "2026-10-12T00:00:00Z" }, { isVip: false, vipDiscountPercent: 0, now });
    expect(p).toMatchObject({ finalCents: 1900, compareAtCents: 2500, offerActive: true, offerEndsAt: "2026-10-12T00:00:00Z" });
  });

  it("oferta caducada o futura no se aplica", () => {
    expect(isOfferActive({ ...base, offer_price_cents: 1900, offer_ends_at: "2026-10-10T12:00:00Z" }, now)).toBe(false);
    const future = computePrice({ ...base, offer_price_cents: 1900, offer_starts_at: "2026-10-11T00:00:00Z" }, { isVip: false, vipDiscountPercent: 0, now });
    expect(future).toMatchObject({ finalCents: 2500, offerScheduled: true });
  });

  it("descuento VIP general", () => {
    const vip = computePrice(base, { isVip: true, vipDiscountPercent: 20, now });
    expect(vip).toMatchObject({ finalCents: 2000, compareAtCents: 2500, isVipPrice: true });
    const noVip = computePrice(base, { isVip: false, vipDiscountPercent: 20, now });
    expect(noVip).toMatchObject({ finalCents: 2500, vipCents: 2000, vipAdvantage: true, isVipPrice: false });
  });

  it("precio VIP fijo manda sobre el descuento general", () => {
    expect(computePrice({ ...base, vip_price_cents: 1500 }, { isVip: true, vipDiscountPercent: 10, now }).finalCents).toBe(1500);
  });

  it("el VIP paga lo mejor entre oferta y precio VIP", () => {
    const p = { ...base, offer_price_cents: 1800, vip_price_cents: 2200 };
    expect(computePrice(p, { isVip: true, vipDiscountPercent: 0, now })).toMatchObject({ finalCents: 1800, isVipPrice: false });
    expect(computePrice(p, { isVip: false, vipDiscountPercent: 0, now })).toMatchObject({ finalCents: 1800, vipAdvantage: false });
  });
});
