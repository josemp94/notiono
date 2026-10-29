package com.monrealperez.notiono.avisos

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.content.edit
import com.monrealperez.notiono.MainActivity
import com.monrealperez.notiono.R
import com.monrealperez.notiono.Servicios
import com.monrealperez.notiono.red.json
import com.monrealperez.notiono.widgets.Widgets
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/** Un recordatorio que suena en el móvil (de `app.recordatorios`). `cuando`: instante ISO. */
@Serializable
data class Recordatorio(val key: String, val cuando: String, val titulo: String, val texto: String, val pageId: String, val recordId: String? = null) {
    val ms: Long get() = runCatching { Instant.parse(cuando).toEpochMilli() }.getOrDefault(0)
    /** Lo que abre: la fila o la página. */
    val enlace: String get() = if (recordId != null) "notiono://fila/$pageId/$recordId" else "notiono://pagina/$pageId"
}

/**
 * Los recordatorios a su hora en el móvil, sin Firebase: la app baja los próximos al abrirse,
 * al cambiar algo y en el trabajo periódico, y los programa con alarmas exactas
 * (`setExactAndAllowWhileIdle`: suenan aunque HyperOS tenga la app dormida). Tras reiniciar o
 * actualizar se reprograman de lo guardado. El servidor crea a la vez el aviso de la bandeja
 * con la misma `key`; el que llegue segundo no se vuelve a enseñar ([yaMostrado]).
 */
object Alarmas {
    const val CANAL = "recordatorios"
    private const val ACCION = "com.monrealperez.notiono.RECORDATORIO"
    private const val ACCION_MEDIANOCHE = "com.monrealperez.notiono.MEDIANOCHE"
    const val ACCION_HECHO = "com.monrealperez.notiono.RECORDATORIO_HECHO"
    const val ACCION_POSPONER = "com.monrealperez.notiono.RECORDATORIO_POSPONER"
    private val envio = Mutex()

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("recordatorios", Context.MODE_PRIVATE)

    fun guardados(ctx: Context): List<Recordatorio> = runCatching {
        json.decodeFromString(ListSerializer(Recordatorio.serializer()), prefs(ctx).getString("lista", null) ?: "[]")
    }.getOrDefault(emptyList())

    /** ¿Puede programar alarmas exactas? (Android 12+ pide permiso; con USE_EXACT_ALARM viene dado desde Android 13.) */
    fun exactas(ctx: Context): Boolean =
        Build.VERSION.SDK_INT < 31 || ctx.getSystemService(AlarmManager::class.java)?.canScheduleExactAlarms() == true

    /** Baja los próximos recordatorios y los programa. Sin red, se queda con lo que había. */
    suspend fun actualiza(ctx: Context, motivo: String) = envio.withLock {
        val s = Servicios.de(ctx)
        if (s.sesion.token == null) return@withLock programa(ctx, emptyList())
        val lista = runCatching {
            json.decodeFromJsonElement(ListSerializer(Recordatorio.serializer()), s.api.query("app.recordatorios"))
        }.getOrElse { e ->
            s.registro.anota("avisos", "recordatorios · $motivo · fallo", e)
            return@withLock reprograma(ctx)
        }
        prefs(ctx).edit { putString("lista", json.encodeToString(ListSerializer(Recordatorio.serializer()), lista)) }
        programa(ctx, lista)
    }

    /** Vuelve a programar lo guardado (tras reiniciar o actualizar, sin red). */
    fun reprograma(ctx: Context) = programa(ctx, guardados(ctx))

    /** Uno más (el pospuesto), guardado con los demás: sobrevive a reiniciar aunque no haya red. */
    @Synchronized
    fun anade(ctx: Context, r: Recordatorio) {
        val lista = guardados(ctx).filter { it.key != r.key } + r
        prefs(ctx).edit(commit = true) { putString("lista", json.encodeToString(ListSerializer(Recordatorio.serializer()), lista)) }
        programa(ctx, lista)
    }

    /**
     * Los botones de la notificación, con la sesión y sin mirar el espacio activo (el aviso
     * puede ser de otro): `POST /api/recordatorio`, lo mismo que pulsa el push de la web.
     * «Posponer 1 h» suena dentro de una hora aunque no haya red (alarma local); si hay,
     * con la key del servidor (así la bandeja y la alarma no se repiten).
     */
    suspend fun accion(ctx: Context, accion: String, r: Recordatorio) {
        val s = Servicios.de(ctx)
        NotificationManagerCompat.from(ctx).cancel(idNotificacion(r.key))
        val cuerpo = kotlinx.serialization.json.buildJsonObject {
            put("accion", kotlinx.serialization.json.JsonPrimitive(accion))
            put("key", kotlinx.serialization.json.JsonPrimitive(r.key))
            put("pageId", kotlinx.serialization.json.JsonPrimitive(r.pageId))
            r.recordId?.let { put("recordId", kotlinx.serialization.json.JsonPrimitive(it)) }
            put("titulo", kotlinx.serialization.json.JsonPrimitive(r.titulo))
        }
        val respuesta = runCatching { s.api.postJsonLee("/api/recordatorio", cuerpo) }
            .onFailure { s.registro.anota("avisos", "recordatorio · $accion · fallo", it) }
            .getOrNull()
        if (accion == "posponer") {
            val pos = (respuesta as? kotlinx.serialization.json.JsonObject)?.get("pospuesto") as? kotlinx.serialization.json.JsonObject
            val key = (pos?.get("key") as? kotlinx.serialization.json.JsonPrimitive)?.content ?: "local:${r.key}:${System.currentTimeMillis()}"
            val cuando = (pos?.get("cuando") as? kotlinx.serialization.json.JsonPrimitive)?.content
                ?: Instant.ofEpochMilli(System.currentTimeMillis() + 3_600_000).toString()
            anade(ctx, r.copy(key = key, cuando = cuando))
        } else if (respuesta != null) {
            // Marcada: las listas y los widgets la quitan.
            s.repo.avisa("vista:${r.pageId}", "tareas")
            Widgets.repintaTodo(ctx)
        }
    }

    private fun boton(ctx: Context, r: Recordatorio, accion: String, n: Int) = PendingIntent.getBroadcast(
        ctx, idNotificacion(r.key) * 3 + n,
        Intent(ctx, AlarmaReceiver::class.java).setAction(accion).setData(Uri.parse("notiono-recordatorio://${Uri.encode(r.key)}"))
            .putExtra("r", json.encodeToString(Recordatorio.serializer(), r)),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    private fun intento(ctx: Context, r: Recordatorio) = Intent(ctx, AlarmaReceiver::class.java).setAction(ACCION)
        // El dato distingue una alarma de otra; los extras viajan con ella.
        .setData(Uri.parse("notiono-recordatorio://${Uri.encode(r.key)}"))
        .putExtra("r", json.encodeToString(Recordatorio.serializer(), r))

    private fun programa(ctx: Context, lista: List<Recordatorio>) {
        val am = ctx.getSystemService(AlarmManager::class.java) ?: return
        val ahora = System.currentTimeMillis()
        // Las que ya no están (fecha cambiada, recordatorio quitado), fuera.
        val antes = prefs(ctx).getStringSet("programadas", emptySet()).orEmpty()
        val nuevas = lista.filter { it.ms > ahora - 60_000 && !yaMostrado(ctx, it.key) }
        for (k in antes - nuevas.map { it.key }.toSet()) {
            val pi = PendingIntent.getBroadcast(ctx, 0, Intent(ctx, AlarmaReceiver::class.java).setAction(ACCION).setData(Uri.parse("notiono-recordatorio://${Uri.encode(k)}")),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_NO_CREATE)
            if (pi != null) am.cancel(pi)
        }
        val exacta = exactas(ctx)
        for (r in nuevas) {
            val pi = PendingIntent.getBroadcast(ctx, 0, intento(ctx, r), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            val t = maxOf(r.ms, ahora + 1_000)
            try {
                if (exacta) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, t, pi) else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, t, pi)
            } catch (_: SecurityException) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, t, pi)
            }
        }
        prefs(ctx).edit { putStringSet("programadas", nuevas.map { it.key }.toSet()) }
        programaMedianoche(ctx)
    }

    /**
     * Un toque a medianoche para que el Calendario cambie de día aunque no haya red ni corra
     * el trabajo periódico (inexacta: da igual un par de minutos).
     */
    private fun programaMedianoche(ctx: Context) {
        val am = ctx.getSystemService(AlarmManager::class.java) ?: return
        val t = LocalDate.now().plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli() + 30_000
        val pi = PendingIntent.getBroadcast(ctx, 0, Intent(ctx, AlarmaReceiver::class.java).setAction(ACCION_MEDIANOCHE),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, t, pi)
    }

    /** ¿Ya se enseñó este recordatorio (por la alarma o por la bandeja)? */
    fun yaMostrado(ctx: Context, key: String) = key in prefs(ctx).getStringSet("mostrados", emptySet()).orEmpty()

    @Synchronized
    fun marcaMostrado(ctx: Context, key: String) {
        val p = prefs(ctx)
        // Las claves llevan la fecha: basta con recordar las últimas.
        val m = (p.getStringSet("mostrados", emptySet()).orEmpty().toList() + key).takeLast(300).toSet()
        p.edit(commit = true) { putStringSet("mostrados", m) }
    }

    fun creaCanal(ctx: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        ctx.getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CANAL, ctx.getString(R.string.canal_recordatorios), NotificationManager.IMPORTANCE_HIGH)
                .apply { description = ctx.getString(R.string.canal_recordatorios_desc) },
        )
    }

    /** El id de la notificación de un recordatorio: el mismo para la alarma y para la bandeja. */
    fun idNotificacion(key: String) = key.hashCode()

    /** Enseña el recordatorio (una sola vez aunque llegue también por la bandeja). */
    fun muestra(ctx: Context, r: Recordatorio): Boolean {
        if (yaMostrado(ctx, r.key)) return false
        marcaMostrado(ctx, r.key)
        if (!Permisos.notificaciones(ctx)) return false
        creaCanal(ctx)
        val abrir = Intent(ctx, MainActivity::class.java).setAction(Intent.ACTION_VIEW).setData(Uri.parse(r.enlace))
        val pi = PendingIntent.getActivity(ctx, idNotificacion(r.key), abrir, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = NotificationCompat.Builder(ctx, CANAL)
            .setSmallIcon(R.drawable.ic_notificacion)
            .setColor(0xFFFF5C28.toInt())
            .setContentTitle(r.titulo)
            .setContentText(r.texto.substringAfter(" · ", r.texto))
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setWhen(r.ms.takeIf { it > 0 } ?: System.currentTimeMillis())
            .setContentIntent(pi)
            .setAutoCancel(true)
            // Como en la web: si es una fila con casilla o estado, «Hecho» la marca; si no, descarta.
            .addAction(0, ctx.getString(R.string.recordatorio_hecho), boton(ctx, r, ACCION_HECHO, 1))
            .addAction(0, ctx.getString(R.string.recordatorio_posponer), boton(ctx, r, ACCION_POSPONER, 2))
            .build()
        return try {
            NotificationManagerCompat.from(ctx).notify(idNotificacion(r.key), n)
            true
        } catch (_: SecurityException) {
            false
        }
    }
}

/** Cuando suena una alarma: enseñar el recordatorio (o repintar los widgets a medianoche). */
class AlarmaReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val s = Servicios.de(ctx)
        if (intent.action == "com.monrealperez.notiono.MEDIANOCHE") {
            Widgets.repintaTodo(ctx)
            Alarmas.reprograma(ctx)
            return
        }
        val r = runCatching { json.decodeFromString(Recordatorio.serializer(), intent.getStringExtra("r") ?: return) }.getOrNull() ?: return
        if (intent.action == Alarmas.ACCION_HECHO || intent.action == Alarmas.ACCION_POSPONER) {
            val fin = goAsync()
            s.alcance.launch {
                try {
                    withTimeoutOrNull(20_000) { Alarmas.accion(ctx, if (intent.action == Alarmas.ACCION_HECHO) "hecho" else "posponer", r) }
                } finally {
                    fin.finish()
                }
            }
            return
        }
        val retraso = (System.currentTimeMillis() - r.ms) / 1000
        val enseñado = Alarmas.muestra(ctx, r)
        s.registro.anota("avisos", "recordatorio a su hora · ${if (enseñado) "enseñado" else "no enseñado"} · retraso $retraso s" +
            (if (!Permisos.notificaciones(ctx)) " · sin permiso de notificaciones" else ""))
    }
}

/**
 * Tras reiniciar, actualizar la app, cambiar la hora o conceder las alarmas exactas:
 * reprogramar los recordatorios y repintar los widgets.
 */
class ReprogramaReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val motivo = when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED -> "reinicio"
            Intent.ACTION_MY_PACKAGE_REPLACED -> "actualizacion"
            else -> "permiso"
        }
        Alarmas.reprograma(ctx)
        if (motivo == "actualizacion") Widgets.limpiaRestosDeGlance(ctx)
        val pendiente: PendingResult? = goAsync()
        Servicios.de(ctx).alcance.launch {
            try {
                withTimeoutOrNull(25_000) {
                    Alarmas.actualiza(ctx.applicationContext, motivo)
                    if (motivo != "permiso") Widgets.actualizaTodo(ctx.applicationContext, motivo)
                }
            } finally {
                pendiente?.finish()
            }
        }
    }
}

/** Lo que hace falta para que los avisos lleguen y los widgets se actualicen (Ajustes → Diagnóstico). */
object Permisos {
    fun notificaciones(ctx: Context): Boolean {
        val concedido = Build.VERSION.SDK_INT < 33 ||
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        return concedido && NotificationManagerCompat.from(ctx).areNotificationsEnabled()
    }

    /** Los canales que la persona silenció en los ajustes de Android. */
    fun canalesSilenciados(ctx: Context): List<String> {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return emptyList()
        val nm = ctx.getSystemService(NotificationManager::class.java) ?: return emptyList()
        return listOf(Avisador.CANAL to "avisos de la bandeja", Alarmas.CANAL to "recordatorios")
            .filter { (id, _) -> nm.getNotificationChannel(id)?.importance == NotificationManager.IMPORTANCE_NONE }
            .map { it.second }
    }

    fun bateriaLibre(ctx: Context) = ctx.getSystemService(PowerManager::class.java)?.isIgnoringBatteryOptimizations(ctx.packageName) == true

    /** Lo que falta, en palabras («notificaciones», «alarmas exactas»…). */
    fun faltan(ctx: Context): List<String> = buildList {
        if (!notificaciones(ctx)) add("notificaciones")
        canalesSilenciados(ctx).forEach { add("canal de $it silenciado") }
        if (!Alarmas.exactas(ctx)) add("alarmas exactas")
        if (!bateriaLibre(ctx)) add("batería sin restricciones")
    }

    /** Lo apunta en el registro si cambió desde la última vez (para verlo desde el servidor). */
    fun anota(ctx: Context) {
        val f = faltan(ctx).joinToString(", ")
        val p = ctx.getSharedPreferences("recordatorios", Context.MODE_PRIVATE)
        if (p.getString("faltan", null) == f) return
        p.edit { putString("faltan", f) }
        Servicios.de(ctx).registro.anota("avisos", if (f.isEmpty()) "permisos: todo concedido" else "permisos: faltan $f")
    }
}
