import { describe, expect, it, vi } from "vitest";
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
import { slugify } from "./categories";

describe("slugify", () => {
  it("genera identificadores válidos", () => {
    expect(slugify("Tangas Usados")).toBe("tangas-usados");
    expect(slugify("  Calcetínes & Más!! ")).toBe("calcetines-mas");
    expect(slugify("💋")).toBe("categoria");
  });
});
