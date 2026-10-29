"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bell, Camera, Check, CircleCheck, FilePlus, ListTodo, Loader2, Plus } from "lucide-react";
import { trpc } from "@/trpc/react";
import { toast } from "@/components/Toast";
import { cuandoEvento } from "@/lib/recordatorios";
import { fechaTarea } from "@/lib/cellText";
import type { ConfigInicio } from "@/lib/inicio";

const boton =
  "toque flex flex-1 flex-col items-center gap-1.5 rounded-lg border border-[var(--border)] px-2 py-3 text-sm hover:bg-[var(--hover)] disabled:opacity-60";

/** Crear una página (opcionalmente con contenido) y abrirla. */
function useNuevaPagina() {
  const router = useRouter();
  const crear = trpc.pages.create.useMutation();
  const contenido = trpc.pages.updateContent.useMutation();
  const utils = trpc.useUtils();
  return async (titulo: string, bloques?: unknown[]) => {
    const p = await crear.mutateAsync({ title: titulo });
    if (bloques) await contenido.mutateAsync({ id: p.id, content: bloques });
    utils.pages.tree.invalidate();
    router.push(`/p/${p.id}`);
  };
}

/** Acciones rápidas: los botones del widget de la app (Página, Lista de casillas, Tarea, Foto). */
export function AccionesRapidas({ config, guardar }: { config: ConfigInicio; guardar: (c: ConfigInicio) => void }) {
  const nueva = useNuevaPagina();
  const [ocupado, setOcupado] = useState(false);
  const [tarea, setTarea] = useState(false);
  const foto = useRef<HTMLInputElement>(null);
  const haz = (f: () => Promise<void>) => async () => {
    setOcupado(true);
    try {
      await f();
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo");
    } finally {
      setOcupado(false);
    }
  };
  async function subeFoto(f: File) {
    const fd = new FormData();
    fd.append("file", f);
    const r = (await (await fetch("/api/upload?kind=image", { method: "POST", body: fd })).json()) as { url?: string; name?: string; error?: string };
    if (!r.url) throw new Error(r.error ?? "No se pudo subir la foto");
    const hoy = new Date().toLocaleDateString("es-ES", { day: "numeric", month: "short" });
    await nueva(`Foto ${hoy}`, [{ type: "image", props: { url: r.url, name: r.name ?? f.name } }]);
  }
  return (
    <div>
      <div className="flex gap-2">
        <button disabled={ocupado} onClick={haz(() => nueva(""))} className={boton}>
          <FilePlus size={20} strokeWidth={1.75} /> Página
        </button>
        <button disabled={ocupado} onClick={haz(() => nueva("", [{ type: "checkListItem", content: [] }]))} className={boton}>
          <ListTodo size={20} strokeWidth={1.75} /> Lista
        </button>
        <button disabled={ocupado} onClick={() => setTarea((t) => !t)} className={`${boton} ${tarea ? "border-brand text-brand" : ""}`}>
          <CircleCheck size={20} strokeWidth={1.75} /> Tarea
        </button>
        <button disabled={ocupado} onClick={() => foto.current?.click()} className={boton}>
          <Camera size={20} strokeWidth={1.75} /> Foto
        </button>
        <input
          ref={foto}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) haz(() => subeFoto(f))();
          }}
        />
      </div>
      {tarea && (
        <div className="mt-2">
          <TareaRapida config={config} guardar={guardar} onHecha={() => setTarea(false)} />
        </div>
      )}
    </div>
  );
}

/** ¿Dónde van mis tareas? Se elige una vez (Inicio y Mis tareas). */
export function ElegirBdTareas({ config, guardar }: { config: ConfigInicio; guardar: (c: ConfigInicio) => void }) {
  const { data: bds } = trpc.db.listDatabases.useQuery();
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-[var(--muted)]">Las tareas van a</span>
      <select
        value={config.tareas ?? ""}
        onChange={(e) => guardar({ ...config, tareas: e.target.value || null })}
        className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1"
      >
        <option value="">Elige una base de datos…</option>
        {(bds ?? []).map((b) => (
          <option key={b.pageId} value={b.pageId}>
            {b.title || "Sin título"}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Añadir rápido: título y fecha opcional, en la BD de tareas elegida (asignada a mí). */
export function TareaRapida({ config, guardar, onHecha }: { config: ConfigInicio; guardar: (c: ConfigInicio) => void; onHecha?: () => void }) {
  const utils = trpc.useUtils();
  const [titulo, setTitulo] = useState("");
  const [fecha, setFecha] = useState("");
  const crear = trpc.inicio.nuevaTarea.useMutation({
    onSuccess: () => {
      setTitulo("");
      setFecha("");
      utils.db.myTasks.invalidate();
      toast("Tarea añadida");
      onHecha?.();
    },
    onError: (e) => toast(e.message),
  });
  if (!config.tareas) return <ElegirBdTareas config={config} guardar={guardar} />;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (titulo.trim()) crear.mutate({ titulo: titulo.trim(), fecha: fecha || null });
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        placeholder="Nueva tarea…"
        aria-label="Título de la tarea"
        autoFocus
        className="min-w-0 flex-1 basis-full rounded-md border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm outline-none focus:border-[var(--muted)] sm:basis-auto"
      />
      <input
        type="date"
        value={fecha}
        onChange={(e) => setFecha(e.target.value)}
        aria-label="Fecha (opcional)"
        className="rounded-md border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm"
      />
      <button
        disabled={!titulo.trim() || crear.isPending}
        className="flex items-center gap-1 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
      >
        <Plus size={15} /> Añadir
      </button>
    </form>
  );
}

/** Bloc de notas rápido: se guarda solo y «Convertir en página» lo pasa a una página nueva. */
export function BlocNotas({ inicial }: { inicial: string }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [texto, setTexto] = useState(inicial);
  const [estado, setEstado] = useState<"" | "guardando" | "guardado">("");
  const guardar = trpc.inicio.guardarBloc.useMutation({ onSuccess: () => setEstado("guardado"), onError: () => setEstado("") });
  const convertir = trpc.inicio.blocAPagina.useMutation({
    onSuccess: (p) => {
      setTexto("");
      utils.inicio.get.invalidate();
      utils.pages.tree.invalidate();
      router.push(`/p/${p.id}`);
    },
    onError: (e) => toast(e.message),
  });
  const ultimo = useRef(inicial);
  useEffect(() => {
    if (texto === ultimo.current) return;
    const t = setTimeout(() => {
      ultimo.current = texto;
      setEstado("guardando");
      guardar.mutate({ texto });
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);
  return (
    <div>
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={5}
        placeholder="Apunta algo rápido… (- [ ] para casillas)"
        aria-label="Bloc de notas rápido"
        className="w-full resize-y rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--muted)]"
      />
      <div className="mt-1 flex items-center justify-between">
        <span className="text-xs text-[var(--muted)]">{estado === "guardando" ? "Guardando…" : estado === "guardado" ? "Guardado" : ""}</span>
        <button
          disabled={!texto.trim() || convertir.isPending || estado === "guardando"}
          onClick={() => {
            // Lo último escrito, guardado antes de convertir.
            guardar.mutateAsync({ texto }).then(() => convertir.mutate());
          }}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)] disabled:opacity-50"
        >
          {convertir.isPending ? <Loader2 size={14} className="animate-spin" /> : <FilePlus size={14} />} Convertir en página
        </button>
      </div>
    </div>
  );
}

type BloqueN = { id: string; type: string; props?: Record<string, unknown>; content?: unknown; children?: BloqueN[] };
type InlineN = { type?: string; text?: string; content?: InlineN[]; props?: Record<string, unknown> };

const textoDe = (c: unknown): string =>
  Array.isArray(c)
    ? (c as InlineN[])
        .map((n) =>
          n.type === "link" ? textoDe(n.content)
          : n.type === "mention" ? String(n.props?.title || "Página")
          : n.type === "personMention" ? `@${n.props?.name ?? ""}`
          : n.type === "dateMention" ? fechaTarea(String(n.props?.fecha ?? ""))
          : n.text ?? "",
        )
        .join("")
    : "";

/** Elegir la página de «Nota fijada» (en Personalizar). */
export function ElegirNota({ config, guardar }: { config: ConfigInicio; guardar: (c: ConfigInicio) => void }) {
  const { data: tree } = trpc.pages.tree.useQuery();
  return (
    <label className="mb-2 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-[var(--muted)]">Página</span>
      <select
        value={config.nota ?? ""}
        onChange={(e) => guardar({ ...config, nota: e.target.value || null })}
        className="max-w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1"
      >
        <option value="">Elige una página…</option>
        {(tree ?? [])
          .filter((p) => p.type !== "database")
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.title || "Sin título"}
            </option>
          ))}
      </select>
    </label>
  );
}

/**
 * Nota fijada: el contenido de una página en el Inicio, con sus casillas marcables ahí
 * mismo (por operación de bloque, como la app: llega en vivo a quien la tenga abierta).
 */
export function NotaFijada({ pageId, titulo }: { pageId: string; titulo: string }) {
  const q = trpc.app.bloques.useQuery({ id: pageId }, { staleTime: 0 });
  const aplicar = trpc.app.aplicar.useMutation();
  const [marcadas, setMarcadas] = useState<Record<string, boolean>>({});
  if (q.isError) return <p className="px-1 py-2 text-sm text-[var(--muted)]">Esta página ya no existe o no la ves.</p>;
  const bloques = (q.data?.bloques ?? []) as BloqueN[];
  let n = 0;
  const pinta = (lista: BloqueN[], nivel: number): React.ReactNode[] =>
    lista.flatMap((b) => {
      if (n++ > 60) return [];
      const t = textoDe(b.content);
      const sangria = { paddingLeft: nivel * 18 };
      let fila: React.ReactNode = null;
      if (b.type === "checkListItem") {
        const hecha = marcadas[b.id] ?? !!b.props?.checked;
        fila = (
          <label key={b.id} style={sangria} className="flex cursor-pointer items-start gap-2 py-0.5">
            <input
              type="checkbox"
              checked={hecha}
              onChange={() => {
                setMarcadas((m) => ({ ...m, [b.id]: !hecha }));
                aplicar.mutate(
                  { id: pageId, ops: [{ op: "upsert", block: { ...b, props: { ...b.props, checked: !hecha } } }] as never },
                  { onError: (e) => (toast(e.message), setMarcadas((m) => ({ ...m, [b.id]: hecha }))) },
                );
              }}
              className="mt-1 accent-[var(--color-brand)]"
            />
            <span className={hecha ? "text-[var(--muted)] line-through" : ""}>{t || " "}</span>
          </label>
        );
      } else if (b.type === "heading") fila = <div key={b.id} style={sangria} className="pt-1 font-semibold">{t}</div>;
      else if (b.type === "bulletListItem" || b.type === "numberedListItem") fila = <div key={b.id} style={sangria}>• {t}</div>;
      else if (t) fila = <div key={b.id} style={sangria}>{t}</div>;
      return [fila, ...pinta(b.children ?? [], nivel + 1)].filter(Boolean);
    });
  return (
    <div className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
      <Link href={`/p/${pageId}`} className="mb-1 block font-medium hover:underline">
        {titulo || "Sin título"}
      </Link>
      {q.isLoading ? <p className="text-[var(--muted)]">Cargando…</p> : bloques.length ? pinta(bloques, 0) : <p className="text-[var(--muted)]">Página vacía.</p>}
    </div>
  );
}

/** Recordatorios: mis próximos avisos pendientes (de este espacio). */
export function ListaRecordatorios({ lista }: { lista: { key: string; titulo: string; inicio: string; pageId: string; recordId: string | null }[] }) {
  return (
    <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
      {lista.slice(0, 8).map((r) => (
        <li key={r.key}>
          <Link href={`/p/${r.pageId}${r.recordId ? `?r=${r.recordId}` : ""}`} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-[var(--border)]/20">
            <Bell size={14} className="shrink-0 text-[var(--muted)]" />
            <span className="min-w-0 flex-1 truncate">{r.titulo || "Sin título"}</span>
            <span className="shrink-0 text-xs text-[var(--muted)]" title={fechaTarea(r.inicio)}>
              {cuandoEvento(r.inicio)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** El círculo de una tarea: marcarla hecha (o pendiente) tocándolo. */
export function CirculoTarea({
  hecha,
  marca,
  recordId,
  pageId,
}: {
  hecha: boolean;
  marca: { fieldId: string; si: unknown; no: unknown } | null;
  recordId: string;
  pageId: string;
}) {
  const utils = trpc.useUtils();
  const [ahora, setAhora] = useState<boolean | null>(null);
  const cambiar = trpc.db.updateCell.useMutation({
    onSettled: () => {
      utils.db.myTasks.invalidate();
      utils.db.get.invalidate({ pageId });
    },
    onError: (e) => (toast(e.message), setAhora(null)),
  });
  const v = ahora ?? hecha;
  if (!marca) return <span className="w-5 shrink-0" />;
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setAhora(!v);
        cambiar.mutate({ recordId, fieldId: marca.fieldId, value: v ? marca.no : marca.si });
      }}
      aria-label={v ? "Marcar pendiente" : "Marcar hecha"}
      aria-pressed={v}
      // La zona de toque (40 px en táctil) es el botón; el círculo se queda en 20 px.
      className="toque group -m-1 flex shrink-0 items-center justify-center p-1"
    >
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-full border ${v ? "border-brand bg-brand text-white" : "border-[var(--muted)] group-hover:border-brand"}`}
      >
        {v && <Check size={12} strokeWidth={3} />}
      </span>
    </button>
  );
}
