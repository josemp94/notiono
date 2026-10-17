import type { MetadataRoute } from "next";

/** Nada de Notiono se indexa: ver `robots` en el layout. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
