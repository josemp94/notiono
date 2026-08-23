/**
 * Diff de versiones del historial: el snapshot (bloques BlockNote) se aplana a
 * líneas de texto y se comparan dos versiones por LCS. Suficiente para ver qué
 * párrafos entraron y salieron; no intenta diferenciar dentro de una línea.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Texto plano de un snapshot, una línea por bloque (sangría por anidamiento). */
export function lineasDe(content: unknown, depth = 0): string[] {
  if (!Array.isArray(content)) return [];
  const out: string[] = [];
  for (const b of content as any[]) {
    const inline = Array.isArray(b?.content) ? b.content : [];
    const texto = inline.map((i: any) => i?.text ?? i?.props?.name ?? "").join("");
    // Los bloques sin texto propio (imagen, BD embebida…) se representan por su tipo.
    out.push("  ".repeat(depth) + (texto || (b?.type && b.type !== "paragraph" ? `[${b.type}]` : "")));
    if (Array.isArray(b?.children) && b.children.length) out.push(...lineasDe(b.children, depth + 1));
  }
  return out;
}

export type LineaDiff = { tipo: "igual" | "mas" | "menos"; texto: string };

/** Diff por líneas (LCS clásico): `a` = versión anterior, `b` = la seleccionada. */
export function diffLineas(a: string[], b: string[]): LineaDiff[] {
  const n = a.length, m = b.length;
  // ponytail: LCS O(n·m); una página tiene cientos de bloques, no millones.
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: LineaDiff[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ tipo: "igual", texto: a[i] });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ tipo: "menos", texto: a[i] });
      i++;
    } else {
      out.push({ tipo: "mas", texto: b[j] });
      j++;
    }
  }
  while (i < n) out.push({ tipo: "menos", texto: a[i++] });
  while (j < m) out.push({ tipo: "mas", texto: b[j++] });
  return out;
}
