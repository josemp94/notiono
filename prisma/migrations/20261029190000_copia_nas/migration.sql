-- «Copia en el NAS» de la app: lo que la app informa de la copia de cada persona (nunca
-- credenciales: la contraseña de DSM no sale del móvil). La web lo enseña en Ajustes.
CREATE TABLE "CopiaNas" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "ultima" TIMESTAMP(3),
    "paginas" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "carpeta" TEXT,
    "actualizado" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CopiaNas_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CopiaNas_userId_key" ON "CopiaNas"("userId");
ALTER TABLE "CopiaNas" ADD CONSTRAINT "CopiaNas_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
