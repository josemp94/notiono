import { NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { db } from "@/lib/db";
import { ipDe, permitido } from "@/server/ratelimit";
import { publicCookieName, publicCookieValue } from "@/server/publicAuth";

/**
 * Verifica la contraseña de una página pública y deja la cookie firmada que da
 * paso (/s/<token> la comprueba). Sin sesión: es para quien recibe el enlace.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { token?: unknown; password?: unknown } | null;
  const token = body?.token;
  const password = body?.password;
  if (typeof token !== "string" || typeof password !== "string" || token.length > 100 || password.length > 100) {
    return NextResponse.json({ error: "Petición inválida." }, { status: 400 });
  }
  // Freno anti fuerza bruta, como el formulario público: 20 intentos/IP/página cada 10 min.
  if (!permitido(`pub:${ipDe(req)}:${token}`, 20, 10 * 60_000)) {
    return NextResponse.json({ error: "Demasiados intentos. Prueba en unos minutos." }, { status: 429 });
  }
  const page = await db.page.findUnique({
    where: { publicToken: token },
    select: { publicPassword: true, publicExpiresAt: true, archivedAt: true },
  });
  if (!page?.publicPassword || page.archivedAt) {
    return NextResponse.json({ error: "Página no encontrada." }, { status: 404 });
  }
  if (page.publicExpiresAt && page.publicExpiresAt < new Date()) {
    return NextResponse.json({ error: "El enlace ha caducado." }, { status: 404 });
  }
  if (!(await compare(password, page.publicPassword))) {
    return NextResponse.json({ error: "Contraseña incorrecta." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(publicCookieName(token), publicCookieValue(token, page.publicPassword), {
    httpOnly: true,
    sameSite: "lax",
    path: "/s",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
