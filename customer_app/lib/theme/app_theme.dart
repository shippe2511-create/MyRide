import 'package:flutter/material.dart';

class AppColors {
  // Dark theme colors - matching driver app
  static const Color bgDark = Color(0xFF0E0E10);
  static const Color bg2Dark = Color(0xFF1A1A1C);
  static const Color surfaceDark = Color(0xFF1A1A1C);
  static const Color borderDark = Color(0xFF2A2A2E);
  static const Color textDark = Color(0xFFFAFAFA);
  static const Color mutedDark = Color(0x8CFAFAFA);
  static const Color faintDark = Color(0x59FAFAFA);

  // Light theme colors
  static const Color bgLight = Color(0xFFF5F5F7);
  static const Color bg2Light = Color(0xFFFFFFFF);
  static const Color surfaceLight = Color(0xFFFFFFFF);
  static const Color borderLight = Color(0xFFE0E0E0);
  static const Color textLight = Color(0xFF1C1C1E);
  static const Color mutedLight = Color(0xFF8E8E93);
  static const Color faintLight = Color(0xFFC7C7CC);

  // Dynamic colors based on brightness
  static Color getBackground(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark ? bgDark : bgLight;
  static Color getSurface(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark ? surfaceDark : surfaceLight;
  static Color getBorder(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark ? borderDark : borderLight;
  static Color getText(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark ? textDark : textLight;
  static Color getMuted(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark ? mutedDark : mutedLight;

  // Shared colors (const for backwards compatibility)
  static const Color bg = bgDark;
  static const Color bg2 = bg2Dark;
  static const Color surface = surfaceDark;
  static const Color text = textDark;
  static const Color muted = mutedDark;
  static const Color faint = faintDark;
  static const Color hair = Color(0x14FFFFFF);

  // Brand colors - matching driver app
  static const Color yellow = Color(0xFFFFD60A);
  static const Color yellow2 = Color(0xFFF5C400);
  static const Color yellowSoft = Color(0x1FFFD60A);
  static const Color green = Color(0xFF34C759);
  static const Color red = Color(0xFFFF3B30);
  static const Color success = Color(0xFF34C759);
  static const Color error = Color(0xFFFF3B30);
  static const Color warning = Color(0xFFFF9500);
  static const Color info = Color(0xFF007AFF);
}

class AppTheme {
  static ThemeData get darkTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: AppColors.bgDark,
      primaryColor: AppColors.yellow,
      colorScheme: const ColorScheme.dark(
        primary: AppColors.yellow,
        secondary: AppColors.yellow2,
        surface: AppColors.surfaceDark,
        onPrimary: AppColors.bgDark,
        onSecondary: AppColors.bgDark,
        onSurface: AppColors.textDark,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.bgDark,
        elevation: 0,
        centerTitle: true,
        titleTextStyle: TextStyle(
          color: Colors.white,
          fontSize: 18,
          fontWeight: FontWeight.w600,
        ),
      ),
      cardTheme: CardThemeData(
        color: AppColors.surfaceDark,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.yellow,
          foregroundColor: Colors.black,
          padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          textStyle: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      fontFamily: 'SF Pro Display',
      textTheme: const TextTheme(
        displayLarge: TextStyle(
          fontSize: 38,
          fontWeight: FontWeight.w700,
          letterSpacing: -1.2,
          color: AppColors.textDark,
        ),
        headlineMedium: TextStyle(
          fontSize: 22,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.5,
          color: AppColors.textDark,
        ),
        titleLarge: TextStyle(
          fontSize: 18,
          fontWeight: FontWeight.w700,
          color: AppColors.textDark,
        ),
        bodyLarge: TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.w600,
          color: AppColors.textDark,
        ),
        bodyMedium: TextStyle(
          fontSize: 14,
          color: AppColors.textDark,
        ),
        labelMedium: TextStyle(
          fontSize: 13,
          letterSpacing: 2,
          color: AppColors.mutedDark,
        ),
      ),
    );
  }

  static ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      scaffoldBackgroundColor: AppColors.bgLight,
      primaryColor: AppColors.yellow,
      colorScheme: const ColorScheme.light(
        primary: AppColors.yellow,
        secondary: AppColors.yellow2,
        surface: AppColors.surfaceLight,
        onPrimary: AppColors.bgDark,
        onSecondary: AppColors.bgDark,
        onSurface: AppColors.textLight,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.bgLight,
        elevation: 0,
        centerTitle: true,
        titleTextStyle: TextStyle(
          color: Colors.black,
          fontSize: 18,
          fontWeight: FontWeight.w600,
        ),
        iconTheme: IconThemeData(color: Colors.black),
      ),
      cardTheme: CardThemeData(
        color: AppColors.surfaceLight,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.yellow,
          foregroundColor: Colors.black,
          padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          textStyle: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      fontFamily: 'SF Pro Display',
      textTheme: const TextTheme(
        displayLarge: TextStyle(
          fontSize: 38,
          fontWeight: FontWeight.w700,
          letterSpacing: -1.2,
          color: AppColors.textLight,
        ),
        headlineMedium: TextStyle(
          fontSize: 22,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.5,
          color: AppColors.textLight,
        ),
        titleLarge: TextStyle(
          fontSize: 18,
          fontWeight: FontWeight.w700,
          color: AppColors.textLight,
        ),
        bodyLarge: TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.w600,
          color: AppColors.textLight,
        ),
        bodyMedium: TextStyle(
          fontSize: 14,
          color: AppColors.textLight,
        ),
        labelMedium: TextStyle(
          fontSize: 13,
          letterSpacing: 2,
          color: AppColors.mutedLight,
        ),
      ),
    );
  }
}

extension ThemeColors on BuildContext {
  bool get isDark => Theme.of(this).brightness == Brightness.dark;
  Color get bgColor => isDark ? AppColors.bgDark : AppColors.bgLight;
  Color get bg2Color => isDark ? AppColors.bg2Dark : AppColors.bg2Light;
  Color get surfaceColor => isDark ? AppColors.surfaceDark : AppColors.surfaceLight;
  Color get borderColor => isDark ? AppColors.borderDark : AppColors.borderLight;
  Color get textColor => isDark ? AppColors.textDark : AppColors.textLight;
  Color get mutedColor => isDark ? AppColors.mutedDark : AppColors.mutedLight;
  Color get faintColor => isDark ? AppColors.faintDark : AppColors.faintLight;
  Color get cardColor => isDark ? AppColors.surfaceDark : AppColors.surfaceLight;
}
