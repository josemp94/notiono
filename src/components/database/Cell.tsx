"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Check, Copy, Expand, MoreHorizontal, Paperclip, Pencil, Trash2, X } from "lucide-react";
import { trpc } from "@/trpc/react";
import { Popover } from "./Popover";
import { confirmar } from "@/components/Confirmar";
import { RichText, tieneFormato } from "@/lib/mdInline";
import { dateValue, formatDate, formatNumber, OPTION_COLORS, optionsOf, STATUS_GROUPS, type Attachment, type FieldLite, type Option } from "@/lib/cellText";


/** Mapa userId -> nombre de los miembros del espacio (para pintar campos "person"). */
export function usePeople(): Map<string, string> {
  const { data } = trpc.workspace.members.useQuery();
  return useMemo(
    () => new Map((data?.members ?? []).map((m) => [m.userId, m.name || m.email])),
    [data],
  );
}


export function Cell({
  field,
  value,
  onCommit,
  rollupValue,
  createdAt,
  updatedAt,
  createdById,
  updatedById,
  seq,
  wrap = false,
  rowUrl,
  recordId,
}: {
  field: FieldLite;
  value: unknown;
  onCommit: (v: unknown) => void;
  rollupValue?: string | number;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  createdById?: string | null;
  updatedById?: string | null;
  seq?: number;
  /** La vista pide envolver el texto largo en vez de recortarlo. */
  wrap?: boolean;
  /** Ruta de la fila (/p/…?r=…); con ella el ID ofrece copiar su enlace. */
  rowUrl?: string;
  /** Id de la fila; lo necesita el tipo Botón para aplicar sus acciones. */
  recordId?: string;
}) {
  // ID incremental (solo lectura), con prefijo opcional y copia del enlace de la fila
  if (field.type === "id") {
    const prefix = (field.config as { prefix?: string })?.prefix ?? "";
    return (
      <span className="group/celda relative flex items-center gap-1 px-1 py-0.5 text-sm text-[var(--muted)]">
        <span className="min-w-0 truncate">{seq == null ? "—" : `${prefix}${seq}`}</span>
        {rowUrl && seq != null && (
          <AccionesCelda>
            <CopiarBtn value={rowUrl} title="Copiar el enlace de la fila" />
          </AccionesCelda>
        )}
      </span>
    );
  }

  // Botón: aplica sus acciones (fieldId → valor) a la fila al pulsarlo
  if (field.type === "button") {
    return <ButtonCell field={field} recordId={recordId} />;
  }

  // Auto (solo lectura): quién creó o editó la fila
  if (field.type === "created_by" || field.type === "last_edited_by") {
    return <AuthorCell userId={field.type === "created_by" ? createdById : updatedById} />;
  }

  // Auto (solo lectura): fecha de creación / última edición
  if (field.type === "created_time" || field.type === "last_edited_time") {
    const src = field.type === "created_time" ? createdAt : updatedAt;
    const d = src ? new Date(src) : null;
    const txt =
      d && !isNaN(d.getTime())
        ? d.toLocaleString("es-ES", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
        : "—";
    return <span className="block px-1 py-0.5 text-sm text-[var(--muted)]">{txt}</span>;
  }

  if (field.type === "rollup" || field.type === "formula") {
    const v = rollupValue;
    return (
      <span className="block px-1 py-0.5 text-sm text-[var(--muted)]">
        {v === undefined || v === null || v === "" ? "—" : String(v)}
      </span>
    );
  }

  if (field.type === "relation") {
    const n = Array.isArray(value) ? value.length : 0;
    return (
      <span className="block px-1 py-0.5 text-sm text-[var(--muted)]">
        {n ? `${n} vinculado${n > 1 ? "s" : ""}` : "—"}
      </span>
    );
  }

  if (field.type === "checkbox") {
    return (
      <input
        type="checkbox"
        checked={Boolean(value)}
        onChange={(e) => onCommit(e.target.checked)}
        className="size-4 accent-[var(--color-brand,#ff5c28)]"
      />
    );
  }

  if (field.type === "person") {
    return <PersonCell value={value} onCommit={onCommit} />;
  }

  if (field.type === "files") {
    return <FilesCell value={value} onCommit={onCommit} />;
  }

  if (field.type === "select" || field.type === "status" || field.type === "multiselect") {
    return <TagCell field={field} value={value} onCommit={onCommit} />;
  }

  if (field.type === "date") {
    return <DateCell field={field} value={value} onCommit={onCommit} />;
  }

  // url / email / phone: input con tipo adecuado + enlace clicable si hay valor
  if (field.type === "url" || field.type === "email" || field.type === "phone") {
    return <LinkCell field={field} value={value} onCommit={onCommit} wrap={wrap} />;
  }

  if (field.type === "number") {
    return <NumberCell field={field} value={value} onCommit={onCommit} />;
  }

  // text (no controlado; commit al salir)
  if (wrap) return <WrappedTextCell value={value} onCommit={onCommit} />;
  return <TextCell value={value} onCommit={onCommit} />;
}

/**
 * Celda de texto de una línea, con copiar y «Expandir» si el contenido no cabe.
 * Si el texto lleva markdown inline (**negrita**, enlaces…), se pinta formateado
 * y el clic pasa a editar el crudo; sin formato, el input de siempre.
 */
function TextCell({ value, onCommit }: { value: unknown; onCommit: (v: unknown) => void }) {
  const texto = value == null ? "" : String(value);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [desborda, setDesborda] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState(false);

  if (tieneFormato(texto) && !editando) {
    return (
      <div ref={wrapRef} className="group/celda relative flex w-full items-center">
        <button
          onClick={() => setEditando(true)}
          className="min-w-0 flex-1 truncate px-1 py-0.5 text-left text-sm"
          title="Pulsa para editar (formato: **negrita**, *cursiva*, `código`, ~~tachado~~, [enlace](https://…))"
        >
          <RichText texto={texto} />
        </button>
        <AccionesCelda>
          <CopiarBtn value={texto} />
        </AccionesCelda>
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className="group/celda relative flex w-full items-center"
      // Medir solo al entrar con el ratón: cero coste en el render normal.
      onMouseEnter={() => {
        const el = inputRef.current;
        setDesborda(!!el && el.scrollWidth > el.clientWidth + 1);
      }}
    >
      {/* key: el input no es controlado (commit al salir) y sin remontarlo un valor
          cambiado por fuera (Expandir, la ficha, otra persona) seguiría enseñando
          —y recommitteando en el blur— el texto viejo. La guarda del commit evita
          lo mismo en la ventana entre el commit y el refetch. */}
      <input
        key={texto}
        ref={inputRef}
        type="text"
        defaultValue={texto}
        autoFocus={editando}
        onBlur={(e) => {
          setEditando(false);
          if (e.target.value !== texto) onCommit(e.target.value === "" ? null : e.target.value);
        }}
        className="min-w-0 flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
      />
      {texto && (
        <AccionesCelda>
          {desborda && <ExpandirBtn onClick={() => setAbierto(true)} />}
          <CopiarBtn value={texto} />
        </AccionesCelda>
      )}
      {abierto && (
        <ExpandePopover texto={texto} onCommit={onCommit} anchorRef={wrapRef} cerrar={() => setAbierto(false)} />
      )}
    </div>
  );
}

/** Celda URL / correo / teléfono: input nativo + copiar + abrir + expandir. */
function LinkCell({ field, value, onCommit, wrap = false }: { field: FieldLite; value: unknown; onCommit: (v: unknown) => void; wrap?: boolean }) {
  const raw = value == null ? "" : String(value);
  const href =
    field.type === "email" ? `mailto:${raw}` : field.type === "phone" ? `tel:${raw}` : /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [desborda, setDesborda] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState(false);

  // Con «Ajustar texto», el valor se pinta envuelto (un input no puede) y el
  // clic pasa a editar, como el texto con formato.
  if (wrap && raw && !editando) {
    return (
      <div className="group/celda relative flex w-full items-start">
        <button
          onClick={() => setEditando(true)}
          className="min-w-0 flex-1 whitespace-pre-wrap break-all px-1 py-0.5 text-left text-sm"
          title="Pulsa para editar"
        >
          {raw}
        </button>
        <AccionesCelda>
          <CopiarBtn value={raw} />
          <a href={href} target="_blank" rel="noreferrer" className="flex shrink-0 items-center rounded p-0.5 text-brand" title="Abrir">
            <ArrowUpRight size={13} />
          </a>
        </AccionesCelda>
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className="group/celda relative flex w-full items-center"
      onMouseEnter={() => {
        const el = inputRef.current;
        setDesborda(!!el && el.scrollWidth > el.clientWidth + 1);
      }}
    >
      {/* key + guarda: mismo motivo que en TextCell (input no controlado). */}
      <input
        key={raw}
        ref={inputRef}
        type={field.type === "email" ? "email" : field.type === "phone" ? "tel" : "url"}
        defaultValue={raw}
        autoFocus={editando}
        onBlur={(e) => {
          setEditando(false);
          if (e.target.value !== raw) onCommit(e.target.value === "" ? null : e.target.value);
        }}
        className="min-w-0 flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
      />
      {raw && (
        <AccionesCelda>
          {desborda && <ExpandirBtn onClick={() => setAbierto(true)} />}
          <CopiarBtn value={raw} />
          <a href={href} target="_blank" rel="noreferrer" className="flex shrink-0 items-center rounded p-0.5 text-brand" title="Abrir">
            <ArrowUpRight size={13} />
          </a>
        </AccionesCelda>
      )}
      {abierto && (
        <ExpandePopover texto={raw} onCommit={onCommit} anchorRef={wrapRef} cerrar={() => setAbierto(false)} />
      )}
    </div>
  );
}

/**
 * Acciones de una celda (copiar, expandir, abrir…) superpuestas a su borde
 * derecho, como en Notion: fuera del flujo para que la columna no reserve hueco
 * cuando no se ven. Solo aparecen con el ratón encima (en táctil no hay hover y
 * el valor completo ya se alcanza abriendo la ficha). Requiere `relative` y
 * `group/celda` en el contenedor de la celda.
 */
function AccionesCelda({ children }: { children: React.ReactNode }) {
  return (
    <span className="absolute right-0 top-1/2 z-10 hidden -translate-y-1/2 items-center rounded border border-[var(--border)] bg-[var(--background)] px-0.5 shadow-sm group-hover/celda:flex">
      {children}
    </span>
  );
}

/** Botón «Expandir» (solo con hover, como el de copiar). */
function ExpandirBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 rounded p-0.5 text-[var(--muted)] hover:text-[var(--foreground)]"
      title="Expandir"
    >
      <Expand size={13} />
    </button>
  );
}

/**
 * Popup con el contenido completo de una celda que no cabe, editable. El commit
 * va en el cierre (no en el blur del textarea: al cerrarse el popover por un clic
 * fuera, el nodo se desmonta y su blur puede no llegar a dispararse).
 */
function ExpandePopover({
  texto,
  onCommit,
  anchorRef,
  cerrar,
}: {
  texto: string;
  onCommit: (v: unknown) => void;
  anchorRef: { readonly current: HTMLElement | null };
  cerrar: () => void;
}) {
  const borrador = useRef<string | null>(null);
  return (
    <Popover
      onClose={() => {
        if (borrador.current !== null && borrador.current !== texto) {
          onCommit(borrador.current === "" ? null : borrador.current);
        }
        cerrar();
      }}
      className="left-0 w-80 p-2"
      anchorRef={anchorRef}
    >
      <textarea
        autoFocus
        rows={6}
        defaultValue={texto}
        onChange={(e) => (borrador.current = e.target.value)}
        className="w-full resize-none rounded border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm outline-none focus:border-brand"
      />
    </Popover>
  );
}

/** Botón de copiar el valor de la celda; su visibilidad la lleva AccionesCelda. */
function CopiarBtn({ value, title = "Copiar" }: { value: string; title?: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      onClick={() =>
        // Las rutas relativas se copian como URL absoluta (enlace de la fila).
        navigator.clipboard.writeText(value.startsWith("/") ? location.origin + value : value).then(() => {
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1000);
        })
      }
      className="shrink-0 rounded p-0.5 text-[var(--muted)] hover:text-[var(--foreground)]"
      title={title}
    >
      {copiado ? <Check size={13} className="text-brand" /> : <Copy size={13} />}
    </button>
  );
}

/**
 * Celda de texto con el contenido envuelto en varias líneas (opción «Envolver
 * texto» de la vista). Crece con lo escrito en vez de recortar.
 */
function WrappedTextCell({ value, onCommit }: { value: unknown; onCommit: (v: unknown) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [editando, setEditando] = useState(false);
  const ajustar = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  // El alto depende del ancho y este cambia después de montar (el panel de la
  // ficha restaura su ancho de localStorage, se arrastra su borde, se ajusta una
  // columna): sin re-medir quedaba el alto viejo, con hueco de sobra debajo.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    ajustar(el);
    const ro = new ResizeObserver(() => ajustar(el));
    ro.observe(el);
    return () => ro.disconnect();
  }, [value, editando]);

  const texto = value == null ? "" : String(value);

  if (tieneFormato(texto) && !editando) {
    return (
      <div className="group/celda relative flex w-full items-start">
        <button
          onClick={() => setEditando(true)}
          className="min-w-0 flex-1 whitespace-pre-wrap break-words px-1 py-0.5 text-left text-sm"
          title="Pulsa para editar (formato: **negrita**, *cursiva*, `código`, ~~tachado~~, [enlace](https://…))"
        >
          <RichText texto={texto} />
        </button>
        <AccionesCelda>
          <CopiarBtn value={texto} />
        </AccionesCelda>
      </div>
    );
  }

  return (
    <div className="group/celda relative flex w-full items-start">
      {/* key + guarda: mismo motivo que en TextCell (textarea no controlado). */}
      <textarea
        key={texto}
        ref={ref}
        rows={1}
        defaultValue={texto}
        autoFocus={editando}
        onInput={(e) => ajustar(e.currentTarget)}
        onBlur={(e) => {
          setEditando(false);
          if (e.target.value !== texto) onCommit(e.target.value === "" ? null : e.target.value);
        }}
        className="min-w-0 flex-1 resize-none bg-transparent px-1 py-0.5 text-sm outline-none"
      />
      {texto && (
        <AccionesCelda>
          <CopiarBtn value={texto} />
        </AccionesCelda>
      )}
    </div>
  );
}

/**
 * Campo Número: muestra el valor con su formato (1.234,5 · € · % · barra) y, al
 * enfocarlo, el número crudo para poder editarlo.
 */
function NumberCell({ field, value, onCommit }: { field: FieldLite; value: unknown; onCommit: (v: unknown) => void }) {
  const cfg = (field.config as { format?: string; max?: number } | null) ?? {};
  const raw = value == null ? "" : String(value);
  const n = Number(value);
  const max = Number(cfg.max) > 0 ? Number(cfg.max) : 100;
  const pct = Math.max(0, Math.min(1, n / max));

  return (
    <div className={cfg.format === "ring" ? "flex w-full items-center" : "w-full"}>
      {/* Anillo de progreso junto al número, como en Notion. */}
      {cfg.format === "ring" && Number.isFinite(n) && <Anillo pct={pct} />}
      <input
        type="text"
        inputMode="decimal"
        key={raw}
        defaultValue={formatNumber(value, field)}
        onFocus={(e) => (e.target.value = raw)}
        onBlur={(e) => {
          const text = e.target.value.trim().replace(/[€%$£\s.]/g, "").replace(",", ".");
          const next = text === "" ? null : Number(text);
          e.target.value = formatNumber(next, field);
          onCommit(next === null || Number.isNaN(next) ? null : next);
        }}
        className="w-full min-w-0 flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
      />
      {cfg.format === "bar" && Number.isFinite(n) && (
        <div className="mx-1 mb-0.5 h-1 rounded-full bg-[var(--border)]">
          <div
            className="h-1 rounded-full bg-brand"
            style={{ width: `${pct * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

/** Anillo de progreso del formato de número (pct entre 0 y 1). */
function Anillo({ pct }: { pct: number }) {
  const C = 2 * Math.PI * 5.5;
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" className="ml-1 shrink-0">
      <circle cx="7" cy="7" r="5.5" fill="none" stroke="var(--border)" strokeWidth="2.5" />
      <circle
        cx="7" cy="7" r="5.5" fill="none"
        stroke="var(--color-brand,#ff5c28)" strokeWidth="2.5" strokeLinecap="round"
        strokeDasharray={`${C * pct} ${C}`} transform="rotate(-90 7 7)"
      />
    </svg>
  );
}

export const COLOR_NAMES = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red", "default"];
export const COLOR_LABELS: Record<string, string> = {
  gray: "Gris",
  brown: "Marrón",
  orange: "Naranja",
  yellow: "Amarillo",
  green: "Verde",
  blue: "Azul",
  purple: "Morado",
  pink: "Rosa",
  red: "Rojo",
  default: "Claro",
};

function TagCell({ field, value, onCommit }: { field: FieldLite; value: unknown; onCommit: (v: unknown) => void }) {
  const utils = trpc.useUtils();
  const updateField = trpc.db.updateField.useMutation({ onSuccess: () => utils.db.get.invalidate() });
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  // Opción cuyo editor está abierto (nombre, color, grupo si es Estado, borrar).
  const [editingOpt, setEditingOpt] = useState<string | null>(null);
  const [dragOpt, setDragOpt] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const multi = field.type === "multiselect";
  const isStatus = field.type === "status";
  const opts = optionsOf(field);
  const selected: string[] = multi
    ? (Array.isArray(value) ? (value as string[]) : [])
    : value
      ? [String(value)]
      : [];

  // El cierre por clic fuera lo gestiona el Popover: su panel vive en un portal
  // (document.body), así que un `contains` contra el div de la celda diría que
  // TODO clic dentro del menú es "fuera" y lo cerraría antes de poder elegir.
  const cerrar = () => {
    setOpen(false);
    setQ("");
    setEditingOpt(null);
  };

  const commit = (ids: string[]) => onCommit(multi ? ids : (ids[0] ?? null));

  const toggle = (id: string) => {
    if (multi) commit(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
    else {
      commit(selected.includes(id) ? [] : [id]);
      cerrar();
    }
  };

  const saveOpts = (next: Option[]) => {
    const cfg = (field.config as { options?: Option[] }) ?? {};
    updateField.mutate({ id: field.id, config: { ...cfg, options: next } });
  };

  const setGroup = (optionId: string, group: string) =>
    saveOpts(opts.map((o) => (o.id === optionId ? { ...o, group } : o)));

  const renameOpt = (optionId: string, label: string) => {
    const l = label.trim();
    if (l) saveOpts(opts.map((o) => (o.id === optionId ? { ...o, label: l } : o)));
  };

  const colorOpt = (optionId: string, color: string) =>
    saveOpts(opts.map((o) => (o.id === optionId ? { ...o, color } : o)));

  const deleteOpt = async (o: Option) => {
    if (!(await confirmar(`¿Borrar la opción «${o.label}»? Desaparecerá de todas las filas que la usen.`))) return;
    saveOpts(opts.filter((x) => x.id !== o.id));
    if (selected.includes(o.id)) commit(selected.filter((x) => x !== o.id));
    setEditingOpt(null);
  };

  // Soltar una opción sobre otra la coloca delante; en Estado además adopta su grupo
  // (el orden visual manda: si cae en «Hecho», es de «Hecho»).
  const dropOpt = (targetId: string) => {
    if (!dragOpt || dragOpt === targetId) return;
    const src = opts.find((o) => o.id === dragOpt);
    const target = opts.find((o) => o.id === targetId);
    if (!src || !target) return;
    const rest = opts.filter((o) => o.id !== dragOpt);
    const moved = isStatus ? { ...src, group: target.group ?? "todo" } : src;
    rest.splice(rest.findIndex((o) => o.id === targetId), 0, moved);
    saveOpts(rest);
    setDragOpt(null);
  };

  const addOption = () => {
    const label = q.trim();
    if (!label) return;
    const existing = opts.find((o) => o.label.toLowerCase() === label.toLowerCase());
    if (existing) {
      toggle(existing.id);
      setQ("");
      return;
    }
    const id = "opt_" + Math.random().toString(36).slice(2, 9);
    const color = COLOR_NAMES[opts.length % COLOR_NAMES.length];
    const cfg = (field.config as { options?: Option[] }) ?? {};
    const option: Option = isStatus ? { id, label, color, group: "todo" } : { id, label, color };
    updateField.mutate({ id: field.id, config: { ...cfg, options: [...opts, option] } });
    commit(multi ? [...selected, id] : [id]);
    setQ("");
    if (!multi) cerrar();
  };

  const pill = (o: Option) => (
    <span key={o.id} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs" style={{ background: OPTION_COLORS[o.color ?? "gray"], color: "var(--tag-fg)" }}>
      {o.label}
      {multi && (
        <button onClick={(e) => { e.stopPropagation(); toggle(o.id); }} className="opacity-60 hover:opacity-100">
          <X size={12} />
        </button>
      )}
    </span>
  );

  const shown = q ? opts.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : opts;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-[26px] w-full flex-wrap items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-[var(--border)]/30"
      >
        {selected.length ? (
          selected.map((id) => {
            const o = opts.find((x) => x.id === id);
            return o ? pill(o) : null;
          })
        ) : (
          <span className="text-sm text-[var(--muted)]">—</span>
        )}
      </button>
      {open && (
        <Popover onClose={cerrar} className="left-0 w-56 p-2" anchorRef={ref}>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addOption()}
            placeholder="Buscar o crear…"
            className="mb-2 w-full rounded border border-[var(--border)] bg-transparent px-2 py-1 text-sm outline-none focus:border-brand"
          />
          <div className="max-h-56 space-y-0.5 overflow-y-auto">
            {/* El campo Estado separa sus opciones en Por hacer / En curso / Hecho, como Notion. */}
            {(isStatus ? STATUS_GROUPS : [["", ""] as [string, string]]).map(([group, groupLabel]) => {
              const inGroup = isStatus ? shown.filter((o) => (o.group ?? "todo") === group) : shown;
              if (isStatus && !inGroup.length) return null;
              return (
                <div key={group}>
                  {isStatus && (
                    <div className="px-1 pb-0.5 pt-1 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
                      {groupLabel}
                    </div>
                  )}
                  {inGroup.map((o) => (
                    <div key={o.id}>
                      <div
                        className="group/opt flex items-center gap-1 rounded hover:bg-[var(--hover)]"
                        draggable={!q}
                        onDragStart={() => setDragOpt(o.id)}
                        onDragEnd={() => setDragOpt(null)}
                        onDragOver={(e) => dragOpt && e.preventDefault()}
                        onDrop={(e) => { e.preventDefault(); dropOpt(o.id); }}
                      >
                        <button onClick={() => toggle(o.id)} className="flex min-w-0 flex-1 items-center gap-2 px-1 py-1 text-left text-sm">
                          <span className="truncate rounded px-1.5 py-0.5 text-xs" style={{ background: OPTION_COLORS[o.color ?? "gray"], color: "var(--tag-fg)" }}>
                            {o.label}
                          </span>
                          {selected.includes(o.id) && <span className="ml-auto text-brand"><Check size={14} /></span>}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingOpt(editingOpt === o.id ? null : o.id); }}
                          className={`toque-estrecho shrink-0 rounded p-1 hover:bg-[var(--border)]/40 hover:text-[var(--foreground)] ${editingOpt === o.id ? "text-[var(--foreground)]" : "al-pasar text-[var(--muted)]"}`}
                          title="Editar la opción"
                        >
                          <MoreHorizontal size={13} />
                        </button>
                      </div>
                      {editingOpt === o.id && (
                        <div className="mb-1 ml-2 space-y-1.5 rounded border border-[var(--border)] p-1.5">
                          <input
                            defaultValue={o.label}
                            autoFocus
                            onBlur={(e) => renameOpt(o.id, e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                            className="w-full rounded border border-[var(--border)] bg-transparent px-2 py-0.5 text-sm outline-none focus:border-brand"
                          />
                          <div className="flex flex-wrap gap-1">
                            {COLOR_NAMES.map((c) => (
                              <button
                                key={c}
                                onClick={() => colorOpt(o.id, c)}
                                className="toque-estrecho flex size-[18px] items-center justify-center rounded-full border border-[var(--border)]"
                                style={{ background: OPTION_COLORS[c] }}
                                title={COLOR_LABELS[c]}
                              >
                                {(o.color ?? "gray") === c && <Check size={12} style={{ color: "var(--tag-fg)" }} />}
                              </button>
                            ))}
                          </div>
                          {isStatus && (
                            <div className="flex flex-wrap items-center gap-1">
                              <span className="text-[10px] uppercase tracking-wide text-[var(--muted)]">Grupo</span>
                              {STATUS_GROUPS.map(([g, l]) => (
                                <button
                                  key={g}
                                  onClick={() => setGroup(o.id, g)}
                                  className={`rounded px-1.5 py-0.5 text-xs ${
                                    (o.group ?? "todo") === g
                                      ? "bg-brand text-white"
                                      : "border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--hover)]"
                                  }`}
                                >
                                  {l}
                                </button>
                              ))}
                            </div>
                          )}
                          <button onClick={() => deleteOpt(o)} className="flex items-center gap-1 text-xs text-red-500 hover:underline">
                            <Trash2 size={12} /> Borrar opción
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
            {q && !opts.some((o) => o.label.toLowerCase() === q.toLowerCase()) && (
              <button onClick={addOption} className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-sm text-brand hover:bg-[var(--hover)]">
                + Crear «{q}»
              </button>
            )}
            {shown.length === 0 && !q && <p className="px-1 py-1 text-xs text-[var(--muted)]">Sin opciones. Escribe para crear.</p>}
          </div>
        </Popover>
      )}
    </div>
  );
}

/** Acción de un campo Botón: al pulsarlo, pone `value` en el campo `fieldId` de la fila. */
export type AccionBoton = { fieldId: string; value: unknown };

function ButtonCell({ field, recordId }: { field: FieldLite; recordId?: string }) {
  const utils = trpc.useUtils();
  const updateCell = trpc.db.updateCell.useMutation({ onSuccess: () => utils.db.get.invalidate() });
  const [hecho, setHecho] = useState(false);
  const cfg = (field.config as { label?: string; acciones?: AccionBoton[] } | null) ?? {};
  const acciones = cfg.acciones ?? [];

  const ejecutar = () => {
    if (!recordId || !acciones.length) return;
    const hoy = new Date();
    const hoyYmd = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
    for (const a of acciones) {
      // "@hoy" se resuelve al pulsar, no al configurar: el botón siempre pone la fecha del día.
      updateCell.mutate({ recordId, fieldId: a.fieldId, value: a.value === "@hoy" ? hoyYmd : a.value });
    }
    setHecho(true);
    setTimeout(() => setHecho(false), 1000);
  };

  return (
    <button
      onClick={ejecutar}
      disabled={!recordId || !acciones.length}
      title={acciones.length ? "" : "Configura sus acciones en el menú de la columna"}
      className="rounded border border-brand/60 px-2 py-0.5 text-xs font-medium text-brand hover:bg-brand/10 disabled:opacity-40"
    >
      {hecho ? <Check size={12} className="inline" /> : cfg.label || "Hacer"}
    </button>
  );
}

/** Iniciales para el avatar: "Jose Monreal" -> "JM"; "jose@x.com" -> "J". */
export function initialsOf(name: string): string {
  const parts = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?").toUpperCase() + (parts[1]?.[0] ?? "").toUpperCase();
}

export function Avatar({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand-50 text-[10px] font-semibold text-brand"
      style={{ width: size, height: size }}
      title={name}
    >
      {initialsOf(name)}
    </span>
  );
}

/** Campo "Persona": varios miembros del espacio, como en Notion. Valor = userId[]. */
function PersonCell({ value, onCommit }: { value: unknown; onCommit: (v: unknown) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const { data } = trpc.workspace.members.useQuery(undefined, { enabled: open });
  const selected: string[] = Array.isArray(value) ? (value as string[]) : value ? [String(value)] : [];

  // El clic fuera lo gestiona el Popover (su panel vive en un portal, ver TagCell).
  const cerrar = () => {
    setOpen(false);
    setQ("");
  };

  const members = data?.members ?? [];
  const nameOf = (userId: string) => {
    const m = members.find((x) => x.userId === userId);
    return m ? m.name || m.email : userId;
  };
  const toggle = (userId: string) =>
    onCommit(selected.includes(userId) ? selected.filter((x) => x !== userId) : [...selected, userId]);
  const shown = q
    ? members.filter((m) => (m.name || m.email).toLowerCase().includes(q.toLowerCase()))
    : members;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-[26px] w-full flex-wrap items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-[var(--border)]/30"
      >
        {selected.length ? (
          selected.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-[var(--border)]/40 py-0.5 pl-0.5 pr-2 text-xs">
              <Avatar name={nameOf(id)} />
              {nameOf(id)}
            </span>
          ))
        ) : (
          <span className="text-sm text-[var(--muted)]">—</span>
        )}
      </button>
      {open && (
        <Popover onClose={cerrar} className="left-0 w-60 p-2" anchorRef={ref}>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar persona…"
            className="mb-2 w-full rounded border border-[var(--border)] bg-transparent px-2 py-1 text-sm outline-none focus:border-brand"
          />
          <div className="max-h-48 space-y-0.5 overflow-y-auto">
            {shown.map((m) => (
              <button
                key={m.userId}
                onClick={() => toggle(m.userId)}
                className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-sm hover:bg-[var(--hover)]"
              >
                <Avatar name={m.name || m.email} />
                <span className="min-w-0 flex-1 truncate">{m.name || m.email}</span>
                {selected.includes(m.userId) && <span className="text-brand"><Check size={14} /></span>}
              </button>
            ))}
            {!shown.length && <p className="px-1 py-1 text-xs text-[var(--muted)]">Sin miembros que coincidan.</p>}
          </div>
        </Popover>
      )}
    </div>
  );
}

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB (mismo límite que /api/upload)

/** Campo "Archivos y multimedia": adjuntos subidos a /api/upload. Valor = Attachment[]. */
function FilesCell({ value, onCommit }: { value: unknown; onCommit: (v: unknown) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Adjunto cuyo nombre se está editando (lápiz → input inline).
  const [renombrando, setRenombrando] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const files: Attachment[] = Array.isArray(value) ? (value as Attachment[]) : [];

  const upload = async (picked: FileList | null) => {
    if (!picked?.length) return;
    setError(null);
    setBusy(true);
    const added: Attachment[] = [];
    try {
      for (const file of Array.from(picked)) {
        if (file.size > MAX_UPLOAD_BYTES) {
          setError(`«${file.name}» supera los 8 MB.`);
          continue;
        }
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) {
          setError(data?.error ?? "No se pudo subir el archivo.");
          continue;
        }
        added.push({ id: data.id, url: data.url, name: data.name ?? file.name, mime: data.mime ?? file.type });
      }
      if (added.length) onCommit([...files, ...added]);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  // Quitar solo desengancha el adjunto de la celda: el Asset puede quedar huérfano, como las portadas.
  const remove = (id: string) => onCommit(files.filter((f) => f.id !== id));

  // Renombrar solo cambia el nombre visible en la celda (el Asset guarda el original).
  const rename = (id: string, name: string) => {
    setRenombrando(null);
    const n = name.trim();
    if (n) onCommit(files.map((f) => (f.id === id ? { ...f, name: n } : f)));
  };

  return (
    <div className="flex min-h-[26px] w-full flex-wrap items-center gap-1 px-1 py-0.5">
      {files.map((f) => (
        <span key={f.id} className="inline-flex max-w-[12rem] items-center gap-1 rounded bg-[var(--border)]/40 px-1.5 py-0.5 text-xs">
          {f.mime?.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={f.url} alt="" className="size-4 shrink-0 rounded object-cover" />
          ) : (
            <Paperclip size={12} className="shrink-0" />
          )}
          {renombrando === f.id ? (
            <input
              defaultValue={f.name ?? ""}
              autoFocus
              onBlur={(e) => rename(f.id, e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              className="w-28 bg-transparent text-xs outline-none"
            />
          ) : (
            <a href={f.url} target="_blank" rel="noreferrer" className="truncate hover:underline" title={f.name ?? "archivo"}>
              {f.name || "archivo"}
            </a>
          )}
          <button onClick={() => setRenombrando(f.id)} className="shrink-0 opacity-60 hover:opacity-100" title="Renombrar">
            <Pencil size={11} />
          </button>
          <button onClick={() => remove(f.id)} className="shrink-0 opacity-60 hover:opacity-100" title="Quitar">
            <X size={12} />
          </button>
        </span>
      ))}
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="rounded px-1 text-xs text-[var(--muted)] hover:bg-[var(--hover)] disabled:opacity-60"
      >
        {busy ? "Subiendo…" : files.length ? "+" : "+ Adjuntar"}
      </button>
      <input ref={inputRef} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
      {error && <span className="w-full text-[11px] text-red-600">{error}</span>}
    </div>
  );
}

/** Campo "Creado por" / "Editado por": solo lectura, resuelto contra los miembros del espacio. */
function AuthorCell({ userId }: { userId?: string | null }) {
  const people = usePeople();
  const name = userId ? (people.get(userId) ?? "Desconocido") : null;
  return (
    <span className="flex items-center gap-1 px-1 py-0.5 text-sm text-[var(--muted)]">
      {name ? (
        <>
          <Avatar name={name} />
          {name}
        </>
      ) : (
        "—"
      )}
    </span>
  );
}

/**
 * Campo Fecha. Según su configuración: día suelto, con hora (`time`) o rango
 * (`range`, que guarda { start, end } en vez de una cadena).
 */
function DateCell({ field, value, onCommit }: { field: FieldLite; value: unknown; onCommit: (v: unknown) => void }) {
  const cfg = (field.config as { time?: boolean; range?: boolean } | null) ?? {};
  const d = dateValue(value);
  const [editando, setEditando] = useState(false);
  const type = cfg.time ? "datetime-local" : "date";
  // Sin hora, el input date no admite la parte "T…": se recorta.
  const cut = (iso?: string) => (iso ? (cfg.time ? iso.slice(0, 16) : iso.slice(0, 10)) : "");

  const commit = (start: string, end: string) => {
    if (!start) return onCommit(null);
    if (!cfg.range) return onCommit(start);
    onCommit(end ? { start, end } : { start });
  };

  // Con valor se pinta el texto según el formato del campo (24 ago 2026,
  // 24/08/2026 o «hoy») y el clic pasa a los inputs; vacía, el input directo.
  if (d && !editando) {
    return (
      <button
        onClick={() => setEditando(true)}
        className="block w-full px-1 py-0.5 text-left text-sm"
        title="Pulsa para editar"
      >
        {formatDate(value, field)}
      </button>
    );
  }

  return (
    <div
      className="flex w-full items-center gap-1"
      // Volver al texto cuando el foco sale del grupo entero (no entre inputs del rango).
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setEditando(false);
      }}
    >
      <input
        type={type}
        autoFocus={editando}
        value={cut(d?.start)}
        onChange={(e) => commit(e.target.value, cut(d?.end))}
        className="min-w-0 flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
      />
      {cfg.range && (
        <>
          <span className="shrink-0 text-xs text-[var(--muted)]">→</span>
          <input
            type={type}
            value={cut(d?.end)}
            onChange={(e) => commit(cut(d?.start), e.target.value)}
            className="min-w-0 flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
          />
        </>
      )}
    </div>
  );
}
