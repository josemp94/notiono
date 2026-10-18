#!/usr/bin/env node
/**
 * Deja el APK ya firmado de la app nativa dentro de la web, para que se descargue desde
 * Ajustes y para que la app instalada vea que hay versión nueva (`/api/app/version`).
 *
 *   cd app-android && ./gradlew :app:assembleRelease && cd ..
 *   npm run apk:publicar [ruta/al/apk]
 *
 * Copia el APK a `public/` (Next sirve esa carpeta tal cual, y el Dockerfile la mete
 * en la imagen: así el APK viaja con el despliegue) y anota versión, tamaño y fecha en
 * `src/lib/apk.json`, que es lo que enseñan Ajustes y `/api/app/version`. La versión
 * sale de `app-android/app/build.gradle.kts`, la que se acaba de compilar: así no hay
 * dos sitios que puedan discrepar.
 */
import { copyFileSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";

const origen = process.argv[2] ?? "app-android/app/build/outputs/apk/release/app-release.apk";
const destino = "public/notiono.apk";

if (!existsSync(origen)) {
  console.error(`No existe ${origen}: compila antes con ./gradlew :app:assembleRelease (en app-android/).`);
  process.exit(1);
}
const gradle = readFileSync("app-android/app/build.gradle.kts", "utf8");
const version = /versionName\s*=\s*"([^"]+)"/.exec(gradle)?.[1];
const versionCode = Number(/versionCode\s*=\s*(\d+)/.exec(gradle)?.[1]);
if (!version || !versionCode) {
  console.error("No encuentro versionName/versionCode en app-android/app/build.gradle.kts");
  process.exit(1);
}
// Android solo instala encima una versión con código MAYOR: con uno igual o menor, los
// móviles verían «hay versión nueva» y la instalación fallaría.
const anterior = JSON.parse(readFileSync("src/lib/apk.json", "utf8"));
if (versionCode <= anterior.versionCode) {
  console.error(`versionCode ${versionCode} no es mayor que el publicado (${anterior.versionCode}): súbelo en build.gradle.kts.`);
  process.exit(1);
}

copyFileSync(origen, destino);
const info = { version, versionCode, bytes: statSync(destino).size, fecha: new Date().toISOString().slice(0, 10) };
writeFileSync("src/lib/apk.json", JSON.stringify(info, null, 2) + "\n");

console.log(`${origen} → ${destino}`);
console.log(`  versión ${info.version} (código ${info.versionCode}), ${(info.bytes / 1024 / 1024).toFixed(1)} MB`);
console.log("  Recuerda commitear los dos ficheros: el APK viaja en el repo.");
