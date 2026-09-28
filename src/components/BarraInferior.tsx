"use client";

import { CircleCheck, House, Inbox, Plus, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { openSearchPalette } from "@/components/SearchPalette";
import { abrirBandeja, useNoLeidas } from "@/components/Bandeja";
import { NEW_PAGE_EVENT } from "@/lib/shortcuts";

/**
 * La barra de abajo del móvil.
 *
 * Es lo que más separa «una web en el móvil» de «una app»: lo que se usa cada dos
 * minutos —volver, buscar, crear, ver los avisos— cae donde llega el pulgar. El árbol
 * de páginas va en el cajón lateral, que se abre con el botón de arriba a la
 * izquierda de cada pantalla, como en Notion (abajo a la derecha no lo buscaba nadie).
 *
 * Solo móvil: en escritorio manda el panel lateral y esto estorbaría.
 */
/** Todos los iconos ocupan el mismo hueco, incluido el cuadro naranja de «Nueva»:
 *  si no, ese botón crece y desalinea las etiquetas de al lado. */
const HUECO = "flex h-8 w-10 items-center justify-center";

export function BarraInferior() {
  const ruta = usePathname();
  const noLeidas = useNoLeidas();
  const teclado = useTecladoAbierto();
  // «Inicio» es donde vive el contenido: la portada redirige a la primera página, así
  // que estando en una página el sitio marcado tiene que ser ese.
  const enPaginas = ruta === "/" || ruta.startsWith("/p/");

  // Mientras se escribe, fuera: con el teclado abierto la página se encoge hasta él
  // (interactive-widget en layout.tsx) y la barra quedaría flotando encima de las
  // teclas, quitando sitio al texto. Notion hace lo mismo.
  if (teclado) return null;

  return (
    <nav className="no-imprimir zona-segura-abajo flex shrink-0 items-stretch border-t border-[var(--border)] bg-[var(--surface)] pt-1 md:hidden">
      <Boton href="/" icono={<House size={20} />} etiqueta="Inicio" activo={enPaginas} />
      <Boton onClick={openSearchPalette} icono={<Search size={20} />} etiqueta="Buscar" />
      <button
        onClick={() => window.dispatchEvent(new Event(NEW_PAGE_EVENT))}
        className="flex flex-1 flex-col items-center gap-1 px-1 py-1 text-[var(--muted)] active:opacity-70"
        aria-label="Nueva página"
      >
        <span className={`${HUECO} rounded-lg bg-brand text-white`}>
          <Plus size={20} strokeWidth={2.25} />
        </span>
        <span className="text-[10px] leading-none">Nueva</span>
      </button>
      <Boton
        href="/my-tasks"
        icono={<CircleCheck size={20} />}
        etiqueta="Tareas"
        activo={ruta === "/my-tasks"}
      />
      <Boton
        onClick={abrirBandeja}
        icono={
          <span className="relative">
            <Inbox size={20} />
            {!!noLeidas && (
              <span className="absolute -right-2 -top-1.5 min-w-4 rounded-full bg-brand px-1 text-center text-[10px] font-semibold leading-4 text-white">
                {noLeidas > 9 ? "9+" : noLeidas}
              </span>
            )}
          </span>
        }
        etiqueta="Bandeja"
      />
    </nav>
  );
}

function Boton({
  href,
  onClick,
  icono,
  etiqueta,
  activo,
}: {
  href?: string;
  onClick?: () => void;
  icono: React.ReactNode;
  etiqueta: string;
  activo?: boolean;
}) {
  const clase = `flex flex-1 flex-col items-center gap-1 px-1 py-1 active:opacity-70 ${
    activo ? "text-brand" : "text-[var(--muted)]"
  }`;
  const dentro = (
    <>
      <span className={HUECO}>{icono}</span>
      <span className="text-[10px] leading-none">{etiqueta}</span>
    </>
  );
  return href ? (
    <Link href={href} className={clase} aria-current={activo ? "page" : undefined}>
      {dentro}
    </Link>
  ) : (
    <button onClick={onClick} className={clase} aria-label={etiqueta}>
      {dentro}
    </button>
  );
}

/**
 * ¿Está abierto el teclado en pantalla? Con `interactive-widget=resizes-content` el
 * teclado encoge la ventana: si mide bastante menos que la más alta vista con el
 * mismo ancho (girar el móvil cambia el ancho), es que está abierto.
 */
function useTecladoAbierto(): boolean {
  const [abierto, setAbierto] = useState(false);
  useEffect(() => {
    let ancho = window.innerWidth;
    let maxAlto = window.innerHeight;
    const medir = () => {
      if (window.innerWidth !== ancho) {
        ancho = window.innerWidth;
        maxAlto = window.innerHeight;
      }
      maxAlto = Math.max(maxAlto, window.innerHeight);
      setAbierto(maxAlto - window.innerHeight > 150);
    };
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, []);
  return abierto;
}
