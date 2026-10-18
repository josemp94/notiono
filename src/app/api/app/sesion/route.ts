import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSession, SESSION_MAX_AGE } from "@/server/auth";
import { canjeaCodigoApp, esVerificador } from "@/server/appAuth";
import { permitido } from "@/server/ratelimit";

export const dynamic = "force-dynamic";

/**
 * POST /api/app/sesion {code, verifier} — la app nativa canjea el código que le dio
 * el callback OIDC por un token de sesión (una fila `Session` como la de la web, que
 * la app manda como la cookie `notiono_session`: así el contexto de tRPC no cambia).
 * Cerrar sesión es el `auth.logout` de siempre, que borra la fila.
 */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!permitido(`app-sesion:${ip}`, 20, 10 * 60_000)) {
    return NextResponse.json({ error: "Demasiados intentos." }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as { code?: unknown; verifier?: unknown } | null;
  if (typeof body?.code !== "string" || !esVerificador(body.verifier)) {
    return NextResponse.json({ error: "Faltan code y verifier." }, { status: 400 });
  }
  const userId = await canjeaCodigoApp(db, body.code, body.verifier);
  if (!userId) return NextResponse.json({ error: "Código inválido o caducado." }, { status: 401 });
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true } });
  if (!user) return NextResponse.json({ error: "Usuario no encontrado." }, { status: 401 });
  const token = await createSession(user.id);
  return NextResponse.json({ token, maxAge: SESSION_MAX_AGE, user });
}
