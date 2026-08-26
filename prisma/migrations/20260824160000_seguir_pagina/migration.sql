-- Seguir página (el «watch» de Notion): avisos al que sigue cuando otro edita.
CREATE TABLE "PageFollow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    CONSTRAINT "PageFollow_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PageFollow_userId_pageId_key" ON "PageFollow"("userId", "pageId");
CREATE INDEX "PageFollow_pageId_idx" ON "PageFollow"("pageId");
ALTER TABLE "PageFollow" ADD CONSTRAINT "PageFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PageFollow" ADD CONSTRAINT "PageFollow_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
