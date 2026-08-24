"use client";

import { useState } from "react";
import { trpc } from "@/trpc/react";
import { RichText } from "@/lib/mdInline";
import { RecordPanel } from "./RecordPanel";
import { usePeople } from "./Cell";
import { displayValue, groupBy, rowColor, type Attachment, type FieldLite } from "@/lib/cellText";
import { colorByRules, type ColorRule, type DbField, type DbRecord } from "@/lib/viewData";

type Rec = { id: string; cells: Record<string, unknown>; order: string };

const SIZES: Record<string, { grid: string; card: string; title: string; img: string }> = {
  small: { grid: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6", card: "p-3 text-xs", title: "text-sm", img: "h-24" },
  medium: { grid: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4", card: "p-4 text-sm", title: "", img: "h-32" },
  large: { grid: "grid-cols-1 lg:grid-cols-2 xl:grid-cols-3", card: "p-5 text-sm", title: "text-lg", img: "h-44" },
};

export function GalleryView({
  pageId,
  collectionId,
  fields,
  records,
  cardSize,
  cardPreview,
  colorFieldId,
  groupByFieldId,
  colorRules,
  imageFit,
  openIn = "center",
  openFull,
}: {
  pageId: string;
  collectionId: string;
  fields: FieldLite[];
  records: Rec[];
  cardSize?: string;
  cardPreview?: string;
  colorFieldId?: string;
  groupByFieldId?: string;
  colorRules?: ColorRule[];
  /** Ajuste de la imagen de la vista previa: recortar (cover) o entera (contain). */
  imageFit?: string;
  /** Cómo abrir la ficha (lateral/centrado/página completa). */
  openIn?: "side" | "center" | "full";
  openFull?: (recId: string) => void;
}) {
  const utils = trpc.useUtils();
  const invalidate = () => utils.db.get.invalidate({ pageId });
  const addRecord = trpc.db.addRecord.useMutation({ onSuccess: invalidate });
  const [openRec, setOpenRec] = useState<Rec | null>(null);
  const abrir = (r: Rec) => (openIn === "full" ? openFull?.(r.id) : setOpenRec(r));
  const people = usePeople();
  const colorField = fields.find((f) => f.id === colorFieldId);
  const groupField = fields.find((f) => f.id === groupByFieldId);
  const colorOf = (r: Rec) =>
    colorByRules(r as unknown as DbRecord, fields as unknown as DbField[], colorRules) ?? rowColor(colorField, r.cells);

  const titleField = fields.find((f) => f.type === "text") ?? fields[0];
  const size = SIZES[cardSize ?? "medium"] ?? SIZES.medium;
  const previewField = cardPreview && cardPreview !== "none" ? fields.find((f) => f.id === cardPreview) : undefined;
  const propFields = fields.filter((f) => f.id !== titleField?.id && f.id !== previewField?.id);

  const recTitle = (r: Rec) => {
    const t = titleField ? r.cells?.[titleField.id] : "";
    return (typeof t === "string" && t) || "Sin título";
  };

  const groups = groupField ? groupBy(records, groupField, people) : [{ key: "", label: "", records }];

  return (
    <div className="space-y-5">
      {groups.map((g) => (
      <div key={g.key}>
      {groupField && (
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          {g.label}
          <span className="text-xs font-normal text-[var(--muted)]">{g.records.length}</span>
        </div>
      )}
      <div className={`grid gap-3 ${size.grid}`}>
        {g.records.map((r) => (
          <button
            key={r.id}
            onClick={() => abrir(r)}
            style={{ background: colorOf(r) }}
            className={`flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--background)] ${size.card} text-left shadow-sm transition hover:border-brand hover:shadow-md`}
          >
            <div className={`font-display truncate font-semibold ${size.title}`}><RichText texto={recTitle(r)} /></div>
            {previewField && (() => {
              const v = r.cells?.[previewField.id];
              // Un campo de Archivos con imagen se enseña como imagen, no como su nombre.
              const files = previewField.type === "files" && Array.isArray(v) ? (v as Attachment[]) : [];
              const img = files.find((x) => x.mime?.startsWith("image/"));
              if (img) {
                return (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={img.url}
                    alt=""
                    className={`${size.img} w-full rounded-md ${
                      imageFit === "contain" ? "bg-[var(--border)]/30 object-contain" : "object-cover"
                    }`}
                  />
                );
              }
              const txt = displayValue(previewField, v, people);
              if (!txt) return null;
              return (
                <div className="line-clamp-4 break-words rounded-md bg-[var(--border)]/30 p-2">{txt}</div>
              );
            })()}
            <div className="space-y-1">
              {propFields.map((f) => {
                const txt = displayValue(f, r.cells?.[f.id], people);
                if (!txt) return null;
                return (
                  <div key={f.id} className="flex gap-2 text-xs">
                    <span className="shrink-0 text-[var(--muted)]">{f.name}:</span>
                    <span className="truncate">{txt}</span>
                  </div>
                );
              })}
            </div>
          </button>
        ))}

        {/* El botón de añadir va solo en el último grupo, para no repetirlo por sección. */}
        {g.key === groups.at(-1)?.key && (
          <button
            onClick={() => addRecord.mutate({ collectionId })}
            className="flex min-h-[92px] items-center justify-center rounded-xl border border-dashed border-[var(--border)] text-sm text-[var(--muted)] transition hover:border-brand hover:text-[var(--foreground)]"
          >
            + Nueva tarjeta
          </button>
        )}
      </div>
      </div>
      ))}

      {openRec &&
        (() => {
          // Refrescado desde records: el snapshot del clic se queda obsoleto tras
          // cada edición y las celdas multivalor partirían de la base vieja.
          const fresh = records.find((r) => r.id === openRec.id) ?? openRec;
          return (
            <RecordPanel
              key={fresh.id}
              pageId={pageId}
              collectionId={collectionId}
              record={fresh}
              fields={fields}
              onClose={() => setOpenRec(null)}
              mode={openIn === "center" ? "center" : "side"}
              onExpand={openFull ? () => openFull(fresh.id) : undefined}
            />
          );
        })()}
    </div>
  );
}
