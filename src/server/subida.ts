import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/** Tope por archivo, el mismo en la web y en la API (lo repiten PageCover y Cell). */
export const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

/**
 * Guarda el campo «file» de un multipart como Asset del espacio y responde
 * { id, url, name, mime }. Lo comparten la subida de la web (`/api/upload`, con
 * sesión) y la de la API (`/api/v1/files`, con token): quién sube lo decide cada
 * ruta, lo que se guarda y cómo se valida es lo mismo. Con `?kind=image` solo
 * acepta imágenes (portadas); sin él, cualquier tipo (adjuntos).
 */
export async function subirArchivo(
  req: Request,
  quien: { workspaceId: string; userId: string },
  status = 200,
): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Se esperaba multipart/form-data." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Falta el campo «file»." }, { status: 400 });
  }
  // Las portadas piden explícitamente imagen; los adjuntos aceptan cualquier tipo.
  if (new URL(req.url).searchParams.get("kind") === "image" && !file.type.startsWith("image/")) {
    return NextResponse.json({ error: "El archivo debe ser una imagen." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "El archivo no puede superar los 8 MB." }, { status: 413 });
  }

  const asset = await db.asset.create({
    data: {
      workspaceId: quien.workspaceId,
      mime: file.type || "application/octet-stream",
      name: file.name || null,
      bytes: Buffer.from(await file.arrayBuffer()),
      createdById: quien.userId,
    },
    select: { id: true, name: true, mime: true },
  });
  return NextResponse.json(
    { id: asset.id, url: `/api/asset/${asset.id}`, name: asset.name, mime: asset.mime },
    { status },
  );
}
