"use client";

/**
 * Panel lateral para echar un vistazo a una página sin salir de la que se está
 * viendo (el «side peek» de Notion): editable y con edición simultánea, con botón
 * para abrirla a pantalla completa, y se cierra con Esc o la X. En el móvil ocupa la
 * pantalla entera, como una hoja que se cierra hacia atrás.
 *
 * Vive en la URL (`?vistazo=<id>`): así el botón Atrás del navegador (o el gesto del
 * móvil) lo cierra, y un enlace con el panel abierto lo vuelve a abrir.
 */
import { Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronsRight, Maximize2 } from "lucide-react";
import { trpc } from "@/trpc/react";
import { Editor } from "@/components/editor/Editor";
import { EditorProtegido } from "@/components/editor/ModoSeguro";
import { Database } from "@/components/database/Database";
import { IconoPagina } from "@/components/PageIcon";
import { VISTAZO_EVENT as EVENTO, VISTAZO_PARAM as PARAM } from "@/lib/vistazo";


/** Lo monta AppShell una vez: escucha las peticiones y pinta el panel si la URL lo pide. */
export function PanelPaginaHost() {
  return (
    <Suspense>
      <Host />
    </Suspense>
  );
}

function Host() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const id = params.get(PARAM);
  // Si lo abrimos nosotros, cerrar es volver atrás (y el Atrás del móvil hace lo mismo).
  const abiertoAqui = useRef(false);

  useEffect(() => {
    const abrir = (e: Event) => {
      const pageId = (e as CustomEvent<string>).detail;
      const sp = new URLSearchParams(window.location.search);
      const yaAbierto = sp.has(PARAM);
      sp.set(PARAM, pageId);
      const url = `${window.location.pathname}?${sp}`;
      if (yaAbierto) router.replace(url);
      else {
        abiertoAqui.current = true;
        router.push(url);
      }
    };
    window.addEventListener(EVENTO, abrir);
    return () => window.removeEventListener(EVENTO, abrir);
  }, [router]);

  const cerrar = useCallback(() => {
    if (abiertoAqui.current) {
      abiertoAqui.current = false;
      router.back();
      return;
    }
    const sp = new URLSearchParams(window.location.search);
    sp.delete(PARAM);
    router.replace(sp.size ? `${pathname}?${sp}` : pathname);
  }, [router, pathname]);

  if (!id) return null;
  return <Panel key={id} pageId={id} onClose={cerrar} />;
}

const nadaQueEscuchar = () => () => {};

function Panel({ pageId, onClose }: { pageId: string; onClose: () => void }) {
  const { data: page, error } = trpc.pages.get.useQuery({ id: pageId });
  const { data: me } = trpc.auth.me.useQuery();

  // Esc cierra (escribiendo en un campo, primero sale del campo; un menú abierto lo consume antes).
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return t.blur();
      onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // Ancho arrastrando el borde izquierdo (solo ratón), como la ficha de una fila.
  const guardado = useSyncExternalStore(
    nadaQueEscuchar,
    () => Number(localStorage.getItem("notiono.vistazo-width")) || 640,
    () => 640,
  );
  const [arrastrado, setAncho] = useState<number | null>(null);
  const ancho = arrastrado ?? Math.min(1100, Math.max(380, guardado));
  const empezarArrastre = (e: React.MouseEvent) => {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = ancho;
    const clamp = (n: number) => Math.min(1100, Math.max(380, n));
    const move = (ev: MouseEvent) => setAncho(clamp(w0 - (ev.clientX - x0)));
    const up = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", move);
      localStorage.setItem("notiono.vistazo-width", String(clamp(w0 - (ev.clientX - x0))));
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up, { once: true });
  };

  const nivel = page?.nivel ?? "edit";
  const canEdit = me?.wsRole !== "viewer" && (nivel === "edit" || nivel === "full");
  const editable = canEdit && !page?.locked;
  const boton = "toque flex items-center justify-center rounded-md p-1 text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]";

  return (
    <aside
      data-panel-pagina=""
      className="fixed inset-0 z-40 flex flex-col border-[var(--border)] bg-[var(--background)] shadow-2xl md:inset-y-0 md:left-auto md:right-0 md:w-[var(--ancho-panel)] md:max-w-[100vw] md:border-l"
      style={{ "--ancho-panel": `${ancho}px` } as React.CSSProperties}
    >
      {/* Tirador de ancho: cosa de ratón, escondido en táctil a propósito. */}
      <span
        onMouseDown={empezarArrastre}
        className="absolute inset-y-0 left-0 z-10 hidden w-1.5 cursor-col-resize hover:bg-brand/40 md:block"
        title="Arrastra para ajustar el ancho"
      />
      <div className="zona-segura-arriba flex h-11 shrink-0 items-center gap-1 px-2">
        <button onClick={onClose} className={boton} title="Cerrar (Esc)" aria-label="Cerrar">
          <ChevronsRight size={18} />
        </button>
        <Link href={`/p/${pageId}`} className={boton} title="Abrir a pantalla completa" aria-label="Abrir a pantalla completa">
          <Maximize2 size={16} />
        </Link>
        {page && (
          <span className="ml-1 flex min-w-0 items-center gap-1 truncate text-sm text-[var(--muted)]">
            {page.icon && <IconoPagina icon={page.icon} size={14} />}
            <span className="truncate">{page.title || "Sin título"}</span>
          </span>
        )}
        <div id="barra-panel" className="ml-auto flex shrink-0 items-center gap-2 text-xs text-[var(--muted)]" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" data-font={page && page.type !== "database" ? (page.font ?? "sans") : undefined}>
        {error ? (
          <div className="px-8 py-16 text-[var(--muted)]">Página no encontrada.</div>
        ) : !page ? (
          <div className="px-8 py-10">
            <div className="esqueleto h-8 w-1/2" />
            <div className="esqueleto mt-6 h-4 w-2/3" />
          </div>
        ) : page.type === "database" ? (
          <Database pageId={page.id} initialTitle={page.title || "Base de datos"} initialIcon={page.icon} initialCover={page.cover} canEdit={editable} />
        ) : (
          <EditorProtegido pageId={page.id} content={page.content}>
            <Editor
              pageId={page.id}
              initialTitle={page.title}
              initialContent={page.content}
              initialIcon={page.icon}
              initialCover={page.cover}
              fullWidth
              canEdit={editable}
              barraId="barra-panel"
            />
          </EditorProtegido>
        )}
      </div>
    </aside>
  );
}
