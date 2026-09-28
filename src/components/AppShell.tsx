"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Menu, PanelLeft } from "lucide-react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { BarraInferior } from "@/components/BarraInferior";
import { ConfirmHost } from "@/components/Confirmar";
import { ToastHost } from "@/components/Toast";
import { SearchPalette } from "@/components/SearchPalette";
import { BandejaHost } from "@/components/Bandeja";
import { Shortcuts } from "@/components/Shortcuts";
import { isTyping, NEW_PAGE_EVENT, SHORTCUTS_EVENT, TOGGLE_SIDEBAR_EVENT } from "@/lib/shortcuts";
import { setTheme } from "@/lib/theme";

const COLLAPSED_KEY = "notiono.sidebar-collapsed";

type Panel = {
  plegado: boolean;
  alternar: () => void;
  abrirCajon: () => void;
  asomar: () => void;
  esconder: () => void;
};
const PanelContext = createContext<Panel | null>(null);

/**
 * El botón del panel lateral, para el principio de la barra superior de cada
 * pantalla, como en Notion: en el móvil abre el cajón (arriba a la izquierda, que
 * es donde se busca; antes estaba abajo a la derecha) y en escritorio solo aparece
 * con el panel plegado, en línea con la miga de pan en vez de en una fila propia.
 */
export function BotonPanel() {
  const panel = useContext(PanelContext);
  if (!panel) return null;
  const clase =
    "no-imprimir toque shrink-0 items-center justify-center rounded-md p-1 text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]";
  return (
    <>
      <button onClick={panel.abrirCajon} className={`flex md:hidden ${clase}`} aria-label="Abrir el panel">
        <Menu size={20} />
      </button>
      {panel.plegado && (
        <button
          onClick={panel.alternar}
          onMouseEnter={panel.asomar}
          onMouseLeave={panel.esconder}
          className={`hidden md:flex ${clase}`}
          data-pista="Mostrar el panel"
          data-atajo="Ctrl+\"
          data-pista-izq=""
          aria-label="Mostrar el panel"
        >
          <PanelLeft size={18} />
        </button>
      )}
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  // Con el panel plegado, pasar el ratón por el borde izquierdo (o el botón) lo
  // asoma flotando, como en Notion. El cierre lleva 300ms de gracia para que el
  // cursor pueda viajar del botón al panel sin que se esfume por el camino.
  const [peek, setPeek] = useState(false);
  const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const asomar = () => {
    if (peekTimer.current) clearTimeout(peekTimer.current);
    setPeek(true);
  };
  const esconder = () => {
    if (peekTimer.current) clearTimeout(peekTimer.current);
    peekTimer.current = setTimeout(() => setPeek(false), 300);
  };
  const pathname = usePathname();

  // El plegado del panel se recuerda entre sesiones (solo escritorio).
  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1");
  }, []);
  const toggleSidebar = useCallback(
    () =>
      setCollapsed((c) => {
        localStorage.setItem(COLLAPSED_KEY, c ? "0" : "1");
        return !c;
      }),
    [],
  );

  /**
   * Atajos globales. Ctrl/Cmd+K lo lleva la propia paleta de búsqueda.
   * No se usa Ctrl+N para "nueva página" porque el navegador se lo queda.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      // «?» a secas abre los atajos, como en tantos sitios; Ctrl+/ hace lo mismo
      // para quien tenga un teclado donde «?» pide dos dedos.
      if ((e.key === "?" || (mod && e.key === "/")) && !isTyping(e.target)) {
        e.preventDefault();
        window.dispatchEvent(new Event(SHORTCUTS_EVENT));
        return;
      }
      if (!mod) return;
      if (e.key === "\\") {
        e.preventDefault();
        window.dispatchEvent(new Event(TOGGLE_SIDEBAR_EVENT));
      } else if (e.altKey && e.key.toLowerCase() === "n" && !isTyping(e.target)) {
        e.preventDefault();
        window.dispatchEvent(new Event(NEW_PAGE_EVENT));
      } else if (e.shiftKey && e.key.toLowerCase() === "l" && !isTyping(e.target)) {
        // Ctrl+Mayús+L alterna claro/oscuro, como en Notion.
        e.preventDefault();
        setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
      } else if ((e.key === "[" || e.key === "]") && !e.altKey && !isTyping(e.target)) {
        // Ctrl+[ y Ctrl+] navegan atrás/adelante, como Notion. Sin altKey: en el
        // teclado español "[" se escribe con AltGr y eso no debe navegar.
        e.preventDefault();
        if (e.key === "[") history.back();
        else history.forward();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(TOGGLE_SIDEBAR_EVENT, toggleSidebar);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(TOGGLE_SIDEBAR_EVENT, toggleSidebar);
    };
  }, [toggleSidebar]);

  // Cerrar el panel al navegar (en móvil; el asomo también se recoge).
  useEffect(() => {
    setOpen(false);
    setPeek(false);
  }, [pathname]);

  const panel: Panel = { plegado: collapsed, alternar: toggleSidebar, abrirCajon: () => setOpen(true), asomar, esconder };
  // Las páginas pintan su propia barra (con la miga de pan); el resto de pantallas
  // lleva esta, que solo trae el botón del panel: en escritorio con el panel a la
  // vista no tendría nada que enseñar y se omite.
  const barraPropia = pathname.startsWith("/p/");

  return (
    <PanelContext.Provider value={panel}>
    <div className="relative flex h-dvh">
      <SearchPalette />
      <Shortcuts />
      <ConfirmHost />
      <ToastHost />
      <BandejaHost />
      {/* Fondo oscuro al abrir el panel en móvil */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Barra lateral: cajón deslizante en móvil, fija en escritorio */}
      <div
        className={`no-imprimir fixed inset-y-0 left-0 z-40 transition-transform duration-200 md:static md:z-auto md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "md:hidden" : ""}`}
      >
        <Sidebar />
      </div>

      {/* Panel plegado: tira invisible en el borde + panel flotante al pasar el ratón. */}
      {collapsed && (
        <>
          <div onMouseEnter={asomar} onMouseLeave={esconder} className="fixed inset-y-0 left-0 z-30 hidden w-2 md:block" />
          <div
            onMouseEnter={asomar}
            onMouseLeave={esconder}
            className={`fixed bottom-3 left-0 top-12 z-40 hidden overflow-hidden rounded-r-xl border border-[var(--border)] transition-[translate,box-shadow] duration-200 md:block [&>aside]:h-full ${
              peek ? "translate-x-0 shadow-2xl" : "-translate-x-full"
            }`}
          >
            <Sidebar />
          </div>
        </>
      )}

      <div className="esquiva-muesca flex min-w-0 flex-1 flex-col">
        {!barraPropia && (
          <div className={`no-imprimir flex h-11 shrink-0 items-center px-3 ${collapsed ? "" : "md:hidden"}`}>
            <BotonPanel />
          </div>
        )}
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
        {/* En el móvil la navegación va abajo, al alcance del pulgar: el menú de la
            esquina de arriba era lo que hacía que esto oliera a página web. */}
        <BarraInferior />
      </div>
    </div>
    </PanelContext.Provider>
  );
}
