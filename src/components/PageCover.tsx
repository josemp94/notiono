"use client";

import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Upload } from "lucide-react";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB (mismo límite que /api/upload)

/** Presets de gradiente; se guardan como "gradient:<id>". Imágenes: "url:<https…>". */
const GRADIENTS: Record<string, string> = {
  sunset: "linear-gradient(135deg, #ff5c28, #ffb347)",
  ocean: "linear-gradient(135deg, #2193b0, #6dd5ed)",
  berry: "linear-gradient(135deg, #642b73, #c6426e)",
  forest: "linear-gradient(135deg, #134e5e, #71b280)",
  candy: "linear-gradient(135deg, #ff9a9e, #fad0c4)",
  night: "linear-gradient(135deg, #232526, #414345)",
  gold: "linear-gradient(135deg, #f7971e, #ffd200)",
  lavender: "linear-gradient(135deg, #a18cd1, #fbc2eb)",
};

/** Separa una portada "url:<src>|y=<0-100>" en imagen y desplazamiento vertical. */
export function coverParts(cover: string): { src: string; y: number } | null {
  if (!cover.startsWith("url:")) return null;
  const raw = cover.slice(4);
  const m = raw.match(/^(.*)\|y=(\d{1,3})$/);
  return m ? { src: m[1], y: Math.min(100, Number(m[2])) } : { src: raw, y: 50 };
}

export function coverStyle(cover: string): React.CSSProperties {
  const img = coverParts(cover);
  if (img) {
    return {
      backgroundImage: `url(${img.src})`,
      backgroundSize: "cover",
      backgroundPosition: `center ${img.y}%`,
    };
  }
  return { background: GRADIENTS[cover.replace(/^gradient:/, "")] ?? GRADIENTS.sunset };
}

function CoverPicker({
  onPick,
  onClose,
  align,
}: {
  onPick: (cover: string) => void;
  onClose: () => void;
  align: "left" | "right";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("El archivo debe ser una imagen.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("La imagen no puede superar los 8 MB.");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload?kind=image", { method: "POST", body: fd });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "No se pudo subir la imagen.");
      onPick(`url:${data.url}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir la imagen.");
    } finally {
      setUploading(false);
    }
  }

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);

  return (
    <div
      ref={ref}
      data-menu=""
      className={`absolute top-full z-30 mt-1 w-72 rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 shadow-xl ${
        align === "right" ? "right-0" : "left-0"
      }`}
    >
      <div className="mb-2 text-xs font-medium text-[var(--muted)]">Gradientes</div>
      <div className="grid grid-cols-4 gap-2">
        {Object.entries(GRADIENTS).map(([id, css]) => (
          <button
            key={id}
            onClick={() => onPick(`gradient:${id}`)}
            title={id}
            className="h-10 rounded-md border border-[var(--border)] transition-transform hover:scale-105"
            style={{ background: css }}
          />
        ))}
      </div>
      <div className="mt-3 border-t border-[var(--border)] pt-2">
        <div className="mb-1 text-xs font-medium text-[var(--muted)]">Subir imagen</div>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-[var(--border)] px-2 py-1.5 text-sm text-[var(--muted)] hover:border-brand hover:text-[var(--foreground)] disabled:opacity-50"
        >
          <Upload size={14} /> {uploading ? "Subiendo…" : "Elegir archivo (máx. 8 MB)"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = ""; // permite reelegir el mismo archivo
            if (f) upload(f);
          }}
        />
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      </div>
      <div className="mt-3 border-t border-[var(--border)] pt-2">
        <div className="mb-1 text-xs font-medium text-[var(--muted)]">Imagen por URL</div>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && url.trim()) onPick(`url:${url.trim()}`);
          }}
          placeholder="https://… y Enter"
          className="w-full rounded-md border border-[var(--border)] bg-transparent px-2 py-1 text-sm outline-none focus:border-brand"
        />
      </div>
    </div>
  );
}

/** Banda de portada (ancho completo) con acciones al pasar el ratón. */
export function CoverBand({
  cover,
  onChange,
  editable,
}: {
  cover: string;
  onChange: (cover: string | null) => void;
  editable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const img = coverParts(cover);
  // Modo «Reposicionar» (solo imágenes): null = normal; número = y provisional.
  const [reponiendo, setReponiendo] = useState<number | null>(null);
  const y = reponiendo ?? img?.y ?? 50;

  // Arrastre vertical: la imagen sigue al cursor (como Notion). El listener va
  // en window para no perder el arrastre al salir de la banda.
  const arrastrar = (e: React.PointerEvent) => {
    if (reponiendo === null) return;
    e.preventDefault();
    const alto = (e.currentTarget as HTMLElement).clientHeight || 160;
    const y0 = y;
    const py0 = e.clientY;
    const move = (ev: PointerEvent) =>
      setReponiendo(Math.max(0, Math.min(100, Math.round(y0 - ((ev.clientY - py0) / alto) * 100))));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      className={`group/cover relative h-40 w-full ${reponiendo !== null ? "cursor-grab touch-none select-none" : ""}`}
      style={coverStyle(reponiendo !== null && img ? `url:${img.src}|y=${y}` : cover)}
      onPointerDown={arrastrar}
    >
      {reponiendo !== null && (
        <span className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-md bg-black/50 px-2 py-1 text-xs text-white">
          Arrastra la imagen para recolocarla
        </span>
      )}
      {editable && (
        <div
          // .al-pasar (salvo abierto): con opacity-0 a pelo, en táctil los
          // botones de la portada eran invisibles.
          className={`absolute bottom-2 right-4 flex gap-1 ${open || reponiendo !== null ? "" : "al-pasar"}`}
        >
          {reponiendo !== null ? (
            <>
              <button
                onClick={() => {
                  onChange(`url:${img!.src}|y=${y}`);
                  setReponiendo(null);
                }}
                className="rounded-md bg-black/40 px-2 py-1 text-xs text-white hover:bg-black/60"
              >
                Guardar posición
              </button>
              <button
                onClick={() => setReponiendo(null)}
                className="rounded-md bg-black/40 px-2 py-1 text-xs text-white hover:bg-black/60"
              >
                Cancelar
              </button>
            </>
          ) : (
            <>
              {img && (
                <button
                  onClick={() => setReponiendo(img.y)}
                  className="rounded-md bg-black/40 px-2 py-1 text-xs text-white hover:bg-black/60"
                >
                  Reposicionar
                </button>
              )}
              <div className="relative">
                <button
                  onClick={() => setOpen((o) => !o)}
                  className="rounded-md bg-black/40 px-2 py-1 text-xs text-white hover:bg-black/60"
                >
                  Cambiar portada
                </button>
                {open && (
                  <CoverPicker
                    align="right"
                    onPick={(c) => {
                      onChange(c);
                      setOpen(false);
                    }}
                    onClose={() => setOpen(false)}
                  />
                )}
              </div>
              <button
                onClick={() => onChange(null)}
                className="rounded-md bg-black/40 px-2 py-1 text-xs text-white hover:bg-black/60"
              >
                Quitar
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Botón "Añadir portada" para la cabecera (visible al pasar el ratón, como "Añadir icono"). */
export function AddCoverButton({ onChange }: { onChange: (cover: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        // .al-pasar (salvo abierto): en táctil no hay hover y no se veía.
        className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)] ${
          open ? "" : "al-pasar"
        }`}
      >
        <ImageIcon size={16} /> Añadir portada
      </button>
      {open && (
        <CoverPicker
          align="left"
          onPick={(c) => {
            onChange(c);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
