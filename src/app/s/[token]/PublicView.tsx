"use client";

import { es } from "@blocknote/core/locales";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { ArrowLeft } from "lucide-react";
import { editorSchema, type NotionoPartialBlock } from "@/components/editor/mention";
import { PublicBaseContext, PublicDbContext, StaticDbTable, type PublicDbTable } from "@/components/editor/databaseBlock";
import { coverStyle } from "@/components/PageCover";
import { IconoPagina } from "@/components/PageIcon";
import { useTheme } from "@/lib/theme";

/** Render público de solo lectura: portada, icono, título y contenido (doc o tabla). */
export function PublicView({
  title,
  icon,
  cover,
  content,
  table,
  dbTables,
  token,
  back,
}: {
  title: string;
  icon: string | null;
  cover: string | null;
  content: unknown;
  table: PublicDbTable | null;
  dbTables: Record<string, PublicDbTable>;
  /** Token público: las menciones de página enlazan a /s/<token>/<id>. */
  token: string;
  /** En una subpágina, el enlace de vuelta a la raíz publicada. */
  back?: { href: string; title: string };
}) {
  return (
    <div className="min-h-dvh">
      {cover && <div className="h-40 w-full" style={coverStyle(cover)} />}
      <div className={`mx-auto max-w-3xl px-4 pb-10 md:px-12 ${cover ? "pt-3" : "pt-10 md:pt-16"}`}>
        {back && (
          <a
            href={back.href}
            className="mb-3 inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            <ArrowLeft size={14} /> {back.title}
          </a>
        )}
        {icon && <div className={`mb-2 text-5xl ${cover ? "relative -mt-12" : ""}`}><IconoPagina icon={icon} size={48} /></div>}
        <h1 className="font-display mb-6 text-4xl font-extrabold md:text-5xl">{title || "Sin título"}</h1>
        {table ? (
          <StaticDbTable table={table} />
        ) : (
          <PublicBaseContext.Provider value={`/s/${token}`}>
            <PublicDbContext.Provider value={dbTables}>
              <PublicDoc content={content} />
            </PublicDbContext.Provider>
          </PublicBaseContext.Provider>
        )}
        <footer className="mt-16 border-t border-[var(--border)] pt-4 text-xs text-[var(--muted)]">
          Publicado con{" "}
          <span className="font-display font-bold">
            No<span className="text-brand">tio</span>no
          </span>
        </footer>
      </div>
    </div>
  );
}

function PublicDoc({ content }: { content: unknown }) {
  const theme = useTheme();
  const blocks = content as NotionoPartialBlock[] | undefined;
  const editor = useCreateBlockNote({
    dictionary: es,
    schema: editorSchema,
    initialContent: Array.isArray(blocks) && blocks.length > 0 ? blocks : undefined,
  });
  return <BlockNoteView editor={editor} editable={false} theme={theme} />;
}
