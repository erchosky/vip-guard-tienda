/**
 * Motor de plantillas de los textos editables.
 *
 *  - {variable}   se sustituye por su valor.
 *  - [ ... ]      trozo opcional: solo aparece si todas las variables que
 *                 contiene tienen valor. Ej: "tu {producto}[ talla {talla}]".
 *
 * Sin HTML ni código: los textos se envían como texto plano, así que nada de
 * lo que se escriba en el panel puede romper el formato de Telegram.
 */
export type TemplateVars = Record<string, string | number | null | undefined>;

const VAR = /\{([a-z_][a-z0-9_]*)\}/g;
const OPTIONAL = /\[([^[\]]*)\]/g;

function valueOf(vars: TemplateVars, name: string): string {
  const value = vars[name];
  if (value === null || value === undefined) return "";
  return String(value);
}

export function renderTemplate(template: string, vars: TemplateVars = {}): string {
  const withOptionals = template.replace(OPTIONAL, (whole, inner: string) => {
    const names = [...inner.matchAll(VAR)].map((m) => m[1]);
    if (names.length === 0) return whole;
    return names.every((name) => valueOf(vars, name).trim() !== "") ? inner : "";
  });
  return withOptionals
    .replace(VAR, (_, name: string) => valueOf(vars, name))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Variables usadas en una plantilla. */
export function variablesIn(template: string): string[] {
  return [...new Set([...template.matchAll(VAR)].map((m) => m[1]))];
}

/** Variables que la plantilla usa pero que ese texto no admite. */
export function unknownVariables(template: string, allowed: readonly string[]): string[] {
  return variablesIn(template).filter((name) => !allowed.includes(name));
}
