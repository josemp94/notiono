import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, SESSION_COOKIE } from "@/server/auth";
import { WS_COOKIE } from "@/server/context";
import { appBaseUrl } from "@/server/oidc";

export const dynamic = "force-dynamic";

/**
 * GET /api/espacio/:id?a=/p/<página> — pasa a ese espacio y abre `a` (o el Inicio).
 * Para enlaces que vienen de fuera del espacio activo: el push de «te han añadido»,
 * un aviso o un enlace a una página de otro espacio. Solo si tienes acceso a él.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const base = appBaseUrl(url.origin);
  const user = await getSessionUser(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.redirect(new URL("/login", base));
  // Solo rutas propias: nada de «//otro.sitio» ni URLs absolutas (redirección abierta).
  const a = url.searchParams.get("a");
  const destino = a && a.startsWith("/") && !a.startsWith("//") && !a.startsWith("/\\") ? a : "/";
  const ws = await db.workspace.findFirst({
    where: { id, OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }] },
    select: { id: true },
  });
  const res = NextResponse.redirect(new URL(ws ? destino : "/", base));
  if (ws) res.headers.append("Set-Cookie", `${WS_COOKIE}=${ws.id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`);
  return res;
}
