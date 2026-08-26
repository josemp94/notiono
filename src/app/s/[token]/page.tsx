import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { publicCookieName, publicCookieValue } from "@/server/publicAuth";
import { PasswordGate } from "./PasswordGate";
import { cellToText, peopleOf } from "@/server/services/cells";
import type { PublicDbTable } from "@/components/editor/databaseBlock";
import { PublicView } from "./PublicView";

type Col = NonNullable<Awaited<ReturnType<typeof loadCollection>>>;

function loadCollection(where: { pageId: string } | { id: string; page: { workspaceId: string } }) {
  return db.collection.findFirst({
    where,
    include: {
      fields: { orderBy: { order: "asc" } },
      records: { where: { archivedAt: null }, orderBy: { order: "asc" } },
    },
  });
}

/** Colección → tabla estática. Campos computados (relación/rollup/fórmula) fuera: sus celdas no tienen valor legible. */
function tableOf(col: Col, people: Map<string, string>): PublicDbTable {
  const fields = col.fields.filter((f) => !["relation", "rollup", "formula"].includes(f.type));
  return {
    headers: fields.map((f) => f.name),
    rows: col.records.map((r) => {
      const cells = (r.cells ?? {}) as Record<string, unknown>;
      return fields.map((f) => cellToText(f, cells[f.id], r, people));
    }),
  };
}

/** Ids de colección de los bloques "database" embebidos en un documento de bloques. */
function collectEmbeddedIds(node: unknown, ids: Set<string>) {
  if (Array.isArray(node)) {
    for (const n of node) collectEmbeddedIds(n, ids);
  } else if (node && typeof node === "object") {
    const b = node as { type?: string; props?: { collectionId?: string }; children?: unknown };
    if (b.type === "database" && b.props?.collectionId) ids.add(b.props.collectionId);
    collectEmbeddedIds(b.children, ids);
  }
}

// Ruta pública (sin sesión): solo expone la página cuyo publicToken coincide.
export default async function PublicShare({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const page = await db.page.findUnique({ where: { publicToken: token } });
  if (!page || page.archivedAt) notFound();
  // Enlace caducado = enlace muerto, indistinguible de no publicado.
  if (page.publicExpiresAt && page.publicExpiresAt < new Date()) notFound();
  // Con contraseña: sin la cookie firmada (atada al hash), la puerta.
  if (page.publicPassword) {
    const jar = await cookies();
    const valida = jar.get(publicCookieName(token))?.value === publicCookieValue(token, page.publicPassword);
    if (!valida) return <PasswordGate token={token} />;
  }

  let table: PublicDbTable | null = null;
  if (page.type === "database") {
    const col = await loadCollection({ pageId: page.id });
    if (col) table = tableOf(col, await peopleOf(db, page.workspaceId, col.fields));
  }

  // BD embebidas en el cuerpo: se resuelven aquí (no hay tRPC sin sesión), solo las del mismo workspace.
  const dbTables: Record<string, PublicDbTable> = {};
  const ids = new Set<string>();
  collectEmbeddedIds(page.content, ids);
  for (const id of ids) {
    const col = await loadCollection({ id, page: { workspaceId: page.workspaceId } });
    if (col) dbTables[id] = tableOf(col, await peopleOf(db, page.workspaceId, col.fields));
  }

  return (
    <PublicView
      title={page.title}
      icon={page.icon}
      cover={page.cover}
      content={page.content}
      table={table}
      dbTables={dbTables}
    />
  );
}
