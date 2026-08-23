import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { FORM_SUPPORTED } from "@/components/database/FormFields";
import { PublicForm } from "./PublicForm";

export const dynamic = "force-dynamic";

// Ruta pública (sin sesión): solo expone la vista de formulario cuyo
// config.publicToken coincide. Los campos ocultos en la vista no salen.
export default async function FormularioPublico({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 8) notFound();

  const view = await db.view.findFirst({
    where: { type: "form", config: { path: ["publicToken"], equals: token } },
    include: {
      collection: {
        include: {
          fields: { orderBy: { order: "asc" } },
          page: { select: { title: true, icon: true, archivedAt: true } },
        },
      },
    },
  });
  if (!view || view.collection.page.archivedAt) notFound();

  const cfg = (view.config ?? {}) as { hiddenFields?: string[]; requiredFields?: string[]; thanksMessage?: string };
  const hidden = new Set(cfg.hiddenFields ?? []);
  const fields = view.collection.fields
    .filter((f) => FORM_SUPPORTED.includes(f.type) && !hidden.has(f.id))
    .map((f) => ({ id: f.id, name: f.name, type: f.type, config: f.config }));
  const required = (cfg.requiredFields ?? []).filter((id) => fields.some((f) => f.id === id));

  return (
    <PublicForm
      token={token}
      title={view.collection.page.title || "Formulario"}
      icon={view.collection.page.icon}
      fields={fields}
      required={required}
      thanksMessage={cfg.thanksMessage}
    />
  );
}
