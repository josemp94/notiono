-- «Posponer 1 h» de un recordatorio (botón de la notificación, web y app).
CREATE TABLE "Pospuesto" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "recordId" TEXT,
    "titulo" TEXT NOT NULL,
    "cuando" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Pospuesto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Pospuesto_cuando_idx" ON "Pospuesto"("cuando");

ALTER TABLE "Pospuesto" ADD CONSTRAINT "Pospuesto_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Pospuesto" ADD CONSTRAINT "Pospuesto_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Pospuesto" ADD CONSTRAINT "Pospuesto_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
