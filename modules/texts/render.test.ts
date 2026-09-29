import { describe, expect, it } from "vitest";
import { renderTemplate, unknownVariables, variablesIn } from "./render";
import { TEXTS, type TextDef } from "./catalog";

describe("renderTemplate", () => {
  it("sustituye variables", () => {
    expect(renderTemplate("Hola {nombre}, te quedan {dias}", { nombre: "Ana", dias: 3 })).toBe("Hola Ana, te quedan 3");
  });

  it("los trozos entre corchetes solo aparecen con datos", () => {
    const tpl = "Me interesa tu {producto}[ (talla {talla})][ en {color}] de {precio}.";
    expect(renderTemplate(tpl, { producto: "tanga rojo", talla: "M", color: "", precio: "20 €" }))
      .toBe("Me interesa tu tanga rojo (talla M) de 20 €.");
    expect(renderTemplate(tpl, { producto: "pack", precio: "15 €" })).toBe("Me interesa tu pack de 15 €.");
  });

  it("deja los corchetes sin variables tal cual", () => {
    expect(renderTemplate("Nota [importante]", {})).toBe("Nota [importante]");
  });

  it("variables desconocidas quedan vacías y se limpian saltos de línea", () => {
    expect(renderTemplate("A {x}\n\n\n\nB", {})).toBe("A\n\nB");
  });

  it("detecta variables desconocidas", () => {
    expect(variablesIn("{a} {b} {a}")).toEqual(["a", "b"]);
    expect(unknownVariables("{nombre} {foo}", ["nombre"])).toEqual(["foo"]);
  });
});

describe("catálogo de textos", () => {
  it("cada texto por defecto solo usa sus variables declaradas", () => {
    for (const [key, def] of Object.entries(TEXTS) as Array<[string, TextDef]>) {
      expect(unknownVariables(def.default, def.vars), key).toEqual([]);
    }
  });

  it("los textos cortos son de una línea y ≤ 64 caracteres", () => {
    for (const [key, def] of Object.entries(TEXTS) as Array<[string, TextDef]>) {
      if (!def.short) continue;
      expect(def.default.includes("\n"), key).toBe(false);
      expect(def.default.length, key).toBeLessThanOrEqual(64);
    }
  });

  it("las claves cumplen el formato de la base de datos", () => {
    for (const key of Object.keys(TEXTS)) expect(key).toMatch(/^[a-z][a-z0-9_.]{1,80}$/);
  });
});
