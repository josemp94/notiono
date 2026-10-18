import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, parseCookie, SESSION_COOKIE } from "@/server/auth";
import { guardaRegistro, limpiaLote } from "@/server/appRegistro";
import { permitido } from "@/server/ratelimit";

export const dynamic = "force-dynamic";

/** Un lote son como mucho 200 entradas de ~9 KB: con 2 MB sobra. */
const MAX_CUERPO = 2_000_000;

/**
 * POST /api/app/registro — la app nativa manda su registro de diagnóstico (widgets,
 * cierres inesperados, fallos del servidor), con su sesión de siempre (la cookie
 * `notiono_session`). Sin pantalla: se lee en la BD (ver docs/app-nativa.md).
 */
export async function POST(req: Request) {
  const user = await getSessionUser(parseCookie(req.headers.get("cookie"), SESSION_COOKIE));
  if (!user) return NextResponse.json({ error: "Sin sesión." }, { status: 401 });
  if (!permitido(`app-registro:${user.id}`, 30, 10 * 60_000)) {
    return NextResponse.json({ error: "Demasiados envíos." }, { status: 429 });
  }
  const cuerpo = await req.text();
  if (cuerpo.length > MAX_CUERPO) return NextResponse.json({ error: "Demasiado grande." }, { status: 413 });
  let datos: unknown = null;
  try {
    datos = JSON.parse(cuerpo);
  } catch {}
  const lote = limpiaLote(datos);
  if (!lote) return NextResponse.json({ error: "Falta la lista de entradas." }, { status: 400 });
  const guardadas = await guardaRegistro(db, user.id, lote);
  return NextResponse.json({ ok: true, guardadas });
}
