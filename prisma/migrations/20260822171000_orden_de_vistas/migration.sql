-- Orden manual de las pestañas de vista (la primera pestaña es la vista por defecto).
-- Backfill con claves fraccionales válidas ('a0', 'a1', …) en el orden en que ya se
-- mostraban (id asc). Son los mismos dígitos base62 de fractional-indexing; con
-- menos de 62 vistas por base de datos sobra de largo.
ALTER TABLE "View" ADD COLUMN "order" TEXT;
WITH ordenadas AS (
  SELECT id, row_number() OVER (PARTITION BY "collectionId" ORDER BY id) AS rn FROM "View"
)
UPDATE "View" v
SET "order" = 'a' || substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', o.rn::int, 1)
FROM ordenadas o WHERE v.id = o.id;
ALTER TABLE "View" ALTER COLUMN "order" SET NOT NULL;
