"use client";

import { useState } from "react";
import { trpc } from "@/trpc/react";
import { IconoPagina } from "@/components/PageIcon";
import { MovePageModal } from "@/components/MovePage";
import type { AbrirAlIniciar as Abrir, ConfigInicio } from "@/lib/inicio";

/** Mi Inicio (src/lib/inicio.ts) y cómo guardarlo: se pinta ya y se guarda detrás. */
export function useInicio() {
  const utils = trpc.useUtils();
  const consulta = trpc.inicio.get.useQuery();
  const m = trpc.inicio.guardar.useMutation({
    // Al guardar vuelve a leer: trae el título e icono de las páginas recién fijadas.
    onSettled: () => utils.inicio.get.invalidate(),
  });
  const guardar = (config: ConfigInicio) => {
    utils.inicio.get.setData(undefined, (d) => (d ? { ...d, config } : d));
    m.mutate(config);
  };
  return { datos: consulta.data, error: consulta.error, guardar, fallo: m.error?.message ?? null };
}

/** «Al abrir Notiono, mostrar»: el Inicio, la última página abierta o una concreta. */
export function AbrirAlIniciar() {
  const { datos, guardar, fallo } = useInicio();
  const [eligiendo, setEligiendo] = useState(false);
  if (!datos) return <p className="text-sm text-[var(--muted)]">Cargando…</p>;
  const { config, paginas } = datos;
  const abrir = config.abrir;
  const pon = (a: Abrir) => guardar({ ...config, abrir: a });
  const pagina = abrir.tipo === "pagina" ? paginas[abrir.pageId] : undefined;

  const opcion = (tipo: Abrir["tipo"], texto: string, alElegir: () => void) => (
    <label className="toque-estrecho flex cursor-pointer items-center gap-2 text-sm">
      <input type="radio" name="abrir-al-iniciar" checked={abrir.tipo === tipo} onChange={alElegir} className="accent-[var(--color-brand)]" />
      {texto}
    </label>
  );

  return (
    <div className="space-y-1">
      {opcion("inicio", "Inicio", () => pon({ tipo: "inicio" }))}
      {opcion("ultima", "La última página que tenía abierta", () => pon({ tipo: "ultima" }))}
      <div className="flex flex-wrap items-center gap-2">
        {opcion("pagina", "Una página:", () => (abrir.tipo === "pagina" ? undefined : setEligiendo(true)))}
        <button
          onClick={() => setEligiendo(true)}
          className="toque-estrecho flex min-w-0 items-center gap-1.5 rounded-md border border-[var(--border)] px-2 py-1 text-sm hover:bg-[var(--hover)]"
        >
          {abrir.tipo === "pagina" ? (
            pagina ? (
              <>
                <IconoPagina icon={pagina.icon} size={14} fallback="📄" />
                <span className="truncate">{pagina.title || "Sin título"}</span>
              </>
            ) : (
              <span className="text-[var(--muted)]">Ya no existe: se abrirá el Inicio</span>
            )
          ) : (
            <span className="text-[var(--muted)]">Elegir…</span>
          )}
        </button>
      </div>
      <p className="text-xs text-[var(--muted)]">Solo al abrir Notiono: pulsar «Inicio» siempre enseña el Inicio.</p>
      {fallo && <p className="text-xs text-red-500">{fallo}</p>}
      {eligiendo && (
        <MovePageModal
          pageId=""
          titulo="Abrir al iniciar"
          onClose={() => setEligiendo(false)}
          onElegir={(pageId) => {
            setEligiendo(false);
            pon({ tipo: "pagina", pageId });
          }}
        />
      )}
    </div>
  );
}
