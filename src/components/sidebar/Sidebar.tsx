"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BlockNoteEditor } from "@blocknote/core";
import { Check, ChevronDown, ChevronRight, ChevronsLeft, CircleCheck, Copy, Database, FileText, FolderInput, House, Inbox, Keyboard, Link2, Loader2, LogOut, Moon, MoreHorizontal, Plus, Search, Settings, Sparkles, SquarePen, Star, Sun, Trash2, Upload, Users, X } from "lucide-react";
import { trpc } from "@/trpc/react";
import { IconoPagina } from "@/components/PageIcon";
import { openShortcuts } from "@/components/Shortcuts";
import { NEW_PAGE_EVENT, TOGGLE_SIDEBAR_EVENT } from "@/lib/shortcuts";
import { parseCsv } from "@/lib/csv";
import { importNotionZip } from "@/lib/importNotion";
import { TEMPLATES } from "@/lib/templates";
import { setTheme, useTheme } from "@/lib/theme";
import { openSearchPalette } from "@/components/SearchPalette";
import { MovePageModal } from "@/components/MovePage";
import { abrirBandeja, useNoLeidas } from "@/components/Bandeja";

type Node = {
  id: string;
  title: string;
  icon: string | null;
  parentId: string | null;
  order: string;
  hasChildren: boolean;
};

// Id de la página que se está arrastrando (solo puede haber un drag a la vez).
let draggedId: string | null = null;

/** ¿Está `id` dentro del subárbol de `rootId`? (para no soltar una página en sí misma) */
function isInSubtree(id: string, rootId: string, parentById: Map<string, string | null>): boolean {
  let cur: string | null = id;
  while (cur) {
    if (cur === rootId) return true;
    cur = parentById.get(cur) ?? null;
  }
  return false;
}

export function Sidebar() {
  const utils = trpc.useUtils();
  const router = useRouter();
  const { data: me } = trpc.auth.me.useQuery();
  const { data: pages } = trpc.pages.tree.useQuery();
  const canEdit = me?.wsRole !== "viewer";
  const [showTemplates, setShowTemplates] = useState(false);
  const noLeidas = useNoLeidas();

  const create = trpc.pages.create.useMutation({
    onSuccess: async (page) => {
      await utils.pages.tree.invalidate();
      router.push(`/p/${page.id}`);
    },
  });
  // Atajo Ctrl/Cmd+Alt+N: reutiliza esta misma mutación en vez de duplicarla en el shell.
  const createMutate = create.mutate;
  useEffect(() => {
    if (!canEdit) return;
    const h = () => createMutate({ parentId: null });
    window.addEventListener(NEW_PAGE_EVENT, h);
    return () => window.removeEventListener(NEW_PAGE_EVENT, h);
  }, [canEdit, createMutate]);

  const createDb = trpc.db.create.useMutation({
    onSuccess: async (page) => {
      await utils.pages.tree.invalidate();
      router.push(`/p/${page.id}`);
    },
  });

  // Importar: un solo botón para .md (página) y .csv (base de datos), según extensión.
  const importInput = useRef<HTMLInputElement>(null);
  const createPage = trpc.pages.create.useMutation();
  const updateContent = trpc.pages.updateContent.useMutation();
  const importCsv = trpc.db.importCsv.useMutation();

  const [importando, setImportando] = useState<string | null>(null);

  // Ancho del panel, arrastrando el borde derecho (solo ratón); persiste en local.
  const [ancho, setAncho] = useState(256);
  useEffect(() => {
    const v = Number(localStorage.getItem("notiono.sidebar-width"));
    if (v >= 200 && v <= 480) setAncho(v);
  }, []);
  const empezarArrastre = (e: React.MouseEvent) => {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = ancho;
    const clamp = (n: number) => Math.min(480, Math.max(200, n));
    const move = (ev: MouseEvent) => setAncho(clamp(w0 + ev.clientX - x0));
    const up = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", move);
      localStorage.setItem("notiono.sidebar-width", String(clamp(w0 + ev.clientX - x0)));
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up, { once: true });
  };

  async function onImportFile(file: File) {
    // El ZIP de export de Notion va aparte: jerarquía entera, BDs y adjuntos.
    if (/\.zip$/i.test(file.name)) {
      setImportando("Importando…");
      try {
        const r = await importNotionZip(file, {
          createPage: (i) => createPage.mutateAsync(i),
          updateContent: (i) => updateContent.mutateAsync(i),
          importCsv: (i) => importCsv.mutateAsync(i),
          onProgress: setImportando,
        });
        await utils.pages.tree.invalidate();
        window.alert(
          `Importado de Notion: ${r.paginas} páginas y ${r.bases} bases de datos` +
            (r.adjuntos ? `, ${r.adjuntos} adjuntos` : "") +
            (r.omitidos ? ` (${r.omitidos} elementos omitidos)` : "") +
            ".",
        );
        if (r.rootId) router.push(`/p/${r.rootId}`);
      } catch (e) {
        window.alert(`No se pudo importar el ZIP: ${e instanceof Error ? e.message : e}`);
      } finally {
        setImportando(null);
      }
      return;
    }
    const text = await file.text();
    const title = file.name.replace(/\.[^.]+$/, "");
    try {
      let pageId: string;
      if (/\.csv$/i.test(file.name)) {
        const rows = parseCsv(text);
        if (rows.length === 0) {
          window.alert("El CSV está vacío.");
          return;
        }
        const page = await importCsv.mutateAsync({
          name: title || "Base de datos",
          headers: rows[0],
          rows: rows.slice(1),
        });
        pageId = page.id;
      } else {
        const blocks = BlockNoteEditor.create().tryParseMarkdownToBlocks(text);
        const page = await createPage.mutateAsync({ parentId: null, title });
        await updateContent.mutateAsync({ id: page.id, content: blocks });
        pageId = page.id;
      }
      await utils.pages.tree.invalidate();
      router.push(`/p/${pageId}`);
    } catch (e) {
      window.alert(`No se pudo importar el archivo: ${e instanceof Error ? e.message : e}`);
    }
  }

  const byParent = new Map<string | null, Node[]>();
  const parentById = new Map<string, string | null>();
  for (const p of pages ?? []) {
    const arr = byParent.get(p.parentId) ?? [];
    arr.push(p);
    byParent.set(p.parentId, arr);
    parentById.set(p.id, p.parentId);
  }

  const input = (
    <input
      ref={importInput}
      type="file"
      accept=".md,.markdown,.csv,.zip"
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = ""; // permite reimportar el mismo archivo
        if (f) onImportFile(f);
      }}
    />
  );

  return (
    <aside className="group/panel relative flex h-dvh flex-col border-r border-[var(--border)] bg-[var(--surface)]" style={{ width: ancho }}>
      {/* Tirador para redimensionar (de ratón, como el ancho de columna). */}
      <div
        onMouseDown={empezarArrastre}
        className="absolute inset-y-0 -right-0.5 z-10 w-1.5 cursor-ew-resize hover:bg-brand/40"
        title="Arrastra para cambiar el ancho"
      />
      {/* Arriba, como en Notion: el espacio (con su menú de cuenta) y, a su lado,
          plegar el panel y escribir una página nueva. */}
      <div className="zona-segura-arriba flex items-center gap-0.5 px-2 pb-1">
        <WorkspaceMenu me={me} />
        <button
          onClick={() => window.dispatchEvent(new Event(TOGGLE_SIDEBAR_EVENT))}
          className={`hidden opacity-0 group-hover/panel:opacity-100 focus-visible:opacity-100 md:flex ${accionPanel}`}
          data-pista="Plegar el panel"
          data-atajo="Ctrl+\"
          aria-label="Plegar el panel"
        >
          <ChevronsLeft size={18} />
        </button>
        {canEdit && (
          <button
            onClick={() => create.mutate({ parentId: null })}
            className={accionPanel}
            data-pista="Nueva página"
            data-atajo="Ctrl+Alt+N"
            data-pista-der=""
            aria-label="Nueva página"
          >
            <SquarePen size={16} />
          </button>
        )}
      </div>

      <nav className="zona-segura-abajo flex-1 overflow-y-auto px-2">
        <FilaPanel icono={<Search size={16} />} onClick={openSearchPalette}>
          Buscar
        </FilaPanel>
        <FilaPanel icono={<House size={16} />} href="/">
          Inicio
        </FilaPanel>
        <FilaPanel icono={<Inbox size={16} />} onClick={abrirBandeja} contador={noLeidas}>
          Bandeja de entrada
        </FilaPanel>
        <FilaPanel icono={<CircleCheck size={16} />} href="/my-tasks">
          Mis tareas
        </FilaPanel>

        <div className="mt-4">
          <Favorites />
          <Section
            title="Páginas"
            accion={
              canEdit && (
                <button
                  onClick={() => create.mutate({ parentId: null })}
                  className="al-pasar toque flex items-center justify-center rounded p-0.5 text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
                  aria-label="Nueva página"
                  title="Nueva página"
                >
                  <Plus size={14} />
                </button>
              )
            }
          >
            <Tree nodes={byParent.get(null) ?? []} byParent={byParent} parentById={parentById} depth={0} canEdit={canEdit} />
            {pages && pages.length === 0 && (
              <p className="px-2 py-1 text-xs text-[var(--muted)]">Aún no hay páginas.</p>
            )}
          </Section>
        </div>

        <div className="mb-2 mt-4">
          <FilaPanel icono={<Settings size={16} />} href="/settings">
            Ajustes
          </FilaPanel>
          {canEdit && (
            <>
              <FilaPanel icono={<Sparkles size={16} />} onClick={() => setShowTemplates(true)}>
                Plantillas
              </FilaPanel>
              <FilaPanel icono={<Database size={16} />} onClick={() => createDb.mutate({ parentId: null })}>
                Nueva base de datos
              </FilaPanel>
              <FilaPanel
                icono={importando ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                onClick={() => importInput.current?.click()}
                pista="Markdown (página), CSV (base de datos) o el ZIP que exporta Notion"
              >
                {importando ?? "Importar"}
              </FilaPanel>
              {input}
            </>
          )}
          <FilaPanel icono={<Trash2 size={16} />} href="/trash">
            Papelera
          </FilaPanel>
        </div>
      </nav>
      {showTemplates && <TemplatesGallery onClose={() => setShowTemplates(false)} />}
    </aside>
  );
}

/**
 * Una fila del panel con icono y nombre (Buscar, Inicio, Ajustes…), como las de
 * Notion. Antes eran seis iconos sueltos en fila que había que adivinar.
 */
function FilaPanel({
  icono,
  href,
  onClick,
  contador,
  pista,
  children,
}: {
  icono: React.ReactNode;
  href?: string;
  onClick?: () => void;
  contador?: number;
  pista?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const activo = href !== undefined && pathname === href;
  const clase = `toque-estrecho flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm font-medium ${
    activo ? "bg-[var(--active)] text-[var(--foreground)]" : "text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
  }`;
  const dentro = (
    <>
      <span className="flex w-5 shrink-0 justify-center">{icono}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {!!contador && (
        <span className="shrink-0 rounded-full bg-brand px-1.5 text-[11px] font-semibold leading-4 text-white">
          {contador > 99 ? "99+" : contador}
        </span>
      )}
    </>
  );
  return href ? (
    <Link href={href} className={clase} aria-current={activo ? "page" : undefined}>
      {dentro}
    </Link>
  ) : (
    <button onClick={onClick} className={clase} title={pista}>
      {dentro}
    </button>
  );
}

/** Sección plegable del panel (Favoritos / Páginas): se pliega pinchando el título, como en Notion. */
function Section({ title, accion, children }: { title: string; accion?: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="group mb-3">
      <div className="flex items-center pr-1">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-2 py-1 text-left text-xs font-medium text-[var(--muted)] hover:bg-[var(--hover)]"
          aria-expanded={open}
        >
          {title}
          <ChevronDown size={12} className={`al-pasar transition-transform ${open ? "" : "-rotate-90"}`} />
        </button>
        {accion}
      </div>
      {open && children}
    </div>
  );
}

function SectionLink({ page }: { page: { id: string; title: string; icon: string | null } }) {
  const pathname = usePathname();
  const active = pathname === `/p/${page.id}`;
  return (
    <Link
      href={`/p/${page.id}`}
      className={`flex items-center gap-1 truncate rounded-md px-2 py-1 text-sm ${
        active ? "bg-[var(--active)] font-medium" : "hover:bg-[var(--hover)]"
      }`}
    >
      <span className="truncate">
        {page.icon ? <><IconoPagina icon={page.icon} size={14} />{" "}</> : <FileText size={13} className="mr-1 inline align-[-2px]" />}
        {page.title || "Sin título"}
      </span>
    </Link>
  );
}

/** Favoritos del usuario (por encima del árbol), reordenables arrastrando. */
function Favorites() {
  const utils = trpc.useUtils();
  const { data: favs } = trpc.favorites.list.useQuery();
  const move = trpc.favorites.move.useMutation({ onSuccess: () => utils.favorites.list.invalidate() });
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; pos: "before" | "after" } | null>(null);
  if (!favs?.length) return null;
  return (
    <Section title="Favoritos">
      {favs.map((p) => (
        <div
          key={p.id}
          draggable
          onDragStart={(e) => {
            e.stopPropagation();
            setDragId(p.id);
          }}
          onDragEnd={() => {
            setDragId(null);
            setDrop(null);
          }}
          onDragOver={(e) => {
            if (!dragId || dragId === p.id) return;
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect();
            setDrop({ id: p.id, pos: e.clientY < r.top + r.height / 2 ? "before" : "after" });
          }}
          onDragLeave={() => setDrop((d) => (d?.id === p.id ? null : d))}
          onDrop={(e) => {
            e.preventDefault();
            if (dragId && drop?.id === p.id && dragId !== p.id)
              move.mutate({ pageId: dragId, ...(drop.pos === "before" ? { beforePageId: p.id } : { afterPageId: p.id }) });
            setDragId(null);
            setDrop(null);
          }}
          className={`${dragId === p.id ? "opacity-50" : ""} ${
            drop?.id === p.id
              ? drop.pos === "before"
                ? "shadow-[inset_0_2px_0_0_var(--color-brand)]"
                : "shadow-[inset_0_-2px_0_0_var(--color-brand)]"
              : ""
          }`}
        >
          <SectionLink page={p} />
        </div>
      ))}
    </Section>
  );
}

/**
 * Botón de la barra de acciones del panel: solo icono. El nombre y el atajo van en
 * el título emergente, para que la barra no se llene de texto; todos los atajos
 * están además juntos en la ventana de Atajos.
 */
const accionPanel =
  "toque flex items-center justify-center rounded-md p-1.5 text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]";

/** Galería de plantillas: tarjetas con icono + nombre + descripción; crea la página en el servidor. */
function TemplatesGallery({ onClose }: { onClose: () => void }) {
  const utils = trpc.useUtils();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const create = trpc.pages.createFromTemplate.useMutation({
    onSuccess: async ({ id }) => {
      await utils.pages.tree.invalidate();
      onClose();
      router.push(`/p/${id}`);
    },
  });
  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--background)] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold">
            <Sparkles size={18} /> Plantillas
          </h2>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--foreground)]" title="Cerrar">
            <X size={16} />
          </button>
        </div>
        <p className="mb-4 text-xs text-[var(--muted)]">Empieza con una página o base de datos prehecha.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Object.entries(TEMPLATES).map(([key, t]) => (
            <button
              key={key}
              disabled={create.isPending}
              onClick={() => create.mutate({ key })}
              className="rounded-lg border border-[var(--border)] p-3 text-left transition-colors hover:border-brand hover:bg-[var(--hover)] disabled:opacity-50"
            >
              <div className="text-2xl">{t.icon}</div>
              <div className="mt-1 text-sm font-medium">{t.name}</div>
              <div className="mt-0.5 text-xs text-[var(--muted)]">{t.description}</div>
            </button>
          ))}
        </div>
        {create.error && <p className="mt-2 text-xs text-red-500">{create.error.message}</p>}
      </div>
    </div>,
    document.body,
  );
}

type Me = {
  id: string;
  email: string;
  name: string | null;
  wsRole: "owner" | "editor" | "viewer" | null;
  workspace: { id: string; name: string; icon: string | null } | null;
} | null | undefined;

/**
 * El espacio, arriba del panel, y su menú: cambiar de espacio, compartirlo, y lo de
 * la cuenta (atajos, tema, cerrar sesión). Es donde lo pone Notion; antes estaba
 * repartido entre una fila con el rol, otra de iconos y un pie.
 */
function WorkspaceMenu({ me }: { me: Me }) {
  const utils = trpc.useUtils();
  const { data: spaces } = trpc.workspace.list.useQuery();
  const [open, setOpen] = useState(false);
  const [share, setShare] = useState(false);
  const theme = useTheme();
  const switchWs = trpc.workspace.switch.useMutation({
    onSuccess: () => window.location.reload(),
  });
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => {
      window.location.href = "/login";
    },
  });

  const current = me?.workspace;
  const roleLabel =
    me?.wsRole === "owner" ? "Propietario" : me?.wsRole === "editor" ? "Editor" : me?.wsRole === "viewer" ? "Solo lectura" : "";
  const nombre = current?.name ?? "Espacio";

  // Clic fuera cierra el menú, como el resto de menús del panel.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as globalThis.Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const item = "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--hover)]";
  return (
    <div ref={ref} className="relative min-w-0 flex-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="toque-estrecho flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-[var(--hover)]"
        aria-expanded={open}
      >
        <InicialEspacio nombre={nombre} />
        <span className="truncate text-sm font-semibold">{nombre}</span>
        <ChevronDown size={14} className="shrink-0 text-[var(--muted)]" />
      </button>

      {open && (
        <div
          data-menu=""
          className="absolute left-0 top-full z-30 mt-1 w-64 rounded-lg border border-[var(--border)] bg-[var(--background)] p-1 shadow-xl"
        >
          <div className="px-2 pb-1 pt-1.5 text-xs text-[var(--muted)]">
            <div className="truncate">{me?.email}</div>
            {roleLabel && <div>{roleLabel}</div>}
          </div>
          {(spaces ?? []).map((s) => (
            <button
              key={s.id}
              onClick={async () => {
                setOpen(false);
                if (s.id === current?.id) return;
                await switchWs.mutateAsync({ workspaceId: s.id });
              }}
              className={item}
            >
              <InicialEspacio nombre={s.name} />
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              {!s.isOwner && <span className="shrink-0 text-[10px] text-[var(--muted)]">de {s.ownerName}</span>}
              {s.id === current?.id && <Check size={14} className="shrink-0 text-brand" />}
            </button>
          ))}
          {me?.wsRole === "owner" && (
            <button
              onClick={() => {
                setOpen(false);
                setShare(true);
              }}
              className={item}
            >
              <Users size={16} className="text-[var(--muted)]" />
              Compartir el espacio
            </button>
          )}
          <div className="my-1 border-t border-[var(--border)]" />
          <button
            onClick={() => {
              setOpen(false);
              openShortcuts();
            }}
            className={item}
          >
            <Keyboard size={16} className="text-[var(--muted)]" />
            Atajos de teclado
          </button>
          <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className={item}>
            {theme === "dark" ? <Sun size={16} className="text-[var(--muted)]" /> : <Moon size={16} className="text-[var(--muted)]" />}
            {theme === "dark" ? "Tema claro" : "Tema oscuro"}
            <span className="ml-auto text-[10px] text-[var(--muted)]">Ctrl+Mayús+L</span>
          </button>
          <div className="my-1 border-t border-[var(--border)]" />
          <button onClick={() => logout.mutate()} className={item}>
            <LogOut size={16} className="text-[var(--muted)]" />
            Cerrar sesión
          </button>
        </div>
      )}

      {share && <ShareDialog onClose={() => setShare(false)} onChange={() => utils.workspace.members.invalidate()} />}
    </div>
  );
}

/** El cuadradito con la inicial del espacio, como el icono de espacio de Notion. */
function InicialEspacio({ nombre }: { nombre: string }) {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[var(--active)] text-[11px] font-semibold text-[var(--foreground)]">
      {nombre.trim().charAt(0).toUpperCase() || "·"}
    </span>
  );
}

function ShareDialog({ onClose, onChange }: { onClose: () => void; onChange: () => void }) {
  const utils = trpc.useUtils();
  const { data } = trpc.workspace.members.useQuery();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [err, setErr] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const refresh = async () => {
    await utils.workspace.members.invalidate();
    onChange();
  };
  const share = trpc.workspace.share.useMutation({
    onSuccess: async () => {
      setEmail("");
      setErr(null);
      await refresh();
    },
    onError: (e) => setErr(e.message),
  });
  const setRoleM = trpc.workspace.setRole.useMutation({ onSuccess: refresh });
  const unshare = trpc.workspace.unshare.useMutation({ onSuccess: refresh });

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--background)] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold">
            <Users size={18} /> Compartir espacio
          </h2>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--foreground)]" title="Cerrar">
            <X size={16} />
          </button>
        </div>
        <p className="mb-4 text-xs text-[var(--muted)]">
          La persona debe haber entrado antes una vez con su cuenta del NAS.
        </p>

        <div className="mb-1 flex flex-col gap-2 sm:flex-row">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && email.trim() && share.mutate({ email: email.trim(), role })}
            placeholder="email de la persona"
            className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <div className="flex gap-2">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "editor" | "viewer")}
              className="rounded-lg border border-[var(--border)] bg-transparent px-2 py-2 text-sm"
            >
              <option value="editor">Editor</option>
              <option value="viewer">Solo lectura</option>
            </select>
            <button
              onClick={() => share.mutate({ email: email.trim(), role })}
              disabled={!email.trim() || share.isPending}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Añadir
            </button>
          </div>
        </div>
        {err && <p className="mb-2 text-xs text-red-500">{err}</p>}

        <ul className="mt-3 space-y-1">
          {(data?.members ?? []).map((m) => {
            const isOwner = m.userId === data?.ownerId;
            return (
              <li key={m.userId} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--border)]/30">
                <span className="min-w-0 flex-1 truncate">{m.name || m.email}</span>
                {isOwner ? (
                  <span className="text-xs text-[var(--muted)]">Propietario</span>
                ) : (
                  <>
                    <select
                      value={m.role}
                      onChange={(e) => setRoleM.mutate({ userId: m.userId, role: e.target.value as "editor" | "viewer" })}
                      className="rounded border border-[var(--border)] bg-transparent px-1 py-0.5 text-xs"
                    >
                      <option value="editor">Editor</option>
                      <option value="viewer">Solo lectura</option>
                    </select>
                    <button
                      onClick={() => unshare.mutate({ userId: m.userId })}
                      className="rounded px-1 text-xs text-[var(--muted)] hover:text-red-500"
                      title="Quitar acceso"
                    >
                      <X size={14} />
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>,
    document.body,
  );
}

function Tree({
  nodes,
  byParent,
  parentById,
  depth,
  canEdit,
}: {
  nodes: Node[];
  byParent: Map<string | null, Node[]>;
  parentById: Map<string, string | null>;
  depth: number;
  canEdit: boolean;
}) {
  return (
    <ul>
      {nodes.map((n) => (
        <TreeItem key={n.id} node={n} byParent={byParent} parentById={parentById} depth={depth} canEdit={canEdit} />
      ))}
    </ul>
  );
}

function TreeItem({
  node,
  byParent,
  parentById,
  depth,
  canEdit,
}: {
  node: Node;
  byParent: Map<string | null, Node[]>;
  parentById: Map<string, string | null>;
  depth: number;
  canEdit: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(true);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [moving, setMoving] = useState(false);
  const [dropPos, setDropPos] = useState<"before" | "after" | "inside" | null>(null);
  const children = byParent.get(node.id) ?? [];
  const active = pathname === `/p/${node.id}`;

  const move = trpc.pages.move.useMutation({
    onSuccess: () => utils.pages.tree.invalidate(),
  });

  const addSub = trpc.pages.create.useMutation({
    onSuccess: async (page) => {
      setOpen(true);
      await utils.pages.tree.invalidate();
      router.push(`/p/${page.id}`);
    },
  });
  const archive = trpc.pages.archive.useMutation({
    onSuccess: async () => {
      await utils.pages.tree.invalidate();
      if (active) router.push("/");
    },
  });
  const duplicate = trpc.pages.duplicate.useMutation({
    onSuccess: async (res) => {
      await utils.pages.tree.invalidate();
      router.push(`/p/${res.id}`);
    },
  });
  const favorite = trpc.pages.toggleFavorite.useMutation({
    onSuccess: () => utils.favorites.list.invalidate(),
  });

  return (
    <li>
      <div
        // Clic derecho: el mismo menú que el «⋯», pero donde está el ratón. El «⋯»
        // solo aparece al pasar por encima, así que en una lista larga cuesta dar con él.
        onContextMenu={(e) => {
          if (!canEdit) return;
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        className={`group flex items-center gap-1 rounded-md pr-1 text-sm ${
          active ? "bg-[var(--active)] font-medium" : "hover:bg-[var(--hover)]"
        } ${
          dropPos === "inside"
            ? "bg-brand-50 ring-1 ring-brand"
            : dropPos === "before"
              ? "shadow-[inset_0_2px_0_0_var(--color-brand)]"
              : dropPos === "after"
                ? "shadow-[inset_0_-2px_0_0_var(--color-brand)]"
                : ""
        }`}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        draggable={canEdit}
        onDragStart={(e) => {
          draggedId = node.id;
          e.dataTransfer.effectAllowed = "move";
          // La fila de origen se atenúa mientras viaja, como en Notion. A pelo
          // sobre el DOM: draggedId no es estado y aquí no hay re-render.
          e.currentTarget.classList.add("opacity-50");
        }}
        onDragEnd={(e) => {
          draggedId = null;
          e.currentTarget.classList.remove("opacity-50");
        }}
        onDragOver={(e) => {
          if (!canEdit || !draggedId || isInSubtree(node.id, draggedId, parentById)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          const r = e.currentTarget.getBoundingClientRect();
          const y = e.clientY - r.top;
          setDropPos(y < r.height / 4 ? "before" : y > (r.height * 3) / 4 ? "after" : "inside");
        }}
        onDragLeave={() => setDropPos(null)}
        onDrop={(e) => {
          e.preventDefault();
          const pos = dropPos;
          setDropPos(null);
          if (!pos || !draggedId || isInSubtree(node.id, draggedId, parentById)) return;
          if (pos === "inside") {
            move.mutate({ id: draggedId, parentId: node.id });
            setOpen(true);
          } else if (pos === "before") {
            move.mutate({ id: draggedId, parentId: node.parentId, beforeId: node.id });
          } else {
            move.mutate({ id: draggedId, parentId: node.parentId, afterId: node.id });
          }
          draggedId = null;
        }}
      >
        <button
          onClick={() => setOpen((o) => !o)}
          className={`toque-estrecho flex w-4 shrink-0 items-center justify-center text-[var(--muted)] ${node.hasChildren ? "" : "invisible"}`}
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <Link href={`/p/${node.id}`} className="toque flex flex-1 items-center truncate py-1" draggable={false}>
          {node.icon ? <><IconoPagina icon={node.icon} size={14} />{" "}</> : <FileText size={13} className="mr-1 inline align-[-2px]" />}
          {node.title || "Sin título"}
        </Link>
        {/* Con ratón, las acciones solo existen al pasar por encima (sin reservar
            su hueco, que cortaba los títulos); en táctil se ven siempre. */}
        {canEdit && (
          <div className={`items-center ${menu ? "flex" : "flex pointer-fine:hidden pointer-fine:group-hover:flex"}`}>
            <button
              onClick={() => addSub.mutate({ parentId: node.id })}
              className="rounded px-1 text-[var(--muted)] hover:text-[var(--foreground)]"
              title="Añadir subpágina"
            >
              <Plus size={14} />
            </button>
            <button
              onClick={(e) => {
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setMenu({ x: r.left, y: r.bottom });
              }}
              className="rounded px-1 text-[var(--muted)] hover:text-[var(--foreground)]"
              title="Más acciones"
            >
              <MoreHorizontal size={14} />
            </button>
          </div>
        )}
      </div>

      {menu && (
        <RowMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            {
              icon: <Plus size={16} />,
              label: "Añadir subpágina",
              onClick: () => addSub.mutate({ parentId: node.id }),
            },
            {
              icon: <Star size={16} />,
              label: "Favorito (añadir o quitar)",
              onClick: () => favorite.mutate({ pageId: node.id }),
            },
            {
              icon: <Link2 size={16} />,
              label: "Copiar enlace",
              onClick: () => navigator.clipboard.writeText(`${window.location.origin}/p/${node.id}`),
            },
            {
              icon: <Copy size={16} />,
              label: "Duplicar",
              onClick: () => duplicate.mutate({ id: node.id }),
            },
            {
              icon: <FolderInput size={16} />,
              label: "Mover a…",
              onClick: () => setMoving(true),
            },
            {
              icon: <Trash2 size={16} />,
              label: "Enviar a la papelera",
              danger: true,
              onClick: () => archive.mutate({ id: node.id }),
            },
          ]}
        />
      )}

      {moving && <MovePageModal pageId={node.id} onClose={() => setMoving(false)} />}

      {open && children.length > 0 && (
        <Tree nodes={children} byParent={byParent} parentById={parentById} depth={depth + 1} canEdit={canEdit} />
      )}
    </li>
  );
}

function RowMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: { icon?: React.ReactNode; label: string; onClick: () => void; danger?: boolean }[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as globalThis.Node)) onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);
  if (!mounted) return null;
  return createPortal(
    <div
      ref={ref}
      data-menu=""
      className="fixed z-[100] min-w-44 rounded-lg border border-[var(--border)] bg-[var(--background)] p-1 shadow-xl"
      style={{ left: x, top: y + 4 }}
    >
      {items.map((it) => (
        <button
          key={it.label}
          onClick={() => {
            it.onClick();
            onClose();
          }}
          className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm hover:bg-[var(--hover)] ${
            it.danger ? "text-red-500" : ""
          }`}
        >
          {it.icon}
          {it.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
