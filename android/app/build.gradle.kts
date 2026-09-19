import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Signing, if a keystore.properties is present. A debug build does not need
// one, so a fresh clone builds and runs without any secret at all.
val keystoreProperties = Properties().apply {
    val file = rootProject.file("keystore.properties")
    if (file.exists()) {
        file.inputStream().use { load(it) }
    }
}
val hasSigning = keystoreProperties.getProperty("storeFile") != null

android {
    namespace = "com.diegoami.baloncelli"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.diegoami.baloncelli"
        // 26, not 24, so the launcher icon can be an adaptive vector and the
        // project carries no generated PNGs. Android 8 is also the floor for
        // a WebView new enough to run this without surprises.
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "2.0"
    }

    if (hasSigning) {
        signingConfigs {
            create("release") {
                storeFile = file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (hasSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

}

/**
 * The game itself, copied in at build time.
 *
 * One source of truth: the APK is built from the same public/ the website
 * serves, rather than a second copy that drifts. It lands in the ordinary
 * assets folder and is gitignored there -- pointing assets.srcDirs at a build
 * directory instead made AGP fail with "Invalid file path".
 */
val copyGame by tasks.registering(Copy::class) {
    from(rootProject.file("../public"))
    into("src/main/assets/www")
}

tasks.named("preBuild") { dependsOn(copyGame) }

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    // WebViewAssetLoader: serves the bundled game over https rather than
    // file://, which is the whole reason this app works at all.
    implementation("androidx.webkit:webkit:1.12.1")
}
