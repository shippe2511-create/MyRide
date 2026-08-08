# Flutter specific rules
-keep class io.flutter.app.** { *; }
-keep class io.flutter.plugin.**  { *; }
-keep class io.flutter.util.**  { *; }
-keep class io.flutter.view.**  { *; }
-keep class io.flutter.**  { *; }
-keep class io.flutter.plugins.**  { *; }

# Supabase / Realtime
-keep class io.supabase.** { *; }
-keep class com.google.gson.** { *; }

# Google Maps
-keep class com.google.android.gms.maps.** { *; }
-keep class com.google.maps.** { *; }

# Firebase
-keep class com.google.firebase.** { *; }

# Audio
-keep class com.ryanheise.** { *; }
-keep class com.simform.** { *; }

# Keep native methods
-keepclasseswithmembernames class * {
    native <methods>;
}
