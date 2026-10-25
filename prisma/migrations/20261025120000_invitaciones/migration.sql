-- Invitaciones pendientes a un espacio: para quien aún no ha entrado nunca por SSO.
-- Al entrar por primera vez, el callback OIDC la convierte en Member y la borra.
CREATE TABLE "Invitacion" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "destino" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'editor',
    "invitedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitacion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Invitacion_workspaceId_destino_key" ON "Invitacion"("workspaceId", "destino");
CREATE INDEX "Invitacion_destino_idx" ON "Invitacion"("destino");

ALTER TABLE "Invitacion" ADD CONSTRAINT "Invitacion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
