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
