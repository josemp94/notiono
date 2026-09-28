"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CircleCheck, Clock, Database } from "lucide-react";
import { trpc } from "@/trpc/react";
import { getRecents, RECENTS_EVENT, type Recent } from "@/lib/recents";
import { fechaTarea } from "@/lib/cellText";
import { IconoPagina } from "@/components/PageIcon";

/**
 * Inicio, como el Home de Notion: saludo, lo último visitado y lo que tengo
 * asignado. Antes esta ruta redirigía a la primera página del árbol.
 * ponytail: widgets fijos; ocultar/reordenar (el «personalizable» de Notion)
 * cuando alguien lo eche en falta.
 */
export default function Inicio() {
  const { data: me } = trpc.auth.me.useQuery();
  const { data: tasks } = trpc.db.myTasks.useQuery();

  // localStorage solo existe en el cliente: leerlo en un efecto evita el
  // desajuste de hidratación.
  const [recientes, setRecientes] = useState<Recent[]>([]);
  useEffect(() => {
    const wid = me?.workspace?.id;
    if (!wid) return;
    const leer = () => setRecientes(getRecents(wid));
    leer();
    window.addEventListener(RECENTS_EVENT, leer);
    return () => window.removeEventListener(RECENTS_EVENT, leer);
  }, [me?.workspace?.id]);

  const h = new Date().getHours();
  const saludo = h < 7 ? "Buenas noches" : h < 13 ? "Buenos días" : h < 21 ? "Buenas tardes" : "Buenas noches";
  const nombre = me?.name?.split(" ")[0] ?? "";
  const misTareas = (tasks ?? []).slice(0, 6);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="font-display mb-8 text-center text-2xl font-extrabold md:mb-10 md:text-3xl">
        {saludo}
        {nombre ? `, ${nombre}` : ""}
      </h1>

      {recientes.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-[var(--muted)]">
            <Clock size={15} /> Recientes
          </h2>
          <div className="barra-scroll flex gap-3 overflow-x-auto pb-2">
            {recientes.slice(0, 8).map((r) => (
              <Link
                key={r.pageId}
                href={`/p/${r.pageId}`}
                className="w-36 shrink-0 rounded-lg border border-[var(--border)] p-3 hover:bg-[var(--hover)]"
              >
                <div className="mb-2">
                  <IconoPagina icon={r.icon} size={22} fallback="📄" />
                </div>
                <div className="line-clamp-2 text-sm font-medium">{r.title || "Sin título"}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {misTareas.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-[var(--muted)]">
            <CircleCheck size={15} /> Mis tareas
          </h2>
          <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
            {misTareas.map((t) => (
              <li key={t.recordId}>
                <Link
                  href={`/p/${t.pageId}?r=${t.recordId}`}
                  className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-[var(--border)]/20"
                >
                  <span className="min-w-0 flex-1 truncate">{t.title || "Sin título"}</span>
                  <span className="hidden shrink-0 items-center gap-1 text-xs text-[var(--muted)] sm:flex">
                    <Database size={12} /> {t.dbTitle || "BD"}
                  </span>
                  {t.date && <span className="shrink-0 text-xs text-[var(--muted)]">{fechaTarea(t.date)}</span>}
                  {t.status && (
                    <span className="shrink-0 rounded bg-[var(--border)]/50 px-1.5 py-0.5 text-xs">{t.status}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
          {(tasks?.length ?? 0) > 6 && (
            <Link
              href="/my-tasks"
              className="mt-2 inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              Ver todas <ArrowRight size={14} />
            </Link>
          )}
        </section>
      )}

      {recientes.length === 0 && misTareas.length === 0 && (
        <p className="rounded-lg border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--muted)]">
          Aquí saldrán tus páginas recientes y lo que tengas asignado. Abre una página del panel para empezar.
        </p>
      )}
    </div>
  );
}
