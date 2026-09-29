import { describe, expect, it } from "vitest";
import { parseSettings } from "./schema";

describe("ajustes", () => {
  it("usa valores por defecto si no hay nada guardado", () => {
    expect(parseSettings("shop", undefined)).toEqual({ vipDiscountPercent: 10, soldVisibleDays: 3 });
    expect(parseSettings("vip", null)).toEqual({ reminderHours: [24] });
  });

  it("recupera campo a campo si algo está corrupto", () => {
    expect(parseSettings("shop", { vipDiscountPercent: 500, soldVisibleDays: 7 })).toEqual({ vipDiscountPercent: 10, soldVisibleDays: 7 });
  });

  it("normaliza el @usuario", () => {
    expect(parseSettings("brand", { name: "Nina", contactUsername: "@nina_vip" }).contactUsername).toBe("nina_vip");
    expect(parseSettings("brand", { name: "Nina", contactUsername: "https://t.me/nina_vip" }).contactUsername).toBe("nina_vip");
  });
});
