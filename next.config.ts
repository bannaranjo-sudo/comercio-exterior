import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Carga de PDF (máx. 10 MB) mediante Server Actions.
  experimental: {
    serverActions: { bodySizeLimit: "11mb" },
    // Las páginas leen la sesión en cada solicitud (no son prerenderizables): se desactiva la validación
    // automática de "navegación instantánea" en desarrollo para evitar avisos continuos en el overlay.
    instantInsights: { validationLevel: "manual-warning" },
  },
  partialPrefetching: true,
  // Cabeceras de seguridad; en QA además se pide a los buscadores no indexar nada.
  async headers() {
    const comunes = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ];
    const qa = process.env.APP_ENV === "qa" ? [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }] : [];
    return [{ source: "/:path*", headers: [...comunes, ...qa] }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
