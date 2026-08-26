-- Reacciones emoji en comentarios: { "👍": [userId, …] }.
ALTER TABLE "Comment" ADD COLUMN "reactions" JSONB NOT NULL DEFAULT '{}';
