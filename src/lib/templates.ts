// Galería de plantillas (✨). Datos puros: los importa el endpoint (servidor) y la galería (cliente).
// En las bases de datos, vistas y registros referencian campos por nombre; el endpoint los resuelve a ids.

export type TemplateDef =
  | { type: "doc"; content: unknown[] }
  | {
      type: "database";
      fields: { name: string; type: string; config?: unknown }[];
      views: {
        name: string;
        type: string;
        groupByField?: string;
        calcs?: Record<string, string>;
        /** Orden de la vista, por nombre de campo. */
        sorts?: { field: string; dir: "asc" | "desc" }[];
        /** Matriz: campos de cada eje y rótulo/color por celda ("x|y" con los valores de los ejes). */
        ejeX?: string;
        ejeY?: string;
        celdas?: Record<string, { rotulo?: string; color?: string }>;
      }[];
      records: Record<string, unknown>[];
    };

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

const h2 = (text: string) => ({ type: "heading", props: { level: 2 }, content: text });
const p = (text = "") => ({ type: "paragraph", content: text });
const bullet = (text = "") => ({ type: "bulletListItem", content: text });
const numbered = (text = "") => ({ type: "numberedListItem", content: text });
const check = (text = "") => ({ type: "checkListItem", content: text });

export const TEMPLATES: Record<string, { name: string; icon: string; description: string; make: () => TemplateDef }> = {
  eisenhower: {
    name: "Matriz de Eisenhower",
    icon: "🎯",
    description: "Urgente × Importante: Hacer, Planificar, Delegar y Eliminar. Las tareas se colocan solas.",
    make: () => ({
      type: "database",
      fields: [
        { name: "Título", type: "text" },
        { name: "Urgente", type: "checkbox" },
        { name: "Importante", type: "checkbox" },
        { name: "Fecha", type: "date" },
        {
          name: "Estado",
          type: "status",
          config: {
            options: [
              { id: "st_todo", label: "Sin empezar", color: "gray", group: "todo" },
              { id: "st_doing", label: "En curso", color: "blue", group: "doing" },
              { id: "st_done", label: "Hecho", color: "green", group: "done" },
            ],
          },
        },
      ],
      views: [
        {
          name: "Matriz",
          type: "matrix",
          ejeX: "Urgente",
          ejeY: "Importante",
          // Hacer arriba a la izquierda: urgente e importante.
          celdas: {
            "true|true": { rotulo: "Hacer", color: "red" },
            "|true": { rotulo: "Planificar", color: "blue" },
            "true|": { rotulo: "Delegar", color: "orange" },
            "|": { rotulo: "Eliminar", color: "gray" },
          },
        },
        { name: "Tabla", type: "table" },
      ],
      records: [
        { Título: "Presentar la declaración de la renta", Urgente: true, Importante: true, Fecha: inDays(2), Estado: "st_doing" },
        { Título: "Llamar al fontanero por la fuga", Urgente: true, Importante: true, Fecha: inDays(0), Estado: "st_todo" },
        { Título: "Planificar las vacaciones de verano", Urgente: false, Importante: true, Fecha: inDays(30), Estado: "st_todo" },
        { Título: "Revisar el seguro del coche", Urgente: false, Importante: true, Fecha: inDays(20), Estado: "st_todo" },
        { Título: "Contestar los correos del cole", Urgente: true, Importante: false, Fecha: inDays(1), Estado: "st_todo" },
        { Título: "Reservar mesa para la cena del sábado", Urgente: true, Importante: false, Fecha: inDays(3), Estado: "st_todo" },
        { Título: "Ordenar las fotos del móvil", Urgente: false, Importante: false, Estado: "st_todo" },
        { Título: "Mirar ofertas de televisores", Urgente: false, Importante: false, Estado: "st_todo" },
      ],
    }),
  },

  tareas: {
    name: "Tareas",
    icon: "✅",
    description: "Estado, prioridad y fecha límite. Vistas Tabla y Kanban.",
    make: () => ({
      type: "database",
      fields: [
        { name: "Nombre", type: "text" },
        {
          name: "Estado",
          type: "status",
          config: {
            options: [
              { id: "st_todo", label: "Sin empezar", color: "gray", group: "todo" },
              { id: "st_doing", label: "En curso", color: "blue", group: "doing" },
              { id: "st_done", label: "Hecho", color: "green", group: "done" },
            ],
          },
        },
        {
          name: "Prioridad",
          type: "select",
          config: {
            options: [
              { id: "alta", label: "Alta", color: "red" },
              { id: "media", label: "Media", color: "yellow" },
              { id: "baja", label: "Baja", color: "gray" },
            ],
          },
        },
        { name: "Fecha límite", type: "date" },
      ],
      views: [
        { name: "Tabla", type: "table" },
        { name: "Kanban", type: "kanban", groupByField: "Estado" },
      ],
      records: [
        { Nombre: "Preparar la propuesta", Estado: "st_doing", Prioridad: "alta", "Fecha límite": inDays(3) },
        { Nombre: "Revisar el presupuesto", Estado: "st_todo", Prioridad: "media", "Fecha límite": inDays(7) },
        { Nombre: "Enviar el informe semanal", Estado: "st_done", Prioridad: "baja", "Fecha límite": inDays(-1) },
      ],
    }),
  },

  // Como la plantilla «Docs» de Notion (notion.com/help/guides/documents-database-for-product-teams):
  // las etiquetas son una propiedad Selección múltiple, con la fecha de creación y de última
  // edición, una vista con todo, otra agrupada por etiqueta y otra con lo editado hace poco.
  notas: {
    name: "Notas",
    icon: "🗒️",
    description: "Notas con etiquetas. Vistas Todas, Por etiqueta y Recientes.",
    make: () => ({
      type: "database",
      fields: [
        { name: "Nombre", type: "text" },
        {
          name: "Etiquetas",
          type: "multiselect",
          config: {
            options: [
              { id: "ideas", label: "Ideas", color: "yellow" },
              { id: "personal", label: "Personal", color: "blue" },
              { id: "recetas", label: "Recetas", color: "green" },
              { id: "trabajo", label: "Trabajo", color: "purple" },
            ],
          },
        },
        { name: "Creado", type: "created_time" },
        { name: "Última edición", type: "last_edited_time" },
      ],
      views: [
        { name: "Todas las notas", type: "table" },
        { name: "Por etiqueta", type: "list", groupByField: "Etiquetas" },
        { name: "Recientes", type: "list", sorts: [{ field: "Última edición", dir: "desc" }] },
      ],
      records: [
        { Nombre: "Ideas para el viaje", Etiquetas: ["ideas", "personal"] },
        { Nombre: "Lentejas de la abuela", Etiquetas: ["recetas"] },
        { Nombre: "Resumen de la reunión", Etiquetas: ["trabajo"] },
      ],
    }),
  },

  "notas-reunion": {
    name: "Notas de reunión",
    icon: "📝",
    description: "Acta con asistentes, orden del día, acuerdos y tareas.",
    make: () => ({
      type: "doc",
      content: [
        h2("🧑‍🤝‍🧑 Asistentes"),
        bullet(),
        h2("📋 Orden del día"),
        numbered(),
        h2("🤝 Acuerdos"),
        bullet(),
        h2("📌 Tareas"),
        check(),
      ],
    }),
  },

  crm: {
    name: "CRM de contactos",
    icon: "🤝",
    description: "Contactos con empresa, email, teléfono y estado del trato.",
    make: () => ({
      type: "database",
      fields: [
        { name: "Nombre", type: "text" },
        { name: "Empresa", type: "text" },
        { name: "Email", type: "email" },
        { name: "Teléfono", type: "phone" },
        {
          name: "Estado",
          type: "select",
          config: {
            options: [
              { id: "lead", label: "Lead", color: "blue" },
              { id: "cliente", label: "Cliente", color: "green" },
              { id: "perdido", label: "Perdido", color: "red" },
            ],
          },
        },
      ],
      views: [{ name: "Tabla", type: "table" }],
      records: [
        { Nombre: "Ana García", Empresa: "Acme S.L.", Email: "ana@acme.es", Teléfono: "600 111 222", Estado: "lead" },
        { Nombre: "Luis Pérez", Empresa: "Globex", Email: "luis@globex.es", Teléfono: "600 333 444", Estado: "cliente" },
      ],
    }),
  },

  presupuesto: {
    name: "Presupuesto",
    icon: "💶",
    description: "Gastos con categoría, importe y fecha. Suma total en la tabla.",
    make: () => ({
      type: "database",
      fields: [
        { name: "Concepto", type: "text" },
        {
          name: "Categoría",
          type: "select",
          config: {
            options: [
              { id: "hogar", label: "Hogar", color: "orange" },
              { id: "comida", label: "Comida", color: "green" },
              { id: "transporte", label: "Transporte", color: "blue" },
              { id: "ocio", label: "Ocio", color: "yellow" },
            ],
          },
        },
        { name: "Importe", type: "number" },
        { name: "Fecha", type: "date" },
      ],
      views: [{ name: "Tabla", type: "table", calcs: { Importe: "sum" } }],
      records: [
        { Concepto: "Alquiler", Categoría: "hogar", Importe: 850, Fecha: inDays(-2) },
        { Concepto: "Compra semanal", Categoría: "comida", Importe: 92.5, Fecha: inDays(-1) },
        { Concepto: "Abono transporte", Categoría: "transporte", Importe: 21.8, Fecha: inDays(0) },
      ],
    }),
  },

  diario: {
    name: "Diario",
    icon: "📔",
    description: "Página para escribir cada día: gratitud, notas y objetivos.",
    make: () => ({
      type: "doc",
      content: [
        h2("🌅 Hoy"),
        p(),
        h2("🙏 Tres cosas que agradezco"),
        bullet(),
        bullet(),
        bullet(),
        h2("🎯 Objetivo del día"),
        check(),
      ],
    }),
  },

  wiki: {
    name: "Wiki de equipo",
    icon: "📚",
    description: "Punto de partida para documentar procesos y enlaces.",
    make: () => ({
      type: "doc",
      content: [
        h2("👋 Sobre este espacio"),
        p("Qué encontrarás aquí y a quién preguntar."),
        h2("🔗 Enlaces útiles"),
        bullet(),
        h2("⚙️ Procesos"),
        bullet(),
        h2("❓ Preguntas frecuentes"),
        p(),
      ],
    }),
  },
};
