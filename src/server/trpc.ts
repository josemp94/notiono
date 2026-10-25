import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

/** Procedure que solo exige usuario autenticado (sin espacio). */
export const authedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "No autenticado." });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/**
 * Lo único que un invitado puede llamar en el espacio (ver `workspaceProcedure`).
 * Añadir algo aquí exige que ese procedimiento compruebe el nivel de página y que no
 * devuelva nada del resto del espacio: lo prueba scripts/integracion-espacios.ts.
 */
export const PERMITIDO_INVITADO = new Set([
  "auth.updateProfile",
  "workspace.members",
  "pages.tree",
  "pages.search",
  "pages.backlinks",
  "pages.get",
  "pages.collabToken",
  "pages.ensureYdoc",
  "pages.create",
  "pages.rename",
  "pages.setCover",
  "pages.setFullWidth",
  "pages.setFont",
  "pages.setLocked",
  "pages.toggleFollow",
  "pages.toggleFavorite",
  "pages.updateContent",
  "pages.versions.list",
  "pages.versions.restore",
  "favorites.list",
  "favorites.move",
  "comments.list",
  "comments.add",
  "comments.edit",
  "comments.react",
  "comments.toggleResolve",
  "comments.remove",
  "notifications.list",
  "notifications.unreadCount",
  "db.get",
  "db.computed",
  "db.chartData",
  "db.relationOptions",
  "db.addRecord",
  "db.addSubRecord",
  "db.updateCell",
  "db.moveRecord",
  "db.duplicateRecord",
  "db.deleteRecord",
  "db.restoreRecord",
  "db.updateRecordContent",
  "inicio.get",
  // La app nativa: cada uno mira el nivel de su página o fila (exigeNivel) y app.vista
  // solo le pone nombre a la propia persona; avisos y recordatorios son solo suyos.
  // Siguen cerrados: importar, plantillas y el calendario del widget (miran el espacio).
  "app.pagina",
  "app.bloques",
  "app.aplicar",
  "app.vista",
  "app.fila",
  "app.bloquesFila",
  "app.aplicarFila",
  "app.exportarMarkdown",
  "app.recordatorios",
  "app.avisos",
]);

/**
 * Procedure que exige usuario + espacio activo. Además, en mutaciones, bloquea a
 * los `viewer` (solo lectura) de forma centralizada: cubre todos los routers.
 */
export const workspaceProcedure = t.procedure.use(({ ctx, type, path, next }) => {
  if (!ctx.user || !ctx.workspace) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "No hay usuario/espacio activo." });
  }
  // Invitado de página: cerrado por defecto. Solo entra en lo de esta lista, donde
  // cada procedimiento comprueba el nivel sobre la página concreta (perms.ts); lo que
  // mira el espacio entero (crear en la raíz, papelera, plantillas, exportar, tokens,
  // la app nativa…) no le existe.
  if (ctx.role === "guest" && !PERMITIDO_INVITADO.has(path)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Eres invitado: solo puedes usar las páginas que te han compartido." });
  }
  if (type === "mutation" && ctx.role === "viewer") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Solo lectura: no tienes permiso de edición en este espacio.",
    });
  }
  return next({
    ctx: { ...ctx, user: ctx.user, workspace: ctx.workspace, role: ctx.role ?? "viewer" },
  });
});
