/**
 * Espacios: crearlos, renombrarlos, salir, borrarlos… sin tRPC delante. Lo llaman el
 * router `workspace` (sesión) y el alta por SSO (`provision.ts`). Los permisos se
 * comprueban aquí con el id de quien pide, nunca con lo que diga la interfaz.
 */
import { TRPCError } from "@trpc/server";
import { generateKeyBetween } from "fractional-indexing";

type DB = typeof import("@/lib/db").db;

/** Tope de espacios propios por persona: de sobra para una familia, un freno a un bucle. */
export const MAX_ESPACIOS = 20;
export const MAX_NOMBRE = 80;

const mal = (message: string) => new TRPCError({ code: "BAD_REQUEST", message });

/** Nombre recortado y con tope; vacío no vale. */
export function limpiaNombre(nombre: string): string {
  const n = nombre.trim().replace(/\s+/g, " ");
  if (!n) throw mal("El espacio necesita un nombre.");
  return n.slice(0, MAX_NOMBRE);
}

/**
 * Espacio nuevo con su dueño como miembro y una página de bienvenida corta. La usan
 * el primer login (el espacio de cada persona) y «Nuevo espacio».
 */
export async function creaEspacio(db: DB, ownerId: string, input: { name: string; icon?: string | null }) {
  const name = limpiaNombre(input.name);
  const propios = await db.workspace.count({ where: { ownerId } });
  if (propios >= MAX_ESPACIOS) throw mal(`Ya tienes ${MAX_ESPACIOS} espacios propios; borra alguno antes de crear otro.`);
  const ws = await db.workspace.create({
    data: {
      name,
      icon: input.icon || null,
      ownerId,
      members: { create: { userId: ownerId, role: "owner" } },
    },
  });
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
  return ws;
}
