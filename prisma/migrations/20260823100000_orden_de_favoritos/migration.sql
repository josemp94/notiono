-- Orden manual de los favoritos del sidebar (arrastrar para reordenar).
-- Backfill con claves fraccionales válidas ('a0', 'a1', …) en el orden en que ya
-- se mostraban (createdAt asc). Mismos dígitos base62 de fractional-indexing;
-- con menos de 62 favoritos por usuario sobra de largo.
ALTER TABLE "Favorite" ADD COLUMN "order" TEXT;
WITH ordenados AS (
  SELECT id, row_number() OVER (PARTITION BY "userId" ORDER BY "createdAt", id) AS rn FROM "Favorite"
)
UPDATE "Favorite" f
SET "order" = 'a' || substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', o.rn::int, 1)
FROM ordenados o WHERE f.id = o.id;
ALTER TABLE "Favorite" ALTER COLUMN "order" SET NOT NULL;
