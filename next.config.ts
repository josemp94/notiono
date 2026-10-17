import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
