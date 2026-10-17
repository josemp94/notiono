import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { authApiRequest, exigeApi, jsonError, paginaDe, readJson } from "@/server/apiAuth";
import { markdownABloques } from "@/lib/mdBloques";

export const dynamic = "force-dynamic";

const findRecord = (id: string, workspaceId: string) =>
  db.record.findFirst({
    where: { id, collection: { page: { workspaceId } } },
    select: { id: true },
  });

const putSchema = z
  .object({ markdown: z.string().optional(), blocks: z.array(z.any()).optional() })
  .refine((v) => v.markdown !== undefined || v.blocks !== undefined, {
    message: "Manda 'markdown' o 'blocks'.",
  });

/**
 * PUT /api/v1/records/:id/content — reemplaza el cuerpo (bloques BlockNote) de la
 * fila. Acepta { markdown } (se convierte en el servidor) o { blocks } en crudo.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authApiRequest(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const rec = await findRecord(id, auth.workspaceId);
  if (!rec) return jsonError(404, "Registro no encontrado.");
  const veto = await exigeApi(auth, await paginaDe.registro(auth, id), "edit", "Registro no encontrado.");
  if (veto) return veto;

  const body = await readJson(req, putSchema);
  if (body instanceof Response) return body;
  const blocks = body.data.blocks ?? markdownABloques(body.data.markdown ?? "");

  const updated = await db.record.update({
    where: { id: rec.id },
    data: {
      content: blocks.length ? (blocks as Prisma.InputJsonValue) : Prisma.JsonNull,
      updatedById: auth.userId,
    },
    select: { id: true, content: true, updatedAt: true },
  });
  return NextResponse.json(updated);
}
