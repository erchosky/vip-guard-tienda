/**
 * Errores de aplicación con mensaje en español listo para enseñar. Los códigos
 * que lanzan las funciones SQL (raise exception 'codigo') se traducen aquí.
 */
export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly publicMessage: string;
  readonly context?: Record<string, unknown>;

  constructor(code: string, publicMessage: string, status = 400, context?: Record<string, unknown>) {
    super(`${code}: ${publicMessage}`);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.publicMessage = publicMessage;
    this.context = context;
  }
}

const SQL_MESSAGES: Record<string, [string, number]> = {
  plan_not_found: ["Ese plan no existe o está archivado.", 404],
  customer_not_found: ["No se encuentra ese cliente.", 404],
  no_subscription: ["Este cliente no tiene suscripción VIP.", 404],
  use_days_or_date: ["Indica días o una fecha, no las dos cosas.", 400],
  invalid_days: ["El número de días no es válido.", 400],
  invalid_amount: ["El importe no es válido.", 400],
  product_not_found: ["Ese producto no existe.", 404],
  product_already_sold: ["Esa pieza única ya está vendida.", 409],
  product_not_available: ["Este producto ya no está disponible.", 409],
};

const CONSTRAINT_MESSAGES: Array<[RegExp, string]> = [
  [/shop_products_offer_price/, "El precio de oferta tiene que ser menor que el precio normal."],
  [/shop_products_offer_dates/, "La fecha de fin de la oferta tiene que ser posterior a la de inicio."],
  [/shop_products_offer_complete/, "Para programar fechas de oferta pon también el precio de oferta."],
  [/shop_products_vip_price/, "El precio VIP no puede ser mayor que el precio normal."],
  [/shop_categories_slug/, "El identificador de la categoría solo admite minúsculas, números y guiones."],
  [/shop_categories_slug_key|duplicate key.*slug/, "Ya existe una categoría con ese identificador."],
  [/vip_payments_paid_has_method|vip_payments_method|shop_sales_method/, "Elige un método de pago válido."],
  [/shop_sales_buyer/, "Indica el cliente o escribe quién es el comprador."],
  [/vip_plans_duration/, "La duración tiene que estar entre 1 y 3650 días."],
  [/text_overrides_body/, "El texto no puede estar vacío ni superar 4000 caracteres."],
  [/customers_telegram_id_key/, "Ese cliente ya existe."],
];

export function dbError(error: { message: string; code?: string; details?: string }, context: string): AppError {
  const known = SQL_MESSAGES[error.message];
  if (known) return new AppError(error.message, known[0], known[1], { context });
  for (const [pattern, message] of CONSTRAINT_MESSAGES) {
    if (pattern.test(error.message) || pattern.test(error.details ?? "")) {
      return new AppError("constraint", message, 400, { context, pg: error.code });
    }
  }
  return new AppError("db_error", "No se pudo guardar. Inténtalo de nuevo en unos segundos.", 500, {
    context,
    pg: error.code,
    message: error.message,
  });
}

export function publicMessage(error: unknown): string {
  if (error instanceof AppError) return error.publicMessage;
  return "Algo ha fallado. Inténtalo de nuevo en unos segundos.";
}
