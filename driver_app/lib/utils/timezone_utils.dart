/// Maldives Timezone Utilities
/// All times in MyRide should display in Maldives Time (MVT, UTC+5)

class MaldivesTimezone {
  static const Duration offset = Duration(hours: 5);

  /// Convert UTC DateTime to Maldives time
  static DateTime toMaldives(DateTime utc) {
    if (utc.isUtc) {
      return utc.add(offset);
    }
    // If already local, convert to UTC first then add offset
    return utc.toUtc().add(offset);
  }

  /// Parse a UTC string and return Maldives time
  static DateTime? parse(String? dateStr) {
    if (dateStr == null || dateStr.isEmpty) return null;
    final parsed = DateTime.tryParse(dateStr);
    if (parsed == null) return null;
    return toMaldives(parsed);
  }

  /// Get current time in Maldives
  static DateTime now() {
    return DateTime.now().toUtc().add(offset);
  }

  /// Get start of today in Maldives timezone, returned as UTC for database queries
  /// Example: If it's 2AM in Maldives (July 19), this returns midnight July 19 Maldives = 19:00 UTC July 18
  static DateTime todayStartUtc() {
    final maldivesNow = now();
    final maldivesMidnight = DateTime(maldivesNow.year, maldivesNow.month, maldivesNow.day);
    // Convert Maldives midnight back to UTC by subtracting offset
    return maldivesMidnight.subtract(offset);
  }
}
