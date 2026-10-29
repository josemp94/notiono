package com.monrealperez.notiono.copia

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.datos.Registro
import com.monrealperez.notiono.red.Api
import com.monrealperez.notiono.red.ErrorApi
import com.monrealperez.notiono.red.comoObjeto
import com.monrealperez.notiono.red.json
import com.monrealperez.notiono.red.objeto
import com.monrealperez.notiono.red.str
import com.monrealperez.notiono.ui.espacios.EspacioLista
import com.monrealperez.notiono.ui.espacios.Espacios
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import okhttp3.OkHttpClient
import java.io.File
import java.security.KeyStore
import java.time.Instant
import java.util.Base64
import java.util.concurrent.TimeUnit
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Cifra lo que no puede quedar en claro en el móvil (la contraseña del NAS y su token). */
interface Cifrador {
    fun cifra(datos: ByteArray): ByteArray
    fun descifra(datos: ByteArray): ByteArray
}

/** AES-GCM con la clave en el AndroidKeyStore (no se puede sacar del móvil); el IV va delante del texto cifrado. */
object CifradorKeystore : Cifrador {
    private const val ALIAS = "copia-nas"

    private fun clave(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        g.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return g.generateKey()
    }

    override fun cifra(datos: ByteArray): ByteArray {
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, clave())
        return c.iv + c.doFinal(datos)
    }

    override fun descifra(datos: ByteArray): ByteArray {
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.DECRYPT_MODE, clave(), GCMParameterSpec(128, datos, 0, 12))
        return c.doFinal(datos, 12, datos.size - 12)
    }
}

@Serializable
data class ConfigCopia(
    val servidor: String = SERVIDOR,
    val carpeta: String = CARPETA,
    val usuario: String = "",
    /** Los espacios que se copian; null = los propios que no comparte nadie (o el activo, si no hay). */
    val espacios: List<String>? = null,
) {
    companion object {
        const val SERVIDOR = "https://monrealperez.com/drive"
        const val CARPETA = "/home/Notiono"
    }
}

@Serializable
private data class Secreto(val pass: String, val did: String? = null)

/** Un .docx que subió la copia: de qué espacio, dónde y de qué edición. */
@Serializable
data class Subido(val espacio: String, val ruta: String, val editada: String)

@Serializable
data class EstadoCopia(
    /** Por elemento (página, o página/fila). Solo se borra del NAS lo que está aquí. */
    val subidos: Map<String, Subido> = emptyMap(),
    /** Lo que subió la copia y ya sobra (movido, renombrado, borrado): se borra tras subir lo nuevo. */
    val porBorrar: List<String> = emptyList(),
    val ultima: String? = null,
    val error: String? = null,
)

/**
 * «Copia en el NAS»: un Word por página (y por fila de cada BD) en el Synology Drive de la
 * persona, reflejando el árbol (ver [Rutas]). Solo sube lo que cambió y solo borra lo que
 * subió ella. Todo vive en `noBackupFilesDir`; la contraseña y el token del NAS, cifrados
 * con [Cifrador] y nunca salen del móvil (ni a Notiono ni al registro de diagnóstico).
 */
class CopiaNas(
    private val ctx: Context,
    private val cifrador: Cifrador,
    private val api: Api,
    private val http: OkHttpClient,
    private val registro: Registro?,
) {
    private val dir = ctx.noBackupFilesDir
    private val fConfig = File(dir, "copia-nas.json")
    private val fSecreto = File(dir, "copia-nas.secreto")
    private val fEstado = File(dir, "copia-nas-estado.json")
    private val mutex = Mutex()

    fun config(): ConfigCopia? = lee(fConfig, ConfigCopia.serializer())
    fun activa() = fConfig.exists()
    fun estado(): EstadoCopia = lee(fEstado, EstadoCopia.serializer()) ?: EstadoCopia()

    private fun <T> lee(f: File, s: KSerializer<T>): T? =
        runCatching { json.decodeFromString(s, f.readText()) }.getOrNull()

    private fun <T> escribe(f: File, s: KSerializer<T>, v: T) {
        // Primero a un temporal: un corte a mitad no deja el estado roto.
        val t = File(f.path + ".tmp")
        t.writeText(json.encodeToString(s, v))
        t.renameTo(f)
    }

    private fun secreto(): Secreto? = runCatching {
        json.decodeFromString(Secreto.serializer(), cifrador.descifra(fSecreto.readBytes()).decodeToString())
    }.getOrNull()

    private fun guardaSecreto(s: Secreto) = fSecreto.writeBytes(cifrador.cifra(json.encodeToString(Secreto.serializer(), s).encodeToByteArray()))

    /**
     * Prueba a entrar en el NAS y, si entra, guarda la conexión y la deja programada. Con
     * verificación en dos pasos: la primera vez lanza [ErrorCopia.pideCodigo] y se repite
     * con el `codigo`; el token que da el NAS se guarda para no volver a pedirlo.
     * `pass` vacía = la que ya estaba guardada.
     */
    suspend fun conecta(conf: ConfigCopia, pass: String, codigo: String? = null) = mutex.withLock {
        val antes = secreto()
        val clave = pass.ifEmpty { antes?.pass ?: throw ErrorCopia(0, "Escribe la contraseña del NAS") }
        val dsm = Dsm(conf.servidor, http)
        val e = dsm.entra(conf.usuario.trim(), clave, antes?.did, codigo?.trim()?.ifEmpty { null })
        runCatching { dsm.sale(e.sid) }
        guardaSecreto(Secreto(clave, e.did))
        // Otro NAS u otra cuenta: lo apuntado como subido no está allí.
        val previa = config()
        if (previa != null && (Dsm.normaliza(previa.servidor) != Dsm.normaliza(conf.servidor) || previa.usuario != conf.usuario.trim())) fEstado.delete()
        escribe(fConfig, ConfigCopia.serializer(), conf.copy(servidor = Dsm.normaliza(conf.servidor), carpeta = Rutas.base(conf.carpeta), usuario = conf.usuario.trim()))
        programa()
        informa()
    }

    fun guardaEspacios(ids: List<String>) {
        val c = config() ?: return
        escribe(fConfig, ConfigCopia.serializer(), c.copy(espacios = ids))
    }

    /** «Desconectar»: fuera credenciales, token, estado y trabajos; la web lo ve apagado. */
    suspend fun desconecta() {
        runCatching {
            WorkManager.getInstance(ctx).cancelUniqueWork(PERIODICA)
            WorkManager.getInstance(ctx).cancelUniqueWork(TRAS_EDITAR)
        }
        mutex.withLock { listOf(fConfig, fSecreto, fEstado).forEach { it.delete() } }
        runCatching { api.mutation("app.informaCopia", objeto("activa" to false, "ultima" to null, "paginas" to 0, "error" to null, "carpeta" to null)) }
    }

    /** Cada 6 h, con red. */
    fun programa() {
        if (!activa()) return
        val req = PeriodicWorkRequestBuilder<CopiaWorker>(6, TimeUnit.HOURS)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        runCatching { WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(PERIODICA, ExistingPeriodicWorkPolicy.KEEP, req) }
    }

    /** Un rato después de editar: cada cambio nuevo lo aplaza, así varios cambios seguidos son una copia. */
    fun trasEditar() {
        if (!activa()) return
        val req = OneTimeWorkRequestBuilder<CopiaWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setInitialDelay(2, TimeUnit.MINUTES)
            .build()
        runCatching { WorkManager.getInstance(ctx).enqueueUniqueWork(TRAS_EDITAR, ExistingWorkPolicy.REPLACE, req) }
    }

    /** Hace la copia. Devuelve el error (en cristiano) o null si fue bien. Sin conexión configurada, no hace nada. */
    suspend fun copia(): String? = mutex.withLock {
        val conf = config() ?: return@withLock null
        var estado = estado()
        var subidas = 0
        var borradas = 0
        var fallos = 0
        var motivo: String? = null
        val error: String? = try {
            val secreto = secreto() ?: throw ErrorCopia(0, "Falta la contraseña del NAS: vuelve a conectar")
            val lista = Espacios.lista(api.query("workspace.list"))
            val elegidos = elegidos(conf, lista, api.espacio())
            if (elegidos.isEmpty()) throw ErrorCopia(0, "No hay ningún espacio que copiar: elige alguno")
            val plan = Rutas.planifica(conf.carpeta, elegidos.map {
                EspacioCopia(it.id, it.name, json.decodeFromJsonElement(ArbolCopia.serializer(), api.query("app.arbolCopia", null, it.id)))
            })
            val dsm = Dsm(conf.servidor, http)
            val entrada = dsm.entra(conf.usuario, secreto.pass, secreto.did, null)
            if (entrada.did != secreto.did) guardaSecreto(secreto.copy(did = entrada.did))
            try {
                for (e in plan) {
                    val antes = estado.subidos[e.clave]
                    if (antes != null && antes.ruta == e.ruta && antes.editada == e.editada) continue
                    val bytes = try {
                        word(e)
                    } catch (x: ErrorApi) {
                        if (x.sinConexion || x.tipo == ErrorApi.Tipo.NoAutorizado) throw x
                        fallos++ // esa página no se pudo exportar: se queda la copia que hubiera y sigue
                        continue
                    }
                    dsm.sube(entrada.sid, e.ruta.substringBeforeLast('/'), e.ruta.substringAfterLast('/'), bytes)
                    subidas++
                    // Se apunta en cuanto sube: si algo falla después, la próxima vez sigue desde aquí.
                    estado = estado.copy(
                        subidos = estado.subidos + (e.clave to Subido(e.espacio, e.ruta, e.editada)),
                        porBorrar = if (antes != null && antes.ruta != e.ruta) estado.porBorrar + antes.ruta else estado.porBorrar,
                    )
                    escribe(fEstado, EstadoCopia.serializer(), estado)
                }
                // Lo que ya no está en los espacios que se copian: fuera del estado y a borrar.
                val claves = plan.map { it.clave }.toSet()
                val copiados = elegidos.map { it.id }.toSet()
                val sobran = estado.subidos.filter { (k, v) -> v.espacio in copiados && k !in claves }
                estado = estado.copy(subidos = estado.subidos - sobran.keys, porBorrar = estado.porBorrar + sobran.values.map { it.ruta })
                escribe(fEstado, EstadoCopia.serializer(), estado)
                // Nunca lo que sigue siendo de la copia (dos páginas que se cambian el nombre) ni algo que no sea un .docx.
                val vivas = estado.subidos.values.map { it.ruta }.toSet()
                for (ruta in estado.porBorrar.distinct()) {
                    if (ruta !in vivas && ruta.endsWith(".docx") && dsm.borra(entrada.sid, ruta)) borradas++
                    estado = estado.copy(porBorrar = estado.porBorrar.filter { it != ruta })
                    escribe(fEstado, EstadoCopia.serializer(), estado)
                }
            } finally {
                withContext(NonCancellable) { runCatching { dsm.sale(entrada.sid) } }
            }
            if (fallos > 0) {
                motivo = "exportar $fallos"
                if (fallos == 1) "Una página no se pudo pasar a Word; se reintentará" else "$fallos páginas no se pudieron pasar a Word; se reintentará"
            } else null
        } catch (e: ErrorCopia) {
            motivo = "nas ${e.codigo}"
            e.message
        } catch (e: ErrorApi) {
            motivo = "notiono ${e.tipo}"
            when {
                e.sinConexion -> "Sin conexión con Notiono"
                e.tipo == ErrorApi.Tipo.NoAutorizado -> "La sesión de Notiono ha caducado: vuelve a entrar en la app"
                else -> "Notiono no pudo preparar la copia; se reintentará"
            }
        }
        // «Última copia»: la que llegó al final (aunque alguna página no se pudiera exportar).
        val terminada = motivo?.startsWith("exportar") != false
        estado = estado.copy(ultima = if (terminada) Instant.now().toString() else estado.ultima, error = error?.take(500))
        escribe(fEstado, EstadoCopia.serializer(), estado)
        // Sin rutas, títulos ni credenciales.
        registro?.anota("copia", "copia nas: $subidas subidas, $borradas borradas" + (motivo?.let { ", error $it" } ?: ""))
        informa()
        error
    }

    /** Lo que ve la web en Ajustes: nunca credenciales ni el servidor. */
    private suspend fun informa() {
        val e = estado()
        runCatching {
            api.mutation(
                "app.informaCopia",
                objeto("activa" to true, "ultima" to e.ultima, "paginas" to e.subidos.size, "error" to e.error, "carpeta" to config()?.carpeta),
            )
        }
    }

    private suspend fun word(e: Elemento): ByteArray {
        val input = JsonObject(buildMap {
            put("id", JsonPrimitive(e.id))
            e.recordId?.let { put("recordId", JsonPrimitive(it)) }
        })
        val r = api.query("app.exportarWord", input, e.espacio).comoObjeto
        return Base64.getMimeDecoder().decode(r.str("base64").orEmpty())
    }

    companion object {
        const val PERIODICA = "copia-nas"
        const val TRAS_EDITAR = "copia-nas-edicion"

        /** Los elegidos o, si no se eligió, los propios que no comparte nadie (o el activo). Nunca uno de invitado. */
        fun elegidos(conf: ConfigCopia, lista: List<EspacioLista>, activo: String?): List<EspacioLista> {
            val posibles = lista.filter { it.rol != "guest" }
            return conf.espacios?.let { ids -> posibles.filter { it.id in ids } }
                ?: posibles.filter { it.isOwner && !it.compartido }.ifEmpty { posibles.filter { it.id == activo } }
        }
    }
}

/** La copia en segundo plano (cada 6 h y un rato después de editar). Sin sesión de Notiono, no copia. */
class CopiaWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val s = Servicios.de(applicationContext)
        if (s.sesion.token != null) s.copia.copia()
        return Result.success()
    }
}
