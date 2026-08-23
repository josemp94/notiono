import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authApiRequest, jsonError, readJson } from "@/server/apiAuth";
import { applyViewConfig, conComputados, filterFieldIds, type DbField, type DbRecord, type FilterNode } from "@/lib/viewData";
import { calculaComputados, necesitaComputados } from "@/server/services/computados";

export const dynamic = "force-dynamic";

const consulta = z.object({
  // El mismo árbol de filtros que usan las vistas: condiciones {fieldId, op, value}
  // y grupos {type:"group", op:"and"|"or", filters:[…]} anidados.
  filters: z.array(z.any()).optional(),
  filterOp: z.enum(["and", "or"]).optional(),
  sorts: z.array(z.object({ fieldId: z.string(), dir: z.enum(["asc", "desc"]) })).optional(),
  cursor: z.string().nullish(),
  limit: z.number().int().min(1).max(500).default(100),
});

/**
 * POST /api/v1/databases/:id/query — registros filtrados y ordenados, paginados.
 *
 * Pasa por el MISMO motor que las vistas de la web (applyViewConfig), así la tabla,
 * la gráfica y la API responden lo mismo ante el mismo filtro. El cursor es el
 * `next_cursor` de la página anterior, sobre el resultado ya filtrado y ordenado.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authApiRequest(req);
  if (auth instanceof Response) return auth;
  const body = await readJson(req, consulta);
  if (body instanceof Response) return body;
  const { id } = await params;
  const { filters, filterOp, sorts, cursor, limit } = body.data;

  const col = await db.collection.findFirst({
    where: { id, page: { workspaceId: auth.workspaceId } },
    include: { fields: true, records: { where: { archivedAt: null }, orderBy: { order: "asc" } } },
  });
  if (!col) return jsonError(404, "Base de datos no encontrada.");

  const fields = col.fields.map((f) => ({ id: f.id, name: f.name, type: f.type, config: f.config })) as DbField[];
  const all: DbRecord[] = col.records.map((r) => ({
    id: r.id,
    cells: (r.cells ?? {}) as Record<string, unknown>,
    order: r.order,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    createdById: r.createdById,
    updatedById: r.updatedById,
  }));
  // Si el filtro o el orden tocan una fórmula o un rollup, se calculan y se funden
  // en las celdas: la API responde lo mismo que la tabla y la gráfica.
  const usados = [
    ...filterFieldIds((filters ?? []) as FilterNode[]),
    ...(sorts ?? []).map((s) => s.fieldId),
  ];
  const base = necesitaComputados(col.fields, usados)
    ? conComputados(all, (await calculaComputados(db, auth.workspaceId, col)).rollups)
    : all;
  const filtradas = applyViewConfig(base, fields, { filters, filterOp, sorts }, auth.userId ?? undefined);

  const desde = cursor ? filtradas.findIndex((r) => r.id === cursor) + 1 : 0;
  if (cursor && desde === 0) return jsonError(400, "Cursor desconocido (¿cambió el filtro entre páginas?).");
  const pagina = filtradas.slice(desde, desde + limit);
  const hasMore = desde + limit < filtradas.length;

  const porId = new Map(col.records.map((r) => [r.id, r]));
  return NextResponse.json({
    records: pagina.map((r) => {
      const fila = porId.get(r.id)!;
      return { id: fila.id, cells: fila.cells, parentId: fila.parentId, createdAt: fila.createdAt, updatedAt: fila.updatedAt };
    }),
    next_cursor: hasMore ? pagina[pagina.length - 1].id : null,
    has_more: hasMore,
    total: filtradas.length,
  });
}
