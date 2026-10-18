# kotlinx.serialization: las clases @Serializable conservan su serializador.
-keepattributes *Annotation*, InnerClasses
-keepclassmembers class com.monrealperez.notiono.** {
    *** Companion;
}
-keepclasseswithmembers class com.monrealperez.notiono.** {
    kotlinx.serialization.KSerializer serializer(...);
}
# jlatexmath carga sus fuentes y tablas por reflexión.
-keep class ru.noties.jlatexmath.** { *; }
-keep class org.scilab.forge.jlatexmath.** { *; }
-dontwarn java.awt.**
-dontwarn javax.swing.**
-dontwarn org.scilab.forge.jlatexmath.**
