/** @type {import('next').NextConfig} */
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.SUPABASE_URL ?? "").origin;
  } catch {
    return "https://*.supabase.co";
  }
})();
const isDev = process.env.NODE_ENV === "development";

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Las fotos ya se optimizan en el navegador antes de subirse (WebP/JPEG, máx.
  // 1600 px), así que no hace falta el optimizador de Next ni su cuota.
  images: { unoptimized: true },
  experimental: {
    serverActions: { bodySizeLimit: "1mb" },
  },
  async headers() {
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org",
      `img-src 'self' data: blob: ${supabaseOrigin} https://*.supabase.co`,
      `script-src 'self' 'unsafe-inline' https://telegram.org${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "connect-src 'self'",
      "font-src 'self' data:",
      "object-src 'none'",
      "form-action 'self'",
      ...(isDev ? [] : ["upgrade-insecure-requests"]),
    ].join("; ");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
        ],
      },
      {
        source: "/admin/:path*",
        headers: [{ key: "X-Frame-Options", value: "DENY" }, { key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
