"use client";

import Link from "next/link";
import { CircleCheck, Database } from "lucide-react";
import { fechaTarea } from "@/lib/cellText";
import { trpc } from "@/trpc/react";

/** "Mis tareas": todo lo que tengo asignado en cualquier base de datos del espacio. */
export default function MyTasksPage() {
  const { data: tasks, isLoading } = trpc.db.myTasks.useQuery();

  if (isLoading) return <div className="px-6 py-8 text-[var(--muted)]">Cargando…</div>;

  const list = tasks ?? [];
  // Una sección por base de datos, en el orden en que aparecen (ya vienen por edición reciente).
  const byDb = new Map<string, typeof list>();
  for (const t of list) byDb.set(t.pageId, [...(byDb.get(t.pageId) ?? []), t]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="font-display mb-1 flex items-center gap-2 text-2xl font-extrabold">
        <CircleCheck size={22} className="text-brand" /> Mis tareas
      </h1>
      <p className="mb-6 text-sm text-[var(--muted)]">
        Filas de cualquier base de datos en las que alguien te ha asignado con un campo de tipo Persona. Lo
        terminado no sale; lo más urgente, arriba.
      </p>

      {!list.length && (
        <p className="rounded-lg border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--muted)]">
          No tienes nada asignado. Añade un campo de tipo <b>Persona</b> a una base de datos y ponte en una fila.
        </p>
      )}

      {[...byDb.entries()].map(([pageId, items]) => (
        <section key={pageId} className="mb-6">
          <Link
            href={`/p/${pageId}`}
            className="mb-2 flex items-center gap-2 text-sm font-medium hover:text-[var(--foreground)]"
          >
            <span className="flex items-center text-[var(--muted)]">
              {items[0].dbIcon ?? <Database size={15} />}
            </span>
            {items[0].dbTitle || "Base de datos"}
            <span className="text-xs font-normal text-[var(--muted)]">{items.length}</span>
          </Link>
          <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
            {items.map((t) => (
              <li key={t.recordId}>
                <Link
                  href={`/p/${t.pageId}?r=${t.recordId}`}
                  className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-[var(--border)]/20"
                >
                  <span className="min-w-0 flex-1 truncate">{t.title || "Sin título"}</span>
                  {t.date && <span className="shrink-0 text-xs text-[var(--muted)]">{fechaTarea(t.date)}</span>}
                  {t.status && (
                    <span className="shrink-0 rounded bg-[var(--border)]/50 px-1.5 py-0.5 text-xs">{t.status}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
