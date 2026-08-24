"use client";

import { FileText } from "lucide-react";
import { BlockNoteSchema, createCodeBlockSpec, defaultBlockSpecs, defaultInlineContentSpecs } from "@blocknote/core";
import { codeBlockOptions } from "@blocknote/code-block";
import { createReactInlineContentSpec, SuggestionMenuController } from "@blocknote/react";
import { trpc } from "@/trpc/react";
import { IconoPagina } from "@/components/PageIcon";
import { BookmarkBlock } from "./bookmarkBlock";
import { ColumnBlock, ColumnListBlock } from "./columnBlock";
import { CalloutBlock } from "./calloutBlock";
import { DatabaseBlock } from "./databaseBlock";
import { TocBlock } from "./tocBlock";

/** Chip de mención inline: icono + título de la página, enlaza a /p/<id>. */
const Mention = createReactInlineContentSpec(
  {
    type: "mention",
    propSchema: {
      pageId: { default: "" },
      title: { default: "" },
      icon: { default: "" },
    },
    content: "none",
  },
  {
    render: ({ inlineContent }) => (
      <a
        href={`/p/${inlineContent.props.pageId}`}
        className="whitespace-nowrap rounded bg-brand-50 px-1 font-medium text-brand no-underline hover:underline"
      >
        {inlineContent.props.icon ? <IconoPagina icon={inlineContent.props.icon} size={14} /> : <FileText size={13} className="inline align-[-2px]" />}{" "}
        {inlineContent.props.title || "Sin título"}
      </a>
    ),
  },
);

/** Chip de mención de persona: @nombre en azul (distinto de las páginas, en naranja de marca). */
const PersonMention = createReactInlineContentSpec(
  {
    type: "personMention",
    propSchema: {
      userId: { default: "" },
      name: { default: "" },
    },
    content: "none",
  },
  {
    render: ({ inlineContent }) => (
      <span className="whitespace-nowrap rounded bg-sky-500/15 px-1 font-medium text-sky-600">
        @{inlineContent.props.name || "alguien"}
      </span>
    ),
  },
);

/** Schema compartido por todos los editores BlockNote de la app (registra "mention", "personMention" y el bloque "database"). */
export const editorSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    // Resaltado de sintaxis (shiki precompilado) con selector de lenguaje.
    codeBlock: createCodeBlockSpec(codeBlockOptions),
    database: DatabaseBlock(),
    callout: CalloutBlock(),
    toc: TocBlock(),
    bookmark: BookmarkBlock(),
    columnList: ColumnListBlock(),
    column: ColumnBlock(),
  },
  inlineContentSpecs: { ...defaultInlineContentSpecs, mention: Mention, personMention: PersonMention },
});

export type NotionoEditor = typeof editorSchema.BlockNoteEditor;
export type NotionoPartialBlock = typeof editorSchema.PartialBlock;

/**
 * Subida de archivos del editor (bloques imagen/vídeo/audio/archivo): reutiliza
 * `/api/upload` (el mismo de portadas y adjuntos). Devuelve props para que el
 * bloque se quede con la URL y el nombre real del archivo.
 */
export async function subirArchivo(file: File) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  const data = (await res.json().catch(() => null)) as { url?: string; name?: string | null; error?: string } | null;
  if (!res.ok || !data?.url) throw new Error(data?.error ?? "No se pudo subir el archivo.");
  return { props: { url: data.url, name: data.name ?? "" } };
}

/** Menú "@": personas del espacio (workspace.members) y páginas (pages.search). */
export function MentionMenu({ editor, pageId }: { editor: NotionoEditor; pageId: string }) {
  const utils = trpc.useUtils();
  const notify = trpc.notifications.notifyMention.useMutation();
  return (
    <SuggestionMenuController
      triggerCharacter="@"
      getItems={async (query) => {
        const q = query.trim().toLowerCase();
        const [pages, ws] = await Promise.all([
          q ? utils.pages.search.fetch({ query }) : utils.pages.tree.fetch().then((t) => t.slice(0, 10)),
          utils.workspace.members.fetch(),
        ]);
        const people = ws.members.filter(
          (m) => !q || (m.name ?? "").toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
        );
        return [
          ...people.map((m) => ({
            title: `@${m.name || m.email}`,
            subtext: m.email,
            group: "Personas",
            onItemClick: () => {
              editor.insertInlineContent([
                { type: "personMention", props: { userId: m.userId, name: m.name || m.email } },
                " ",
              ]);
              notify.mutate({ pageId, userId: m.userId });
            },
          })),
          ...pages.map((p) => ({
            title: p.title || "Sin título",
            icon: p.icon ? <span><IconoPagina icon={p.icon} size={16} /></span> : <FileText size={16} />,
            group: "Páginas",
            onItemClick: () => {
              editor.insertInlineContent([
                { type: "mention", props: { pageId: p.id, title: p.title || "Sin título", icon: p.icon ?? "" } },
                " ",
              ]);
            },
          })),
        ];
      }}
    />
  );
}
