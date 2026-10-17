import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authApiRequest, exigeApi, jsonFromDbError, paginaDe, readJson } from "@/server/apiAuth";
import { addView, VIEW_TYPES } from "@/server/services/db";

export const dynamic = "force-dynamic";

const nuevaVista = z.object({
  type: z.enum(VIEW_TYPES),
  name: z.string().min(1).max(60).optional(),
});

/**
 * POST /api/v1/databases/:id/views — añade una vista { type, name? }.
 *
 * Sin nombre se le pone el del tipo («Tabla», «Kanban»…). La vista se configura
 * sola con lo que encuentra: el Kanban se agrupa por la primera columna de
 * selección, el calendario usa la primera de fecha.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authApiRequest(req);
  if (auth instanceof Response) return auth;
  const body = await readJson(req, nuevaVista);
  if (body instanceof Response) return body;
  const { id } = await params;
  const veto = await exigeApi(auth, await paginaDe.coleccion(auth, id), "edit", "Base de datos no encontrada.");
  if (veto) return veto;

  try {
    const v = await addView(
      { db, workspaceId: auth.workspaceId, userId: auth.userId },
      { collectionId: id, type: body.data.type, name: body.data.name },
    );
    return NextResponse.json({ id: v.id, name: v.name, type: v.type }, { status: 201 });
  } catch (e) {
    return jsonFromDbError(e);
  }
}
