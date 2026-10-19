"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Apple, Clock, Flag, Heart, ImagePlus, Lightbulb, Plane, Search, Shuffle, Smile, SmilePlus, Trees, Trophy,
} from "lucide-react";
import type { EmojiMartData } from "@emoji-mart/data";
import { COLORES_ICONO, ICONOS, colorIcono, esIconoLucide, iconoLucide, leeIcono } from "./iconosPagina";
import { alternativas, casa, puntua, sinTildes } from "./emojisBusqueda";

/** Los de siempre: se ven al instante mientras cargan los ~1.800 del catálogo. */
const COMMON = [
  "📄","📝","📌","✅","📆","💡","🔥","⭐","🎯","🚀","📊","📈","💰","🏦","🧾","🛒",
  "🏠","🍔","✈️","🎓","💼","🔧","🎨","🎵","📚","❤️","🧡","🌟","⚡","🌈","🐢","🧠",
];

/** ¿El icono es una imagen subida (URL) en vez de un emoji? */
export const esIconoImagen = (icon?: string | null): boolean =>
  !!icon && (icon.startsWith("/") || /^https?:\/\//i.test(icon));

/** El icono para contextos de SOLO texto (notificaciones…): el emoji seguido de
 *  espacio, o nada si es una imagen o un icono dibujado (como texto no pintan nada). */
export const emojiIcono = (icon?: string | null): string =>
  icon && !esIconoImagen(icon) && !esIconoLucide(icon) ? `${icon} ` : "";

/**
 * Icono de página en cualquier lista (árbol, migas, buscador…): el emoji tal
 * cual, la imagen subida o el icono de color, a su tamaño. `fallback` para
 * cuando no hay icono.
 */
export function IconoPagina({
  icon,
  size = 16,
  fallback = null,
}: {
  icon?: string | null;
  size?: number;
  fallback?: React.ReactNode;
}) {
  if (!icon) return <>{fallback}</>;
  if (esIconoImagen(icon)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={icon}
        alt=""
        style={{ width: size, height: size }}
        className="inline-block shrink-0 rounded-sm object-cover align-[-2px]"
      />
    );
  }
  if (esIconoLucide(icon)) {
    const ico = leeIcono(icon);
    if (!ico) return <>{fallback}</>;
    return (
      <ico.C
        size={size}
        strokeWidth={size >= 32 ? 1.75 : 2}
        style={{ color: colorIcono(ico.color) }}
        className="inline-block shrink-0 align-[-2px]"
      />
    );
  }
  return <>{icon}</>;
}

type Pestana = "emojis" | "iconos" | "subir";

const CATEGORIAS: [string, string, typeof Smile][] = [
  ["people", "Emoticonos y personas", Smile],
  ["nature", "Animales y naturaleza", Trees],
  ["foods", "Comida y bebida", Apple],
  ["activity", "Actividades", Trophy],
  ["places", "Viajes y lugares", Plane],
  ["objects", "Objetos", Lightbulb],
  ["symbols", "Símbolos", Heart],
  ["flags", "Banderas", Flag],
];

type EmojiItem = { id: string; nativo: string; texto: string };
type Catalogo = { cats: { id: string; emojis: EmojiItem[] }[]; todos: EmojiItem[] };

// El catálogo (~430 KB) se baja una vez, al abrir el selector por primera vez.
let catalogo: Promise<Catalogo> | null = null;
function cargaCatalogo(): Promise<Catalogo> {
  catalogo ??= import("@emoji-mart/data").then((m) => {
    const d = (m.default ?? m) as unknown as EmojiMartData;
    const todos: EmojiItem[] = [];
    const cats = d.categories.map((c) => ({
      id: c.id,
      emojis: c.emojis.flatMap((id) => {
        const e = d.emojis[id];
        // Los de Emoji 15 aún salen como cuadraditos en muchos móviles y PCs.
        if (!e || e.version > 14) return [];
        const item = { id: e.id, nativo: e.skins[0].native, texto: sinTildes(`${e.id} ${e.name} ${e.keywords.join(" ")}`) };
        todos.push(item);
        return [item];
      }),
    }));
    return { cats, todos };
  });
  return catalogo;
}

const leeLista = (k: string): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(k) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
};
const apuntaReciente = (k: string, v: string) => {
  try {
    localStorage.setItem(k, JSON.stringify([v, ...leeLista(k).filter((x) => x !== v)].slice(0, 18)));
  } catch {}
};
const RECIENTES_EMOJI = "notiono:emojis-recientes";
const RECIENTES_ICONO = "notiono:iconos-recientes";
const COLOR_ICONO = "notiono:icono-color";

const azar = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];

/**
 * Selector de icono como el de Notion: pestañas Emojis (catálogo completo con
 * buscador en castellano), Iconos (dibujos en 9 colores) y Subir (imagen propia
 * o enlace). El valor sigue siendo un string: emoji, URL o «icono:nombre:color».
 */
export function SelectorIcono({
  icon,
  elegir,
}: {
  icon: string | null;
  elegir: (v: string | null, seguirAbierto?: boolean) => void;
}) {
  const [pestana, setPestana] = useState<Pestana>(
    esIconoLucide(icon) ? "iconos" : esIconoImagen(icon) ? "subir" : "emojis",
  );
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<Catalogo | null>(null);
  const [color, setColor] = useState(() => {
    const actual = icon && esIconoLucide(icon) ? leeIcono(icon)?.color : null;
    if (actual) return actual;
    try {
      return localStorage.getItem(COLOR_ICONO) || "gray";
    } catch {
      return "gray";
    }
  });
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const buscaRef = useRef<HTMLInputElement>(null);
  const recientesEmoji = useMemo(() => leeLista(RECIENTES_EMOJI), []);
  const recientesIcono = useMemo(() => leeLista(RECIENTES_ICONO), []);

  useEffect(() => {
    let vivo = true;
    cargaCatalogo().then((c) => vivo && setCat(c), () => {});
    return () => {
      vivo = false;
    };
  }, []);

  // Con ratón, el cursor directo al buscador; en táctil no (sacaría el teclado).
  useEffect(() => {
    setQ("");
    scrollRef.current?.scrollTo({ top: 0 });
    if (pestana !== "subir" && window.matchMedia("(pointer: fine)").matches) buscaRef.current?.focus();
  }, [pestana]);

  const emoji = (e: string) => {
    apuntaReciente(RECIENTES_EMOJI, e);
    elegir(e);
  };
  const dibujo = (nombre: string, c = color, seguirAbierto = false) => {
    apuntaReciente(RECIENTES_ICONO, nombre);
    try {
      localStorage.setItem(COLOR_ICONO, c);
    } catch {}
    elegir(iconoLucide(nombre, c), seguirAbierto);
  };

  const alts = useMemo(() => (q.trim() ? alternativas(q) : null), [q]);
  const emojisFiltrados = useMemo(
    () =>
      alts && cat
        ? cat.todos
            .filter((e) => casa(e.texto, alts))
            .map((e) => [puntua(e.id, alts), e] as const)
            .sort((a, b) => a[0] - b[0])
            .map(([, e]) => e)
        : [],
    [alts, cat],
  );
  const iconosFiltrados = useMemo(
    () =>
      alts
        ? ICONOS.filter(([n, , kw]) => casa(sinTildes(`${n} ${kw}`), alts))
            .map((it) => [puntua(`${it[0]}-${sinTildes(it[2]).replace(/ /g, "-")}`, alts), it] as const)
            .sort((a, b) => a[0] - b[0])
            .map(([, it]) => it)
        : ICONOS,
    [alts],
  );
  const actualIcono = icon && esIconoLucide(icon) ? leeIcono(icon) : null;

  const subir = async (picked: FileList | null | undefined) => {
    const file = picked?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Eso no es una imagen.");
      return;
    }
    setSubiendo(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.url) elegir(data.url);
      else setError(data?.error || "No se pudo subir la imagen.");
    } catch {
      setError("No se pudo subir la imagen.");
    } finally {
      setSubiendo(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const celdaEmoji = (e: string, key: string) => (
    <button
      key={key}
      type="button"
      onClick={() => emoji(e)}
      className="flex aspect-square items-center justify-center rounded-md text-[22px] leading-none hover:bg-[var(--hover)]"
    >
      {e}
    </button>
  );
  const celdaIcono = (n: string, C: (typeof ICONOS)[number][1], kw: string) => (
    <button
      key={n}
      type="button"
      onClick={() => dibujo(n)}
      title={kw.split(" ")[0]}
      className={`flex aspect-square items-center justify-center rounded-md hover:bg-[var(--hover)] ${actualIcono?.nombre === n ? "bg-[var(--hover)]" : ""}`}
    >
      <C size={20} style={{ color: colorIcono(color) }} />
    </button>
  );
  const titulo = (t: string) => (
    <div className="px-1 pb-1 pt-2 text-xs font-medium text-[var(--muted)]">{t}</div>
  );
  const pestanaBtn = (p: Pestana, t: string) => (
    <button
      type="button"
      onClick={() => setPestana(p)}
      className={`-mb-px border-b-2 px-2 pb-1.5 pt-1 text-sm ${pestana === p ? "border-[var(--foreground)] font-medium text-[var(--foreground)]" : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"}`}
    >
      {t}
    </button>
  );

  return (
    <div
      data-menu=""
      role="dialog"
      aria-label="Elegir icono"
      className="absolute left-0 top-full z-30 mt-1 flex w-[22rem] max-w-[calc(100vw-1.5rem)] flex-col rounded-xl border border-[var(--border)] bg-[var(--background)] shadow-xl"
    >
      <div className="flex items-end gap-1 border-b border-[var(--border)] px-2 pt-1">
        {pestanaBtn("emojis", "Emojis")}
        {pestanaBtn("iconos", "Iconos")}
        {pestanaBtn("subir", "Subir")}
        <div className="flex-1" />
        {icon && (
          <button
            type="button"
            onClick={() => elegir(null)}
            className="mb-1 rounded-md px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--hover)] hover:text-red-500"
          >
            Quitar
          </button>
        )}
      </div>

      {pestana !== "subir" && (
        <div className="flex items-center gap-1.5 px-2 pt-2">
          <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-[var(--border)] px-2 focus-within:border-brand">
            <Search size={14} className="shrink-0 text-[var(--muted)]" />
            <input
              ref={buscaRef}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                scrollRef.current?.scrollTo({ top: 0 });
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                if (pestana === "iconos" && iconosFiltrados[0]) dibujo(iconosFiltrados[0][0]);
                else if (pestana === "emojis" && emojisFiltrados[0]) emoji(emojisFiltrados[0].nativo);
              }}
              placeholder={pestana === "iconos" ? "Buscar icono…" : "Buscar emoji…"}
              className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none"
            />
          </label>
          <button
            type="button"
            title="Al azar"
            onClick={() => {
              if (pestana === "iconos") dibujo(azar(ICONOS)[0]);
              else emoji(cat ? azar(cat.todos).nativo : azar(COMMON));
            }}
            className="toque flex size-8 shrink-0 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
          >
            <Shuffle size={15} />
          </button>
        </div>
      )}

      {pestana === "iconos" && (
        <div className="flex items-center gap-1 px-2 pt-2" role="radiogroup" aria-label="Color">
          {COLORES_ICONO.map(([c, nombre]) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              title={nombre}
              onClick={() => {
                setColor(c);
                // Cambiar el color de un icono ya puesto lo aplica sin tener que volver a elegirlo.
                if (actualIcono) dibujo(actualIcono.nombre, c, true);
              }}
              // El aro va en el círculo y no en el botón: en táctil el botón crece
              // (mínimo de toque) y el aro salía ovalado.
              className="group/color flex size-7 items-center justify-center"
            >
              <span
                className={`size-4 rounded-full ${color === c ? "ring-2 ring-[var(--foreground)] ring-offset-2 ring-offset-[var(--background)]" : "group-hover/color:scale-110"}`}
                style={{ background: colorIcono(c) }}
              />
            </button>
          ))}
        </div>
      )}

      {pestana === "subir" ? (
        <div
          className="space-y-2 p-3"
          onPaste={(e) => {
            if (e.clipboardData.files.length) {
              e.preventDefault();
              subir(e.clipboardData.files);
            }
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            subir(e.dataTransfer.files);
          }}
        >
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={subiendo}
            className="flex w-full flex-col items-center gap-1 rounded-lg border border-dashed border-[var(--border)] px-3 py-5 text-sm text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)] disabled:opacity-60"
          >
            <ImagePlus size={22} />
            {subiendo ? "Subiendo…" : "Subir una imagen"}
            <span className="text-xs opacity-70">o arrástrala / pégala aquí · mejor cuadrada</span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => subir(e.target.files)} />
          <input
            defaultValue={esIconoImagen(icon) && icon?.startsWith("http") ? icon : ""}
            onKeyDown={(ev) => {
              if (ev.key !== "Enter") return;
              const v = (ev.target as HTMLInputElement).value.trim();
              if (/^https?:\/\/\S+$/i.test(v)) elegir(v);
              else setError("Pega un enlace que empiece por http.");
            }}
            placeholder="…o pega el enlace de una imagen y pulsa Intro"
            className="w-full rounded-md border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm outline-none focus:border-brand"
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      ) : (
        <div ref={scrollRef} className="h-72 overflow-y-auto overscroll-contain px-2 pb-2">
          {pestana === "emojis" ? (
            alts ? (
              cat ? (
                emojisFiltrados.length ? (
                  <div className="grid grid-cols-9 gap-0.5 pt-2">
                    {emojisFiltrados.slice(0, 300).map((e, i) => celdaEmoji(e.nativo, `${i}${e.nativo}`))}
                  </div>
                ) : (
                  <p className="py-8 text-center text-sm text-[var(--muted)]">Ningún emoji con «{q.trim()}».</p>
                )
              ) : (
                <p className="py-8 text-center text-sm text-[var(--muted)]">Cargando…</p>
              )
            ) : (
              <>
                {recientesEmoji.length > 0 && (
                  <section>
                    {titulo("Recientes")}
                    <div className="grid grid-cols-9 gap-0.5">{recientesEmoji.map((e) => celdaEmoji(e, `r${e}`))}</div>
                  </section>
                )}
                {cat ? (
                  cat.cats.map((c) => {
                    const meta = CATEGORIAS.find(([id]) => id === c.id);
                    return (
                      <section key={c.id} data-cat={c.id} className="[content-visibility:auto]">
                        {titulo(meta?.[1] ?? c.id)}
                        <div className="grid grid-cols-9 gap-0.5">{c.emojis.map((e) => celdaEmoji(e.nativo, e.nativo))}</div>
                      </section>
                    );
                  })
                ) : (
                  <section>
                    {titulo("Habituales")}
                    <div className="grid grid-cols-9 gap-0.5">{COMMON.map((e) => celdaEmoji(e, e))}</div>
                  </section>
                )}
              </>
            )
          ) : (
            <>
              {!alts && recientesIcono.length > 0 && (
                <section>
                  {titulo("Recientes")}
                  <div className="grid grid-cols-9 gap-0.5">
                    {recientesIcono.flatMap((n) => {
                      const it = ICONOS.find(([x]) => x === n);
                      return it ? [celdaIcono(it[0], it[1], it[2])] : [];
                    })}
                  </div>
                </section>
              )}
              {!alts && titulo("Iconos")}
              {iconosFiltrados.length ? (
                <div className={`grid grid-cols-9 gap-0.5 ${alts ? "pt-2" : ""}`}>
                  {iconosFiltrados.map(([n, C, kw]) => celdaIcono(n, C, kw))}
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-[var(--muted)]">Ningún icono con «{q.trim()}».</p>
              )}
            </>
          )}
        </div>
      )}

      {pestana === "emojis" && !alts && cat && (
        <div className="flex items-center justify-between border-t border-[var(--border)] px-2 py-1">
          {recientesEmoji.length > 0 && (
            <button
              type="button"
              title="Recientes"
              onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
              className="flex size-8 items-center justify-center rounded-md text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
            >
              <Clock size={16} />
            </button>
          )}
          {CATEGORIAS.map(([id, nombre, C]) => (
            <button
              key={id}
              type="button"
              title={nombre}
              onClick={() => {
                const sc = scrollRef.current;
                const s = sc?.querySelector<HTMLElement>(`[data-cat="${id}"]`);
                if (sc && s) sc.scrollTo({ top: s.offsetTop - sc.offsetTop, behavior: "smooth" });
              }}
              className="flex size-8 items-center justify-center rounded-md text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
            >
              <C size={16} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function PageIcon({
  icon,
  onChange,
  editable,
}: {
  icon: string | null;
  onChange: (icon: string | null) => void;
  editable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", h);
    document.addEventListener("touchstart", h);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("touchstart", h);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  if (!icon && !editable) return null;

  // Cambiar solo el color deja el selector abierto (para ir probando); elegir
  // cierra, como en Notion.
  const elegir = (v: string | null, seguirAbierto = false) => {
    if (v !== icon) onChange(v);
    if (!seguirAbierto) setOpen(false);
  };

  return (
    <div className="relative inline-block" ref={ref}>
      {icon ? (
        <button
          onClick={() => editable && setOpen((o) => !o)}
          className={`leading-none ${esIconoImagen(icon) || esIconoLucide(icon) ? "" : "text-6xl"} ${editable ? "cursor-pointer rounded-lg p-1 hover:bg-[var(--hover)]" : "cursor-default"}`}
          title={editable ? "Cambiar icono" : undefined}
        >
          {esIconoImagen(icon) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={icon} alt="" className="size-16 rounded-lg object-cover" />
          ) : esIconoLucide(icon) ? (
            <IconoPagina icon={icon} size={64} fallback={<span className="text-6xl">📄</span>} />
          ) : (
            icon
          )}
        </button>
      ) : (
        <button
          onClick={() => setOpen((o) => !o)}
          // .al-pasar y no opacity-0 a pelo: en táctil no hay hover y el botón
          // quedaba invisible (aunque pulsable a ciegas).
          className="al-pasar flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
        >
          <SmilePlus size={16} /> Añadir icono
        </button>
      )}

      {open && <SelectorIcono icon={icon} elegir={elegir} />}
    </div>
  );
}
