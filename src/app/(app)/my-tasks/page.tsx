"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown, ChevronRight, CircleCheck, Database } from "lucide-react";
import { fechaTarea } from "@/lib/cellText";
import { diaLocal, inicioPorDefecto } from "@/lib/inicio";
import { agrupaTareas } from "@/lib/tareas";
import { trpc } from "@/trpc/react";
import { useInicio } from "@/components/AbrirAlIniciar";
import { CirculoTarea, ElegirBdTareas, TareaRapida } from "@/components/inicio/BloquesNuevos";

/**
 * Mis tareas: lo que tengo asignado en cualquier base de datos (y lo de mi BD de tareas),
 * por secciones (Vencidas, Hoy, Mañana, Próximas, Sin fecha y Completadas, plegada), con el
 * filtro «Hoy», añadir rápido y el círculo para marcarla hecha (casilla o estado «Hecho»).
 */
export default function MyTasksPage() {
  const { data: tasks, isLoading } = trpc.db.myTasks.useQuery({ conHechas: true });
  const { datos, guardar } = useInicio();
  const config = datos?.config ?? inicioPorDefecto();
  const [soloHoy, setSoloHoy] = useState(false);
  const [verHechas, setVerHechas] = useState(false);
  const [cambiarBd, setCambiarBd] = useState(false);

  const secciones = agrupaTareas(tasks ?? [], diaLocal(), soloHoy);
  const filtro = (activo: boolean) =>
    `toque-estrecho rounded-md px-2.5 py-1 text-sm ${activo ? "bg-[var(--active)] font-medium" : "text-[var(--muted)] hover:bg-[var(--hover)]"}`;

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-4 flex items-center gap-2">
        <h1 className="font-display flex items-center gap-2 text-2xl font-extrabold">
          <CircleCheck size={22} className="text-brand" /> Mis tareas
        </h1>
      </div>

      <div className="mb-4 rounded-lg border border-[var(--border)] p-3">
        {cambiarBd ? (
          <ElegirBdTareas config={config} guardar={(c) => (guardar(c), setCambiarBd(false))} />
        ) : (
          <TareaRapida config={config} guardar={guardar} />
        )}
        {config.tareas && !cambiarBd && (
          <button onClick={() => setCambiarBd(true)} className="mt-1 text-xs text-[var(--muted)] hover:text-[var(--foreground)]">
            Cambiar dónde van
          </button>
        )}
      </div>

      <div className="mb-4 flex gap-1" role="tablist">
        <button role="tab" aria-selected={!soloHoy} onClick={() => setSoloHoy(false)} className={filtro(!soloHoy)}>
          Todas
        </button>
        <button role="tab" aria-selected={soloHoy} onClick={() => setSoloHoy(true)} className={filtro(soloHoy)}>
          Hoy
        </button>
      </div>

      {isLoading && <p className="text-[var(--muted)]">Cargando…</p>}
      {!isLoading && !secciones.length && (
        <p className="rounded-lg border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--muted)]">
          {soloHoy
            ? "Nada para hoy ni vencido."
            : "No tienes nada asignado. Añade una tarea arriba o ponte en un campo Persona de una base de datos."}
        </p>
      )}

      {secciones.map((s) => {
        const plegada = s.id === "completadas" && !verHechas;
        return (
          <section key={s.id} className="mb-6">
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-[var(--muted)]">
              {s.id === "completadas" ? (
                <button onClick={() => setVerHechas((v) => !v)} className="flex items-center gap-1 hover:text-[var(--foreground)]">
                  {plegada ? <ChevronRight size={15} /> : <ChevronDown size={15} />} {s.titulo}
                </button>
              ) : (
                <span className={s.id === "vencidas" ? "text-red-500" : ""}>{s.titulo}</span>
              )}
              <span className="text-xs font-normal">{s.tareas.length}</span>
            </h2>
            {!plegada && (
              <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
                {s.tareas.map((t) => (
                  <li key={t.recordId} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <CirculoTarea hecha={t.hecha} marca={t.marca} recordId={t.recordId} pageId={t.pageId} />
                    <Link href={`/p/${t.pageId}?r=${t.recordId}`} className="flex min-w-0 flex-1 items-center gap-3 hover:underline">
                      <span className={`min-w-0 flex-1 truncate ${t.hecha ? "text-[var(--muted)] line-through" : ""}`}>{t.title || "Sin título"}</span>
                      <span className="hidden shrink-0 items-center gap-1 text-xs text-[var(--muted)] sm:flex">
                        <Database size={12} /> {t.dbTitle || "BD"}
                      </span>
                      {t.date && (
                        <span className={`shrink-0 text-xs ${s.id === "vencidas" ? "font-medium text-red-500" : "text-[var(--muted)]"}`}>
                          {fechaTarea(t.date)}
                        </span>
                      )}
                      {t.status && <span className="shrink-0 rounded bg-[var(--border)]/50 px-1.5 py-0.5 text-xs">{t.status}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
