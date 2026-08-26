-- Tipografía por página (el «Style» de Notion): sans (por defecto), serif o mono.
ALTER TABLE "Page" ADD COLUMN "font" TEXT NOT NULL DEFAULT 'sans';
