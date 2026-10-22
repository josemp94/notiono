import { authApiRequest, exigeEscritor } from "@/server/apiAuth";
import { subirArchivo } from "@/server/subida";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/files — sube un archivo con el token (multipart, campo "file"; con
 * `?kind=image` solo imágenes). → 201 { id, url, name, mime }, el mismo objeto que
 * guarda una celda de tipo `files`. Lo mismo que `/api/upload` de la web, firmado
 * por quien creó el token; quien solo puede leer en el espacio no sube nada.
 */
export async function POST(req: Request) {
  const auth = await authApiRequest(req);
  if (auth instanceof Response) return auth;
  const veto = exigeEscritor(auth);
  if (veto) return veto;
  return subirArchivo(req, { workspaceId: auth.workspaceId, userId: auth.userId }, 201);
}
