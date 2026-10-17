import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authApiRequest, exigeApi, exigeEscritor, jsonFromDbError, paginaDe, readJson } from "@/server/apiAuth";
import { createDatabase, FIELD_TYPES, VIEW_TYPES } from "@/server/services/db";
import { alcanza, mapaDeNiveles } from "@/server/services/perms";

export const dynamic = "force-dynamic";

/** GET /api/v1/databases — bases de datos del espacio que puede ver quien creó el token. */
export async function GET(req: Request) {
  const auth = await authApiRequest(req);
  if (auth instanceof Response) return auth;
  const cols = await db.collection.findMany({
    where: { page: { workspaceId: auth.workspaceId, archivedAt: null } },
    select: { id: true, pageId: true, page: { select: { title: true, icon: true } } },
  });
  const nivel = await mapaDeNiveles(db, auth.workspaceId, auth.userId, auth.role);
  return NextResponse.json(
    cols
      .filter((c) => alcanza(nivel(c.pageId), "view"))
      .map((c) => ({ id: c.id, title: c.page.title, icon: c.page.icon })),
  );
}

const nuevaBd = z.object({
  name: z.string().min(1).max(120),
  icon: z.string().max(8).optional(),
  parentId: z.string().optional(),
  fields: z.array(z.object({ name: z.string().min(1).max(80), type: z.enum(FIELD_TYPES) })).optional(),
  views: z.array(z.object({ type: z.enum(VIEW_TYPES), name: z.string().max(60).optional() })).optional(),
});

/**
 * POST /api/v1/databases — crea una base de datos con sus columnas y vistas.
 *
 * Sin `fields` nace con una columna de texto, y sin `views` con una vista Tabla: una
 * base de datos sin ninguna de las dos no se puede ni abrir. A diferencia de la que
 * se crea desde la web, nace SIN filas de ejemplo: quien la crea por API quiere la
 * estructura, no tres filas vacías que luego hay que borrar.
 */
export async function POST(req: Request) {
  const auth = await authApiRequest(req);
  if (auth instanceof Response) return auth;
  const body = await readJson(req, nuevaBd);
  if (body instanceof Response) return body;
  const { parentId } = body.data;
  const veto = parentId
    ? await exigeApi(auth, await paginaDe.pagina(auth, parentId), "edit", "Página padre no encontrada.")
    : exigeEscritor(auth);
  if (veto) return veto;

  try {
    const { page, collection, fields, views } = await createDatabase(
      { db, workspaceId: auth.workspaceId, userId: auth.userId },
      {
        title: body.data.name,
        icon: body.data.icon,
        parentId: body.data.parentId,
        fields: body.data.fields,
        views: body.data.views,
        seedRows: 0,
      },
    );
    return NextResponse.json(
      {
        id: collection.id,
        pageId: page.id,
        title: page.title,
        icon: page.icon,
        fields: fields.map((f) => ({ id: f.id, name: f.name, type: f.type })),
        views: views.map((v) => ({ id: v.id, name: v.name, type: v.type })),
      },
      { status: 201 },
    );
  } catch (e) {
    return jsonFromDbError(e);
  }
}
