import { notFound } from "next/navigation";
import { PublicView } from "./PublicView";
import { PasswordGate } from "./PasswordGate";
import { puertaAbierta, raizPublica, tablasPublicas } from "./publico";

// Ruta pública (sin sesión): solo expone la página cuyo publicToken coincide.
export default async function PublicShare({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const page = await raizPublica(token);
  if (!page) notFound();
  if (!(await puertaAbierta(token, page.publicPassword))) return <PasswordGate token={token} />;

  const { table, dbTables } = await tablasPublicas(page);
  return (
    <PublicView
      title={page.title}
      icon={page.icon}
      cover={page.cover}
      content={page.content}
      table={table}
      dbTables={dbTables}
      token={token}
    />
  );
}
