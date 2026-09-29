/** Acceso tipado al SDK de Telegram WebApp (cargado con telegram-web-app.js). */
export type TelegramWebApp = {
  initData: string;
  colorScheme: "light" | "dark";
  themeParams: Record<string, string | undefined>;
  ready: () => void;
  expand: () => void;
  openTelegramLink: (url: string) => void;
  openLink: (url: string) => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  disableVerticalSwipes?: () => void;
  BackButton?: { show: () => void; hide: () => void; onClick: (cb: () => void) => void; offClick: (cb: () => void) => void };
  HapticFeedback?: { impactOccurred: (style: "light" | "medium" | "heavy") => void; notificationOccurred: (type: "error" | "success" | "warning") => void; selectionChanged: () => void };
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function webApp(): TelegramWebApp | null {
  return typeof window === "undefined" ? null : window.Telegram?.WebApp ?? null;
}

export async function waitForWebApp(timeoutMs = 3000): Promise<TelegramWebApp | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const app = webApp();
    if (app) return app;
    await new Promise((r) => setTimeout(r, 50));
  }
  return webApp();
}

export function applyTelegramTheme(app: TelegramWebApp) {
  const root = document.documentElement;
  const map: Record<string, string | undefined> = {
    "--tg-theme-bg-color": app.themeParams.bg_color,
    "--tg-theme-secondary-bg-color": app.themeParams.secondary_bg_color,
    "--tg-theme-text-color": app.themeParams.text_color,
    "--tg-theme-hint-color": app.themeParams.hint_color,
    "--tg-theme-link-color": app.themeParams.link_color,
    "--tg-theme-button-color": app.themeParams.button_color,
    "--tg-theme-button-text-color": app.themeParams.button_text_color,
  };
  for (const [k, v] of Object.entries(map)) if (v) root.style.setProperty(k, v);
  root.dataset.tgScheme = app.colorScheme;
}

/** true si estamos dentro de Telegram (y no en el navegador de desarrollo). */
export function insideTelegram(): boolean {
  return Boolean(webApp()?.initData);
}

export function openLink(url: string) {
  const app = webApp();
  // En el navegador de desarrollo no se abren enlaces reales de Telegram.
  if (!app?.initData && process.env.NODE_ENV === "development") return;
  if (url.startsWith("https://t.me/") && app) app.openTelegramLink(url);
  else if (app) app.openLink(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

export function haptic(kind: "tap" | "success" | "error") {
  const h = webApp()?.HapticFeedback;
  if (!h) return;
  if (kind === "tap") h.impactOccurred("light");
  else h.notificationOccurred(kind);
}
