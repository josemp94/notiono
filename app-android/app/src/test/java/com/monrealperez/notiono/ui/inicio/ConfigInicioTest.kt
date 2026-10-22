package com.monrealperez.notiono.ui.inicio

import com.monrealperez.notiono.red.json
import com.monrealperez.notiono.red.objeto
import java.time.LocalDate
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** El Inicio personalizable de la app lee y pinta lo mismo que la web (src/lib/inicio.ts). */
class ConfigInicioTest {
    private fun cfg(s: String) = ConfigInicio.de(json.parseToJsonElement(s))
    private fun visibles(c: ConfigInicio) = c.bloques.filter { it.visible }.joinToString(",") { it.id }

    @Test
    fun sinNadaGuardadoElDeSiempre() {
        for (raw in listOf("null", "3", "[]", "{}", """{"bloques":"no"}""", """{"bloques":[{"id":"inventado"}]}""")) {
            val c = cfg(raw)
            assertEquals(raw, "recientes,tareas", visibles(c))
            assertEquals(6, c.bloques.size)
            assertEquals(Abrir("inicio"), c.abrir)
        }
        assertEquals("recientes,tareas", visibles(ConfigInicio.de(null)))
    }

    @Test
    fun ordenDesconocidosYQueFaltan() {
        val c = cfg("""{"bloques":[{"id":"enlaces","visible":true},{"id":"futuro","visible":true},{"id":"hoy"},{"id":"enlaces","visible":false},{"id":"recientes","visible":false}]}""")
        assertEquals("enlaces,hoy,recientes,tareas,proximas,favoritos", c.bloques.joinToString(",") { it.id })
        assertEquals("enlaces,hoy", visibles(c))
    }

    @Test
    fun enlacesYAbrir() {
        val c = cfg(
            """{"enlaces":[{"id":"1","tipo":"web","url":"https://a.es","titulo":" A "},{"id":"2","tipo":"web","url":"javascript:alert(1)"},
            {"id":"1","tipo":"pagina","pageId":"p1"},{"id":"3","tipo":"pagina","pageId":"p1","titulo":""},{"id":"4","tipo":"pagina"}],
            "abrir":{"tipo":"pagina","pageId":"p9"}}""",
        )
        assertEquals(listOf(Enlace("1", url = "https://a.es", titulo = "A"), Enlace("3", pageId = "p1")), c.enlaces)
        assertEquals(Abrir("pagina", "p9"), c.abrir)
        assertEquals(Abrir("inicio"), cfg("""{"abrir":{"tipo":"pagina"}}""").abrir)
        // Ida y vuelta por el JSON que se manda a inicio.guardar.
        assertEquals(c, ConfigInicio.de(c.aJson()))
        assertNull(urlValida("javascript:alert(1)"))
        assertNull(urlValida("ftp://x.es"))
        assertNull(urlValida("  "))
        assertEquals("https://ejemplo.es", urlValida(" ejemplo.es "))
        assertEquals("http://x.es/a", urlValida("http://x.es/a"))
    }

    @Test
    fun moverYDestino() {
        assertEquals(listOf("b", "a", "c"), listOf("a", "b", "c").mueve(0, 1))
        assertEquals(listOf("a", "b", "c"), listOf("a", "b", "c").mueve(0, -1))
        assertEquals(listOf("a", "b", "c"), listOf("a", "b", "c").mueve(2, 1))
        val existe = { id: String -> id == "p1" }
        assertEquals("p1", destinoAlIniciar(Abrir("pagina", "p1"), existe, null))
        assertNull(destinoAlIniciar(Abrir("pagina", "borrada"), existe, "p1"))
        assertNull(destinoAlIniciar(Abrir("inicio"), existe, "p1"))
        assertEquals("p1", destinoAlIniciar(Abrir("ultima"), existe, "p1"))
        assertNull(destinoAlIniciar(Abrir("ultima"), existe, null))
    }

    @Test
    fun hoyYProximas() {
        val hoy = LocalDate.parse("2026-10-22")
        val t = { id: String, d: String -> objeto("recordId" to id, "pageId" to "db", "title" to id, "date" to d) }
        val tareas = listOf(t("sin", ""), t("manana", "2026-10-23"), t("hoy", "2026-10-22"), t("vencida", "2026-10-01"), t("semana", "2026-10-29"), t("lejos", "2026-10-30"))
        assertEquals("vencida!,hoy", tareasDeHoy(tareas, hoy).joinToString(",") { (x, v) -> (x["recordId"].toString().trim('"')) + if (v) "!" else "" })
        val r = { k: String, tit: String, ini: String, page: String, rec: String? -> objeto("key" to k, "titulo" to tit, "inicio" to ini, "pageId" to page, "recordId" to rec) }
        val recs: List<JsonObject> = listOf(
            r("k1", "Médico", "2026-10-22T17:00", "pag", null),
            r("k2", "manana", "2026-10-23", "db", "manana"),
            r("k3", "Médico", "2026-10-22T17:00", "pag", null),
            r("k4", "Viaje", "2026-11-15", "pag", null),
            r("k5", "Cumple", "2026-10-25", "otra", "ajena"),
        )
        assertEquals(
            "2026-10-22:Médico:r,2026-10-23:manana:t,2026-10-25:Cumple:r,2026-10-29:semana:t",
            proximasFechas(tareas, recs, hoy).joinToString(",") { "${it.inicio.take(10)}:${it.titulo}:${if (it.recordatorio) "r" else "t"}" },
        )
        assertEquals("manana", proximasFechas(tareas, emptyList(), hoy, 1).joinToString(",") { it.titulo })
    }
}
