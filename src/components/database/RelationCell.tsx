"use client";

import { useRef, useState } from "react";
import { Check } from "lucide-react";
import { trpc } from "@/trpc/react";
import { Popover } from "./Popover";
import type { FieldLite } from "@/lib/cellText";

/** Editor de un campo de relación: chips de registros vinculados + selector multi. */
export function RelationCell({
  field,
  value,
  onCommit,
}: {
  field: FieldLite;
  value: unknown;
  onCommit: (v: unknown) => void;
}) {
  const cfg = field.config as { targetCollectionId?: string; single?: boolean } | null;
  const targetCollectionId = cfg?.targetCollectionId;
  // Límite 1: elegir un vínculo sustituye al anterior, como en Notion.
  const single = Boolean(cfg?.single);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: options } = trpc.db.relationOptions.useQuery(
    { collectionId: targetCollectionId ?? "" },
    { enabled: !!targetCollectionId },
  );

  const ids = Array.isArray(value) ? (value.filter((x) => typeof x === "string") as string[]) : [];
  const titleOf = (id: string) => options?.find((o) => o.id === id)?.title ?? "…";

  const toggle = (id: string) => {
    if (single) {
      onCommit(ids.includes(id) ? null : [id]);
      setOpen(false);
      return;
    }
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    onCommit(next.length ? next : null);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-[24px] w-full flex-wrap items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-[var(--border)]/30"
      >
        {ids.length === 0 ? (
          <span className="text-[var(--muted)]">+ vincular</span>
        ) : (
          ids.map((id) => (
            <span key={id} className="rounded bg-brand/10 px-1.5 py-0.5 text-xs text-brand">
              {titleOf(id)}
            </span>
          ))
        )}
      </button>
      {/* En portal (Popover): colgado con absolute dentro del td, el overflow-hidden
          de la celda lo recortaba a unas pocas px y no se podía vincular nada. */}
      {open && (
        <Popover onClose={() => setOpen(false)} className="left-0 w-56 p-1" anchorRef={ref}>
          {(options ?? []).length === 0 && (
            <div className="px-2 py-1 text-xs text-[var(--muted)]">La BD destino no tiene registros.</div>
          )}
          {(options ?? []).map((o) => (
            <button
              key={o.id}
              onClick={() => toggle(o.id)}
              className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-brand/10"
            >
              <span className="w-4 shrink-0 text-brand">{ids.includes(o.id) && <Check size={14} />}</span>
              <span className="truncate">{o.title}</span>
            </button>
          ))}
          <button
            onClick={() => setOpen(false)}
            className="mt-1 w-full rounded px-2 py-1 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            Cerrar
          </button>
        </Popover>
      )}
    </div>
  );
}
