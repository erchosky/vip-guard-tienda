import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, verifyAdminTokenWithSecret } from "./modules/auth/admin-token";

const SPACE_COOKIE = "admin_space";

/**
 * Protege el panel (/admin y /api/admin). La firma del token se comprueba
 * aquí; la revocación de la sesión se comprueba en el servidor en cada página.
 * También recuerda en qué panel (VIP o Tienda) estabas.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isLogin = pathname === "/admin/login";
  const valid = isLogin ? false : await verifyAdminTokenWithSecret(request.cookies.get(ADMIN_COOKIE)?.value, process.env.SESSION_SECRET);

  if (!isLogin && !valid) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ ok: false, error: { code: "unauthorized", message: "Inicia sesión de nuevo." } }, { status: 401 });
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const headers = new Headers(request.headers);
  headers.set("x-pathname", pathname);
  const response = NextResponse.next({ request: { headers } });
  const space = pathname.startsWith("/admin/tienda") ? "tienda" : pathname.startsWith("/admin/vip") ? "vip" : null;
  if (space && request.cookies.get(SPACE_COOKIE)?.value !== space) {
    response.cookies.set(SPACE_COOKIE, space, { path: "/admin", sameSite: "lax", httpOnly: false, maxAge: 60 * 60 * 24 * 365 });
  }
  response.headers.set("x-robots-tag", "noindex, nofollow");
  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
