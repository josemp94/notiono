"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Maximize2, Search, X } from "lucide-react";
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
  const [activeViewId, setActiveViewId] = useState<string | null>(viewId ?? null);
  const [title, setTitle] = useState(initialTitle);
  const [icon, setIcon] = useState<string | null>(initialIcon ?? "🗃️");
  const [cover, setCover] = useState<string | null>(initialCover ?? null);
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [q, setQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const people = usePeople();
  // Para el valor especial "Yo" (me) de los filtros de persona.
  const { data: me } = trpc.auth.me.useQuery();

  const rename = trpc.pages.rename.useMutation({ onSuccess: () => utils.pages.tree.invalidate() });
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
      <div className={embedded ? "px-3 pb-3" : `px-3 pb-5 md:px-8 ${cover ? "" : "pt-5"}`}>
      {!embedded && (
      <div className="group/header mb-4">
        {canEdit && !cover && (
          <div className="h-7">
            <AddCoverButton onChange={onCoverChange} />
          </div>
        )}
        <div className={`mb-1 flex items-center gap-3 ${cover ? "relative z-10 -mt-10" : ""}`}>
          <PageIcon icon={icon} onChange={onIconChange} editable={canEdit} />
          <input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Sin título"
            readOnly={!canEdit}
            className="font-display w-full bg-transparent text-2xl font-extrabold outline-none placeholder:text-[var(--border)] md:text-3xl"
          />
        </div>
      </div>
      )}

      <div className="mb-4 flex flex-col items-stretch gap-1 border-b border-[var(--border)] md:flex-row md:items-end md:justify-between md:gap-2">
        <div className="sin-barra flex items-center gap-0.5 overflow-x-auto">
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
        {/* En el móvil, la barra baja a su propia línea: con los botones a tamaño de
            dedo, en una sola fila las pestañas se quedaban en «Tab». */}
        <div className="flex items-center justify-end gap-1 pb-1">
          {searchOpen ? (
            <div className="flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1">
              <Search size={13} className="shrink-0 text-[var(--muted)]" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && (setQ(""), setSearchOpen(false))}
                placeholder="Buscar en la base de datos…"
                className="w-44 bg-transparent text-xs outline-none"
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
        <FormView pageId={pageId} collectionId={col.id} fields={asAny(visibleFields)} view={active} />
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
