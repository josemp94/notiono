#!/usr/bin/env node
/**
 * Saca de lucide-react los iconos que usa la app nativa de Android y los deja como
 * trazos SVG en app-android/app/src/main/assets/lucide.json (y el orden y las palabras de
 * búsqueda de los de página en iconos-pagina.json). Así la app usa los MISMOS
 * dibujos que la web: los de la interfaz y los 257 iconos de página («icono:<nombre>:<color>»).
 *
 *   node scripts/iconos-android.mjs
 *
 * Cada icono es una lista de trazos (atributo `d`); círculos, rectángulos y líneas se
 * pasan a trazo aquí para que la app solo tenga que saber leer `d`.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";


// Los de la interfaz (mismos nombres que en la web, lucide v1).
const INTERFAZ = `
menu panel-left search house plus square-pen square-check inbox bell settings trash-2 star star-off
ellipsis ellipsis-vertical chevron-right chevron-down chevron-left chevron-up arrow-left arrow-right x check
file-text file database table columns-3 list layout-grid calendar chart-gantt chart-column chart-bar chart-line
chart-pie clipboard-list list-filter arrow-up-down group eye eye-off lock lock-open share-2 globe link link-2 copy
history message-square message-square-text at-sign bold italic underline strikethrough code palette type
heading-1 heading-2 heading-3 list-ordered list-checks list-todo quote minus lightbulb image video music paperclip
sigma columns-2 grip-vertical arrow-up arrow-down copy-plus camera upload download refresh-cw log-out user users
sun moon wifi-off cloud-off cloud-check cloud-upload loader smile image-plus maximize-2 calendar-days clock hash
circle-chevron-down circle-dashed align-left phone map-pin mouse-pointer-click arrow-up-right function-square
key-round circle-user mail send corner-down-right indent-increase indent-decrease text-quote file-plus
folder-input type-outline remove-formatting baseline highlighter pin smartphone briefcase layers move
corner-up-left reply circle-check circle check-check archive-restore undo-2 info triangle-alert play pause
external-link file-down file-up sparkles zoom-in zoom-out maximize minimize filter sliders-horizontal
arrow-down-up rows-3 between-horizontal-start ban pencil circle-plus rotate-ccw save list-tree table-of-contents
square circle-dot loader-circle wand-sparkles letter-text text redo-2 sun-moon mail-open
user-plus user-minus smile-plus
`.split(/\s+/).filter(Boolean);

// Los de página: los mismos que la pestaña «Iconos» del selector de la web.
const conPalabras = [...readFileSync("src/components/iconosPagina.tsx", "utf8").matchAll(/\["([a-z0-9-]+)", [A-Za-z0-9]+, "([^"]*)"\]/g)].map((m) => [m[1], m[2]]);
const pagina = conPalabras.map(([n]) => n);

const n = (v) => Number(v);
function aTrazo([tag, a]) {
  switch (tag) {
    case "path": return a.d;
    case "circle": return `M${n(a.cx) - n(a.r)} ${a.cy}a${a.r} ${a.r} 0 1 0 ${2 * n(a.r)} 0a${a.r} ${a.r} 0 1 0 ${-2 * n(a.r)} 0`;
    case "ellipse": return `M${n(a.cx) - n(a.rx)} ${a.cy}a${a.rx} ${a.ry} 0 1 0 ${2 * n(a.rx)} 0a${a.rx} ${a.ry} 0 1 0 ${-2 * n(a.rx)} 0`;
    case "line": return `M${a.x1} ${a.y1}L${a.x2} ${a.y2}`;
    case "polyline":
    case "polygon": {
      const p = a.points.trim().split(/[\s,]+/);
      let d = `M${p[0]} ${p[1]}`;
      for (let i = 2; i < p.length; i += 2) d += `L${p[i]} ${p[i + 1]}`;
      return tag === "polygon" ? d + "Z" : d;
    }
    case "rect": {
      const x = n(a.x ?? 0), y = n(a.y ?? 0), w = n(a.width), h = n(a.height);
      const rx = n(a.rx ?? a.ry ?? 0), ry = n(a.ry ?? a.rx ?? 0);
      if (!rx) return `M${x} ${y}h${w}v${h}h${-w}Z`;
      return `M${x + rx} ${y}h${w - 2 * rx}a${rx} ${ry} 0 0 1 ${rx} ${ry}v${h - 2 * ry}a${rx} ${ry} 0 0 1 ${-rx} ${ry}` +
        `h${-(w - 2 * rx)}a${rx} ${ry} 0 0 1 ${-rx} ${-ry}v${-(h - 2 * ry)}a${rx} ${ry} 0 0 1 ${rx} ${-ry}Z`;
    }
    default: throw new Error(`elemento SVG no previsto: ${tag}`);
  }
}

const salida = {};
const faltan = [];
for (const nombre of [...new Set([...INTERFAZ, ...pagina])]) {
  const f = `node_modules/lucide-react/dist/esm/icons/${nombre}.mjs`;
  if (!existsSync(f)) { faltan.push(nombre); continue; }
  // Algunos nombres son alias que reexportan otro icono: se sigue hasta el de verdad.
  let ruta = f;
  let mod = await import(new URL(`../${ruta}`, import.meta.url));
  while (!mod.__iconNode) {
    const otro = readFileSync(ruta, "utf8").match(/from '\.\/([a-z0-9-]+)\.mjs'/)?.[1];
    if (!otro) throw new Error(`no encuentro el dibujo de ${nombre}`);
    ruta = `node_modules/lucide-react/dist/esm/icons/${otro}.mjs`;
    mod = await import(new URL(`../${ruta}`, import.meta.url));
  }
  salida[nombre] = mod.__iconNode.map(aTrazo);
}
if (faltan.length) {
  console.error("No existen en lucide-react:", faltan.join(", "));
  process.exit(1);
}
writeFileSync("app-android/app/src/main/assets/lucide.json", JSON.stringify(salida));
// El orden y las palabras de búsqueda de la pestaña «Iconos» del selector.
writeFileSync("app-android/app/src/main/assets/iconos-pagina.json", JSON.stringify(conPalabras));
console.log(`${Object.keys(salida).length} iconos → app-android/app/src/main/assets/lucide.json`);
