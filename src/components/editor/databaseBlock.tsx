"use client";

import { createContext, useContext } from "react";
import dynamic from "next/dynamic";
import { createReactBlockSpec } from "@blocknote/react";

// Import dinámico: rompe el ciclo schema → Database → TableView → RecordPanel → schema
// y deja las vistas de BD fuera del bundle de páginas que no embeben ninguna.
const Database = dynamic(() => import("@/components/database/Database").then((m) => m.Database), {
  ssr: false,
  loading: () => (
    <div className="space-y-2 py-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="esqueleto h-7 w-full" />
      ))}
    </div>
  ),
});

export type PublicDbTable = { headers: string[]; rows: string[][] };

/**
 * En páginas públicas (/s/<token>) no hay sesión y tRPC no responde: el servidor
 * resuelve las BD embebidas a tablas estáticas y las inyecta por este contexto.
 */
export const PublicDbContext = createContext<Record<string, PublicDbTable> | null>(null);

/** Tabla estática de solo lectura (vista pública de una BD, completa o embebida). */
export function StaticDbTable({ table }: { table: PublicDbTable }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-y border-[var(--border)] text-left text-[var(--muted)]">
            {table.headers.map((h, i) => (
              <th key={i} className="min-w-32 px-2 py-1 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={i} className="border-b border-[var(--border)]">
              {row.map((cell, j) => (
                <td key={j} className="px-2 py-1.5">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 px-2 text-xs text-[var(--muted)]">{table.rows.length} filas</div>
    </div>
  );
}

function EmbeddedDatabase({
  collectionId,
  pageId,
  viewId,
  canEdit,
  onViewChange,
}: {
  collectionId: string;
  pageId: string;
  viewId?: string;
  canEdit: boolean;
  onViewChange?: (viewId: string) => void;
}) {
  const publicTables = useContext(PublicDbContext);
  if (publicTables) {
    const table = publicTables[collectionId];
    return table ? (
      <div className="my-2 w-full">
        <StaticDbTable table={table} />
      </div>
    ) : (
      <div className="my-2 text-sm text-[var(--muted)]">Base de datos no disponible.</div>
    );
  }
  if (!pageId) return <div className="my-2 text-sm text-[var(--muted)]">Base de datos no disponible.</div>;
  return (
    <div className="my-2 w-full rounded-lg border border-[var(--border)]" contentEditable={false}>
      <Database
        pageId={pageId}
        initialTitle=""
        canEdit={canEdit}
        embedded
        viewId={viewId || undefined}
        onViewChange={onViewChange}
      />
    </div>
  );
}

/** Bloque "database": una BD real embebida en el cuerpo de la página (Notion inline database). */
export const DatabaseBlock = createReactBlockSpec(
  {
    type: "database",
    propSchema: {
      collectionId: { default: "" },
      pageId: { default: "" }, // página contenedora oculta (embedded=true) de la que cuelga la Collection
      viewId: { default: "" }, // vista que muestra el bloque (las vistas enlazadas recuerdan la suya)
    },
    content: "none",
  },
  {
    render: ({ block, editor }) => (
      <EmbeddedDatabase
        collectionId={block.props.collectionId}
        pageId={block.props.pageId}
        viewId={block.props.viewId}
        canEdit={editor.isEditable}
        onViewChange={(viewId) => editor.updateBlock(block, { props: { viewId } })}
      />
    ),
  },
);
