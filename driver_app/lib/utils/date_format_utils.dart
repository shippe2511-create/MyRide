import 'package:intl/intl.dart';

/// Centralized date formatting for MyRide app
/// All dates should use dd/MM/yyyy format
class AppDateFormat {
  /// Full date: 28/07/2026
  static String date(DateTime date) {
    return DateFormat('dd/MM/yyyy').format(date);
  }

  /// Short date: 28/07
  static String dateShort(DateTime date) {
    return DateFormat('dd/MM').format(date);
  }

  /// Date with day name: Mon, 28/07/2026
  static String dateWithDay(DateTime date) {
    return DateFormat('EEE, dd/MM/yyyy').format(date);
  }

  /// Date with day name short: Mon, 28/07
  static String dateWithDayShort(DateTime date) {
    return DateFormat('EEE, dd/MM').format(date);
  }

  /// Time only: 2:30 PM
  static String time(DateTime date) {
    return DateFormat('h:mm a').format(date);
  }

  /// Date and time: 28/07/2026 · 2:30 PM
  static String dateTime(DateTime date) {
    return '${DateFormat('dd/MM/yyyy').format(date)} · ${DateFormat('h:mm a').format(date)}';
  }

  /// Short date and time: 28/07 · 2:30 PM
  static String dateTimeShort(DateTime date) {
    return '${DateFormat('dd/MM').format(date)} · ${DateFormat('h:mm a').format(date)}';
  }

  /// Date range: 28/07 - 30/07
  static String dateRange(DateTime start, DateTime end) {
    return '${dateShort(start)} - ${dateShort(end)}';
  }

  /// Date range full: 28/07/2026 - 30/07/2026
  static String dateRangeFull(DateTime start, DateTime end) {
    return '${date(start)} - ${date(end)}';
  }
}
