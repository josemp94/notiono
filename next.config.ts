import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // jsdom (Markdown ↔ bloques para la app nativa, src/server/app/markdown.ts) se
  // carga de node_modules tal cual: empaquetado no arranca.
  serverExternalPackages: ["jsdom"],
  async headers() {
    return [
      {
        // Lo mismo que el <meta robots> del layout, pero también para lo que no es
        // HTML (imágenes subidas, el APK, la API).
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/notiono.apk",
        headers: [
          { key: "Content-Disposition", value: 'attachment; filename="notiono.apk"' },
          { key: "Content-Type", value: "application/octet-stream" },
        ],
      },
    ];
  },
};

export default nextConfig;
