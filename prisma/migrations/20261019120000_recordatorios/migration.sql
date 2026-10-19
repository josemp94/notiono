-- Recordatorios a su hora (src/server/recordatorios.ts): el aviso abre la fila que lo lanzó.
ALTER TABLE "Notification" ADD COLUMN "recordId" TEXT;
