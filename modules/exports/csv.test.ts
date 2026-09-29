import { describe, expect, it } from "vitest";
import { csvMoney, toCsv } from "./csv";

describe("CSV para Excel", () => {
  it("lleva BOM, separador ; y escapa comillas", () => {
    const csv = toCsv([{ a: 'Tanga "rosa"; talla S', b: 1990 }], [{ header: "Producto", value: (r) => r.a }, { header: "Importe", value: (r) => csvMoney(r.b) }]);
    expect(csv.startsWith("﻿Producto;Importe\r\n")).toBe(true);
    expect(csv).toContain('"Tanga ""rosa""; talla S";19,90');
  });

  it("neutraliza fórmulas", () => {
    const csv = toCsv([{ a: "=HYPERLINK(\"x\")" }, { a: "-1+2" }, { a: "@SUM" }], [{ header: "x", value: (r) => r.a }]);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'-1+2");
    expect(csv).toContain("'@SUM");
  });
});
