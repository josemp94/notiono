// Proyecto de la app nativa de Android de Notiono (ver docs/app-nativa.md).
plugins {
    alias(libs.plugins.android.application) apply false
    // AGP 9 trae Kotlin integrado; declararlo aquí solo fija la versión de Kotlin.
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.serialization) apply false
    alias(libs.plugins.roborazzi) apply false
}
