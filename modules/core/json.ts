import "server-only";

import { AppError } from "./errors";

export type BoundedJsonOptions = {
  maxBytes: number;
};

/**
 * Read a JSON request without trusting proxy metadata alone.
 *
 * The declared Content-Length is rejected early when possible, while the body
 * stream is still counted so a missing or forged header cannot bypass the
 * limit. Compressed request bodies are deliberately unsupported: the public
 * API does not need them and accepting them would complicate size guarantees.
 */
export async function readBoundedJson(
  request: Request,
  { maxBytes }: BoundedJsonOptions,
): Promise<unknown> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new RangeError("maxBytes must be a positive safe integer");
  }

  assertJsonContentType(request.headers.get("content-type"));
  assertIdentityEncoding(request.headers.get("content-encoding"));
  assertDeclaredLength(request.headers.get("content-length"), maxBytes);

  const bytes = await readBodyBytes(request, maxBytes);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw invalidJson();
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw invalidJson();
  }
}

function assertJsonContentType(contentType: string | null): void {
  const mediaType = contentType?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new AppError("unsupported_media_type", "La solicitud debe enviarse como JSON.", 415);
  }
}

function assertIdentityEncoding(contentEncoding: string | null): void {
  const encoding = contentEncoding?.trim().toLowerCase();
  if (encoding && encoding !== "identity") {
    throw new AppError("unsupported_content_encoding", "El cuerpo comprimido no está permitido.", 415);
  }
}

function assertDeclaredLength(contentLength: string | null, maxBytes: number): void {
  if (contentLength === null) return;
  if (!/^\d+$/.test(contentLength)) {
    throw new AppError("invalid_content_length", "La longitud declarada del cuerpo no es válida.", 400);
  }
  if (BigInt(contentLength) > BigInt(maxBytes)) throw payloadTooLarge(maxBytes);
}

async function readBodyBytes(request: Request, maxBytes: number): Promise<Uint8Array> {
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel("JSON payload exceeds configured limit");
        throw payloadTooLarge(maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function payloadTooLarge(maxBytes: number): AppError {
  return new AppError("payload_too_large", "El cuerpo de la solicitud es demasiado grande.", 413);
}

function invalidJson(): AppError {
  return new AppError("invalid_json", "El cuerpo JSON no es válido.", 400);
}
