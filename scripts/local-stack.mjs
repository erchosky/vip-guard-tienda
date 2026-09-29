#!/usr/bin/env node
/**
 * Entorno local completo SIN Docker, para desarrollo y pruebas de punta a punta:
 *
 *   - Postgres (binarios de Homebrew) con las migraciones y el seed.
 *   - PostgREST: el mismo motor REST que usa Supabase.
 *   - Proxy en :54321 que imita las rutas de Supabase (/rest/v1 y /storage/v1).
 *   - Telegram simulado en :54320 (guarda los mensajes que "envía" el bot) y
 *     POST /__update para simular que un usuario escribe al bot.
 *
 * Uso: node scripts/local-stack.mjs   (Ctrl+C para parar; los datos se borran)
 * Escribe .local/env con las variables para `next dev`.
 */
import { spawn, execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { createServer, request as httpRequest } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PG_PORT = 54398;
const PGRST_PORT = 54396;
const PROXY_PORT = 54321;
const TG_PORT = 54320;
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const JWT_SECRET = "local-dev-jwt-secret-with-at-least-32-characters!!";
const BOT_TOKEN = "123456789:AAlocal_fake_token_for_dev_only_xxxxxx";
const WEBHOOK_SECRET = "local_webhook_secret_1234";
const CHANNEL_ID = -1001234567890;

process.env.LC_ALL = "C";
process.env.LANG = "C";

const work = mkdtempSync(join(tmpdir(), "vipguard-local-"));
const storageDir = join(work, "storage");
mkdirSync(storageDir, { recursive: true });
const children = [];

function b64url(input) {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function jwt(payload) {
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", JWT_SECRET).update(`${head}.${body}`).digest("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${head}.${body}.${sig}`;
}
const SERVICE_KEY = jwt({ role: "service_role", iss: "local", iat: 1700000000, exp: 4102444800 });

function psql(sqlOrFile, isFile = false) {
  const args = ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-h", work, "-p", String(PG_PORT), "-U", "postgres", "-d", "postgres"];
  execFileSync("psql", isFile ? [...args, "-f", sqlOrFile] : [...args, "-c", sqlOrFile], { stdio: ["ignore", "ignore", "inherit"] });
}

function cleanup() {
  for (const child of children) try { child.kill("SIGTERM"); } catch { /* ya parado */ }
  try { execFileSync("pg_ctl", ["-D", join(work, "data"), "-m", "immediate", "stop"], { stdio: "ignore" }); } catch { /* ya parado */ }
  rmSync(work, { recursive: true, force: true });
}
process.on("SIGINT", () => { cleanup(); process.exit(0); });
process.on("SIGTERM", () => { cleanup(); process.exit(0); });

// ─── Postgres ───
execFileSync("initdb", ["-D", join(work, "data"), "-U", "postgres", "--auth=trust", "--no-locale", "-E", "UTF8"], { stdio: "ignore" });
execFileSync("pg_ctl", ["-D", join(work, "data"), "-o", `-p ${PG_PORT} -k ${work} -c listen_addresses=''`, "-l", join(work, "pg.log"), "-w", "start"], { stdio: "ignore" });
psql(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; create role authenticator login noinherit; grant anon, authenticated, service_role to authenticator;`);
for (const file of readdirSync(join(ROOT, "supabase/migrations")).sort()) psql(join(ROOT, "supabase/migrations", file), true);
psql(join(ROOT, "supabase/seed.sql"), true);
psql(`update public.vip_channel set telegram_chat_id = ${CHANNEL_ID}, title = 'Canal VIP (simulado)' where id = 1;`);
console.log("✓ Postgres con migraciones y seed");

// ─── PostgREST ───
const pgrst = spawn("postgrest", [], {
  env: {
    ...process.env,
    PGRST_DB_URI: `postgres://authenticator@/postgres?host=${encodeURIComponent(work)}&port=${PG_PORT}`,
    PGRST_DB_SCHEMAS: "public",
    PGRST_DB_ANON_ROLE: "anon",
    PGRST_JWT_SECRET: JWT_SECRET,
    PGRST_SERVER_PORT: String(PGRST_PORT),
    PGRST_SERVER_HOST: "127.0.0.1",
    PGRST_LOG_LEVEL: "warn",
  },
  stdio: ["ignore", "inherit", "inherit"],
});
children.push(pgrst);

// ─── Proxy Supabase (REST + Storage) ───
function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}
function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}
const storageMeta = new Map();

createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PROXY_PORT}`);
  if (url.pathname.startsWith("/rest/v1")) {
    const target = url.pathname.slice("/rest/v1".length) + url.search;
    const proxied = httpRequest({ host: "127.0.0.1", port: PGRST_PORT, path: target || "/", method: req.method, headers: { ...req.headers, host: `127.0.0.1:${PGRST_PORT}` } }, (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    });
    proxied.on("error", () => json(res, 502, { message: "postgrest down" }));
    req.pipe(proxied);
    return;
  }
  const publicMatch = url.pathname.match(/^\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
  if (publicMatch && req.method === "GET") {
    const file = join(storageDir, publicMatch[1], decodeURIComponent(publicMatch[2]));
    if (!existsSync(file)) return json(res, 404, { message: "not found" });
    res.writeHead(200, { "content-type": storageMeta.get(file) ?? "application/octet-stream", "cache-control": "public, max-age=60", "access-control-allow-origin": "*" });
    return res.end(readFileSync(file));
  }
  const listMatch = url.pathname.match(/^\/storage\/v1\/object\/list\/([^/]+)$/);
  if (listMatch && req.method === "POST") {
    const body = JSON.parse((await readBody(req)).toString() || "{}");
    const dir = join(storageDir, listMatch[1], body.prefix ?? "");
    if (!existsSync(dir)) return json(res, 200, []);
    return json(res, 200, readdirSync(dir).map((name) => ({ name, id: name, created_at: statSync(join(dir, name)).birthtime.toISOString() })));
  }
  const objectMatch = url.pathname.match(/^\/storage\/v1\/object\/([^/]+)(?:\/(.+))?$/);
  if (objectMatch && req.method === "POST" && objectMatch[2]) {
    const file = join(storageDir, objectMatch[1], decodeURIComponent(objectMatch[2]));
    mkdirSync(dirname(file), { recursive: true });
    const body = await readBody(req);
    const type = req.headers["content-type"] ?? "application/octet-stream";
    // storage-js envía FormData o el binario directamente.
    if (String(type).startsWith("multipart/form-data")) {
      const boundary = String(type).split("boundary=")[1];
      const parts = body.toString("latin1").split(`--${boundary}`);
      const filePart = parts.find((p) => p.includes("filename=") || p.includes('name=""'));
      const start = filePart.indexOf("\r\n\r\n") + 4;
      const contentType = /Content-Type: ([^\r\n]+)/i.exec(filePart)?.[1] ?? "application/octet-stream";
      writeFileSync(file, Buffer.from(filePart.slice(start, filePart.length - 2), "latin1"));
      storageMeta.set(file, contentType);
    } else {
      writeFileSync(file, body);
      storageMeta.set(file, String(type));
    }
    return json(res, 200, { Key: `${objectMatch[1]}/${objectMatch[2]}`, Id: randomUUID() });
  }
  if (objectMatch && req.method === "DELETE" && !objectMatch[2]) {
    const body = JSON.parse((await readBody(req)).toString() || "{}");
    for (const prefix of body.prefixes ?? []) rmSync(join(storageDir, objectMatch[1], prefix), { force: true });
    return json(res, 200, (body.prefixes ?? []).map((name) => ({ name })));
  }
  json(res, 404, { message: `sin simular: ${req.method} ${url.pathname}` });
}).listen(PROXY_PORT, "127.0.0.1");
console.log(`✓ Supabase simulado en http://127.0.0.1:${PROXY_PORT}`);

// ─── Telegram simulado ───
const sent = [];
const channelMembers = new Set();
let updateId = 1000;
let webhook = { url: "", pending_update_count: 0 };
const BOT = { id: 123456789, is_bot: true, first_name: "VIP Bot", username: "vip_local_bot" };

async function tgMethod(method, p) {
  switch (method) {
    case "getMe": return BOT;
    case "sendMessage": {
      if (String(p.chat_id) === "700000099") throw { error_code: 403, description: "Forbidden: bot was blocked by the user" };
      const message = { message_id: sent.length + 1, chat: { id: Number(p.chat_id), type: "private" }, date: Math.floor(Date.now() / 1000), text: p.text, reply_markup: p.reply_markup };
      sent.push({ at: new Date().toISOString(), chat_id: Number(p.chat_id), text: p.text, buttons: p.reply_markup?.inline_keyboard ?? null });
      return message;
    }
    case "getChat": return { id: Number(p.chat_id), type: "channel", title: "Canal VIP (simulado)", has_protected_content: true };
    case "getChatMember": return { status: "administrator", user: BOT, can_invite_users: true, can_restrict_members: true };
    case "createChatInviteLink": return { invite_link: `https://t.me/+local${Math.random().toString(36).slice(2, 10)}`, creates_join_request: true, name: p.name };
    case "revokeChatInviteLink": return { invite_link: p.invite_link };
    case "banChatMember": channelMembers.delete(Number(p.user_id)); sent.push({ at: new Date().toISOString(), action: "ban", user_id: Number(p.user_id) }); return true;
    case "unbanChatMember": sent.push({ at: new Date().toISOString(), action: "unban", user_id: Number(p.user_id) }); return true;
    case "approveChatJoinRequest": channelMembers.add(Number(p.user_id)); sent.push({ at: new Date().toISOString(), action: "approve", user_id: Number(p.user_id) }); return true;
    case "declineChatJoinRequest": sent.push({ at: new Date().toISOString(), action: "decline", user_id: Number(p.user_id) }); return true;
    case "setWebhook": webhook = { url: p.url, pending_update_count: 0 }; return true;
    case "getWebhookInfo": return { url: webhook.url, has_custom_certificate: false, pending_update_count: 0 };
    case "setMyCommands": case "setChatMenuButton": case "answerCallbackQuery": return true;
    default: throw { error_code: 400, description: `Bad Request: método no simulado ${method}` };
  }
}

async function deliver(update) {
  const res = await fetch(`${APP_URL}/api/telegram/webhook`, { method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": WEBHOOK_SECRET }, body: JSON.stringify({ update_id: ++updateId, ...update }) });
  return { status: res.status, body: await res.text() };
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${TG_PORT}`);
  if (url.pathname === "/__messages") return json(res, 200, sent);
  if (url.pathname === "/__reset") { sent.length = 0; return json(res, 200, { ok: true }); }
  if (url.pathname === "/__update" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)).toString());
    return json(res, 200, await deliver(body));
  }
  const match = url.pathname.match(/^\/bot([^/]+)\/(\w+)$/);
  if (!match) return json(res, 404, { ok: false });
  if (match[1] !== BOT_TOKEN) return json(res, 401, { ok: false, error_code: 401, description: "Unauthorized" });
  const raw = (await readBody(req)).toString();
  let params = {};
  if (raw) {
    try { params = JSON.parse(raw); } catch { params = Object.fromEntries(new URLSearchParams(raw)); }
  }
  try {
    json(res, 200, { ok: true, result: await tgMethod(match[2], params) });
  } catch (error) {
    json(res, 200, { ok: false, error_code: error.error_code ?? 500, description: error.description ?? String(error) });
  }
}).listen(TG_PORT, "127.0.0.1");
console.log(`✓ Telegram simulado en http://127.0.0.1:${TG_PORT} (mensajes: /__messages)`);

const envFile = [
  `SUPABASE_URL=http://127.0.0.1:${PROXY_PORT}`,
  `SUPABASE_SERVICE_ROLE_KEY=${SERVICE_KEY}`,
  `TELEGRAM_BOT_TOKEN=${BOT_TOKEN}`,
  `TELEGRAM_WEBHOOK_SECRET=${WEBHOOK_SECRET}`,
  `ADMIN_PASSWORD=local-admin-1234`,
  `SESSION_SECRET=local-session-secret-with-more-than-32-chars`,
  `CRON_SECRET=local-cron-secret-1234`,
  `NEXT_PUBLIC_APP_URL=${APP_URL}`,
  `E2E_TEST_MODE=1`,
  `TEST_TELEGRAM_API_ROOT=http://127.0.0.1:${TG_PORT}`,
].join("\n");
mkdirSync(join(ROOT, ".local"), { recursive: true });
writeFileSync(join(ROOT, ".local/env"), `${envFile}\n`);
console.log("✓ Variables en .local/env  →  set -a; source .local/env; set +a; npx next dev");
console.log("  Contraseña del panel local: local-admin-1234");
