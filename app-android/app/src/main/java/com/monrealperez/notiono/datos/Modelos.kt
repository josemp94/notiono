package com.monrealperez.notiono.datos

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

// Las respuestas que se usan en muchos sitios. Lo libre (configs, celdas) se queda
// como JsonElement: la app lo conserva tal cual aunque no lo entienda.

@Serializable
data class Yo(
    val id: String,
    val email: String,
    val name: String? = null,
    val role: String? = null,
    val wsRole: String? = null,
    val workspace: EspacioRef? = null,
)

@Serializable
data class EspacioRef(val id: String, val name: String, val icon: String? = null)

@Serializable
data class Espacio(val id: String, val name: String, val icon: String? = null, val role: String? = null, val active: Boolean = false)

@Serializable
data class NodoArbol(
    val id: String,
    val title: String = "",
    val icon: String? = null,
    val parentId: String? = null,
    val order: String = "",
    val hasChildren: Boolean = false,
)

@Serializable
data class PaginaInfo(
    val id: String,
    val parentId: String? = null,
    val title: String = "",
    val icon: String? = null,
    val cover: String? = null,
    val type: String = "doc",
    val embedded: Boolean = false,
    val fullWidth: Boolean = false,
    val locked: Boolean = false,
    val font: String = "sans",
    val publicToken: String? = null,
    val publicExpiresAt: String? = null,
    val hasPublicPassword: Boolean = false,
    val restricted: Boolean = false,
    val archivedAt: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
    val siguiendo: Boolean = false,
    val favorita: Boolean = false,
    val nivel: String = "view",
    val editadoPor: String? = null,
) {
    val puedeEditar get() = nivel == "edit" || nivel == "full"
    val puedeComentar get() = puedeEditar || nivel == "comment"
    val esBd get() = type == "database"
}

@Serializable
data class Miembro(val userId: String, val name: String? = null, val email: String = "", val role: String = "editor") {
    val nombre get() = name?.takeIf { it.isNotBlank() } ?: email
}

@Serializable
data class Campo(
    val id: String,
    val name: String = "",
    val type: String = "text",
    val order: String = "",
    val config: JsonElement? = null,
    val collectionId: String? = null,
)

@Serializable
data class Vista(
    val id: String,
    val name: String = "",
    val type: String = "table",
    val config: JsonElement? = null,
    val order: String = "",
    val collectionId: String? = null,
)

@Serializable
data class RelacionEtiqueta(val id: String, val title: String)

@Serializable
data class Fila(
    val id: String,
    val parentId: String? = null,
    val cells: JsonObject = JsonObject(emptyMap()),
    val textos: Map<String, String> = emptyMap(),
    val relaciones: Map<String, List<RelacionEtiqueta>> = emptyMap(),
    val color: String? = null,
    val seq: Int? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
    val createdById: String? = null,
    val updatedById: String? = null,
)

@Serializable
data class Subgrupo(val clave: String, val etiqueta: String, val ids: List<String>, val totales: Map<String, String> = emptyMap())

@Serializable
data class Grupo(
    val clave: String,
    val etiqueta: String,
    val ids: List<String>,
    val totales: Map<String, String> = emptyMap(),
    val subgrupos: List<Subgrupo>? = null,
)

@Serializable
data class Coleccion(val id: String, val name: String = "", val description: String = "", val templates: JsonElement? = null)

@Serializable
data class Persona(val id: String, val nombre: String)

/** Una vista de BD lista para pintar (app.vista). */
@Serializable
data class DatosVista(
    val collection: Coleccion,
    val fields: List<Campo> = emptyList(),
    val views: List<Vista> = emptyList(),
    val view: Vista? = null,
    val personas: List<Persona> = emptyList(),
    val filas: List<Fila> = emptyList(),
    val total: Int = 0,
    val grupos: List<Grupo>? = null,
    val totales: Map<String, String> = emptyMap(),
    val nivel: String = "view",
    val locked: Boolean = false,
) {
    val puedeEditar get() = (nivel == "edit" || nivel == "full") && !locked
}
