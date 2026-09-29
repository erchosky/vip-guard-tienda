import type { Config } from "tailwindcss";

const token = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

/**
 * Colores semánticos definidos con variables CSS (globals.css): el mismo
 * componente se ve bien en claro, oscuro y dentro de Telegram, y el acento
 * cambia según el panel (VIP dorado, Tienda rosa).
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./modules/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: token("canvas"),
        surface: token("surface"),
        subtle: token("subtle"),
        fg: token("fg"),
        muted: token("muted"),
        line: token("line"),
        accent: token("accent"),
        "accent-fg": token("accent-fg"),
        "accent-soft": token("accent-soft"),
        danger: token("danger"),
        success: token("success"),
        warning: token("warning"),
        info: token("info"),
      },
      borderRadius: { xl: "14px", "2xl": "18px" },
      boxShadow: {
        card: "0 1px 2px rgb(0 0 0 / 0.04), 0 1px 1px rgb(0 0 0 / 0.02)",
        pop: "0 10px 30px -10px rgb(0 0 0 / 0.25)",
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      keyframes: {
        "fade-in": { from: { opacity: "0", transform: "translateY(4px)" }, to: { opacity: "1", transform: "none" } },
      },
      animation: { "fade-in": "fade-in .18s ease-out" },
    },
  },
  plugins: [],
};

export default config;
