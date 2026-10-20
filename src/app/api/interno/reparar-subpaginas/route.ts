import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { firmaReparacionValida } from "@/server/collabToken";
import { repararSubpaginas } from "@/server/subpaginas";

export const dynamic = "force-dynamic";

/**
 * Repara árbol y enlaces de subpáginas que dejó sueltos la versión anterior. Lo llama
 * `collab/dist/reparar-subpaginas.mjs` desde dentro del contenedor (ver
 * docs/subpaginas.md): se hace aquí, en el servidor en marcha, para escribir en el
 * documento vivo de cada página y que una pestaña abierta no lo pise.
 */
export async function POST(req: Request) {
  const momento = Number(req.headers.get("x-reparar-momento"));
  if (!firmaReparacionValida(momento, req.headers.get("x-reparar-firma") ?? "")) {
    return NextResponse.json({ error: "firma no válida" }, { status: 401 });
  }
  const { aplicar, espacio } = (await req.json()) as { aplicar?: boolean; espacio?: string };
  const lineas = await repararSubpaginas(db, { aplicar: aplicar === true, espacio: espacio || undefined });
  return NextResponse.json({ lineas });
}
