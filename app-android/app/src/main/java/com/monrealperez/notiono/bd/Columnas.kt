package com.monrealperez.notiono.bd

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.monrealperez.notiono.datos.Campo
import com.monrealperez.notiono.red.arr
import com.monrealperez.notiono.red.comoLista
import com.monrealperez.notiono.red.comoObjeto
import com.monrealperez.notiono.red.int
import com.monrealperez.notiono.red.objs
import com.monrealperez.notiono.red.str
import com.monrealperez.notiono.ui.comun.Campo as CampoTexto
import com.monrealperez.notiono.ui.comun.Confirmar
import com.monrealperez.notiono.ui.comun.FilaMenu
import com.monrealperez.notiono.ui.comun.HojaLista
import com.monrealperez.notiono.ui.comun.Icono
import com.monrealperez.notiono.ui.comun.PedirTexto
import com.monrealperez.notiono.ui.comun.Separador
import com.monrealperez.notiono.ui.comun.TituloSeccion
import com.monrealperez.notiono.ui.comun.rememberConsulta
import com.monrealperez.notiono.ui.tema.C
import com.monrealperez.notiono.ui.tema.Marca
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** Formatos del campo Número (NUMBER_FORMATS de la web). */
val FORMATOS_NUMERO = listOf("plain" to "Normal", "euro" to "Euros (€)", "dolar" to "Dólares ($)", "libra" to "Libras (£)", "percent" to "Porcentaje (%)", "bar" to "Barra", "ring" to "Anillo")
val AGREGADOS_ROLLUP = listOf("count" to "Contar", "sum" to "Suma", "avg" to "Media", "min" to "Mínimo", "max" to "Máximo", "values" to "Mostrar valores")

/** El menú de una columna, como el de la cabecera de la web. `NUEVO_CAMPO` = crear una. */
@Composable
fun HojaCampo(est: EstadoBD, c: Campo, onCerrar: () -> Unit) {
    if (c.id == NUEVO_CAMPO.id) {
        HojaNuevoCampo(est, null, onCerrar)
        return
    }
    var sub by remember { mutableStateOf<String?>(null) }
    val cfg = c.cfg()
    fun ponCfg(vararg pares: Pair<String, kotlinx.serialization.json.JsonElement?>) {
        val m = cfg.toMutableMap()
        for ((k, v) in pares) if (v == null) m.remove(k) else m[k] = v
        est.configCampo(c.id, JsonObject(m))
    }
    when (sub) {
        "renombrar" -> { PedirTexto("Nombre de la columna", c.name, onOk = { t -> est.renombraCampo(c.id, t); onCerrar() }, onNo = onCerrar); return }
        "insertar" -> { HojaNuevoCampo(est, c.id, onCerrar); return }
        "borrar" -> { Confirmar("¿Borrar «${c.name}»?", "Se pierden sus valores en todas las filas.", onSi = { est.borraCampo(c.id); onCerrar() }, onNo = onCerrar); return }
        "prefijo" -> { PedirTexto("Prefijo del ID", cfg.str("prefix").orEmpty(), placeholder = "TAREA-", onOk = { t -> ponCfg("prefix" to JsonPrimitive(t)); onCerrar() }, onNo = onCerrar); return }
        "formula" -> { PedirTexto("Fórmula", cfg.str("expression").orEmpty(), placeholder = "prop(\"Precio\") * 2", onOk = { t -> ponCfg("expression" to JsonPrimitive(t)); onCerrar() }, onNo = onCerrar); return }
        "etiqueta" -> { PedirTexto("Texto del botón", cfg.str("label").orEmpty(), placeholder = "Hacer", onOk = { t -> ponCfg("label" to JsonPrimitive(t)); onCerrar() }, onNo = onCerrar); return }
        "maximo" -> { PedirTexto("Valor máximo de la barra", (cfg.int("max") ?: 100).toString(), onOk = { t -> t.toDoubleOrNull()?.let { ponCfg("max" to JsonPrimitive(it)) }; onCerrar() }, onNo = onCerrar); return }
    }
    HojaLista(onCerrar) {
        Row(Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) {
            Icono(iconoCampo(c.type), color = C.apagado)
            Text(c.name.ifBlank { "Sin nombre" }, fontSize = 16.sp, color = C.texto, modifier = Modifier.padding(start = 8.dp))
        }
        if (est.editable) {
            FilaMenu("Renombrar", "pencil") { sub = "renombrar" }
            if (c.type !in setOf("relation", "rollup", "formula")) FilaMenu("Tipo: ${TIPOS_CAMPO.toMap()[c.type] ?: c.type}", "type") { sub = "tipo" }
        }
        TituloSeccion("Ordenar y filtrar")
        FilaMenu("Orden ascendente", "arrow-up") { est.ponConfig(mapOf("sorts" to JsonArray(listOf(JsonObject(mapOf("fieldId" to JsonPrimitive(c.id), "dir" to JsonPrimitive("asc"))))))); onCerrar() }
        FilaMenu("Orden descendente", "arrow-down") { est.ponConfig(mapOf("sorts" to JsonArray(listOf(JsonObject(mapOf("fieldId" to JsonPrimitive(c.id), "dir" to JsonPrimitive("desc"))))))); onCerrar() }
        if (est.editable) {
            FilaMenu("Ocultar en esta vista", "eye-off") {
                val ocultos = (est.vista?.cfg()?.arr("hiddenFields")?.toList() ?: emptyList()) + JsonPrimitive(c.id)
                est.ponConfig(mapOf("hiddenFields" to JsonArray(ocultos))); onCerrar()
            }
            val i = est.visibles().indexOfFirst { it.id == c.id }
            if (est.vista?.type == "table" && i >= 0) FilaMenu("Congelar hasta esta columna", "pin") { est.ponConfig(mapOf("frozen" to JsonPrimitive(i + 1))); onCerrar() }
            when (c.type) {
                "number" -> {
                    TituloSeccion("Formato")
                    for ((k, n) in FORMATOS_NUMERO) FilaMenu(n, "hash", derecha = { if ((cfg.str("format") ?: "plain") == k) Icono("check", color = Marca) }) { ponCfg("format" to JsonPrimitive(k)); onCerrar() }
                    if (cfg.str("format") == "bar" || cfg.str("format") == "ring") FilaMenu("Máximo de la barra: ${cfg.int("max") ?: 100}", "ruler") { sub = "maximo" }
                }
                "date" -> {
                    TituloSeccion("Fecha")
                    Interruptor("Incluir hora", cfg["time"]?.toString() == "true") { ponCfg("time" to JsonPrimitive(it)) }
                    Interruptor("Fecha de fin (rango)", cfg["range"]?.toString() == "true") { ponCfg("range" to JsonPrimitive(it)) }
                    Interruptor("Reloj de 12 horas", cfg["hour12"]?.toString() == "true") { ponCfg("hour12" to JsonPrimitive(it)) }
                    for ((k, n) in listOf("largo" to "24 ago 2026", "corto" to "24/08/2026", "relativo" to "Relativa (hoy, ayer…)")) {
                        FilaMenu(n, "calendar", derecha = { if ((cfg.str("dateFormat") ?: "largo") == k) Icono("check", color = Marca) }) { ponCfg("dateFormat" to JsonPrimitive(k)); onCerrar() }
                    }
                }
                "id" -> FilaMenu("Prefijo: ${cfg.str("prefix").orEmpty().ifBlank { "ninguno" }}", "key-round") { sub = "prefijo" }
                "formula" -> FilaMenu("Editar fórmula", "function-square", detalle = cfg.str("expression")) { sub = "formula" }
                "button" -> FilaMenu("Texto del botón", "mouse-pointer-click", detalle = "Las acciones se configuran en la web") { sub = "etiqueta" }
                "person" -> Interruptor("Una sola persona", cfg["single"]?.toString() == "true") { ponCfg("single" to JsonPrimitive(it)) }
                "select", "multiselect", "status" -> FilaMenu("Opciones (${c.opciones().size})", "list", detalle = "Toca una celda para crear o editar opciones") {}
            }
            Separador()
            FilaMenu("Insertar columna detrás", "plus") { sub = "insertar" }
            FilaMenu("Duplicar columna", "copy-plus") { est.duplicaCampo(c.id); onCerrar() }
            val campos = est.campos
            val j = campos.indexOfFirst { it.id == c.id }
            if (j > 0) FilaMenu("Mover a la izquierda", "arrow-left") { est.mueveCampo(c.id, antesDe = campos[j - 1].id); onCerrar() }
            if (j in 0 until campos.size - 1) FilaMenu("Mover a la derecha", "arrow-right") { est.mueveCampo(c.id, despuesDe = campos[j + 1].id); onCerrar() }
            FilaMenu("Borrar columna", "trash-2", color = Color(0xFFD44C47)) { sub = "borrar" }
        }
    }
    if (sub == "tipo") HojaLista({ sub = null }, "Cambiar el tipo") {
        Text("Se convierten los valores; lo que no encaje se pierde.", fontSize = 13.sp, color = C.apagado, modifier = Modifier.padding(horizontal = 16.dp))
        for ((k, n) in TIPOS_CAMPO.filter { it.first !in setOf("relation", "rollup", "formula") }) {
            FilaMenu(n, iconoCampo(k), derecha = { if (c.type == k) Icono("check", color = Marca) }) { est.tipoCampo(c.id, k); onCerrar() }
        }
    }
}

@Composable
fun Interruptor(texto: String, valor: Boolean, onCambio: (Boolean) -> Unit) {
    var v by remember(valor) { mutableStateOf(valor) }
    FilaMenu(texto, null, derecha = {
        Switch(v, { v = it; onCambio(it) }, colors = SwitchDefaults.colors(checkedTrackColor = Marca))
    }) { v = !v; onCambio(v) }
}

/** Crear una columna: nombre y tipo (relación, rollup y fórmula piden algo más). */
@Composable
fun HojaNuevoCampo(est: EstadoBD, despuesDe: String?, onCerrar: () -> Unit) {
    val alcance = rememberCoroutineScope()
    var nombre by remember { mutableStateOf("") }
    var tipo by remember { mutableStateOf<String?>(null) }
    // Relación
    var destino by remember { mutableStateOf<String?>(null) }
    var espejo by remember { mutableStateOf(false) }
    // Rollup
    var relacion by remember { mutableStateOf<String?>(null) }
    var objetivo by remember { mutableStateOf<String?>(null) }
    var agg by remember { mutableStateOf("count") }
    var expresion by remember { mutableStateOf("") }
    val bds = rememberConsulta("db.listDatabases").datos?.comoLista?.map { it.comoObjeto } ?: emptyList()
    HojaLista(onCerrar, "Nueva columna") {
        Box(Modifier.padding(horizontal = 16.dp)) { CampoTexto(nombre, { nombre = it }, placeholder = "Nombre", autofoco = true) }
        val t = tipo
        if (t == null) {
            for ((k, n) in TIPOS_CAMPO) FilaMenu(n, iconoCampo(k)) {
                tipo = k
                if (nombre.isBlank()) nombre = n
                if (k !in setOf("relation", "rollup", "formula")) {
                    alcance.launch { est.nuevoCampo(k, nombre.ifBlank { n }, despuesDe) }
                    onCerrar()
                }
            }
            return@HojaLista
        }
        when (t) {
            "relation" -> {
                TituloSeccion("¿Con qué base de datos?")
                for (b in bds) FilaMenu(b.str("title")?.ifBlank { null } ?: "Sin título", "database", derecha = { if (destino == b.str("collectionId")) Icono("check", color = Marca) }) { destino = b.str("collectionId") }
                Interruptor("Mostrar también en la otra base de datos", espejo) { espejo = it }
            }
            "rollup" -> {
                val relaciones = est.campos.filter { it.type == "relation" }
                TituloSeccion("Relación")
                if (relaciones.isEmpty()) Text("Primero crea una columna de relación.", color = C.apagado, modifier = Modifier.padding(horizontal = 16.dp))
                for (r in relaciones) FilaMenu(r.name, "arrow-up-right", derecha = { if (relacion == r.id) Icono("check", color = Marca) }) { relacion = r.id }
                val dest = relaciones.firstOrNull { it.id == relacion }?.cfg()?.str("targetCollectionId")
                val camposDest = bds.firstOrNull { it.str("collectionId") == dest }?.objs("fields") ?: emptyList()
                if (relacion != null) {
                    TituloSeccion("Propiedad")
                    for (f in camposDest) FilaMenu(f.str("name").orEmpty(), iconoCampo(f.str("type").orEmpty()), derecha = { if (objetivo == f.str("id")) Icono("check", color = Marca) }) { objetivo = f.str("id") }
                    TituloSeccion("Cálculo")
                    for ((k, n) in AGREGADOS_ROLLUP) FilaMenu(n, "sigma", derecha = { if (agg == k) Icono("check", color = Marca) }) { agg = k }
                }
            }
            "formula" -> Column(Modifier.padding(horizontal = 16.dp)) {
                Text("Expresión", fontSize = 13.sp, color = C.apagado)
                CampoTexto(expresion, { expresion = it }, placeholder = "prop(\"Precio\") * prop(\"Cantidad\")", unaLinea = false)
            }
        }
        TextButton({
            alcance.launch {
                when (t) {
                    "relation" -> destino?.let { est.nuevaRelacion(nombre.ifBlank { "Relación" }, it, espejo) }
                    "rollup" -> relacion?.let { est.nuevoRollup(nombre.ifBlank { "Rollup" }, it, objetivo, agg) }
                    "formula" -> est.nuevaFormula(nombre.ifBlank { "Fórmula" }, expresion)
                }
            }
            onCerrar()
        }, Modifier.padding(horizontal = 8.dp)) { Text("Crear", color = Marca) }
    }
}
