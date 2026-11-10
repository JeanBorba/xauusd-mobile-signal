plugins {
    id("com.android.application")
}
android {
    namespace = "br.com.jeanborba.assistantlab"
    compileSdk = 37
    defaultConfig {
        applicationId = "br.com.jeanborba.assistantlab"
        minSdk = 32
        targetSdk = 36
        versionCode = 4
        versionName = "0.6.3-lab"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
