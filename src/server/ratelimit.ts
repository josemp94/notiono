/**
 * Límite de peticiones para rutas públicas sin sesión (el formulario /f/<token>).
 * Ventana deslizante en memoria: válido porque la app corre en UN contenedor.
 * ponytail: en memoria y por proceso; si algún día hay varias réplicas, esto
 * pasa a Redis o a la tabla AppSetting.
 */
const ventanas = new Map<string, number[]>();

/** Techo de claves vivas: que un atacante rotando IPs no infle el mapa sin fin. */
const MAX_CLAVES = 10_000;

export function permitido(clave: string, max: number, ventanaMs: number, ahora = Date.now()): boolean {
  const marcas = (ventanas.get(clave) ?? []).filter((t) => ahora - t < ventanaMs);
  if (marcas.length >= max) {
    ventanas.set(clave, marcas);
    return false;
  }
  marcas.push(ahora);
  if (!ventanas.has(clave) && ventanas.size >= MAX_CLAVES) {
    // Limpieza perezosa: fuera las claves cuya ventana ya expiró.
    for (const [k, ts] of ventanas) {
      if (ts.every((t) => ahora - t >= ventanaMs)) ventanas.delete(k);
    }
  }
  ventanas.set(clave, marcas);
  return true;
}

/** IP del cliente detrás del proxy inverso del DSM (primer salto de x-forwarded-for). */
export function ipDe(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  return xff?.split(",")[0]?.trim() || "desconocida";
}
