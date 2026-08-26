"use client";

import { CircleCheck, House, Menu, Plus, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { openSearchPalette } from "@/components/SearchPalette";
import { NEW_PAGE_EVENT } from "@/lib/shortcuts";

/**
 * La barra de abajo del móvil.
 *
 * Es lo que más separa «una web en el móvil» de «una app»: lo que se usa cada dos
 * minutos —volver, buscar, crear— cae donde llega el pulgar, y no detrás de un menú
 * en la esquina de arriba. El árbol de páginas sigue en el cajón lateral, que ahora
 * se abre desde aquí.
 *
 * Solo móvil: en escritorio manda el panel lateral y esto estorbaría.
 */
/** Todos los iconos ocupan el mismo hueco, incluido el cuadro naranja de «Nueva»:
 *  si no, ese botón crece y desalinea las etiquetas de al lado. */
const HUECO = "flex h-8 w-10 items-center justify-center";

export function BarraInferior({ onMenu }: { onMenu: () => void }) {
  const ruta = usePathname();
  // «Inicio» es donde vive el contenido: la portada redirige a la primera página, así
  // que estando en una página el sitio marcado tiene que ser ese.
  const enPaginas = ruta === "/" || ruta.startsWith("/p/");

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
      <Boton onClick={onMenu} icono={<Menu size={20} />} etiqueta="Menú" />
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
