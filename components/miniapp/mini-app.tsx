"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Crown, Loader2, Package, RefreshCw, ShoppingBag, X } from "lucide-react";
import { renderTemplate, type TemplateVars } from "@/modules/texts/render";
import { formatHuman, timeLeft } from "@/modules/core/dates";
import type { MiniAppPayload } from "@/modules/shop/miniapp";
import type { PublicProduct } from "@/modules/shop/types";
import { applyTelegramTheme, haptic, insideTelegram, openLink, waitForWebApp, webApp } from "./telegram";

type Phase = { name: "loading" } | { name: "outside" } | { name: "error"; message: string } | { name: "ready"; data: MiniAppPayload };
type Tab = "shop" | "vip";

const money = (cents: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(cents / 100);

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function MiniApp() {
  const [phase, setPhase] = useState<Phase>({ name: "loading" });
  const initData = useRef<string>("");

  const load = useCallback(async () => {
    setPhase((p) => (p.name === "ready" ? p : { name: "loading" }));
    try {
      const res = await fetch("/api/shop", { headers: { authorization: `tma ${initData.current}` }, cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? "No se pudo cargar la tienda.");
      setPhase({ name: "ready", data: json.data as MiniAppPayload });
    } catch (error) {
      setPhase({ name: "error", message: error instanceof Error ? error.message : "No se pudo cargar la tienda." });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const app = await waitForWebApp();
      if (cancelled) return;
      if (app?.initData) {
        app.ready();
        app.expand();
        app.disableVerticalSwipes?.();
        applyTelegramTheme(app);
        initData.current = app.initData;
      } else if (process.env.NODE_ENV === "development") {
        const res = await fetch("/api/dev/initdata").then((r) => r.json()).catch(() => null);
        initData.current = res?.initData ?? "";
      }
      if (!initData.current) {
        setPhase({ name: "outside" });
        return;
      }
      await load();
    })();
    return () => { cancelled = true; };
  }, [load]);

  return (
    <div className="miniapp min-h-dvh">
      {phase.name === "loading" ? <Skeleton /> : null}
      {phase.name === "outside" ? <Centered title="Abre la tienda desde Telegram" body="Esta página solo funciona dentro del bot. Vuelve al chat y pulsa el botón de la tienda." /> : null}
      {phase.name === "error" ? (
        <Centered title="Uy, algo ha fallado" body={phase.message} action={<button onClick={() => void load()} className="mt-4 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold" style={{ background: "var(--tg-button)", color: "var(--tg-button-text)" }}><RefreshCw className="h-4 w-4" />Reintentar</button>} />
      ) : null}
      {phase.name === "ready" ? <Store data={phase.data} initData={initData.current} reload={load} /> : null}
    </div>
  );
}

function Store({ data, initData, reload }: { data: MiniAppPayload; initData: string; reload: () => Promise<void> }) {
  const [tab, setTab] = useState<Tab>("shop");
  const [category, setCategory] = useState<string | null>(null);
  const [selected, setSelected] = useState<PublicProduct | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const isVip = data.me.vip.status === "active";

  const t = useCallback(
    (key: string, vars: TemplateVars = {}) => renderTemplate(data.texts[key] ?? "", { creadora: data.brand.name, nombre: data.me.firstName, ...vars }),
    [data],
  );

  const products = useMemo(() => (category ? data.products.filter((p) => p.categoryId === category) : data.products), [data.products, category]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Botón "atrás" nativo de Telegram para cerrar la ficha.
  useEffect(() => {
    const back = webApp()?.BackButton;
    if (!back) return;
    const close = () => setSelected(null);
    if (selected) {
      back.show();
      back.onClick(close);
    } else back.hide();
    return () => back.offClick(close);
  }, [selected]);

  async function post(path: string, body: Record<string, string>) {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json", authorization: `tma ${initData}` }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? "No se pudo completar. Inténtalo de nuevo.");
    return json.data as { message: string; url: string };
  }

  async function interested(product: PublicProduct) {
    haptic("tap");
    try {
      const result = await post("/api/shop/interest", { productId: product.id });
      haptic("success");
      openLink(result.url);
      setToast(insideTelegram() ? t("shop.interest_done") : `[Modo prueba] Mensaje preparado: ${result.message}`);
    } catch (error) {
      haptic("error");
      setToast(error instanceof Error ? error.message : "Error");
      if (error instanceof Error && /disponible|existe/.test(error.message)) void reload();
    }
  }

  async function wantPlan(planId: string) {
    haptic("tap");
    try {
      const result = await post("/api/shop/plan", { planId });
      haptic("success");
      openLink(result.url);
      setToast(insideTelegram() ? t("vip.plan_done") : `[Modo prueba] Mensaje preparado: ${result.message}`);
    } catch (error) {
      haptic("error");
      setToast(error instanceof Error ? error.message : "Error");
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg pb-[calc(84px+env(safe-area-inset-bottom))]">
      <header className="px-4 pb-3 pt-5">
        <div className="flex items-center gap-3">
          {data.brand.logoUrl ? (
            <span className="relative h-12 w-12 overflow-hidden rounded-full ring-2" style={{ ["--tw-ring-color" as string]: "var(--tg-button)" }}>
              <Image src={data.brand.logoUrl} alt="" fill sizes="48px" className="object-cover" unoptimized />
            </span>
          ) : (
            <span className="grid h-12 w-12 place-items-center rounded-full text-lg font-bold" style={{ background: "var(--tg-button)", color: "var(--tg-button-text)" }}>{data.brand.name.charAt(0).toUpperCase()}</span>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold leading-tight">{tab === "shop" ? t("shop.title") : data.brand.name}</h1>
            <p className="truncate text-[13px]" style={{ color: "var(--tg-hint)" }}>{data.brand.tagline || (isVip ? "👑 VIP" : "")}</p>
          </div>
          {isVip ? <span className="rounded-full bg-amber-400/20 px-2.5 py-1 text-xs font-semibold text-amber-600">👑 VIP</span> : null}
        </div>
      </header>

      {tab === "shop" ? (
        <main>
          {t("shop.subtitle") ? <p className="px-4 pb-3 text-sm" style={{ color: "var(--tg-hint)" }}>{t("shop.subtitle")}</p> : null}
          {data.categories.length > 1 ? (
            <div className="sticky top-0 z-10 -mb-1 flex gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none]" style={{ background: "var(--tg-secondary)" }}>
              <Chip active={!category} onClick={() => { haptic("tap"); setCategory(null); }}>{t("shop.all")}</Chip>
              {data.categories.map((c) => <Chip key={c.id} active={category === c.id} onClick={() => { haptic("tap"); setCategory(c.id); }}>{c.name}</Chip>)}
            </div>
          ) : null}
          {products.length === 0 ? (
            <Centered title={t("shop.empty")} icon={<Package className="h-6 w-6" />} compact />
          ) : (
            <div className="grid grid-cols-2 gap-3 px-4 pt-3">
              {products.map((p) => <ProductCard key={p.id} product={p} t={t} onOpen={() => { haptic("tap"); setSelected(p); }} />)}
            </div>
          )}
        </main>
      ) : (
        <VipTab data={data} t={t} onPlan={wantPlan} />
      )}

      {selected ? <ProductSheet product={selected} t={t} isVip={isVip} hasContact={data.brand.hasContact} onClose={() => setSelected(null)} onInterest={interested} onVip={() => { setSelected(null); setTab("vip"); }} /> : null}

      {toast ? (
        <div className="fixed inset-x-4 bottom-[calc(92px+env(safe-area-inset-bottom))] z-50 mx-auto max-w-md animate-fade-in rounded-2xl px-4 py-3 text-sm shadow-pop" style={{ background: "var(--tg-text)", color: "var(--tg-bg)" }} role="status">
          {toast}
        </div>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-black/5 backdrop-blur" style={{ background: "color-mix(in srgb, var(--tg-bg) 92%, transparent)" }}>
        <div className="mx-auto grid max-w-lg grid-cols-2 pb-[env(safe-area-inset-bottom)]">
          <TabButton active={tab === "shop"} onClick={() => { haptic("tap"); setTab("shop"); }} icon={<ShoppingBag className="h-5 w-5" />}>{t("miniapp.tab_shop")}</TabButton>
          <TabButton active={tab === "vip"} onClick={() => { haptic("tap"); setTab("vip"); }} icon={<Crown className="h-5 w-5" />}>{t("miniapp.tab_vip")}</TabButton>
        </div>
      </nav>
    </div>
  );
}

function ProductCard({ product, t, onOpen }: { product: PublicProduct; t: (k: string, v?: TemplateVars) => string; onOpen: () => void }) {
  const sold = product.status === "sold";
  const badge = sold ? t("shop.badge_sold") : product.status === "reserved" ? t("shop.badge_reserved") : product.price.offerActive ? t("shop.badge_offer") : null;
  return (
    <button onClick={onOpen} className="flex h-full flex-col justify-start overflow-hidden rounded-2xl text-left shadow-sm transition active:scale-[.98]" style={{ background: "var(--tg-bg)" }}>
      <div className="relative aspect-[4/5] w-full" style={{ background: "var(--tg-secondary)" }}>
        {product.images[0] ? (
          <Image src={product.images[0].url} alt={product.title} fill sizes="(max-width: 512px) 50vw, 256px" className={cx("object-cover", sold && "opacity-60 grayscale")} unoptimized />
        ) : <div className="grid h-full place-items-center" style={{ color: "var(--tg-hint)" }}><Package className="h-8 w-8" /></div>}
        {badge ? <span className={cx("absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide text-white", badge === t("shop.badge_offer") ? "bg-rose-600" : "bg-black/70")}>{badge}</span> : null}
      </div>
      <div className="p-2.5">
        <p className="line-clamp-2 text-[13px] font-semibold leading-snug">{product.title}</p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
          <span className={cx("text-[15px] font-bold", product.price.isVipPrice && "text-amber-600")}>{money(product.price.finalCents)}</span>
          {product.price.compareAtCents ? <span className="text-xs line-through" style={{ color: "var(--tg-hint)" }}>{money(product.price.compareAtCents)}</span> : null}
        </div>
        {product.price.vipAdvantage && !product.price.isVipPrice ? <p className="mt-0.5 text-[11px] font-medium text-amber-600">👑 {money(product.price.vipCents)}</p> : null}
      </div>
    </button>
  );
}

function ProductSheet({ product, t, isVip, hasContact, onClose, onInterest, onVip }: {
  product: PublicProduct; t: (k: string, v?: TemplateVars) => string; isVip: boolean; hasContact: boolean;
  onClose: () => void; onInterest: (p: PublicProduct) => Promise<void>; onVip: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [index, setIndex] = useState(0);
  const sold = product.status === "sold";
  const reserved = product.status === "reserved";

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: "var(--tg-bg)" }} role="dialog" aria-modal="true">
      <div className="mx-auto max-w-lg pb-[calc(96px+env(safe-area-inset-bottom))]">
        <div className="relative">
          <div
            className="flex aspect-[4/5] snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]"
            style={{ background: "var(--tg-secondary)" }}
            onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
          >
            {product.images.length ? product.images.map((img, i) => (
              <div key={img.url} className="relative h-full w-full shrink-0 snap-center">
                <Image src={img.url} alt={`${product.title} ${i + 1}`} fill sizes="512px" className={cx("object-cover", sold && "grayscale")} priority={i === 0} unoptimized />
              </div>
            )) : <div className="grid h-full w-full place-items-center" style={{ color: "var(--tg-hint)" }}><Package className="h-10 w-10" /></div>}
          </div>
          {product.images.length > 1 ? (
            <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
              {product.images.map((img, i) => <span key={img.url} className={cx("h-1.5 rounded-full bg-white transition-all", i === index ? "w-4" : "w-1.5 opacity-60")} />)}
            </div>
          ) : null}
          <button onClick={onClose} className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-black/50 text-white" aria-label="Cerrar"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4 px-4 pt-4">
          <div className="flex flex-wrap gap-1.5">
            {sold ? <Tag dark>{t("shop.badge_sold")}</Tag> : null}
            {reserved ? <Tag dark>{t("shop.badge_reserved")}</Tag> : null}
            {product.price.offerActive ? <Tag offer>{t("shop.badge_offer")}</Tag> : null}
            {product.isUnique ? <Tag>{t("shop.badge_unique")}</Tag> : null}
            {product.fulfillment === "digital" ? <Tag>{t("shop.badge_digital")}</Tag> : null}
          </div>
          <h2 className="text-xl font-bold leading-snug">{product.title}</h2>

          <div className="rounded-2xl p-4" style={{ background: "var(--tg-secondary)" }}>
            {product.price.isVipPrice ? <p className="mb-1 text-xs font-semibold text-amber-600">{t("shop.vip_price")}</p> : null}
            <div className="flex items-baseline gap-2">
              <span className={cx("text-3xl font-extrabold tracking-tight", product.price.isVipPrice && "text-amber-600")}>{money(product.price.finalCents)}</span>
              {product.price.compareAtCents ? <span className="text-base line-through" style={{ color: "var(--tg-hint)" }}>{money(product.price.compareAtCents)}</span> : null}
            </div>
            {product.price.offerActive && product.price.offerEndsAt ? <p className="mt-1 text-sm font-medium text-rose-600">⏳ {t("shop.offer_ends", { tiempo: timeLeft(product.price.offerEndsAt) })}</p> : null}
            {!isVip && product.price.vipAdvantage ? (
              <button onClick={onVip} className="mt-2 text-sm font-semibold text-amber-600 underline-offset-2 active:underline">{t("shop.vip_upsell", { precio_vip: money(product.price.vipCents) })}</button>
            ) : null}
          </div>

          {product.size || product.color ? (
            <div className="grid grid-cols-2 gap-2">
              {product.size ? <Detail label={t("shop.size")} value={product.size} /> : null}
              {product.color ? <Detail label={t("shop.color")} value={product.color} /> : null}
            </div>
          ) : null}
          {product.description ? <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{product.description}</p> : null}
          <p className="text-sm" style={{ color: "var(--tg-hint)" }}>{product.fulfillment === "digital" ? t("shop.digital_note") : t("shop.shipping_note")}</p>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3" style={{ background: "linear-gradient(to top, var(--tg-bg) 70%, transparent)" }}>
        <button
          disabled={sold || busy || !hasContact}
          onClick={async () => { setBusy(true); await onInterest(product); setBusy(false); }}
          className="mx-auto flex h-14 w-full max-w-lg items-center justify-center gap-2 rounded-2xl text-base font-bold shadow-lg transition active:scale-[.98] disabled:opacity-50"
          style={{ background: "var(--tg-button)", color: "var(--tg-button-text)" }}
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
          {sold ? t("shop.badge_sold") : reserved ? t("shop.cta_reserved") : t("shop.cta_interest")}
        </button>
      </div>
    </div>
  );
}

function VipTab({ data, t, onPlan }: { data: MiniAppPayload; t: (k: string, v?: TemplateVars) => string; onPlan: (id: string) => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const { status, endsAt } = data.me.vip;
  const active = status === "active" && endsAt;
  return (
    <main className="space-y-4 px-4">
      <section className={cx("overflow-hidden rounded-3xl p-5", active ? "bg-gradient-to-br from-amber-400 to-amber-600 text-white" : "")} style={active ? undefined : { background: "var(--tg-bg)" }}>
        <p className="text-2xl font-extrabold">{active ? t("vip.active_title") : status === "expired" ? t("vip.expired_title") : t("vip.none_title")}</p>
        <p className={cx("mt-1 text-[15px]", active ? "text-white/90" : "")} style={active ? undefined : { color: "var(--tg-hint)" }}>
          {active ? t("vip.active_body", { dias_restantes: timeLeft(endsAt), fecha_fin: formatHuman(endsAt) }) : status === "expired" && endsAt ? t("vip.expired_body", { fecha_fin: formatHuman(endsAt) }) : t("vip.none_body")}
        </p>
        {active && data.inviteLink ? (
          <button onClick={() => { haptic("tap"); openLink(data.inviteLink!); }} className="mt-4 h-11 rounded-xl bg-white px-5 text-sm font-bold text-amber-700 active:scale-[.98]">{t("vip.join_cta")}</button>
        ) : null}
      </section>

      {data.plans.length ? (
        <section className="space-y-3">
          {data.plans.map((plan) => (
            <div key={plan.id} className={cx("rounded-2xl p-4", plan.isFeatured && "ring-2 ring-amber-500")} style={{ background: "var(--tg-bg)" }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-base font-bold">{plan.name}{plan.isFeatured ? <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">★</span> : null}</p>
                  <p className="text-[13px]" style={{ color: "var(--tg-hint)" }}>{plan.durationLabel}{plan.description ? ` · ${plan.description}` : ""}</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-extrabold">{money(plan.priceCents)}</p>
                  <p className="text-[11px]" style={{ color: "var(--tg-hint)" }}>{data.me.hasPaidBefore ? t("vip.renewal_price") : t("vip.first_price")}</p>
                </div>
              </div>
              <button
                disabled={busy !== null || !data.brand.hasContact}
                onClick={async () => { setBusy(plan.id); await onPlan(plan.id); setBusy(null); }}
                className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold transition active:scale-[.98] disabled:opacity-50"
                style={{ background: "var(--tg-button)", color: "var(--tg-button-text)" }}
              >
                {busy === plan.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {status === "active" ? t("vip.renew_cta") : t("vip.plan_cta")}
              </button>
            </div>
          ))}
        </section>
      ) : null}
    </main>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="h-9 shrink-0 rounded-full px-4 text-sm font-medium transition" style={active ? { background: "var(--tg-button)", color: "var(--tg-button-text)" } : { background: "var(--tg-bg)", color: "var(--tg-text)" }}>
      {children}
    </button>
  );
}

function Tag({ children, dark, offer }: { children: React.ReactNode; dark?: boolean; offer?: boolean }) {
  return <span className={cx("rounded-full px-2.5 py-1 text-[11px] font-bold", offer ? "bg-rose-600 text-white" : dark ? "bg-black/80 text-white" : "")} style={!offer && !dark ? { background: "var(--tg-secondary)", color: "var(--tg-hint)" } : undefined}>{children}</span>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: "var(--tg-secondary)" }}>
      <p className="text-[11px]" style={{ color: "var(--tg-hint)" }}>{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold" style={{ color: active ? "var(--tg-button)" : "var(--tg-hint)" }} aria-current={active ? "page" : undefined}>
      {icon}
      {children}
    </button>
  );
}

function Centered({ title, body, action, icon, compact }: { title: string; body?: string; action?: React.ReactNode; icon?: React.ReactNode; compact?: boolean }) {
  return (
    <div className={cx("flex flex-col items-center justify-center px-8 text-center", compact ? "py-16" : "min-h-dvh")}>
      {icon ? <div className="mb-3" style={{ color: "var(--tg-hint)" }}>{icon}</div> : null}
      <p className="text-lg font-bold">{title}</p>
      {body ? <p className="mt-1 text-sm" style={{ color: "var(--tg-hint)" }}>{body}</p> : null}
      {action}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="mx-auto max-w-lg animate-pulse px-4 pt-5">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-full" style={{ background: "var(--tg-bg)" }} />
        <div className="space-y-2"><div className="h-4 w-40 rounded" style={{ background: "var(--tg-bg)" }} /><div className="h-3 w-24 rounded" style={{ background: "var(--tg-bg)" }} /></div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="aspect-[4/6] rounded-2xl" style={{ background: "var(--tg-bg)" }} />)}
      </div>
    </div>
  );
}
