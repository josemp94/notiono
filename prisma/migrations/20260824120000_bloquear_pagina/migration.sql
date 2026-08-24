-- Candado de página/BD (el "Lock" de Notion): evita ediciones accidentales.
ALTER TABLE "Page" ADD COLUMN "locked" BOOLEAN NOT NULL DEFAULT false;
