import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:connectivity_plus/connectivity_plus.dart';

class OfflineService {
  static SharedPreferences? _prefs;
  static bool _isOnline = true;
  static final List<Map<String, dynamic>> _pendingActions = [];

  static Future<void> initialize() async {
    _prefs = await SharedPreferences.getInstance();
    _loadPendingActions();
    _monitorConnectivity();
  }

  static void _monitorConnectivity() {
    Connectivity().onConnectivityChanged.listen((results) {
      final wasOffline = !_isOnline;
      _isOnline = results.isNotEmpty && !results.contains(ConnectivityResult.none);

      if (_isOnline && wasOffline) {
        syncPendingActions();
      }
    });
  }

  static bool get isOnline => _isOnline;

  static Future<void> cacheDriverProfile(Map<String, dynamic> profile) async {
    await _prefs?.setString('cached_driver_profile', jsonEncode(profile));
    debugPrint('Cached driver profile');
  }

  static Map<String, dynamic>? getCachedDriverProfile() {
    final data = _prefs?.getString('cached_driver_profile');
    if (data != null) {
      return jsonDecode(data) as Map<String, dynamic>;
    }
    return null;
  }

  static Future<void> cacheShifts(List<Map<String, dynamic>> shifts) async {
    await _prefs?.setString('cached_shifts', jsonEncode(shifts));
    debugPrint('Cached ${shifts.length} shifts');
  }

  static List<Map<String, dynamic>> getCachedShifts() {
    final data = _prefs?.getString('cached_shifts');
    if (data != null) {
      return List<Map<String, dynamic>>.from(jsonDecode(data));
    }
    return [];
  }

  static Future<void> cacheVehicleLogs(List<Map<String, dynamic>> logs) async {
    await _prefs?.setString('cached_vehicle_logs', jsonEncode(logs));
    debugPrint('Cached ${logs.length} vehicle logs');
  }

  static List<Map<String, dynamic>> getCachedVehicleLogs() {
    final data = _prefs?.getString('cached_vehicle_logs');
    if (data != null) {
      return List<Map<String, dynamic>>.from(jsonDecode(data));
    }
    return [];
  }

  static Future<void> cacheRideHistory(List<Map<String, dynamic>> rides) async {
    await _prefs?.setString('cached_ride_history', jsonEncode(rides));
    debugPrint('Cached ${rides.length} rides');
  }

  static List<Map<String, dynamic>> getCachedRideHistory() {
    final data = _prefs?.getString('cached_ride_history');
    if (data != null) {
      return List<Map<String, dynamic>>.from(jsonDecode(data));
    }
    return [];
  }

  static Future<void> queueAction(String type, Map<String, dynamic> data) async {
    _pendingActions.add({
      'type': type,
      'data': data,
      'timestamp': DateTime.now().toIso8601String(),
    });
    await _savePendingActions();
    debugPrint('Queued offline action: $type');
  }

  static void _loadPendingActions() {
    final data = _prefs?.getString('pending_actions');
    if (data != null) {
      final List<dynamic> actions = jsonDecode(data);
      _pendingActions.clear();
      _pendingActions.addAll(actions.map((e) => Map<String, dynamic>.from(e)));
      debugPrint('Loaded ${_pendingActions.length} pending actions');
    }
  }

  static Future<void> _savePendingActions() async {
    await _prefs?.setString('pending_actions', jsonEncode(_pendingActions));
  }

  static List<Map<String, dynamic>> get pendingActions => List.unmodifiable(_pendingActions);

  static int get pendingActionCount => _pendingActions.length;

  static Future<void> syncPendingActions() async {
    if (_pendingActions.isEmpty) return;

    debugPrint('Syncing ${_pendingActions.length} pending actions...');

    final actionsToSync = List<Map<String, dynamic>>.from(_pendingActions);
    int successCount = 0;

    for (final action in actionsToSync) {
      try {
        final success = await _executeAction(action);
        if (success) {
          _pendingActions.remove(action);
          successCount++;
        }
      } catch (e) {
        debugPrint('Failed to sync action: $e');
      }
    }

    await _savePendingActions();
    debugPrint('Synced $successCount/${actionsToSync.length} actions');
  }

  static Future<bool> _executeAction(Map<String, dynamic> action) async {
    final type = action['type'] as String;
    // data is available for future use when actions are implemented
    // final data = action['data'] as Map<String, dynamic>;

    switch (type) {
      case 'update_location':
        return true;
      case 'add_vehicle_log':
        return true;
      case 'update_shift_status':
        return true;
      default:
        debugPrint('Unknown action type: $type');
        return false;
    }
  }

  static Future<void> clearCache() async {
    await _prefs?.remove('cached_driver_profile');
    await _prefs?.remove('cached_shifts');
    await _prefs?.remove('cached_vehicle_logs');
    await _prefs?.remove('cached_ride_history');
    debugPrint('Cache cleared');
  }

  static Future<void> clearPendingActions() async {
    _pendingActions.clear();
    await _savePendingActions();
    debugPrint('Pending actions cleared');
  }
}
