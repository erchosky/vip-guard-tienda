import { describe, expect, it, vi } from "vitest";
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
import { isPubliclyVisible } from "./catalog";

const now = new Date("2026-10-10T12:00:00Z");
const visible = new Set(["cat-1"]);

describe("visibilidad pública", () => {
  it("disponible y reservado se ven", () => {
    expect(isPubliclyVisible({ status: "available", sold_visible_until: null, category_id: "cat-1" }, visible, now)).toBe(true);
    expect(isPubliclyVisible({ status: "reserved", sold_visible_until: null, category_id: null }, visible, now)).toBe(true);
  });

  it("vendido solo mientras dura el sello VENDIDO", () => {
    expect(isPubliclyVisible({ status: "sold", sold_visible_until: "2026-10-11T00:00:00Z", category_id: "cat-1" }, visible, now)).toBe(true);
    expect(isPubliclyVisible({ status: "sold", sold_visible_until: "2026-10-10T11:00:00Z", category_id: "cat-1" }, visible, now)).toBe(false);
  });

  it("categoría oculta esconde el producto", () => {
    expect(isPubliclyVisible({ status: "available", sold_visible_until: null, category_id: "cat-oculta" }, visible, now)).toBe(false);
  });
});
