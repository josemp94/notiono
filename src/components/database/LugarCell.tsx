"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, MapPin, X } from "lucide-react";
import { Popover } from "./Popover";
import "leaflet/dist/leaflet.css";

export type Lugar = { nombre: string; lat: number; lng: number };

export function lugarDe(v: unknown): Lugar | null {
  const l = v as Lugar | null;
  return l && typeof l === "object" && typeof l.lat === "number" && typeof l.lng === "number" ? l : null;
}

/**
 * Celda del campo Lugar: el nombre con su chincheta y, al abrir, buscador de
 * direcciones (Nominatim vía /api/geo) + mini-mapa OpenStreetMap con Leaflet.
 */
export function LugarCell({ value, onCommit }: { value: unknown; onCommit: (v: unknown) => void }) {
  const lugar = lugarDe(value);
  const [abierto, setAbierto] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={wrapRef} className="min-w-0">
      <button
        onClick={() => setAbierto(true)}
        className="flex min-h-[26px] w-full min-w-0 items-center gap-1 px-1 py-0.5 text-left text-sm"
      >
        {lugar && (
          <>
            <MapPin size={14} className="shrink-0 text-[var(--muted)]" />
            <span className="truncate">{lugar.nombre || `${lugar.lat}, ${lugar.lng}`}</span>
          </>
        )}
      </button>
      {abierto && (
        <Popover onClose={() => setAbierto(false)} anchorRef={wrapRef} className="left-0 w-80 p-2">
          <EditorLugar lugar={lugar} onCommit={onCommit} cerrar={() => setAbierto(false)} />
        </Popover>
      )}
    </div>
  );
}

function EditorLugar({
  lugar,
  onCommit,
  cerrar,
}: {
  lugar: Lugar | null;
  onCommit: (v: unknown) => void;
  cerrar: () => void;
}) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<Lugar[]>([]);
  const [buscando, setBuscando] = useState(false);

  // Búsqueda con calma: Nominatim pide como mucho ~1 petición por segundo.
  useEffect(() => {
    if (q.trim().length < 3) {
      setResultados([]);
      return;
    }
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const r = await fetch(`/api/geo?q=${encodeURIComponent(q)}`);
        const data = (await r.json()) as { lugares?: Lugar[] };
        setResultados(data.lugares ?? []);
      } catch {
        setResultados([]);
      }
      setBuscando(false);
    }, 500);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar una dirección o un lugar…"
          className="min-w-0 flex-1 rounded border border-[var(--border)] bg-transparent px-2 py-1 text-sm outline-none focus:border-[var(--muted)]"
        />
        {buscando && <Loader2 size={14} className="shrink-0 animate-spin text-[var(--muted)]" />}
      </div>
      {resultados.length > 0 && (
        <div className="max-h-48 overflow-y-auto">
          {resultados.map((r, i) => (
            <button
              key={i}
              onClick={() => {
                onCommit(r);
                cerrar();
              }}
              className="flex w-full items-start gap-1.5 rounded px-2 py-1 text-left text-sm hover:bg-[var(--hover)]"
            >
              <MapPin size={14} className="mt-0.5 shrink-0 text-[var(--muted)]" />
              <span>{r.nombre}</span>
            </button>
          ))}
        </div>
      )}
      {lugar && (
        <>
          <MiniMapa lugar={lugar} />
          <div className="flex items-center gap-1 text-sm">
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${lugar.lat},${lugar.lng}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 rounded px-2 py-1 text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
            >
              <ExternalLink size={14} /> Cómo llegar
            </a>
            <span className="flex-1" />
            <button
              onClick={() => {
                onCommit(null);
                cerrar();
              }}
              className="flex items-center gap-1 rounded px-2 py-1 text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
            >
              <X size={14} /> Quitar
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Mapa quieto (sin zoom ni arrastre): es una vista previa, no un GPS. */
function MiniMapa({ lugar }: { lugar: Lugar }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let mapa: import("leaflet").Map | null = null;
    let vivo = true;
    // Leaflet toca `window` al importarse: dinámico para que el SSR no muera.
    (async () => {
      const L = (await import("leaflet")).default;
      if (!vivo || !ref.current) return;
      mapa = L.map(ref.current, {
        zoomControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        touchZoom: false,
      }).setView([lugar.lat, lugar.lng], 15);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
      }).addTo(mapa);
      // circleMarker y no el marcador clásico: los PNG del icono de Leaflet no
      // sobreviven al bundler y así no hay assets que arreglar.
      L.circleMarker([lugar.lat, lugar.lng], {
        radius: 8,
        color: "#ff5c28",
        fillColor: "#ff5c28",
        fillOpacity: 0.35,
      }).addTo(mapa);
    })();
    return () => {
      vivo = false;
      mapa?.remove();
    };
  }, [lugar.lat, lugar.lng]);
  return <div ref={ref} className="h-36 w-full overflow-hidden rounded-md border border-[var(--border)]" />;
}
