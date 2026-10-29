-- «Apariencia y diseño» del menú ⋯: texto pequeño (como Notion) y color de página (propio de Notiono).
ALTER TABLE "Page" ADD COLUMN "smallText" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Page" ADD COLUMN "color" TEXT;
-- Una fila de base de datos es una página: también tiene su color.
ALTER TABLE "Record" ADD COLUMN "color" TEXT;
