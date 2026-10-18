# La app de Android

Desde la 2.0.0 Notiono en el móvil es una **app nativa** (Kotlin + Jetpack Compose,
Material 3), en `app-android/`. Ya no es Chrome abriendo la web: las pantallas, el
editor de bloques, las bases de datos y los widgets están hechos para Android y le
piden los datos al mismo servidor, por los mismos procedimientos tRPC que la web.

La única web que queda dentro es el **inicio de sesión**: el SSO de Synology se abre
en una pestaña del sistema (Custom Tab), como hacen las apps nativas con sus
logins, y al terminar el servidor vuelve a la app con `notiono://auth?code=…`, que la
app canjea por una sesión con PKCE (`/api/app/sesion`). Solo pasa la primera vez.

El diseño y las decisiones (cómo escribe en el documento vivo de Yjs, cómo funciona
sin conexión…) están en `docs/app-nativa.md`.

La TWA anterior (`android/`, la 1.1.0) sigue en el repo como referencia, pero ya no
se publica.

## Qué cambia respecto a la TWA

- **Las actualizaciones ya no son automáticas al desplegar.** Las pantallas viven
  dentro del APK, así que una función nueva de la app es un APK nuevo. Los datos sí
  son siempre los del servidor. La app mira al arrancar `GET /api/app/version` y, si
  hay una versión con `versionCode` mayor, ofrece bajarla e instalarla encima
  (Ajustes → «Buscar actualizaciones» hace lo mismo a mano).
- **Funciona sin conexión**: lo último que se abrió se ve, y lo que se cambia sin red
  se guarda en una cola y se manda al volver (WorkManager).
- **Widgets** de escritorio: Nota, Lista de una base de datos y Nota rápida.
- **«Compartir con Notiono»** desde cualquier app (texto, enlaces, imágenes).

## Cómo se la instala la familia

**Ajustes → App de Android → Descargar el APK** (en la web), o desde la propia app si
ya tienen una versión. El APK va dentro del despliegue (`public/notiono.apk`), así
que el que se baja cada uno es el de la versión publicada. Android pide permiso para
instalar algo que no viene de su tienda: es lo normal fuera de Play Store.

La 2.0.0 se instala **encima de la TWA** sin desinstalar nada: mismo paquete
(`com.monrealperez.notiono`), misma firma y `versionCode` mayor (3 > 2).

## Lo que hace falta

| Pieza | Dónde | Para qué |
|---|---|---|
| `app-android/` | este repo | el proyecto Gradle de la app |
| `~/.bubblewrap/jdk/jdk-17…` y `~/.bubblewrap/android_sdk` | el PC | JDK 17 y SDK de Android (los mismos que usaba Bubblewrap) |
| `~/notiono-apk/notiono.keystore` | **fuera del repo** | la firma del APK |
| `~/notiono-apk/firma.properties` | **fuera del repo** | dónde está el almacén y sus contraseñas, para Gradle |
| `/.well-known/assetlinks.json` | la web | dice que ese APK es de este dominio (abre los enlaces `/p/…` en la app) |

### El almacén de claves: guárdalo

`~/notiono-apk/notiono.keystore` es lo que firma el APK. **Si se pierde, ninguna
versión futura se podrá instalar encima de la instalada**: Android lo rechaza por
firma distinta y hay que desinstalar la app (y con ella lo que tenga guardado sin
mandar). No está en el repo a propósito —una clave de firma no se sube a git— así que
cópialo donde guardes las cosas que no se pueden volver a generar, junto con su
contraseña.

`firma.properties` (también fuera del repo) es lo que lee `app/build.gradle.kts`:

```properties
storeFile=/home/jose/notiono-apk/notiono.keystore
storePassword=…
keyAlias=notiono
keyPassword=…
```

Sin ese fichero, `assembleRelease` saca un APK **sin firmar** (que no se puede
instalar): así nadie publica por error uno firmado con otra clave.

### El enlace entre dominio y app

`/.well-known/assetlinks.json` (variable `ANDROID_CERT_FINGERPRINT` del contenedor,
con la huella SHA-256 de la firma) es lo que deja a Android abrir directamente en la
app los enlaces `https://notiono.monrealperez.com/p/…` que alguien te pasa. Sin él
funcionan igual, pero Android pregunta con qué abrirlos.

Para volver a sacar la huella:

```bash
~/.bubblewrap/jdk/*/bin/keytool -list -v \
  -keystore ~/notiono-apk/notiono.keystore -alias notiono
```

## Compilar

```bash
cd ~/Projects/notiono/app-android
export JAVA_HOME=~/.bubblewrap/jdk/jdk-17.0.20+8
./gradlew :app:testDebugUnitTest :app:lintRelease :app:assembleRelease
```

Deja el APK firmado en `app-android/app/build/outputs/apk/release/app-release.apk`.
La memoria está acotada en `app-android/gradle.properties` (Gradle con 3 GB, Kotlin
dentro del mismo proceso, pruebas de Robolectric de una en una con 1 GB): el PC tiene
16 GB y un Gradle sin límites tumbó la sesión entera. **No lances `npm run build`
mientras compila Gradle**, y al acabar `./gradlew --stop`.

Una versión de depuración contra un Notiono local:

```bash
./gradlew :app:assembleDebug -Pnotiono.baseUrl=http://192.168.1.50:3000
```

## Pruebas

- `./gradlew :app:testDebugUnitTest`: modelo del editor con documentos reales del
  editor web (`scripts/fixtures/*.json`), teclado, red/caché/cola y sincronía contra
  un servidor de mentira, y las capturas de los widgets.
- **Contra un Notiono de verdad en local** (servidor de producción `server.mjs` +
  PGlite, ver «La app entera en local» en `docs/movil.md` y la cabecera de
  `scripts/integracion-app.ts` para arrancarlo apuntando al SSO falso):
  - `npx tsx scripts/integracion-app.ts`: el servidor de la app (sesión PKCE, ops de
    bloque con un navegador conectado, vistas, Markdown).
  - `npx tsx scripts/integracion-android.ts`: la capa de red, el editor y la sincronía
    **de la app** (Kotlin) contra ese servidor, con un cliente Yjs tecleando a la vez.
  - `npx tsx scripts/capturas-android.ts`: capturas de cada pantalla, vista de BD y
    widget en claro y oscuro a 390 dp (`app-android/app/build/capturas/`). Míralas
    antes de publicar una versión.

## Publicar una versión nueva

1. Sube `versionCode` (entero, **obligatorio**: con uno igual o menor Android no la
   instala encima) y `versionName` en `app-android/app/build.gradle.kts`.
2. Compila como arriba y comprueba la firma (debe ser la misma huella de siempre):
   ```bash
   ~/.bubblewrap/android_sdk/build-tools/*/apksigner verify --print-certs \
     app-android/app/build/outputs/apk/release/app-release.apk
   ```
3. Publícalo en la web y commitea:
   ```bash
   npm run apk:publicar          # lo copia a public/ y anota versión y tamaño
   git add public/notiono.apk src/lib/apk.json app-android/app/build.gradle.kts
   ```
4. Despliega. Al abrir la app, cada móvil verá que hay versión nueva.

`npm run apk:publicar` lee la versión del mismo `build.gradle.kts` con el que se
acaba de compilar, y se niega a publicar un `versionCode` que no sea mayor que el
publicado: así la descarga, el aviso de la app y el APK no pueden discrepar.
