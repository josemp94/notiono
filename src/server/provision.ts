import { creaEspacio } from "./services/espacios";

type DB = typeof import("@/lib/db").db;

/** Garantiza que el usuario tenga un workspace propio (con página de inicio). */
export async function ensureWorkspace(db: DB, user: { id: string; name: string | null }) {
  const ws = await db.workspace.findFirst({ where: { ownerId: user.id } });
  // Sin icono: se elige luego desde el selector de espacios o Ajustes, como en Notion.
  return ws ?? creaEspacio(db, user.id, { name: user.name?.trim() || "Mi espacio" });
}
