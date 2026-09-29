import "server-only";
import { NextResponse } from "next/server";
import { AppError } from "./errors";

export function ok(data: unknown, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, { ...init, headers: { "cache-control": "no-store", ...(init?.headers ?? {}) } });
}

export function fail(error: unknown) {
  if (error instanceof AppError) {
    if (error.status >= 500) console.error("[api]", error.code, error.context ?? "");
    return NextResponse.json({ ok: false, error: { code: error.code, message: error.publicMessage } }, { status: error.status, headers: { "cache-control": "no-store" } });
  }
  console.error("[api] unhandled", error);
  return NextResponse.json({ ok: false, error: { code: "internal", message: "Algo ha fallado. Inténtalo de nuevo." } }, { status: 500, headers: { "cache-control": "no-store" } });
}
