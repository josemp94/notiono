import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authApiRequest, exigeApi, jsonError, paginaDe } from "@/server/apiAuth";
import { limpiaReferencias } from "@/server/services/relations";

export const dynamic = "force-dynamic";

const findRecord = (id: string, workspaceId: string) =>
  db.record.findFirst({ where: { id, collection: { page: { workspaceId } } } });

const patchSchema = z.object({ cells: z.record(z.string(), z.any()) });

/** PATCH /api/v1/records/:id — merge de celdas { cells }; null o "" borra la celda. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authApiRequest(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const rec = await findRecord(id, auth.workspaceId);
  if (!rec) return jsonError(404, "Registro no encontrado.");
  const veto = await exigeApi(auth, await paginaDe.registro(auth, id), "edit", "Registro no encontrado.");
  if (veto) return veto;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Cuerpo JSON inválido.");
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "Cuerpo inválido.");

  // Merge atómico en Postgres (mismo motivo que db.updateCell): tocar solo las
  // claves que llegan, sin leer-todo + escribir-todo, para no pisar ediciones
  // concurrentes de otros campos.
  const nuevos: Record<string, unknown> = {};
  const borrar: string[] = [];
  for (const [k, v] of Object.entries(parsed.data.cells)) {
    if (v === null || v === "") borrar.push(k);
    else nuevos[k] = v;
  }
  await db.$executeRaw`UPDATE "Record" SET cells = (cells || ${JSON.stringify(nuevos)}::jsonb) - ${borrar}::text[], "updatedAt" = now() WHERE id = ${rec.id}`;
  const updated = await db.record.findUniqueOrThrow({
    where: { id: rec.id },
    select: { id: true, cells: true, parentId: true, updatedAt: true },
  });
  return NextResponse.json(updated);
}

/** DELETE /api/v1/records/:id — borra el registro (y sus hijos, por FK en cascada). */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authApiRequest(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const rec = await findRecord(id, auth.workspaceId);
  if (!rec) return jsonError(404, "Registro no encontrado.");
  const veto = await exigeApi(auth, await paginaDe.registro(auth, id), "edit", "Registro no encontrado.");
  if (veto) return veto;
  await db.record.delete({ where: { id: rec.id } });
  await limpiaReferencias(db, rec.collectionId, [rec.id]);
  return NextResponse.json({ ok: true });
}
