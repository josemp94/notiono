import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authApiRequest, exigeApi, jsonError, jsonFromDbError, paginaDe, readJson } from "@/server/apiAuth";
import { deleteField, FIELD_TYPES, setFieldType, updateField } from "@/server/services/db";

export const dynamic = "force-dynamic";

const cambioColumna = z.object({
  name: z.string().min(1).max(80).optional(),
  type: z.enum(FIELD_TYPES).optional(),
  config: z.record(z.string(), z.any()).optional(),
});

/**
 * PATCH /api/v1/fields/:id — renombra, cambia la config o cambia el tipo.
 *
 * El tipo va aparte porque no es un cambio de metadatos: hay que convertir el valor
 * de todas las celdas, y lo que no se pueda convertir se pierde. Por eso se aplica
 * el ÚLTIMO: si en la misma llamada se cambia también la config, la del tipo nuevo
 * es la que manda (la conversión reescribe las opciones).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authApiRequest(req);
  if (auth instanceof Response) return auth;
  const body = await readJson(req, cambioColumna);
  if (body instanceof Response) return body;
  const { id } = await params;
  const { name, type, config } = body.data;
  if (name === undefined && type === undefined && config === undefined) {
    return jsonError(400, "Indica al menos uno: name, type o config.");
  }
  const veto = await exigeApi(auth, await paginaDe.campo(auth, id), "edit", "Columna no encontrada.");
  if (veto) return veto;

  const scope = { db, workspaceId: auth.workspaceId, userId: auth.userId };
  try {
    if (name !== undefined || config !== undefined) {
      await updateField(scope, { id, name, config });
    }
    let converted: number | undefined;
    if (type !== undefined) {
      converted = (await setFieldType(scope, { id, type })).converted;
    }
    const f = await db.field.findUnique({
      where: { id },
      select: { id: true, name: true, type: true, config: true },
    });
    return NextResponse.json({ ...f, ...(converted !== undefined ? { converted } : {}) });
  } catch (e) {
    return jsonFromDbError(e);
  }
}

/** DELETE /api/v1/fields/:id — borra la columna y sus valores. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authApiRequest(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const veto = await exigeApi(auth, await paginaDe.campo(auth, id), "edit", "Columna no encontrada.");
  if (veto) return veto;
  try {
    await deleteField({ db, workspaceId: auth.workspaceId, userId: auth.userId }, { id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonFromDbError(e);
  }
}
