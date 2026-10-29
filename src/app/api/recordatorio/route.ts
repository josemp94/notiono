import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { createContext } from "@/server/context";
import { accionRecordatorio } from "@/server/recordatorios";

export const dynamic = "force-dynamic";

const Cuerpo = z.object({
  accion: z.enum(["hecho", "posponer"]),
  key: z.string().max(300),
  pageId: z.string().max(100),
  recordId: z.string().max(100).nullish(),
  titulo: z.string().max(500).optional(),
});

/**
 * POST /api/recordatorio — los botones «Hecho» y «Posponer 1 h» de la notificación de un
 * recordatorio: los pulsa el service worker de la web (push) y la app de Android (alarma).
 * Con la sesión de quien la recibe y sin mirar su espacio activo (el aviso puede ser de
 * otro): `accionRecordatorio` comprueba el acceso a esa página.
 */
export async function POST(req: Request) {
  const ctx = await createContext({ req });
  if (!ctx.user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const datos = Cuerpo.safeParse(await req.json().catch(() => null));
  if (!datos.success) return NextResponse.json({ error: "Petición no válida." }, { status: 400 });
  const { accion, ...aviso } = datos.data;
  try {
    return NextResponse.json(await accionRecordatorio(db, ctx.user.id, accion, aviso));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo." }, { status: 403 });
  }
}
