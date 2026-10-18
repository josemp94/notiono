package com.monrealperez.notiono.datos

import android.content.Context
import androidx.core.content.edit
import com.monrealperez.notiono.red.json
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer

@Serializable
data class Reciente(val pageId: String, val title: String, val icon: String? = null, val visto: Long)

/** Lo último visitado, en el propio móvil (como los recientes de la web, en localStorage). */
class Recientes(ctx: Context) {
    private val prefs = ctx.getSharedPreferences("recientes", Context.MODE_PRIVATE)

    fun lista(espacio: String?): List<Reciente> = runCatching {
        json.decodeFromString(ListSerializer(Reciente.serializer()), prefs.getString(espacio ?: "-", null) ?: "[]")
    }.getOrDefault(emptyList())

    fun anota(espacio: String?, r: Reciente) {
        val nueva = (listOf(r) + lista(espacio).filter { it.pageId != r.pageId }).take(20)
        prefs.edit { putString(espacio ?: "-", json.encodeToString(ListSerializer(Reciente.serializer()), nueva)) }
    }

    fun quita(espacio: String?, pageId: String) {
        val nueva = lista(espacio).filter { it.pageId != pageId }
        prefs.edit { putString(espacio ?: "-", json.encodeToString(ListSerializer(Reciente.serializer()), nueva)) }
    }
}
