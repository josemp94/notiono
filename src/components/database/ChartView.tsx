"use client";

import { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import { trpc } from "@/trpc/react";
import type { FieldLite } from "@/lib/cellText";

const BRAND = "#ff5c28";
const PALETTE = ["#ff5c28", "#2d9d78", "#4a5568", "#e2b93b", "#9f7aea", "#38b2ac", "#ed64a6"];

type ChartConfig = {
  chartType?: string;
  xFieldId?: string;
  yFieldId?: string | null;
  agg?: string;
  dateBucket?: string;
  omitZero?: boolean;
  breakdownFieldId?: string | null;
};

const DATE_TYPES = ["date", "created_time", "last_edited_time"];
/** Campos por los que se puede desglosar (2ª dimensión, barras apiladas). */
const BREAKDOWN_TYPES = ["select", "status", "multiselect", "person", "checkbox"];

export function ChartView({
  pageId,
  view,
  fields,
}: {
  pageId: string;
  view: { id: string; config: unknown };
  fields: FieldLite[];
}) {
  const utils = trpc.useUtils();
  const cfg = (view.config ?? {}) as ChartConfig;
  const { data } = trpc.db.chartData.useQuery({ pageId, viewId: view.id });
  const updateView = trpc.db.updateView.useMutation({
    onSuccess: async () => {
      await utils.db.get.invalidate({ pageId });
      await utils.db.chartData.invalidate({ pageId, viewId: view.id });
    },
  });

  const save = (patch: Partial<ChartConfig>) =>
    updateView.mutate({ id: view.id, config: { ...cfg, ...patch } });

  const numberFields = fields.filter((f) => f.type === "number");
  // La "tarta" de antes se trata como donut, que es lo que dibuja Notion.
  const chartType = cfg.chartType === "pie" ? "donut" : (cfg.chartType ?? "bar");

  const option = useMemo(() => {
    if (!data) return {};
    const { categories, values, series, xName, yName } = data;
    if (chartType === "donut") {
      return {
        color: PALETTE,
        tooltip: { trigger: "item" },
        legend: { bottom: 0, type: "scroll" },
        series: [
          {
            type: "pie",
            radius: ["40%", "70%"],
            data: categories.map((c, i) => ({ name: c, value: values[i] })),
          },
        ],
      };
    }
    const horizontal = chartType === "bar_h";
    // Con desglose, una serie apilada por cada valor de la 2ª dimensión.
    const seriesData = series?.length
      ? series.map((sr) => ({
          name: sr.name,
          type: chartType === "line" ? ("line" as const) : ("bar" as const),
          stack: chartType === "line" ? undefined : "total",
          data: sr.values,
          smooth: true,
        }))
      : [
          {
            type: chartType === "line" ? ("line" as const) : ("bar" as const),
            data: values,
            smooth: true,
            areaStyle: chartType === "line" ? {} : undefined,
          },
        ];
    const catAxis = {
      type: "category" as const,
      data: categories,
      name: horizontal ? undefined : xName,
      axisLabel: { rotate: !horizontal && categories.length > 6 ? 30 : 0 },
      // En horizontal, la primera categoría arriba (ECharts las pinta de abajo a arriba).
      inverse: horizontal,
    };
    const valAxis = { type: "value" as const, name: yName };
    return {
      color: series?.length ? PALETTE : [BRAND],
      grid: { left: horizontal ? 110 : 48, right: 20, top: 24, bottom: series?.length ? 56 : 48 },
      tooltip: { trigger: "axis" },
      legend: series?.length ? { bottom: 0, type: "scroll" } : undefined,
      xAxis: horizontal ? valAxis : catAxis,
      yAxis: horizontal ? catAxis : valAxis,
      series: seriesData,
    };
  }, [data, chartType]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <Select
          label="Tipo"
          value={chartType}
          onChange={(v) => save({ chartType: v })}
          options={[
            ["bar", "Barras"],
            ["bar_h", "Barras horizontales"],
            ["line", "Líneas"],
            ["donut", "Anillo"],
            ["number", "Número"],
          ]}
        />
        {chartType !== "number" && (
          <Select
            label="Agrupar por"
            value={cfg.xFieldId ?? ""}
            onChange={(v) => save({ xFieldId: v || undefined })}
            // Con opción vacía: sin ella, con xFieldId null el navegador pintaba
            // el primer campo como elegido aunque la gráfica no lo estaba usando.
            options={[["", "Elegir campo…"], ...fields.map((f) => [f.id, f.name] as [string, string])]}
          />
        )}
        {chartType !== "number" && DATE_TYPES.includes(fields.find((f) => f.id === cfg.xFieldId)?.type ?? "") && (
          <Select
            label="Por"
            value={cfg.dateBucket ?? "month"}
            onChange={(v) => save({ dateBucket: v })}
            options={[
              ["day", "Día"],
              ["week", "Semana"],
              ["month", "Mes"],
              ["quarter", "Trimestre"],
              ["year", "Año"],
            ]}
          />
        )}
        <Select
          label="Medida"
          value={cfg.agg ?? "count"}
          onChange={(v) => save({ agg: v })}
          options={[
            ["count", "Contar"],
            ["sum", "Sumar"],
            ["avg", "Media"],
            ["min", "Mínimo"],
            ["max", "Máximo"],
            ["median", "Mediana"],
          ]}
        />
        {cfg.agg && cfg.agg !== "count" && (
          <Select
            label="Campo"
            value={cfg.yFieldId ?? ""}
            onChange={(v) => save({ yFieldId: v || null })}
            options={[["", "Elegir campo…"], ...numberFields.map((f) => [f.id, f.name] as [string, string])]}
          />
        )}
        {["bar", "bar_h", "line"].includes(chartType) && (
          <Select
            label="Desglosar por"
            value={cfg.breakdownFieldId ?? ""}
            onChange={(v) => save({ breakdownFieldId: v || null })}
            options={[
              ["", "Sin desglose"],
              ...fields
                .filter((f) => BREAKDOWN_TYPES.includes(f.type) && f.id !== cfg.xFieldId)
                .map((f) => [f.id, f.name] as [string, string]),
            ]}
          />
        )}
        {chartType !== "number" && (
          <label className="flex items-center gap-1 text-[var(--muted)]">
            <input
              type="checkbox"
              checked={!!cfg.omitZero}
              onChange={(e) => save({ omitZero: e.target.checked })}
              className="size-3.5 accent-[var(--color-brand,#ff5c28)]"
            />
            Omitir ceros
          </label>
        )}
      </div>
      {chartType === "number" ? (
        // KPI: un único valor grande, la agregación sobre todos los registros filtrados.
        <div className="flex h-64 flex-col items-center justify-center">
          <div className="font-display text-6xl font-extrabold">
            {new Intl.NumberFormat("es-ES").format(data?.total ?? 0)}
          </div>
          <div className="mt-2 text-sm text-[var(--muted)]">{data?.yName || "Registros"}</div>
        </div>
      ) : data && data.categories.length > 0 ? (
        <ReactECharts option={option} style={{ height: 420 }} notMerge />
      ) : (
        <p className="py-16 text-center text-[var(--muted)]">No hay datos para graficar.</p>
      )}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="flex items-center gap-1 text-[var(--muted)]">
      {label}:
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[var(--foreground)]"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
