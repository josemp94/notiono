"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Contenedor con scroll horizontal cuya barra se ve SIEMPRE, aunque la vista
 * sea larga: la barra nativa quedaría al pie del contenido (fuera de pantalla),
 * así que se esconde y se pinta una gemela pegada al borde inferior del
 * viewport (sticky), sincronizada con el contenido en ambos sentidos.
 */
export function ScrollHorizontal({ className = "", children }: { className?: string; children: React.ReactNode }) {
  const cont = useRef<HTMLDivElement>(null);
  const barra = useRef<HTMLDivElement>(null);
  // Ancho del contenido; 0 = no desborda y la barra no hace falta.
  const [ancho, setAncho] = useState(0);

  const medir = () => {
    const el = cont.current;
    if (el) setAncho(el.scrollWidth > el.clientWidth + 1 ? el.scrollWidth : 0);
  };
  // Tras cada render (filas/columnas nuevas) y ante cambios de tamaño sin
  // re-render (ventana, contenido que crece al escribir).
  useEffect(medir);
  useEffect(() => {
    const el = cont.current;
    if (!el) return;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div
        ref={cont}
        className={`sin-barra overflow-x-auto ${className}`}
        onScroll={(e) => {
          if (barra.current) barra.current.scrollLeft = e.currentTarget.scrollLeft;
        }}
      >
        {children}
      </div>
      {ancho > 0 && (
        <div
          ref={barra}
          className="sticky bottom-0 z-30 overflow-x-auto"
          onScroll={(e) => {
            if (cont.current) cont.current.scrollLeft = e.currentTarget.scrollLeft;
          }}
        >
          <div style={{ width: ancho, height: 1 }} />
        </div>
      )}
    </div>
  );
}
