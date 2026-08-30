import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.cryptogate.cashier"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.cryptogate.cashier"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0-m4-23"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    // M4-23: test vs prod API base URL (+ optional release signing).
    // Override without editing Gradle:
    //   -Pcryptogate.stagingApi=https://api-test.example/v1
    //   -Pcryptogate.prodApi=https://api.example/v1
    val stagingApi =
        (project.findProperty("cryptogate.stagingApi") as String?)
            ?.trim()
            ?.takeIf { it.isNotEmpty() }
            ?: "http://10.0.2.2:3000/v1"
    val prodApi =
        (project.findProperty("cryptogate.prodApi") as String?)
            ?.trim()
            ?.takeIf { it.isNotEmpty() }
            ?: "https://api.cryptogate.example/v1"

    flavorDimensions += "env"
    productFlavors {
        create("staging") {
            dimension = "env"
            applicationIdSuffix = ".staging"
            versionNameSuffix = "-staging"
            buildConfigField("String", "API_BASE_URL", "\"$stagingApi\"")
            buildConfigField("String", "APP_ENV", "\"staging\"")
            // Align with CRYPTOGATE_CHAIN_ENV — Nile visible on staging builds.
            buildConfigField("String", "CHAIN_ENV", "\"testnet\"")
            resValue("string", "app_name", "CryptoGate POS (Test)")
        }
        create("prod") {
            dimension = "env"
            buildConfigField("String", "API_BASE_URL", "\"$prodApi\"")
            buildConfigField("String", "APP_ENV", "\"prod\"")
            buildConfigField("String", "CHAIN_ENV", "\"mainnet\"")
            resValue("string", "app_name", "CryptoGate POS")
        }
    }

    val keystorePropsFile = rootProject.file("keystore.properties")
    val keystoreProps = Properties()
    val hasReleaseKeystore = keystorePropsFile.exists()
    if (hasReleaseKeystore) {
        keystoreProps.load(keystorePropsFile.inputStream())
    }

    signingConfigs {
        if (hasReleaseKeystore) {
            create("release") {
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
                storeFile = file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            if (hasReleaseKeystore) {
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
    buildFeatures {
        compose = true
        buildConfig = true
    }
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.10.01")
    implementation(composeBom)
    androidTestImplementation(composeBom)

    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.security:security-crypto:1.1.0-alpha06")

    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.google.zxing:core:3.5.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("org.json:json:20240303")

    debugImplementation("androidx.compose.ui:ui-tooling")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
