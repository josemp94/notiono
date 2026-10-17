import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authApiRequest, exigeApi, exigeEscritor, jsonFromDbError, paginaDe, readJson } from "@/server/apiAuth";
import { createPage } from "@/server/services/pages";

export const dynamic = "force-dynamic";

const nuevaPagina = z.object({
  title: z.string().max(200).default(""),
  parentId: z.string().optional(),
  icon: z.string().max(8).optional(),
});

/** POST /api/v1/pages — crea una página de documento (vacía) { title, parentId?, icon? }. */
export async function POST(req: Request) {
  const auth = await authApiRequest(req);
  if (auth instanceof Response) return auth;
  const body = await readJson(req, nuevaPagina);
  if (body instanceof Response) return body;
  const { parentId } = body.data;
  const veto = parentId
    ? await exigeApi(auth, await paginaDe.pagina(auth, parentId), "edit", "Página padre no encontrada.")
    : exigeEscritor(auth);
  if (veto) return veto;

  try {
    const p = await createPage(
      { db, workspaceId: auth.workspaceId, userId: auth.userId },
      { title: body.data.title, parentId: body.data.parentId, icon: body.data.icon },
    );
    return NextResponse.json({ id: p.id, title: p.title, icon: p.icon, parentId: p.parentId }, { status: 201 });
  } catch (e) {
    return jsonFromDbError(e);
  }
}
