-- Registro de diagnóstico de la app nativa (widgets, cierres, fallos del servidor).
CREATE TABLE "AppRegistro" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dispositivo" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "fabricante" TEXT NOT NULL,
    "android" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "traza" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppRegistro_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AppRegistro_userId_createdAt_idx" ON "AppRegistro"("userId", "createdAt");

ALTER TABLE "AppRegistro" ADD CONSTRAINT "AppRegistro_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
