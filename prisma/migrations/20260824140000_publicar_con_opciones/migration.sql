-- Opciones del enlace público: caducidad y contraseña (hash bcrypt).
ALTER TABLE "Page" ADD COLUMN "publicExpiresAt" TIMESTAMP(3);
ALTER TABLE "Page" ADD COLUMN "publicPassword" TEXT;
