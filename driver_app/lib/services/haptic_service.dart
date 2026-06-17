import 'package:flutter/services.dart';

class HapticService {
  static void light() {
    HapticFeedback.lightImpact();
  }

  static void medium() {
    HapticFeedback.mediumImpact();
  }

  static void heavy() {
    HapticFeedback.heavyImpact();
  }

  static void selection() {
    HapticFeedback.selectionClick();
  }

  static void success() {
    HapticFeedback.mediumImpact();
  }

  static void error() {
    HapticFeedback.heavyImpact();
  }

  static void warning() {
    HapticFeedback.lightImpact();
  }

  static void buttonTap() {
    HapticFeedback.lightImpact();
  }

  static void notification() {
    HapticFeedback.heavyImpact();
  }

  static void newRideRequest() {
    HapticFeedback.heavyImpact();
  }
}
