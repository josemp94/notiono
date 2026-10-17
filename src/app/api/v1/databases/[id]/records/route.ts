import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authApiRequest, exigeApi, jsonFromDbError, paginaDe, readJson } from "@/server/apiAuth";
import { createRecord } from "@/server/services/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/databases/:id/records — registros paginados por cursor.
 *
 * `?limit=` (100 por defecto, máx. 500) y `?cursor=` (el `next_cursor` de la página
 * anterior). Respuesta: { records, next_cursor, has_more }, en el orden de la BD.
 * `GET /databases/:id` sigue devolviéndolo todo, por compatibilidad; para BD
 * grandes, usar esto.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authApiRequest(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const q = new URL(req.url).searchParams;
  const limit = Math.min(500, Math.max(1, Number(q.get("limit")) || 100));
  const cursor = q.get("cursor");

  const veto = await exigeApi(auth, await paginaDe.coleccion(auth, id), "view", "Base de datos no encontrada.");
  if (veto) return veto;

  // Se pide uno de más para saber si hay otra página sin contar toda la tabla.
  const filas = await db.record.findMany({
    where: { collectionId: id, archivedAt: null },
    select: { id: true, cells: true, parentId: true, createdAt: true, updatedAt: true },
    orderBy: [{ order: "asc" }, { id: "asc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const hasMore = filas.length > limit;
  const records = hasMore ? filas.slice(0, limit) : filas;
  return NextResponse.json({
    records,
    next_cursor: hasMore ? records[records.length - 1].id : null,
    has_more: hasMore,
  });
}

const nuevoRegistro = z.object({
  cells: z.record(z.string(), z.any()).default({}),
  parentId: z.string().optional(),
});

/**
 * POST /api/v1/databases/:id/records — crea un registro { cells, parentId? }.
 *
 * Misma respuesta que siempre. Lo que cambia por dentro es que ahora pasa por el
 * mismo servicio que usa la web: hasta ahora esta ruta traía su propia copia y se
 * dejaba por el camino los webhooks y el «creado por».
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authApiRequest(req);
  if (auth instanceof Response) return auth;
  const body = await readJson(req, nuevoRegistro);
  if (body instanceof Response) return body;
  const { id } = await params;
  const veto = await exigeApi(auth, await paginaDe.coleccion(auth, id), "edit", "Base de datos no encontrada.");
  if (veto) return veto;

  try {
    const rec = await createRecord(
      { db, workspaceId: auth.workspaceId, userId: auth.userId },
      { collectionId: id, cells: body.data.cells, parentId: body.data.parentId },
    );
    return NextResponse.json(
      { id: rec.id, cells: rec.cells, parentId: rec.parentId, createdAt: rec.createdAt },
      { status: 201 },
    );
  } catch (e) {
    return jsonFromDbError(e);
  }
}
