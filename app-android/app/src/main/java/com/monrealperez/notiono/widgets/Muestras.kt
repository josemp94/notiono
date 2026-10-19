package com.monrealperez.notiono.widgets

import com.monrealperez.notiono.red.json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject

/**
 * El contenido de ejemplo de las vistas previas de los widgets: lo que enseña el
 * selector del launcher (Android 15, `setWidgetPreview`) y los PNG de
 * `res/drawable-nodpi` que saca `VistasPreviasTest`. Los layouts de `res/layout/widget_previa_*`
 * repiten estos mismos textos a mano.
 */
object Muestras {
    const val TITULO_NOTA = "Lista de la compra"

    private fun bloque(id: String, tipo: String, texto: String, props: String = "{}") =
        """{"id":"$id","type":"$tipo","props":$props,"content":[{"type":"text","text":"$texto","styles":{}}],"children":[]}"""

    private fun casilla(id: String, texto: String, hecha: Boolean) = bloque(id, "checkListItem", texto, """{"checked":$hecha}""")

    val nota: List<JsonObject> = json.parseToJsonElement("[" + listOf(
        bloque("1", "paragraph", "Para el sábado, antes de las 13:00"),
        casilla("2", "Tomates", true),
        casilla("3", "Pan de pueblo", false),
        casilla("4", "Leche sin lactosa", true),
        casilla("5", "Café molido", false),
        casilla("6", "Huevos (una docena)", false),
        bloque("7", "bulletListItem", "Pedir turno en la carnicería"),
    ).joinToString(",") + "]").jsonArray.map { it.jsonObject }

    const val TITULO_LISTA = "Tareas de casa"

    private fun fila(id: String, nombre: String, hecho: Boolean, fecha: String) =
        """{"id":"$id","cells":{"n":"$nombre","h":$hecho,"f":"$fecha"},"textos":{"n":"$nombre","f":"$fecha"}}"""

    private val vista = json.parseToJsonElement("""{
      "fields":[{"id":"n","name":"Nombre","type":"text"},{"id":"h","name":"Hecho","type":"checkbox"},{"id":"f","name":"Fecha","type":"date"}],
      "filas":[${listOf(
        fila("1", "Renovar el DNI", false, "mañana"), fila("2", "Pintar el salón", false, "en 2 días"),
        fila("3", "Revisar la caldera", false, "23 oct"), fila("4", "Comprar regalo de Lucía", true, "ayer"),
        fila("5", "Cambiar el aceite del coche", false, "27 oct"),
      ).joinToString(",")}]
    }""").jsonObject
    val campos: List<JsonObject> = vista["fields"]!!.jsonArray.map { it.jsonObject }
    val filas: List<JsonObject> = vista["filas"]!!.jsonArray.map { it.jsonObject }

    /** El «hoy» de la vista previa del Calendario (fijo, para que el PNG no cambie cada día). */
    val HOY_CALENDARIO: java.time.LocalDate = java.time.LocalDate.of(2026, 10, 19)

    val tareas = listOf(
        TareaCal("m", "1", "Renovar el DNI", "2026-10-16", null, false),
        TareaCal("m", "2", "Llamar al fontanero", "2026-10-19T10:00", null, true),
        TareaCal("m", "3", "Recoger a Lucía", "2026-10-19T17:30", null, false),
        TareaCal("m", "4", "Comprar el regalo", "2026-10-19", null, false),
        TareaCal("m", "5", "Revisar la caldera", "2026-10-21T09:00", null, false),
        TareaCal("m", "6", "Viaje a Lisboa", "2026-10-24", "2026-10-26", false),
        TareaCal("m", "7", "Pagar el seguro", "2026-10-30", null, false),
        TareaCal("m", "8", "Cita del médico", "2026-11-04T12:15", null, false),
    )

    val recientes = listOf(
        PaginaWidget("a", "Casa", "🏠", "", favorita = true),
        PaginaWidget("b", "Menú de la semana", "🍲", "", favorita = true),
        PaginaWidget("c", "Lista de la compra", "🛒", "hace 5 min"),
        PaginaWidget("d", "Viaje a Lisboa", "✈️", "hace 2 h"),
        PaginaWidget("e", "Libros pendientes", null, "ayer"),
        PaginaWidget("f", "Ideas de regalos", "🎁", "hace 3 días"),
    )
}
