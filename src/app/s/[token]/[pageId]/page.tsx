import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { PublicView } from "../PublicView";
import { PasswordGate } from "../PasswordGate";
import { esDescendiente, puertaAbierta, raizPublica, tablasPublicas } from "../publico";

/**
 * Subpágina de una página publicada: navegable con el mismo token, como en
 * Notion (el share incluye a las hijas). Solo descendientes vivas de la raíz;
 * la contraseña y la caducidad de la raíz mandan también aquí.
 */
export default async function PublicSubpage({
  params,
}: {
  params: Promise<{ token: string; pageId: string }>;
}) {
  const { token, pageId } = await params;
  const root = await raizPublica(token);
  if (!root) notFound();
  if (!(await puertaAbierta(token, root.publicPassword))) return <PasswordGate token={token} />;

  // La propia raíz con su id en la URL también vale (enlaces generados a mano).
  const page =
    pageId === root.id
      ? root
      : (await esDescendiente(root.id, pageId, root.workspaceId))
        ? await db.page.findFirst({ where: { id: pageId, workspaceId: root.workspaceId, archivedAt: null } })
        : null;
  if (!page) notFound();

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
      font={page.type === "database" ? null : page.font}
      back={page.id === root.id ? undefined : { href: `/s/${token}`, title: root.title || "Sin título" }}
    />
  );
}
