import { generateKeyBetween } from "fractional-indexing";

type DB = typeof import("@/lib/db").db;

/** Garantiza que el usuario tenga un workspace propio (con página de inicio). */
export async function ensureWorkspace(db: DB, user: { id: string; name: string | null }) {
  let ws = await db.workspace.findFirst({ where: { ownerId: user.id } });
  if (!ws) {
    ws = await db.workspace.create({
      // Sin icono: el del espacio no se puede elegir en ningún sitio, así que poner
      // uno por defecto era decidir por el usuario. Se muestra el icono de carpeta.
      data: { name: user.name ?? "Mi espacio", ownerId: user.id },
    });
    await db.member.create({ data: { workspaceId: ws.id, userId: user.id, role: "owner" } });
    await db.page.create({
      data: {
        workspaceId: ws.id,
        // «Primeros pasos» y no «Inicio»: Inicio ya es la pantalla de la fila de
        // arriba del panel, y dos «Inicio» seguidos confundían (Notion la llama
        // igual, «Getting started»).
        title: "Primeros pasos",
        icon: "👋",
        order: generateKeyBetween(null, null),
        content: [
          { type: "heading", props: { level: 1 }, content: "Bienvenido a Notiono 🧡" },
          { type: "paragraph", content: "Este es tu espacio. Escribe, organiza y crea bases de datos." },
          { type: "paragraph", content: "Crea una página con el lápiz de arriba del panel, o una base de datos desde «Nueva base de datos», abajo." },
        ],
      },
    });
  }
  return ws;
}
