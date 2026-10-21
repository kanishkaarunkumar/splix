plugins {
    id("com.android.application") version "9.4.0"
    id("org.jetbrains.kotlin.android") version "2.4.10"
}

android {
    namespace = "com.splix"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.splix.captureprototype"
        minSdk = 27
        targetSdk = 36
        versionCode = 1
        versionName = "0.1-prototype"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test:core-ktx:1.6.1")
    androidTestImplementation("androidx.test.ext:junit-ktx:1.2.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
}
