-- Invitados de página (los «guests» de Notion): invitación pendiente a UNA página para
-- quien aún no ha entrado nunca. Al entrar por SSO pasa a invitado del espacio con
-- permiso solo sobre esa página (y sus subpáginas).
CREATE TABLE "InvitacionPagina" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "destino" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'view',
    "invitedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvitacionPagina_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InvitacionPagina_pageId_destino_key" ON "InvitacionPagina"("pageId", "destino");
CREATE INDEX "InvitacionPagina_destino_idx" ON "InvitacionPagina"("destino");

ALTER TABLE "InvitacionPagina" ADD CONSTRAINT "InvitacionPagina_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
