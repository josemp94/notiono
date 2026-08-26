"use client";

import { CalendarDays, FileText } from "lucide-react";
import { BlockNoteSchema, createCodeBlockSpec, defaultBlockSpecs, defaultInlineContentSpecs } from "@blocknote/core";
import { codeBlockOptions } from "@blocknote/code-block";
import { createReactInlineContentSpec, SuggestionMenuController } from "@blocknote/react";
import { trpc } from "@/trpc/react";
import { useContext } from "react";
import { IconoPagina } from "@/components/PageIcon";
import { BookmarkBlock } from "./bookmarkBlock";
import { ColumnBlock, ColumnListBlock } from "./columnBlock";
import { CalloutBlock } from "./calloutBlock";
import { DatabaseBlock, PublicBaseContext } from "./databaseBlock";
import { TocBlock } from "./tocBlock";

/** Chip de mención inline: icono + título de la página. Enlaza a /p/<id> o, en
 *  una página pública, a la subpágina pública (/s/<token>/<id>). */
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
      <MentionChip inlineContent={inlineContent} />
    ),
  },
);

function MentionChip({ inlineContent }: { inlineContent: { props: { pageId: string; title: string; icon: string } } }) {
  const base = useContext(PublicBaseContext);
  return (
      <a
        href={base ? `${base}/${inlineContent.props.pageId}` : `/p/${inlineContent.props.pageId}`}
        className="whitespace-nowrap rounded bg-brand-50 px-1 font-medium text-brand no-underline hover:underline"
      >
        {inlineContent.props.icon ? <IconoPagina icon={inlineContent.props.icon} size={14} /> : <FileText size={13} className="inline align-[-2px]" />}{" "}
        {inlineContent.props.title || "Sin título"}
      </a>
  );
}

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

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** "Hoy"/"Mañana"/"Ayer" si toca; si no, "25 dic" (con año solo si no es el actual). */
function etiquetaFecha(fecha: string): string {
  const hoy = new Date();
  const cerca = (dias: number) => {
    const d = new Date(hoy);
    d.setDate(hoy.getDate() + dias);
    return ymd(d);
  };
  if (fecha === cerca(0)) return "Hoy";
  if (fecha === cerca(1)) return "Mañana";
  if (fecha === cerca(-1)) return "Ayer";
  const d = new Date(`${fecha}T00:00:00`);
  if (isNaN(d.getTime())) return fecha;
  return d.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: d.getFullYear() === hoy.getFullYear() ? undefined : "numeric",
  });
}

/**
 * Chip de mención de fecha (@hoy, @mañana, @25/12). Guarda el día fijo
 * (YYYY-MM-DD) y la etiqueta se calcula al pintar: el chip que hoy dice «Mañana»
 * dirá «Hoy» mañana, como en Notion.
 */
const DateMention = createReactInlineContentSpec(
  {
    type: "dateMention",
    propSchema: { fecha: { default: "" } },
    content: "none",
  },
  {
    render: ({ inlineContent }) => (
      <span
        className="whitespace-nowrap rounded bg-[var(--border)]/50 px-1 font-medium text-[var(--muted)]"
        title={inlineContent.props.fecha}
      >
        <CalendarDays size={13} className="inline align-[-2px]" /> {etiquetaFecha(inlineContent.props.fecha)}
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
  inlineContentSpecs: { ...defaultInlineContentSpecs, mention: Mention, personMention: PersonMention, dateMention: DateMention },
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
        // Fechas: Hoy/Mañana si casan con lo escrito, y "25/12" o "25/12/2027" tal cual.
        const hoy = new Date();
        const fechas: { title: string; fecha: string }[] = [];
        const enDias = (n: number) => {
          const d = new Date(hoy);
          d.setDate(hoy.getDate() + n);
          return ymd(d);
        };
        if (!q || "hoy".startsWith(q)) fechas.push({ title: "Hoy", fecha: enDias(0) });
        if (!q || "mañana".startsWith(q) || "manana".startsWith(q)) fechas.push({ title: "Mañana", fecha: enDias(1) });
        const mf = /^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?$/.exec(query.trim());
        if (mf) {
          const año = mf[3] ? (mf[3].length === 2 ? 2000 + Number(mf[3]) : Number(mf[3])) : hoy.getFullYear();
          const d = new Date(año, Number(mf[2]) - 1, Number(mf[1]));
          // new Date normaliza (32/01 → 01/02): si no coincide, la fecha no existía.
          if (d.getDate() === Number(mf[1]) && d.getMonth() === Number(mf[2]) - 1) {
            fechas.push({ title: d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }), fecha: ymd(d) });
          }
        }
        return [
          ...fechas.map((f) => ({
            title: f.title,
            subtext: f.fecha,
            group: "Fechas",
            icon: <CalendarDays size={16} />,
            onItemClick: () => {
              editor.insertInlineContent([{ type: "dateMention", props: { fecha: f.fecha } }, " "]);
            },
          })),
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
