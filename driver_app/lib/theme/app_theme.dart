import 'package:flutter/material.dart';

class AppColors {
  static const yellow = Color(0xFFFFD60A);
  static const darkBg = Color(0xFF0E0E10);
  static const darkCard = Color(0xFF1A1A1C);
  static const darkBorder = Color(0xFF2A2A2E);
  static const lightBg = Color(0xFFF8F8F8);
  static const lightCard = Color(0xFFFFFFFF);
  static const lightBorder = Color(0xFFE5E5E5);
  static const success = Color(0xFF34C759);
  static const error = Color(0xFFFF3B30);
  static const warning = Color(0xFFFF9500);
  static const info = Color(0xFF0A84FF);
}

class AppTheme {
  static ThemeData get darkTheme => ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: AppColors.darkBg,
        primaryColor: AppColors.yellow,
        colorScheme: const ColorScheme.dark(
          primary: AppColors.yellow,
          secondary: AppColors.yellow,
          surface: AppColors.darkCard,
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: AppColors.darkBg,
          elevation: 0,
          centerTitle: true,
          titleTextStyle: TextStyle(
            color: Colors.white,
            fontSize: 18,
            fontWeight: FontWeight.w600,
          ),
        ),
        cardTheme: CardThemeData(
          color: AppColors.darkCard,
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
              borderRadius: BorderRadius.circular(12),
            ),
            textStyle: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      );

  static ThemeData get lightTheme => ThemeData(
        brightness: Brightness.light,
        scaffoldBackgroundColor: AppColors.lightBg,
        primaryColor: AppColors.yellow,
        colorScheme: const ColorScheme.light(
          primary: AppColors.yellow,
          secondary: AppColors.yellow,
          surface: AppColors.lightCard,
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: AppColors.lightBg,
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
          color: AppColors.lightCard,
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
              borderRadius: BorderRadius.circular(12),
            ),
            textStyle: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      );
}

extension ThemeExtension on BuildContext {
  bool get isDark => Theme.of(this).brightness == Brightness.dark;
  Color get bgColor => isDark ? AppColors.darkBg : AppColors.lightBg;
  Color get cardColor => isDark ? AppColors.darkCard : AppColors.lightCard;
  Color get borderColor => isDark ? AppColors.darkBorder : AppColors.lightBorder;
  Color get textColor => isDark ? Colors.white : Colors.black;
  Color get mutedColor => isDark ? Colors.white54 : Colors.black54;
}
