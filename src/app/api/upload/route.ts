import { NextResponse } from "next/server";
import { createContext } from "@/server/context";
import { subirArchivo } from "@/server/subida";

export const dynamic = "force-dynamic";

/**
 * POST /api/upload — multipart con campo "file". Devuelve { id, url, name, mime }.
 * Sirve para portadas de página (solo imágenes: `?kind=image`) y para adjuntos de
 * base de datos (cualquier tipo). Los bytes se guardan en Postgres (modelo Asset).
 * Es la subida de la web, con sesión; la de la API con token es `/api/v1/files`.
 */
export async function POST(req: Request) {
  const ctx = await createContext({ req });
  if (!ctx.user || !ctx.workspace || ctx.role === "viewer") {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  return subirArchivo(req, { workspaceId: ctx.workspace.id, userId: ctx.user.id });
}
