import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createRecord } from "@/server/services/db";
import { FORM_SUPPORTED } from "@/components/database/FormFields";
import { optionsOf, type FieldLite } from "@/lib/cellText";

/**
 * Envío del formulario público (/f/<token>). Sin sesión: el token ES la
 * autorización. Solo acepta los campos visibles del formulario y valida cada
 * valor por tipo; lo demás se ignora sin error (un cliente raro no puede
 * escribir en campos ocultos ni meter objetos en una celda de texto).
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 8) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const view = await db.view.findFirst({
    where: { type: "form", config: { path: ["publicToken"], equals: token } },
    include: {
      collection: {
        include: {
          fields: true,
          page: { select: { workspaceId: true, archivedAt: true } },
        },
      },
    },
  });
  if (!view || view.collection.page.archivedAt) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { cells?: unknown } | null;
  const raw = body?.cells;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const cfg = (view.config ?? {}) as { hiddenFields?: string[]; requiredFields?: string[] };
  const hidden = new Set(cfg.hiddenFields ?? []);
  const visibles = new Map(
    view.collection.fields
      .filter((f) => FORM_SUPPORTED.includes(f.type) && !hidden.has(f.id))
      .map((f) => [f.id, f as unknown as FieldLite]),
  );

  const cells: Record<string, unknown> = {};
  for (const [fieldId, valor] of Object.entries(raw as Record<string, unknown>)) {
    const f = visibles.get(fieldId);
    if (!f) continue;
    const v = limpiaValor(f, valor);
    if (v !== undefined) cells[fieldId] = v;
  }

  // Obligatorios: solo cuentan los visibles (uno oculto no sale en el formulario)
  // y nunca el checkbox («no» es respuesta válida).
  const faltan = (cfg.requiredFields ?? []).filter((id) => {
    const f = visibles.get(id);
    return f && f.type !== "checkbox" && cells[id] === undefined;
  });
  if (faltan.length) {
    return NextResponse.json(
      { error: "required", fields: faltan.map((id) => visibles.get(id)!.name) },
      { status: 400 },
    );
  }

  const scope = { db, workspaceId: view.collection.page.workspaceId, userId: null };
  const rec = await createRecord(scope, { collectionId: view.collectionId, cells });
  return NextResponse.json({ ok: true, id: rec.id });
}

/** Valida y recorta un valor según el tipo del campo; undefined = se descarta. */
function limpiaValor(f: FieldLite, v: unknown): unknown {
  switch (f.type) {
    case "text":
    case "url":
    case "email":
    case "phone":
      return typeof v === "string" && v.trim() ? v.slice(0, 4000) : undefined;
    case "number":
      return typeof v === "number" && Number.isFinite(v) ? v : undefined;
    case "checkbox":
      return typeof v === "boolean" ? v : undefined;
    case "date":
      return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
    case "select":
    case "status":
      return typeof v === "string" && optionsOf(f).some((o) => o.id === v) ? v : undefined;
    default:
      return undefined;
  }
}
