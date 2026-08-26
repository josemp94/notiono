import { NextResponse } from "next/server";
import { createContext } from "@/server/context";
import { permitido } from "@/server/ratelimit";

export const dynamic = "force-dynamic";

/**
 * GET /api/geo?q=… — busca lugares en Nominatim (OpenStreetMap) para el campo
 * Lugar. Pasa por el servidor para poner un User-Agent identificable (lo exige
 * la política de uso de Nominatim) y para frenar el ritmo por usuario.
 */
export async function GET(req: Request) {
  const ctx = await createContext({ req });
  if (!ctx.user || !ctx.workspace) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 3) return NextResponse.json({ lugares: [] });
  if (!permitido(`geo:${ctx.user.id}`, 30, 60_000)) {
    return NextResponse.json({ error: "Demasiadas búsquedas; espera un momento." }, { status: 429 });
  }

  const r = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=es&q=${encodeURIComponent(q)}`,
    { headers: { "User-Agent": "Notiono (self-hosted; github.com/josemp94/notiono)" } },
  );
  if (!r.ok) {
    return NextResponse.json({ error: "El buscador de lugares no responde." }, { status: 502 });
  }
  const filas = (await r.json()) as { display_name: string; lat: string; lon: string }[];
  return NextResponse.json({
    lugares: filas.map((f) => ({ nombre: f.display_name, lat: Number(f.lat), lng: Number(f.lon) })),
  });
}
