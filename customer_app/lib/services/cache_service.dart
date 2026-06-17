import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

class CacheService {
  static const String _busScheduleKey = 'cached_bus_schedules';
  static const String _ferryScheduleKey = 'cached_ferry_schedules';
  static const String _lastUpdateKey = 'schedules_last_update';

  // Bus Schedules
  static Future<void> cacheBusSchedules(List<Map<String, dynamic>> schedules) async {
    final prefs = await SharedPreferences.getInstance();
    final jsonString = jsonEncode(schedules);
    await prefs.setString(_busScheduleKey, jsonString);
    await prefs.setString(_lastUpdateKey, DateTime.now().toIso8601String());
  }

  static Future<List<Map<String, dynamic>>> getCachedBusSchedules() async {
    final prefs = await SharedPreferences.getInstance();
    final jsonString = prefs.getString(_busScheduleKey);
    if (jsonString == null) return [];

    final List<dynamic> decoded = jsonDecode(jsonString);
    return decoded.map((e) => Map<String, dynamic>.from(e)).toList();
  }

  // Ferry Schedules
  static Future<void> cacheFerrySchedules(List<Map<String, dynamic>> schedules) async {
    final prefs = await SharedPreferences.getInstance();
    final jsonString = jsonEncode(schedules);
    await prefs.setString(_ferryScheduleKey, jsonString);
    await prefs.setString(_lastUpdateKey, DateTime.now().toIso8601String());
  }

  static Future<List<Map<String, dynamic>>> getCachedFerrySchedules() async {
    final prefs = await SharedPreferences.getInstance();
    final jsonString = prefs.getString(_ferryScheduleKey);
    if (jsonString == null) return [];

    final List<dynamic> decoded = jsonDecode(jsonString);
    return decoded.map((e) => Map<String, dynamic>.from(e)).toList();
  }

  // Check if cache is fresh (less than 24 hours old)
  static Future<bool> isCacheFresh() async {
    final prefs = await SharedPreferences.getInstance();
    final lastUpdate = prefs.getString(_lastUpdateKey);
    if (lastUpdate == null) return false;

    final lastUpdateTime = DateTime.parse(lastUpdate);
    final difference = DateTime.now().difference(lastUpdateTime);
    return difference.inHours < 24;
  }

  // Get last update time
  static Future<DateTime?> getLastUpdateTime() async {
    final prefs = await SharedPreferences.getInstance();
    final lastUpdate = prefs.getString(_lastUpdateKey);
    if (lastUpdate == null) return null;
    return DateTime.parse(lastUpdate);
  }

  // Clear all cache
  static Future<void> clearCache() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_busScheduleKey);
    await prefs.remove(_ferryScheduleKey);
    await prefs.remove(_lastUpdateKey);
  }

  // Default schedules to cache on first run
  static List<Map<String, dynamic>> get defaultBusSchedules => [
    {'route': 'Express A1', 'from': 'Hulhumalé', 'to': 'Airport T1', 'times': ['6:00 AM', '7:00 AM', '8:00 AM', '9:00 AM', '10:00 AM', '2:00 PM', '4:00 PM', '6:00 PM']},
    {'route': 'Express A2', 'from': 'Hulhumalé Phase 2', 'to': 'Airport T2', 'times': ['6:30 AM', '7:30 AM', '8:30 AM', '9:30 AM', '3:00 PM', '5:00 PM', '7:00 PM']},
    {'route': 'Staff Shuttle', 'from': 'Malé', 'to': 'Airport All Terminals', 'times': ['5:30 AM', '6:30 AM', '7:30 AM', '8:30 AM', '2:00 PM', '3:00 PM', '5:00 PM']},
    {'route': 'Night Service', 'from': 'Airport', 'to': 'Hulhumalé', 'times': ['10:00 PM', '11:00 PM', '12:00 AM', '1:00 AM']},
  ];

  static List<Map<String, dynamic>> get defaultFerrySchedules => [
    {'route': 'Malé - Hulhulé', 'duration': '15 min', 'times': ['6:00 AM', '7:00 AM', '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '2:00 PM', '4:00 PM', '6:00 PM', '8:00 PM']},
    {'route': 'Hulhulé - Malé', 'duration': '15 min', 'times': ['6:30 AM', '7:30 AM', '8:30 AM', '9:30 AM', '10:30 AM', '11:30 AM', '12:30 PM', '2:30 PM', '4:30 PM', '6:30 PM', '8:30 PM']},
    {'route': 'Hulhumalé - Hulhulé', 'duration': '10 min', 'times': ['6:15 AM', '7:15 AM', '8:15 AM', '9:15 AM', '10:15 AM', '3:15 PM', '5:15 PM', '7:15 PM']},
    {'route': 'Staff Ferry', 'duration': '12 min', 'times': ['5:45 AM', '6:45 AM', '7:45 AM', '4:45 PM', '5:45 PM', '6:45 PM']},
  ];

  // Initialize cache with defaults if empty
  static Future<void> initializeCache() async {
    final busSchedules = await getCachedBusSchedules();
    if (busSchedules.isEmpty) {
      await cacheBusSchedules(defaultBusSchedules);
    }

    final ferrySchedules = await getCachedFerrySchedules();
    if (ferrySchedules.isEmpty) {
      await cacheFerrySchedules(defaultFerrySchedules);
    }
  }
}
