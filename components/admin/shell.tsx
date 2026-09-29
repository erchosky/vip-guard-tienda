"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  BarChart3, Bell, Crown, FileText, LayoutDashboard, LogOut, Megaphone, Menu, MessageSquareText, Monitor, Moon,
  Package, Radio, Receipt, Settings2, ShoppingBag, Sparkles, Sun, Tags, UsersRound, Wallet, X,
} from "lucide-react";
import { cn } from "@/components/ui/cn";

export type Space = "vip" | "tienda";
type Theme = "light" | "dark" | "system";

type NavItem = { href: string; label: string; icon: ReactNode; badge?: number; exact?: boolean };

export function AdminShell({
  space,
  theme: initialTheme,
  counts,
  broadcasts,
  brandName,
  logoutAction,
  children,
}: {
  space: Space;
  theme: Theme;
  counts: { alerts: number; interests: number };
  broadcasts: boolean;
  brandName: string;
  logoutAction: () => Promise<void>;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => setOpen(false), [pathname]);

  const vipNav: NavItem[] = [
    { href: "/admin/vip", label: "Resumen", icon: <LayoutDashboard className="h-[18px] w-[18px]" />, exact: true },
    { href: "/admin/vip/miembros", label: "Miembros", icon: <Crown className="h-[18px] w-[18px]" /> },
    { href: "/admin/vip/pagos", label: "Pagos", icon: <Wallet className="h-[18px] w-[18px]" /> },
    { href: "/admin/vip/planes", label: "Planes y precios", icon: <Tags className="h-[18px] w-[18px]" /> },
    { href: "/admin/vip/textos", label: "Textos del bot", icon: <MessageSquareText className="h-[18px] w-[18px]" /> },
    { href: "/admin/vip/canal", label: "Canal y bot", icon: <Radio className="h-[18px] w-[18px]" /> },
    { href: "/admin/vip/actividad", label: "Alertas e historial", icon: <Bell className="h-[18px] w-[18px]" />, badge: counts.alerts },
    ...(broadcasts ? [{ href: "/admin/vip/difusion", label: "Difusión", icon: <Megaphone className="h-[18px] w-[18px]" /> }] : []),
  ];
  const shopNav: NavItem[] = [
    { href: "/admin/tienda", label: "Resumen", icon: <LayoutDashboard className="h-[18px] w-[18px]" />, exact: true },
    { href: "/admin/tienda/productos", label: "Productos", icon: <Package className="h-[18px] w-[18px]" /> },
    { href: "/admin/tienda/categorias", label: "Categorías", icon: <Tags className="h-[18px] w-[18px]" /> },
    { href: "/admin/tienda/intereses", label: "Intereses", icon: <Sparkles className="h-[18px] w-[18px]" />, badge: counts.interests },
    { href: "/admin/tienda/ventas", label: "Ventas", icon: <Receipt className="h-[18px] w-[18px]" /> },
    { href: "/admin/tienda/textos", label: "Textos de la tienda", icon: <FileText className="h-[18px] w-[18px]" /> },
    { href: "/admin/tienda/ajustes", label: "Ajustes", icon: <Settings2 className="h-[18px] w-[18px]" /> },
  ];
  const common: NavItem[] = [
    { href: "/admin/clientes", label: "Clientes", icon: <UsersRound className="h-[18px] w-[18px]" /> },
    { href: "/admin/informes", label: "Informes y Excel", icon: <BarChart3 className="h-[18px] w-[18px]" /> },
  ];
  const nav = space === "vip" ? vipNav : shopNav;

  function changeTheme(next: Theme) {
    setTheme(next);
    document.cookie = `admin_theme=${next}; path=/; max-age=31536000; samesite=lax`;
    document.getElementById("admin-root")?.setAttribute("data-theme", next);
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-4 pb-3 pt-5">
        <p className="truncate text-[15px] font-semibold">{brandName}</p>
        <p className="text-xs text-muted">Panel de control</p>
      </div>
      <div className="px-3">
        <SpaceSwitcher space={space} />
      </div>
      <nav className="mt-4 flex-1 space-y-0.5 overflow-y-auto px-3" aria-label="Secciones">
        {nav.map((item) => <NavLink key={item.href} item={item} pathname={pathname} />)}
        <p className="px-3 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-wider text-muted/80">General</p>
        {common.map((item) => <NavLink key={item.href} item={item} pathname={pathname} />)}
      </nav>
      <div className="space-y-3 border-t border-line p-3">
        <ThemeSwitcher theme={theme} onChange={changeTheme} />
        <form action={logoutAction}>
          <button className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-sm text-muted hover:bg-subtle hover:text-fg">
            <LogOut className="h-4 w-4" /> Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div id="admin-root" data-theme={theme} className="min-h-dvh bg-canvas text-fg">
      <div data-space={space} className="min-h-dvh">
        <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line bg-surface lg:block">{sidebar}</aside>

        <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-surface/90 px-3 backdrop-blur lg:hidden">
          <button onClick={() => setOpen(true)} className="grid h-10 w-10 place-items-center rounded-lg hover:bg-subtle" aria-label="Abrir menú">
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <SpaceSwitcher space={space} compact />
          </div>
          {counts.alerts > 0 ? (
            <Link href="/admin/vip/actividad" className="relative grid h-10 w-10 place-items-center rounded-lg hover:bg-subtle" aria-label="Alertas">
              <Bell className="h-5 w-5" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger" />
            </Link>
          ) : null}
        </header>

        {open ? (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
            <button className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-label="Cerrar menú" />
            <div className="absolute inset-y-0 left-0 w-[82%] max-w-xs animate-fade-in bg-surface shadow-pop">
              <button onClick={() => setOpen(false)} className="absolute right-2 top-3 grid h-10 w-10 place-items-center rounded-lg hover:bg-subtle" aria-label="Cerrar">
                <X className="h-5 w-5" />
              </button>
              {sidebar}
            </div>
          </div>
        ) : null}

        <main className="print:!ml-0 px-4 py-5 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-6 lg:ml-64 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
  return (
    <Link
      href={item.href}
      className={cn(
        "flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition",
        active ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-subtle hover:text-fg",
      )}
    >
      {item.icon}
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge ? <span className="min-w-5 rounded-full bg-accent px-1.5 text-center text-[11px] font-semibold leading-5 text-accent-fg">{item.badge > 99 ? "99+" : item.badge}</span> : null}
    </Link>
  );
}

/** Interruptor VIP Guard ⇄ Tienda (como el de modo claro/oscuro). */
function SpaceSwitcher({ space, compact }: { space: Space; compact?: boolean }) {
  const router = useRouter();
  const options: Array<{ value: Space; label: string; icon: ReactNode; href: string }> = [
    { value: "vip", label: compact ? "VIP" : "VIP Guard", icon: <Crown className="h-4 w-4" />, href: "/admin/vip" },
    { value: "tienda", label: "Tienda", icon: <ShoppingBag className="h-4 w-4" />, href: "/admin/tienda" },
  ];
  return (
    <div className={cn("grid grid-cols-2 gap-1 rounded-xl bg-subtle p-1", compact && "max-w-[230px]")} role="tablist" aria-label="Cambiar de panel">
      {options.map((option) => (
        <button
          key={option.value}
          role="tab"
          aria-selected={space === option.value}
          onClick={() => router.push(option.href)}
          className={cn(
            "flex h-8 items-center justify-center gap-1.5 rounded-lg text-[13px] font-medium transition",
            space === option.value ? "bg-surface text-accent shadow-card" : "text-muted hover:text-fg",
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ThemeSwitcher({ theme, onChange }: { theme: Theme; onChange: (theme: Theme) => void }) {
  const options: Array<{ value: Theme; icon: ReactNode; label: string }> = [
    { value: "light", icon: <Sun className="h-4 w-4" />, label: "Claro" },
    { value: "dark", icon: <Moon className="h-4 w-4" />, label: "Oscuro" },
    { value: "system", icon: <Monitor className="h-4 w-4" />, label: "Auto" },
  ];
  return (
    <div className="grid grid-cols-3 gap-1 rounded-xl bg-subtle p-1" role="radiogroup" aria-label="Tema">
      {options.map((option) => (
        <button
          key={option.value}
          role="radio"
          aria-checked={theme === option.value}
          onClick={() => onChange(option.value)}
          className={cn("flex h-7 items-center justify-center gap-1 rounded-lg text-xs transition", theme === option.value ? "bg-surface font-medium text-fg shadow-card" : "text-muted hover:text-fg")}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}


