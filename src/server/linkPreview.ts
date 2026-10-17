import { lookup } from "node:dns";
import http, { type IncomingMessage } from "node:http";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";
import zlib from "node:zlib";
import { TRPCError } from "@trpc/server";

export type LinkPreview = { url: string; title: string; description: string; image: string; siteName: string };

/**
 * ¿La IP pertenece a una red privada o especial? El servidor vive dentro de la red
 * de casa: sin este filtro, cualquiera podría usar la vista previa para sondear el
 * router, el NAS o servicios internos (SSRF).
 */
function isPrivateAddress(ip: string): boolean {
  if (ip.includes(":")) {
    const v6 = ip.toLowerCase();
    return (
      v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80") ||
      v6.startsWith("::ffff:") || v6.startsWith("64:ff9b:")
    );
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

/**
 * Resolución de nombres que se niega a conectar con la red interna. Va en el propio
 * `connect`, no antes: así la IP comprobada es la IP a la que se conecta, y un DNS
 * que contesta una cosa al comprobar y otra al conectar (DNS rebinding) no cuela.
 * También vale para cada salto de una redirección.
 */
const lookupPublico: LookupFunction = (host, opts, cb) => {
  lookup(host, { ...opts, all: true }, (err, addrs) => {
    if (err) return cb(err, "", 0);
    if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) {
      return cb(Object.assign(new Error("Dirección de la red interna"), { code: "EPRIVADA" }), "", 0);
    }
    if (opts.all) cb(null, addrs);
    else cb(null, addrs[0].address, addrs[0].family);
  });
};

/** Una IP escrita tal cual en el enlace no pasa por el DNS: se mira aquí. */
const ipLiteralPrivada = (url: URL) => {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  return isIP(host) !== 0 && isPrivateAddress(host);
};

const LIMITE_HTML = 200_000; // con los primeros 200 KB sobra: el <head> va al principio
const MAX_SALTOS = 5;

/**
 * GET de una página para la vista previa. Las redirecciones se siguen a mano, una a
 * una, para revalidar cada destino; y del cuerpo solo se lee lo necesario, así una
 * descarga enorme no llena la memoria del servidor.
 */
function descargaHtml(inicial: URL, signal: AbortSignal): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const pide = (url: URL, saltos: number) => {
      if (url.protocol !== "http:" && url.protocol !== "https:") return resolve(null);
      if (ipLiteralPrivada(url)) return reject(new Error("Dirección de la red interna"));
      const req = (url.protocol === "https:" ? https : http).get(
        url,
        {
          lookup: lookupPublico,
          signal,
          headers: {
            "User-Agent": "Notiono/1.0 (+link preview)",
            Accept: "text/html",
            "Accept-Encoding": "gzip, deflate, br",
          },
        },
        (res: IncomingMessage) => {
          const status = res.statusCode ?? 0;
          if (status >= 300 && status < 400 && res.headers.location) {
            res.resume();
            if (saltos >= MAX_SALTOS) return resolve(null);
            return pide(new URL(res.headers.location, url), saltos + 1);
          }
          if (status < 200 || status >= 300 || !(res.headers["content-type"] ?? "").includes("text/html")) {
            res.resume();
            return resolve(null);
          }
          const codif = String(res.headers["content-encoding"] ?? "").toLowerCase();
          const cuerpo =
            codif === "gzip" ? res.pipe(zlib.createGunzip())
            : codif === "deflate" ? res.pipe(zlib.createInflate())
            : codif === "br" ? res.pipe(zlib.createBrotliDecompress())
            : res;
          const trozos: Buffer[] = [];
          let total = 0;
          const fin = () => {
            res.destroy();
            resolve(Buffer.concat(trozos).toString("utf8").slice(0, LIMITE_HTML));
          };
          cuerpo.on("data", (t: Buffer) => {
            trozos.push(t);
            total += t.length;
            if (total >= LIMITE_HTML) fin();
          });
          cuerpo.on("end", fin);
          cuerpo.on("error", reject);
        },
      );
      req.on("error", reject);
    };
    pide(inicial, 0);
  });
}

const meta = (html: string, prop: string): string => {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1];
  }
  return "";
};

const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();

/** Descarga una página y saca sus etiquetas OpenGraph para la tarjeta de enlace. */
export async function fetchLinkPreview(rawUrl: string): Promise<LinkPreview> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Esa dirección no es válida." });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Solo se admiten enlaces http y https." });
  }
  const interna = () =>
    new TRPCError({ code: "BAD_REQUEST", message: "No se pueden previsualizar direcciones de la red interna." });
  if (ipLiteralPrivada(url)) throw interna();

  const fallback: LinkPreview = { url: url.toString(), title: url.hostname, description: "", image: "", siteName: url.hostname };
  try {
    const html = await descargaHtml(url, AbortSignal.timeout(6000));
    if (html === null) return fallback;
    return {
      url: url.toString(),
      title: decode(meta(html, "og:title") || html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || url.hostname),
      description: decode(meta(html, "og:description") || meta(html, "description")).slice(0, 300),
      image: decode(meta(html, "og:image")),
      siteName: decode(meta(html, "og:site_name") || url.hostname),
    };
  } catch (e) {
    if ((e as { code?: string }).code === "EPRIVADA" || (e as Error).message === "Dirección de la red interna") {
      throw interna();
    }
    // Sitio caído, lento o que bloquea bots: la tarjeta se queda con el dominio.
    return fallback;
  }
}
