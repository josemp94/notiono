"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlignLeft, ArrowLeft, Check, ChevronDown, Maximize2, Search, X } from "lucide-react";
import { Popover } from "./Popover";
import { trpc } from "@/trpc/react";
import { VIEW_MENU_EVENT, type ViewMenuDetail } from "@/lib/shortcuts";

/** Abre el menú de la vista justo donde se ha pulsado. */
function abrirMenuVista(e: { preventDefault: () => void; clientX: number; clientY: number }) {
  e.preventDefault();
  const detail: ViewMenuDetail = { x: e.clientX, y: e.clientY };
  window.dispatchEvent(new CustomEvent(VIEW_MENU_EVENT, { detail }));
}
import { PageIcon } from "@/components/PageIcon";
import { AddCoverButton, CoverBand } from "@/components/PageCover";
import { TituloGrande } from "@/components/TituloGrande";
import { applyViewConfig, conComputados, openInOf, type DbField, type DbRecord } from "@/lib/viewData";
import { RecordCard } from "./RecordPanel";
import { usePeople } from "./Cell";
import { displayValue } from "@/lib/cellText";
import { AddViewButton, DbToolbar, FilterChips, ViewIcon } from "./DbToolbar";
import { useDbLive } from "./useDbLive";
import { TableView } from "./TableView";
import { KanbanView } from "./KanbanView";
import { ChartView } from "./ChartView";
import { CalendarView } from "./CalendarView";
import { GalleryView } from "./GalleryView";
import { ListView } from "./ListView";
import { TimelineView } from "./TimelineView";
import { FormView } from "./FormView";

export function Database({
  pageId,
  initialTitle,
  initialIcon,
  initialCover,
  canEdit = true,
  embedded = false,
  viewId,
  onViewChange,
}: {
  pageId: string;
  initialTitle: string;
  initialIcon?: string | null;
  initialCover?: string | null;
  canEdit?: boolean;
  /** BD embebida en el cuerpo de otra página: sin cabecera (título/icono/portada) y con padding compacto. */
  embedded?: boolean;
  /** Vista que debe mostrar el bloque embebido (una vista enlazada recuerda la suya). */
  viewId?: string;
  onViewChange?: (viewId: string) => void;
}) {
  const utils = trpc.useUtils();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: col, isLoading } = trpc.db.get.useQuery({ pageId });
  // Los cambios de otros aparecen al momento (señal por la sala Yjs de la página).
  useDbLive(pageId);
  // La vista activa: la del bloque embebido, o la del enlace ?v= («Copiar enlace
  // a la vista»), o la primera.
  const [activeViewId, setActiveViewId] = useState<string | null>(viewId ?? (embedded ? null : searchParams.get("v")));
  const [title, setTitle] = useState(initialTitle);
  // Si renombran la BD desde fuera (sidebar, otra persona), adoptar el nombre
  // nuevo — salvo mientras se edita aquí, que teclear encima lo pisaría.
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const [conDescripcion, setConDescripcion] = useState(false);

  useEffect(() => {
    if (document.activeElement !== titleRef.current) setTitle(initialTitle);
  }, [initialTitle]);
  const [icon, setIcon] = useState<string | null>(initialIcon ?? "🗃️");
  const [cover, setCover] = useState<string | null>(initialCover ?? null);
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [q, setQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const people = usePeople();
  // Para el valor especial "Yo" (me) de los filtros de persona.
  const { data: me } = trpc.auth.me.useQuery();

  const rename = trpc.pages.rename.useMutation({ onSuccess: () => utils.pages.tree.invalidate() });
  const setDescription = trpc.db.setCollectionDescription.useMutation({
    onSuccess: () => utils.db.get.invalidate({ pageId }),
  });
  const setCoverM = trpc.pages.setCover.useMutation();
  // Reordenar las pestañas de vista arrastrándolas: la primera es la vista por defecto.
  const moveView = trpc.db.moveView.useMutation({ onSuccess: () => utils.db.get.invalidate({ pageId }) });
  const [dragTab, setDragTab] = useState<string | null>(null);
  const [dropTab, setDropTab] = useState<{ id: string; pos: "before" | "after" } | null>(null);

  function persist(nextTitle: string, nextIcon: string | null) {
    rename.mutate({ id: pageId, title: nextTitle, icon: nextIcon });
  }
  function onTitleChange(v: string) {
    setTitle(v);
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(() => persist(v, icon), 600);
  }
  function onIconChange(next: string | null) {
    setIcon(next);
    persist(title, next);
  }
  function onCoverChange(next: string | null) {
    setCover(next);
    setCoverM.mutate({ id: pageId, cover: next });
  }

  const active = col?.views.find((v) => v.id === activeViewId) ?? col?.views[0];
  const fields = col?.fields ?? [];
  const rawRecords = col?.records ?? [];
  // Fórmulas y rollups calculados en el servidor, fundidos en las celdas para que
  // filtros, orden y reglas de color los vean con el mismo motor que lo demás.
  const { data: computedData } = trpc.db.computed.useQuery({ pageId });
  const viewRecords = useMemo(
    () =>
      applyViewConfig(
        conComputados(rawRecords as unknown as DbRecord[], computedData?.rollups),
        fields as unknown as DbField[],
        active?.config,
        me?.id,
      ),
    [rawRecords, fields, active, me?.id, computedData],
  );
  // Búsqueda interna (la lupa): sobre el texto visible de cada celda, después de filtros y orden.
  const shownRecords = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return viewRecords;
    return viewRecords.filter((r) =>
      (fields as unknown as DbField[]).some((f) =>
        displayValue(f, r.cells?.[f.id], people).toLowerCase().includes(needle),
      ),
    );
  }, [viewRecords, fields, q, people]);

  if (isLoading || !col) {
    return (
      <div className="px-4 py-6">
        <div className="flex gap-2">
          <div className="esqueleto h-6 w-24" />
          <div className="esqueleto h-6 w-16" />
        </div>
        <div className="mt-3 space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="esqueleto h-7 w-full" />
          ))}
        </div>
      </div>
    );
  }
  if (!active) {
    return <div className="px-4 py-6 text-[var(--muted)]">Esta base de datos no tiene vistas.</div>;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const asAny = (r: unknown) => r as any;
  const hiddenIds: string[] = asAny(active.config)?.hiddenFields ?? [];
  const visibleFields = fields.filter((f) => !hiddenIds.includes(asAny(f).id));

  // Cómo abre sus filas esta vista (lateral/centrado/página completa), como el
  // «Open pages in» de Notion. «Página completa» = esta misma página con ?r=.
  const openIn = openInOf(active.type, asAny(active.config));
  const openFull = (recId: string) => router.push(`/p/${pageId}?r=${recId}`);

  // Fila abierta como página completa (?r=<recordId>). Se busca en los registros
  // sin filtrar: un filtro de la vista no debe romper el enlace a la fila.
  const fullRec = !embedded ? rawRecords.find((r) => asAny(r).id === searchParams.get("r")) : undefined;
  if (fullRec) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8">
        <button
          onClick={() => router.replace(`/p/${pageId}`)}
          className="mb-4 flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          <ArrowLeft size={14} /> {title || "Sin título"}
        </button>
        <RecordCard
          pageId={pageId}
          collectionId={canEdit ? col.id : undefined}
          record={asAny(fullRec)}
          fields={asAny(fields)}
          onDeleted={() => router.replace(`/p/${pageId}`)}
        />
      </div>
    );
  }

  return (
    <div>
      {!embedded && cover && <CoverBand cover={cover} onChange={onCoverChange} editable={canEdit} />}
      <div className={embedded ? "px-3 pb-3" : `px-4 pb-5 md:px-12 ${cover ? "pt-3" : "pt-8 md:pt-16"}`}>
      {!embedded && (
      // La misma cabecera que una página: icono encima, «Añadir icono / portada»
      // al pasar, y el título grande. Antes iba el icono al lado, a otra escala.
      <div className="group/header mb-4">
        {icon && (
          <div className={`mb-1 ${cover ? "relative z-10 -mt-14" : ""}`}>
            <PageIcon icon={icon} onChange={onIconChange} editable={canEdit} />
          </div>
        )}
        {canEdit && (!icon || !cover || (col && !col.description && !conDescripcion)) && (
          <div className="mb-1 flex h-7 items-center gap-1">
            {!icon && <PageIcon icon={null} onChange={onIconChange} editable={canEdit} />}
            {!cover && <AddCoverButton onChange={onCoverChange} />}
            {col && !col.description && !conDescripcion && (
              <button
                onClick={() => setConDescripcion(true)}
                className="al-pasar flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
              >
                <AlignLeft size={16} /> Añadir descripción
              </button>
            )}
          </div>
        )}
        <TituloGrande
          inputRef={titleRef}
          value={title}
          onChange={onTitleChange}
          readOnly={!canEdit}
          className="mb-1 text-[2rem] md:text-[2.5rem]"
        />
        {/* Descripción bajo el título, como en Notion: si no hay, no ocupa sitio
            hasta que se pide con «Añadir descripción». */}
        {col && (canEdit ? (
          (col.description || conDescripcion) && (
          <textarea
            autoFocus={conDescripcion && !col.description}
            key={col.description}
            defaultValue={col.description}
            rows={1}
            placeholder="Añade una descripción…"
            onBlur={(e) => {
              if (!e.target.value.trim()) setConDescripcion(false);
              if (e.target.value.trim() !== col.description) {
                setDescription.mutate({ collectionId: col.id, description: e.target.value });
              }
            }}
            ref={(el) => {
              if (el) {
                el.style.height = "auto";
                el.style.height = `${el.scrollHeight}px`;
              }
            }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${el.scrollHeight}px`;
            }}
            className="w-full resize-none bg-transparent text-sm text-[var(--muted)] outline-none placeholder:text-[var(--border)]"
          />
          )
        ) : (
          col.description && <p className="text-sm text-[var(--muted)]">{col.description}</p>
        ))}
      </div>
      )}

      <div className="mb-3 flex items-center gap-1 border-b border-[var(--border)] md:items-end md:gap-2">
        {/* En el móvil las pestañas no caben: un selector con la vista actual, como
            en la app de Notion. */}
        {active && !searchOpen && (
          <SelectorVista
            views={col.views}
            active={active}
            onPick={(id) => {
              setActiveViewId(id);
              onViewChange?.(id);
            }}
            extra={canEdit && <AddViewButton pageId={pageId} collectionId={col.id} onViewCreated={(id) => setActiveViewId(id)} />}
          />
        )}
        <div className="sin-barra hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto md:flex">
          {col.views.map((v) => (
            <button
              key={v.id}
              // Pinchar la vista en la que ya estás abre sus opciones, como en
              // Notion; la primera vez solo cambia de vista. Y el clic derecho las
              // abre siempre. En los dos casos salen donde está el ratón.
              onClick={(e) => {
                const yaEstaba = active?.id === v.id;
                setActiveViewId(v.id);
                onViewChange?.(v.id);
                if (yaEstaba && canEdit) abrirMenuVista(e);
              }}
              onContextMenu={(e) => {
                if (!canEdit) return;
                setActiveViewId(v.id);
                onViewChange?.(v.id);
                abrirMenuVista(e);
              }}
              draggable={canEdit}
              onDragStart={(e) => {
                setDragTab(v.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={() => {
                setDragTab(null);
                setDropTab(null);
              }}
              onDragOver={(e) => {
                if (!dragTab || dragTab === v.id) return;
                e.preventDefault();
                const rect = e.currentTarget.getBoundingClientRect();
                setDropTab({ id: v.id, pos: e.clientX - rect.left < rect.width / 2 ? "before" : "after" });
              }}
              onDragLeave={() => setDropTab((d) => (d?.id === v.id ? null : d))}
              onDrop={(e) => {
                e.preventDefault();
                const target = dropTab;
                setDropTab(null);
                if (!dragTab || !target || dragTab === target.id) return;
                moveView.mutate(
                  target.pos === "before" ? { id: dragTab, beforeId: target.id } : { id: dragTab, afterId: target.id },
                );
                setDragTab(null);
              }}
              title={canEdit ? `${v.name} · púlsala otra vez para sus opciones · arrastra para reordenar` : v.name}
              className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 text-sm ${
                active?.id === v.id
                  ? "border-b-2 border-brand font-medium text-[var(--foreground)]"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              } ${
                dropTab?.id === v.id
                  ? dropTab.pos === "before"
                    ? "border-l-2 border-l-brand"
                    : "border-r-2 border-r-brand"
                  : ""
              }`}
            >
              <ViewIcon type={v.type} />
              {v.name}
            </button>
          ))}
          {canEdit && (
            <AddViewButton pageId={pageId} collectionId={col.id} onViewCreated={(id) => setActiveViewId(id)} />
          )}
          {embedded && (
            <a
              href={`/p/${pageId}`}
              className="toque flex items-center px-2 py-1.5 text-[var(--muted)] al-pasar hover:text-[var(--foreground)]"
              title="Abrir como página completa"
            >
              <Maximize2 size={14} />
            </a>
          )}
        </div>
        <div className={`flex items-center justify-end gap-0.5 pb-1 ${searchOpen ? "min-w-0 flex-1" : "ml-auto shrink-0"}`}>
          {searchOpen ? (
            <div className="flex min-w-0 flex-1 items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 md:flex-none">
              <Search size={13} className="shrink-0 text-[var(--muted)]" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && (setQ(""), setSearchOpen(false))}
                placeholder="Buscar en la base de datos…"
                className="min-w-0 flex-1 bg-transparent text-xs outline-none md:w-44 md:flex-none"
              />
              <button
                onClick={() => { setQ(""); setSearchOpen(false); }}
                className="shrink-0 text-[var(--muted)] hover:text-[var(--foreground)]"
                title="Cerrar búsqueda"
              >
                <X size={13} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setSearchOpen(true)}
              className="toque flex items-center justify-center rounded-md px-2 py-1.5 text-[var(--muted)] hover:bg-[var(--hover)]"
              title="Buscar en la base de datos"
            >
              <Search size={15} />
            </button>
          )}
        {canEdit && active && (
          <div>
            <DbToolbar
              pageId={pageId}
              collectionId={col.id}
              view={active}
              fields={fields}
              onViewCreated={(id) => setActiveViewId(id)}
              onViewDeleted={() => setActiveViewId(null)}
            />
          </div>
        )}
        </div>
      </div>

      {/* Chips de filtro estilo Notion, encima de la vista (edición rápida). */}
      {canEdit && (
        <FilterChips pageId={pageId} view={asAny(active)} fields={fields as unknown as DbField[]} />
      )}

      {active?.type === "kanban" ? (
        <KanbanView
          pageId={pageId}
          collectionId={col.id}
          fields={asAny(visibleFields)}
          records={asAny(shownRecords)}
          groupByFieldId={asAny(active.config)?.groupByFieldId}
          cardSize={asAny(active.config)?.cardSize}
          cardPreview={asAny(active.config)?.cardPreview}
          openIn={openIn}
          openFull={openFull}
          canReorder={!asAny(active.config)?.sorts?.length}
          sumFieldId={asAny(active.config)?.kanbanSum}
          view={active}
        />
      ) : active?.type === "chart" ? (
        <ChartView pageId={pageId} view={active} fields={fields} />
      ) : active?.type === "calendar" ? (
        <CalendarView
          pageId={pageId}
          collectionId={col.id}
          fields={asAny(visibleFields)}
          records={asAny(shownRecords)}
          view={active}
          openIn={openIn}
          openFull={openFull}
        />
      ) : active?.type === "timeline" ? (
        <TimelineView pageId={pageId} collectionId={col.id} fields={asAny(visibleFields)} records={asAny(shownRecords)} view={active} openIn={openIn} openFull={openFull} />
      ) : active?.type === "gallery" ? (
        <GalleryView
          pageId={pageId}
          collectionId={col.id}
          fields={asAny(visibleFields)}
          records={asAny(shownRecords)}
          cardSize={asAny(active.config)?.cardSize}
          cardPreview={asAny(active.config)?.cardPreview}
          colorFieldId={asAny(active.config)?.rowColorFieldId}
          groupByFieldId={asAny(active.config)?.groupByFieldId}
          colorRules={asAny(active.config)?.colorRules}
          imageFit={asAny(active.config)?.imageFit}
          openIn={openIn}
          openFull={openFull}
        />
      ) : active?.type === "list" ? (
        <ListView
          pageId={pageId}
          collectionId={col.id}
          fields={asAny(visibleFields)}
          records={asAny(shownRecords)}
          groupByFieldId={asAny(active.config)?.groupByFieldId}
          openIn={openIn}
          openFull={openFull}
        />
      ) : active?.type === "form" ? (
        // key: entre dos vistas Formulario de la misma BD React reutilizaría la
        // instancia (misma posición y tipo) y el borrador/estado de una se
        // colaría en la otra.
        <FormView key={active.id} pageId={pageId} collectionId={col.id} fields={asAny(visibleFields)} view={active} />
      ) : (
        <TableView
          pageId={pageId}
          collectionId={col.id}
          fields={asAny(visibleFields)}
          records={asAny(shownRecords)}
          view={active}
          templates={asAny(col).templates ?? []}
          openIn={openIn}
          openFull={openFull}
        />
      )}
      </div>
    </div>
  );
}

/** Selector de vista del móvil: la vista actual con su icono y, al tocarla, la lista. */
function SelectorVista({
  views,
  active,
  onPick,
  extra,
}: {
  views: { id: string; name: string; type: string }[];
  active: { id: string; name: string; type: string };
  onPick: (id: string) => void;
  extra?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative min-w-0 md:hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="toque flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium"
        aria-expanded={open}
      >
        <ViewIcon type={active.type} />
        <span className="truncate">{active.name}</span>
        <ChevronDown size={14} className="shrink-0 text-[var(--muted)]" />
      </button>
      {open && (
        <Popover onClose={() => setOpen(false)} className="w-64 p-1">
          {views.map((v) => (
            <button
              key={v.id}
              onClick={() => {
                onPick(v.id);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--hover)]"
            >
              <ViewIcon type={v.type} />
              <span className="min-w-0 flex-1 truncate">{v.name}</span>
              {v.id === active.id && <Check size={14} className="shrink-0 text-brand" />}
            </button>
          ))}
          {extra && <div className="mt-1 flex items-center border-t border-[var(--border)] pt-1 text-sm text-[var(--muted)]">{extra}<span>Añadir vista</span></div>}
        </Popover>
      )}
    </div>
  );
}
