import { optionsOf, type FieldLite } from "@/lib/cellText";

/**
 * Tipos de campo que el formulario sabe pedir. Compartido por la vista interna
 * (FormView), el formulario público (/f/<token>) y su endpoint de envío —
 * sin "use client" ni tRPC para poder importarlo también desde el servidor.
 */
export const FORM_SUPPORTED = ["text", "number", "select", "status", "date", "checkbox", "url", "email", "phone"];

export function FieldInput({ field, value, onChange }: { field: FieldLite; value: unknown; onChange: (v: unknown) => void }) {
  const base = "w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand";
  if (field.type === "checkbox") {
    return (
      <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[var(--color-brand)]" />
    );
  }
  if (field.type === "select" || field.type === "status") {
    return (
      <select value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} className={base}>
        <option value="">—</option>
        {optionsOf(field).map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
    );
  }
  const type =
    field.type === "date" ? "date"
    : field.type === "number" ? "number"
    : field.type === "url" ? "url"
    : field.type === "email" ? "email"
    : field.type === "phone" ? "tel"
    : "text";
  return <input type={type} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} className={base} />;
}
