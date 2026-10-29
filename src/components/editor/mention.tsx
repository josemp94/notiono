"use client";

import { AlarmClock, CalendarDays, FileText } from "lucide-react";
import { BlockNoteSchema, createCodeBlockSpec, defaultBlockSpecs, defaultInlineContentSpecs } from "@blocknote/core";
import { codeBlockOptions } from "@blocknote/code-block";
import { createReactInlineContentSpec, SuggestionMenuController } from "@blocknote/react";
import { trpc } from "@/trpc/react";
import { useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { atajoRecordatorio, ATAJOS, HORA_AVISO, tituloAtajo, opcionesRecordatorio, sugerenciasRecordar, textoRecordatorio } from "@/lib/recordatorios";
import { IconoPagina } from "@/components/PageIcon";
import { abrirEnPanel } from "@/lib/vistazo";
import { BookmarkBlock } from "./bookmarkBlock";
import { ColumnBlock, ColumnListBlock } from "./columnBlock";
import { CalloutBlock } from "./calloutBlock";
import { EquationBlock } from "./equationBlock";
import { DrawingBlock } from "./drawingBlock";
import { DatabaseBlock, PublicBaseContext } from "./databaseBlock";
import { TocBlock } from "./tocBlock";
import { configMencion, configMencionFecha, configMencionPersona } from "./esquemaBloques";

/** Chip de mención inline: icono + título de la página. Enlaza a /p/<id> o, en
 *  una página pública, a la subpágina pública (/s/<token>/<id>). */
const Mention = createReactInlineContentSpec(
  configMencion,
  {
    render: ({ inlineContent }) => (
      <MentionChip inlineContent={inlineContent} />
    ),
  },
);

function MentionChip({ inlineContent }: { inlineContent: { props: { pageId: string; title: string; icon: string } } }) {
  const base = useContext(PublicBaseContext);
  // La raíz NO puede ser el <a>: al copiar o arrastrar el bloque, BlockNote lo lleva
  // como HTML y, al soltarlo, la regla de la marca «enlace» (a[href]) gana a la de la
  // mención y el chip llegaba convertido en un enlace de texto (sin icono ni título vivo).
  return (
    <span>
      <a
        href={base ? `${base}/${inlineContent.props.pageId}` : `/p/${inlineContent.props.pageId}`}
        // Alt+clic: echarle un vistazo en el panel lateral sin salir de aquí, como Notion.
        onClick={(e) => {
          if (!e.altKey || base) return;
          e.preventDefault();
          abrirEnPanel(inlineContent.props.pageId);
        }}
        className="whitespace-nowrap rounded bg-brand-50 px-1 font-medium text-brand no-underline hover:underline"
      >
        {inlineContent.props.icon ? <IconoPagina icon={inlineContent.props.icon} size={14} /> : <FileText size={13} className="inline align-[-2px]" />}{" "}
        {inlineContent.props.title || "Sin título"}
      </a>
    </span>
  );
}

/** Chip de mención de persona: @nombre en azul (distinto de las páginas, en naranja de marca). */
const PersonMention = createReactInlineContentSpec(
  configMencionPersona,
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

/** "Hoy"/"Mañana"/"Ayer" si toca; si no, "25 dic" (con año solo si no es el actual). Con hora: "Mañana 9:00". */
function etiquetaFecha(fechaHora: string): string {
  const [fecha, hora] = fechaHora.split("T");
  const dia = etiquetaDia(fecha);
  return hora ? `${dia} ${hora.replace(/^0(\d)/, "$1")}` : dia;
}

function etiquetaDia(fecha: string): string {
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
  configMencionFecha,
  {
    render: ({ inlineContent, updateInlineContent, editor }) => (
      <ChipFecha props={inlineContent.props} editable={editor.isEditable} cambia={(props) => updateInlineContent({ type: "dateMention", props })} />
    ),
  },
);

type PropsFecha = { fecha: string; recordatorio: string; por: string };

/** Quién soy (para apuntar quién pone el recordatorio); sin hooks: el chip también sale en páginas públicas. */
async function miId(): Promise<string> {
  const r = await fetch("/api/trpc/auth.me").then((x) => x.json()).catch(() => null);
  return (r as { result?: { data?: { json?: { id?: string } | null } } } | null)?.result?.data?.json?.id ?? "";
}

/**
 * El chip recién puesto con «Recordar…» del menú @ abre solo su menú, para elegir el
 * día y la hora sin buscarlo (solo en esta pestaña: el de otra persona no se abre).
 */
let abrirAlPoner: PropsFecha | null = null;

/** El chip de fecha; al pulsarlo (si se puede editar) se cambia la fecha y su recordatorio, como en Notion. */
function ChipFecha({ props, editable, cambia }: { props: PropsFecha; editable: boolean; cambia: (p: PropsFecha) => void }) {
  const [ancla, setAncla] = useState<HTMLSpanElement | null>(null);
  const [abierto, setAbierto] = useState(() => {
    const a = abrirAlPoner && abrirAlPoner.fecha === props.fecha && abrirAlPoner.por === props.por;
    if (a) abrirAlPoner = null;
    return !!a;
  });
  const base = useContext(PublicBaseContext);
  const conHora = props.fecha.includes("T");
  const aviso = textoRecordatorio(props.recordatorio, conHora);
  const puede = editable && !base;
  return (
    <span
      ref={setAncla}
      className={`whitespace-nowrap rounded px-1 font-medium ${props.recordatorio ? "bg-sky-500/15 text-sky-600" : "bg-[var(--border)]/50 text-[var(--muted)]"}`}
      title={aviso ? `${props.fecha} · Recordatorio: ${aviso}` : props.fecha}
    >
      <span role={puede ? "button" : undefined} onClick={() => puede && setAbierto((a) => !a)} className={puede ? "cursor-pointer" : undefined}>
        {props.recordatorio ? <AlarmClock size={13} className="inline align-[-2px]" aria-label="Recordatorio" /> : <CalendarDays size={13} className="inline align-[-2px]" />}{" "}
        {etiquetaFecha(props.fecha)}
      </span>
      {abierto && ancla && <MenuFecha ancla={ancla} props={props} cambia={cambia} cerrar={() => setAbierto(false)} />}
    </span>
  );
}

/**
 * El menú de una mención de fecha (como el de Notion): el día, «Incluir hora», «Recordar»
 * y, arriba, los atajos de recordar (en 1 hora, esta tarde, mañana a las 9:00), que ponen
 * esa fecha con aviso a su hora. Va en un portal: dentro del editor, ProseMirror se
 * quedaría los clics y las teclas de los campos.
 */
function MenuFecha({ ancla, props, cambia, cerrar }: { ancla: HTMLElement; props: PropsFecha; cambia: (p: PropsFecha) => void; cerrar: () => void }) {
  const caja = useRef<HTMLDivElement>(null);
  const conHora = props.fecha.includes("T");
  const r = ancla.getBoundingClientRect();
  useEffect(() => {
    const fuera = (e: MouseEvent) => !caja.current?.contains(e.target as Node) && !ancla.contains(e.target as Node) && cerrar();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && cerrar();
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", esc);
    };
  }, [ancla, cerrar]);
  const pon = async (p: Partial<PropsFecha>) => {
    const nuevo = { ...props, ...p };
    // Quien pone el recordatorio es a quien avisa.
    if (nuevo.recordatorio && (p.recordatorio !== undefined || !nuevo.por)) nuevo.por = (await miId()) || nuevo.por;
    if (!nuevo.recordatorio) nuevo.por = "";
    cambia(nuevo);
  };
  const item = "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--hover)]";
  return createPortal(
    <div
      ref={caja}
      data-menu=""
      style={{ position: "fixed", left: Math.max(8, Math.min(r.left, window.innerWidth - 272)), top: Math.min(r.bottom + 4, window.innerHeight - 330) }}
      className="z-[60] w-64 rounded-lg border border-[var(--border)] bg-[var(--background)] p-1 text-[var(--foreground)] shadow-xl"
    >
      {ATAJOS.map(([a, texto]) => {
        const fecha = atajoRecordatorio(a);
        return fecha ? (
          <button key={a} onClick={() => (pon({ fecha, recordatorio: "0" }), cerrar())} className={item}>
            <AlarmClock size={15} className="text-[var(--muted)]" /> {tituloAtajo(texto)}
          </button>
        ) : null;
      })}
      <div className="my-1 border-t border-[var(--border)]" />
      <div className="space-y-2 px-2 py-1.5 text-sm">
        <input
          type={conHora ? "datetime-local" : "date"}
          value={props.fecha}
          onChange={(e) => e.target.value && pon({ fecha: e.target.value.slice(0, conHora ? 16 : 10) })}
          aria-label="Fecha"
          className="w-full rounded-md border border-[var(--border)] bg-transparent px-2 py-1"
        />
        <label className="flex items-center justify-between gap-2">
          Incluir hora
          <input
            type="checkbox"
            checked={conHora}
            onChange={(e) => pon({ fecha: e.target.checked ? `${props.fecha.slice(0, 10)}T${String(HORA_AVISO).padStart(2, "0")}:00` : props.fecha.slice(0, 10) })}
            className="accent-[var(--color-brand)]"
          />
        </label>
        <label className="flex items-center justify-between gap-2">
          Recordar
          <select
            value={textoRecordatorio(props.recordatorio, conHora) ? props.recordatorio : ""}
            onChange={(e) => pon({ recordatorio: e.target.value })}
            aria-label="Recordar"
            className="w-40 rounded-md border border-[var(--border)] bg-[var(--background)] px-1 py-0.5 text-sm"
          >
            <option value="">Ninguno</option>
            {opcionesRecordatorio(conHora).map(([id, texto]) => (
              <option key={id} value={id}>{texto}</option>
            ))}
          </select>
        </label>
      </div>
    </div>,
    document.body,
  );
}

/** Schema compartido por todos los editores BlockNote de la app (registra "mention", "personMention" y el bloque "database"). */
export const editorSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    // Resaltado de sintaxis (shiki precompilado) con selector de lenguaje.
    codeBlock: createCodeBlockSpec(codeBlockOptions),
    database: DatabaseBlock(),
    callout: CalloutBlock(),
    equation: EquationBlock(),
    toc: TocBlock(),
    bookmark: BookmarkBlock(),
    columnList: ColumnListBlock(),
    column: ColumnBlock(),
    drawing: DrawingBlock(),
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
        const [pages, ws, yo] = await Promise.all([
          q ? utils.pages.search.fetch({ query }) : utils.pages.tree.fetch().then((t) => t.slice(0, 10)),
          utils.workspace.members.fetch(),
          utils.auth.me.fetch(),
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
        // «@recordar…» como en Notion: mención de fecha con aviso a su hora, de quien la pone.
        const recordar = sugerenciasRecordar(query) ?? (!q ? [] : null);
        // Sin esperas al elegir: entre el clic y una espera, el cursor ya no está donde se escribió.
        const poner = (fecha: string, abrir = false) => {
          const props = { fecha, recordatorio: "0", por: yo?.id ?? "" };
          if (abrir) abrirAlPoner = props;
          editor.insertInlineContent([{ type: "dateMention", props }, " "]);
        };
        return [
          ...fechas.map((f) => ({
            title: f.title,
            subtext: f.fecha,
            group: "Fecha o recordatorio",
            icon: <CalendarDays size={16} />,
            onItemClick: () => {
              editor.insertInlineContent([{ type: "dateMention", props: { fecha: f.fecha, recordatorio: "", por: "" } }, " "]);
            },
          })),
          ...(recordar ?? []).map((r) => ({
            title: r.titulo,
            subtext: r.fecha.replace("T", " "),
            group: "Fecha o recordatorio",
            icon: <AlarmClock size={16} />,
            onItemClick: () => poner(r.fecha),
          })),
          // «Recordar…»: mañana a las 9:00 y su menú abierto para elegir otro día u hora.
          ...(recordar && (!q || q.length <= "recordar".length)
            ? [{
                title: "Recordar…",
                subtext: "Elige el día y la hora",
                group: "Fecha o recordatorio",
                icon: <AlarmClock size={16} />,
                onItemClick: () => poner(atajoRecordatorio("manana")!, true),
              }]
            : []),
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
