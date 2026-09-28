"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Contenedor con scroll horizontal cuya barra se ve SIEMPRE, aunque la vista
 * sea larga: la barra nativa quedaría al pie del contenido (fuera de pantalla),
 * así que se esconde y se pinta una propia pegada al borde inferior del
 * viewport (sticky). No es la scrollbar nativa de un div gemelo —en Android y
 * Firefox las barras son «overlay»: no ocupan sitio y solo se pintan mientras
 * se usan, o sea, invisibles—, sino un pulgar dibujado y arrastrable.
 */
export function ScrollHorizontal({ className = "", children }: { className?: string; children: React.ReactNode }) {
  const cont = useRef<HTMLDivElement>(null);
  const riel = useRef<HTMLDivElement>(null);
  const pulgar = useRef<HTMLDivElement>(null);
  const [desborda, setDesborda] = useState(false);

  // Mide y coloca el pulgar (DOM directo, sin re-render por cada scroll).
  const pintar = () => {
    const el = cont.current;
    if (!el) return;
    const sobra = el.scrollWidth - el.clientWidth;
    setDesborda(sobra > 1);
    const r = riel.current;
    const p = pulgar.current;
    if (!r || !p || sobra <= 1) return;
    const ancho = Math.max(40, (el.clientWidth / el.scrollWidth) * r.clientWidth);
    p.style.width = `${ancho}px`;
    p.style.transform = `translateX(${(el.scrollLeft / sobra) * (r.clientWidth - ancho)}px)`;
  };

  // Tras cada render (filas/columnas nuevas) y ante cambios de tamaño sin
  // re-render (ventana, contenido que crece al escribir).
  useEffect(pintar);
  useEffect(() => {
    const el = cont.current;
    if (!el) return;
    const ro = new ResizeObserver(pintar);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Arrastrar el pulgar o pinchar el riel para saltar a esa posición.
  const alPulsar = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = cont.current;
    const r = riel.current;
    const p = pulgar.current;
    if (!el || !r || !p) return;
    const sobra = el.scrollWidth - el.clientWidth;
    if (sobra <= 0) return;
    e.preventDefault();
    const cajaRiel = r.getBoundingClientRect();
    const cajaPulgar = p.getBoundingClientRect();
    const rango = cajaRiel.width - cajaPulgar.width;
    // Si se pincha sobre el pulgar, se arrastra desde ese punto; si no, se centra.
    const dentro = e.clientX >= cajaPulgar.left && e.clientX <= cajaPulgar.right;
    const agarre = dentro ? e.clientX - cajaPulgar.left : cajaPulgar.width / 2;
    const mover = (x: number) => {
      el.scrollLeft = ((x - cajaRiel.left - agarre) / rango) * sobra;
    };
    mover(e.clientX);
    const alMover = (ev: PointerEvent) => mover(ev.clientX);
    const alSoltar = () => {
      r.removeEventListener("pointermove", alMover);
      r.removeEventListener("pointerup", alSoltar);
    };
    r.addEventListener("pointermove", alMover);
    r.addEventListener("pointerup", alSoltar);
    // Para seguir arrastrando aunque el puntero se salga del riel (18 px: pasa siempre).
    try {
      r.setPointerCapture(e.pointerId);
    } catch {
      /* sin captura el arrastre funciona igual mientras el puntero esté encima */
    }
  };

  return (
    <div>
      <div ref={cont} className={`sin-barra overflow-x-auto ${className}`} onScroll={pintar}>
        {children}
      </div>
      {desborda && (
        <div
          ref={riel}
          className="sticky bottom-0 z-30 cursor-pointer py-1"
          style={{ touchAction: "none" }}
          onPointerDown={alPulsar}
        >
          {/* Fina y tenue, como la de Notion: gruesa y oscura tapaba el pie de la tabla. */}
          <div ref={pulgar} className="h-1.5 rounded-full bg-[var(--muted)] opacity-40 transition-opacity hover:opacity-70" />
        </div>
      )}
    </div>
  );
}
