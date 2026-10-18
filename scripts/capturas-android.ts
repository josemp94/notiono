/**
 * Capturas de la app nativa (Roborazzi) con datos de verdad: levanta el SSO falso con
 * una persona nueva (espacio limpio) y lanza CapturasTest contra el Notiono local, que
 * siembra páginas y una base de datos y fotografía cada pantalla y vista (y WidgetsTest, los
 * widgets con datos locales), en
 * claro y en oscuro, a 390 dp. Salen en app-android/app/build/capturas/.
 *
 *   BASE_URL=http://127.0.0.1:3100 npx tsx scripts/capturas-android.ts
 */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { ssoFalso } from "./sso-falso";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";

async function main() {
  const sso = await ssoFalso({ sub: `capturas-${Date.now()}`, email: "marta@example.com", name: "Marta Pérez" });
  rmSync(path.join(__dirname, "../app-android/app/build/capturas"), { recursive: true, force: true });
  try {
    const gradle = spawn(
      "./gradlew",
      [":app:testDebugUnitTest", "--tests", "com.monrealperez.notiono.CapturasTest",
        "--tests", "com.monrealperez.notiono.widgets.WidgetsTest", "--rerun", "--console=plain", "-q",
        `-Pnotiono.integracion=${BASE}`, "-Proborazzi.test.record=true"],
      { cwd: path.join(__dirname, "../app-android"), stdio: "inherit", env: process.env },
    );
    const salida = await new Promise<number | null>((ok) => gradle.on("exit", ok));
    if (salida !== 0) throw new Error("CapturasTest falló");
    console.log("OK — capturas en app-android/app/build/capturas/");
  } finally {
    sso.close();
  }
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
