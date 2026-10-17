import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authApiRequest, exigeApi, jsonFromDbError, paginaDe, readJson } from "@/server/apiAuth";
import { addField, FIELD_TYPES } from "@/server/services/db";

export const dynamic = "force-dynamic";

const nuevaColumna = z.object({
  name: z.string().min(1).max(80),
  type: z.enum(FIELD_TYPES),
  /** Colocarla justo detrás de esta columna (si no, al final). */
  afterFieldId: z.string().optional(),
});

/** POST /api/v1/databases/:id/fields — añade una columna { name, type, afterFieldId? }. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authApiRequest(req);
  if (auth instanceof Response) return auth;
  const body = await readJson(req, nuevaColumna);
  if (body instanceof Response) return body;
  const { id } = await params;
  const veto = await exigeApi(auth, await paginaDe.coleccion(auth, id), "edit", "Base de datos no encontrada.");
  if (veto) return veto;

  try {
    const f = await addField(
      { db, workspaceId: auth.workspaceId, userId: auth.userId },
      { collectionId: id, name: body.data.name, type: body.data.type, afterFieldId: body.data.afterFieldId },
    );
    return NextResponse.json({ id: f.id, name: f.name, type: f.type }, { status: 201 });
  } catch (e) {
    return jsonFromDbError(e);
  }
}
