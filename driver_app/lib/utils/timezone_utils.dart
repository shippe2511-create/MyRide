/// Maldives Timezone Utilities
/// All times in MyRide should display in Maldives Time (MVT, UTC+5)
///
/// IMPORTANT: We assume the device is physically located in Maldives
/// and the device timezone is set correctly. This avoids double-conversion issues.

class MaldivesTimezone {
  static const Duration offset = Duration(hours: 5);

  /// Convert UTC DateTime to Maldives time
  static DateTime toMaldives(DateTime utc) {
    if (utc.isUtc) {
      return utc.add(offset);
    }
    // If already local (device in Maldives), return as-is
    return utc;
  }

  /// Parse a UTC string and return Maldives time
  static DateTime? parse(String? dateStr) {
    if (dateStr == null || dateStr.isEmpty) return null;
    final parsed = DateTime.tryParse(dateStr);
    if (parsed == null) return null;
    // Database stores UTC, convert to Maldives
    if (parsed.isUtc) {
      return parsed.add(offset);
    }
    return parsed;
  }

  /// Get current time in Maldives
  /// Since device is in Maldives, DateTime.now() is already Maldives time
  static DateTime now() {
    return DateTime.now();
  }

  /// Get today's date as string (YYYY-MM-DD) in Maldives timezone
  static String todayDateString() {
    final now = DateTime.now();
    return '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
  }

  /// Get start of today in Maldives timezone, returned as UTC for database queries
  static DateTime todayStartUtc() {
    final localNow = DateTime.now();
    final localMidnight = DateTime(localNow.year, localNow.month, localNow.day);
    // Convert local midnight to UTC
    return localMidnight.toUtc();
  }
}
