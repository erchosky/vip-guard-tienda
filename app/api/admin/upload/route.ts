import type { NextRequest } from "next/server";
import { fail, ok } from "@/modules/core/http";
import { AppError } from "@/modules/core/errors";
import { isAdmin } from "@/modules/auth/session";
import { isSameOrigin } from "@/modules/core/security/origin";
import { uploadImage } from "@/modules/shop/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sube una foto (una por petición, ya optimizada en el navegador). */
export async function POST(request: NextRequest) {
  try {
    if (!(await isAdmin())) throw new AppError("unauthorized", "Inicia sesión de nuevo.", 401);
    if (!isSameOrigin(request.headers.get("origin"), request.headers.get("x-forwarded-host") ?? request.headers.get("host"), request.headers.get("x-forwarded-proto"))) {
      throw new AppError("bad_origin", "Petición no permitida.", 403);
    }
    const form = await request.formData();
    const folder = form.get("folder");
    if (folder !== "products" && folder !== "categories" && folder !== "brand") throw new AppError("bad_folder", "Destino no válido.");
    try {
      return ok(await uploadImage(form.get("file"), folder));
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("upload_failed", error instanceof Error ? error.message : "No se pudo subir la imagen.", 400);
    }
  } catch (error) {
    return fail(error);
  }
}
