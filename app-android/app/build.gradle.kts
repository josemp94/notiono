import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.roborazzi)
}

// La firma vive FUERA del repo (~/notiono-apk): es la misma que la de la TWA, para
// que la app nativa se instale encima de la que ya tiene la familia.
val firma = Properties().apply {
    val f = File(System.getProperty("user.home"), "notiono-apk/firma.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

// En debug se puede apuntar a un Notiono local: -Pnotiono.baseUrl=http://10.0.2.2:3100
val baseUrlDebug = (project.findProperty("notiono.baseUrl") as String?) ?: "https://notiono.monrealperez.com"

android {
    namespace = "com.monrealperez.notiono"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.monrealperez.notiono"
        minSdk = 26
        targetSdk = 36
        versionCode = 7
        versionName = "2.1.0"
        buildConfigField("String", "BASE_URL", "\"https://notiono.monrealperez.com\"")
        vectorDrawables.useSupportLibrary = true
    }

    signingConfigs {
        if (firma.getProperty("storeFile") != null) {
            create("notiono") {
                storeFile = file(firma.getProperty("storeFile"))
                storePassword = firma.getProperty("storePassword")
                keyAlias = firma.getProperty("keyAlias")
                keyPassword = firma.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            buildConfigField("String", "BASE_URL", "\"$baseUrlDebug\"")
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("notiono")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    testOptions {
        unitTests {
            isIncludeAndroidResources = true
            all {
                it.maxHeapSize = "1g"
                it.maxParallelForks = 1
                // La integración contra un Notiono de verdad (scripts/integracion-android.ts).
                it.systemProperty("notiono.integracion", project.findProperty("notiono.integracion") ?: "")
                it.systemProperty("notiono.pagina", project.findProperty("notiono.pagina") ?: "")
                // Regenerar los PNG de las vistas previas de los widgets (VistasPreviasTest).
                it.systemProperty("notiono.vistasPrevias", project.findProperty("notiono.vistasPrevias") ?: "")
            }
        }
    }

    // Los mismos documentos de prueba que usa el servidor (scripts/fixtures).
    sourceSets["test"].resources.srcDir("../../scripts/fixtures")

    lint {
        abortOnError = true
        warningsAsErrors = false
        checkReleaseBuilds = true
    }
}

kotlin {
    jvmToolchain(17)
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.core.splashscreen)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.process)
    implementation(libs.androidx.navigation.compose)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.graphics)
    implementation(libs.compose.foundation)
    implementation(libs.compose.material3)
    implementation(libs.compose.ui.tooling.preview)
    debugImplementation(libs.compose.ui.tooling)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.okhttp)
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)
    implementation(libs.androidx.browser)
    implementation(libs.androidx.work)
    implementation(libs.glance.appwidget)
    implementation(libs.glance.material3)
    implementation(libs.androidx.datastore)
    implementation(libs.emojipicker)
    implementation(libs.jlatexmath)

    testImplementation(libs.junit)
    testImplementation(libs.robolectric)
    testImplementation(libs.roborazzi)
    testImplementation(libs.roborazzi.compose)
    testImplementation(libs.roborazzi.junit)
    testImplementation(libs.androidx.test.core)
    testImplementation(libs.androidx.test.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.okhttp.mockwebserver)
    testImplementation(libs.androidx.work.testing)
    testImplementation(platform(libs.compose.bom))
    testImplementation(libs.compose.ui.test.junit4)
    debugImplementation(libs.compose.ui.test.manifest)
}
