import { router, workspaceProcedure } from "./trpc";
import { pagesRouter, favoritesRouter } from "./routers/pages";
import { dbRouter } from "./routers/db";
import { authRouter } from "./routers/auth";
import { workspaceRouter } from "./routers/workspace";
import { commentsRouter } from "./routers/comments";
import { apiTokensRouter } from "./routers/apiTokens";
import { webhooksRouter } from "./routers/webhooks";
import { pushRouter } from "./routers/push";
import { notificationsRouter } from "./routers/notifications";
import { appNativaRouter } from "./routers/app";
import { inicioRouter } from "./routers/inicio";

export const appRouter = router({
  auth: authRouter,
  pages: pagesRouter,
  favorites: favoritesRouter,
  db: dbRouter,
  workspace: workspaceRouter,
  comments: commentsRouter,
  apiTokens: apiTokensRouter,
  webhooks: webhooksRouter,
  push: pushRouter,
  notifications: notificationsRouter,
  inicio: inicioRouter,
  // Lo que la app nativa de Android necesita y la web hace en el navegador.
  app: appNativaRouter,
  me: workspaceProcedure.query(({ ctx }) => ({
    user: { id: ctx.user.id, name: ctx.user.name, email: ctx.user.email },
    workspace: { id: ctx.workspace.id, name: ctx.workspace.name },
  })),
});

export type AppRouter = typeof appRouter;
