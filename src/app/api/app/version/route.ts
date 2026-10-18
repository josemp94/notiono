import { NextResponse } from "next/server";
import apk from "@/lib/apk.json";

export const dynamic = "force-dynamic";

/**
 * GET /api/app/version — la versión del APK que va dentro de este despliegue. La app
 * nativa ya no se actualiza sola al desplegar (no es una TWA): la consulta al abrir y
 * desde Ajustes, y si hay una más nueva ofrece bajarla de `url` e instalarla.
 */
export function GET() {
  return NextResponse.json({ ...apk, url: "/notiono.apk" });
}
