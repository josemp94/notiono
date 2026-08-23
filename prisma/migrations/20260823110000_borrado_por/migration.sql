-- «Borrado por» en la papelera: quién envió la página a la papelera.
-- Se limpia al restaurar; si el usuario se borra, queda en NULL.
ALTER TABLE "Page" ADD COLUMN "archivedById" TEXT;
ALTER TABLE "Page" ADD CONSTRAINT "Page_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
