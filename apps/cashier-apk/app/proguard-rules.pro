# Release builds are minified (R8): Compose runs much faster on the G7 than unminified.

# ZCS SmartPos SDK talks to native drivers (JNI) and callbacks by name — keep it untouched.
-keep class com.zcs.** { *; }
-keep interface com.zcs.** { *; }
-dontwarn com.zcs.**
-keepclasseswithmembernames class * {
    native <methods>;
}

# Tink (security-crypto) references annotation-only artifacts that are not on the classpath.
-dontwarn com.google.errorprone.annotations.**
-dontwarn javax.annotation.**

# Keep line numbers so crash stack traces stay readable.
-keepattributes SourceFile,LineNumberTable
