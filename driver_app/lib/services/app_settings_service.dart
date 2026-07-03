import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'supabase_service.dart';

class AppSettingsService {
  static Map<String, dynamic>? _settings;
  static bool _loaded = false;
  static RealtimeChannel? _subscription;

  static Future<void> load() async {
    if (_loaded) return;
    try {
      final result = await SupabaseService.client
          .from('app_settings')
          .select('*')
          .eq('id', 'default')
          .maybeSingle();
      if (result != null) {
        _settings = result;
      }
      _loaded = true;
      _subscribeToChanges();
    } catch (e) {
      debugPrint('Failed to load app settings: $e');
    }
  }

  static void _subscribeToChanges() {
    _subscription?.unsubscribe();
    _subscription = SupabaseService.client
        .channel('app_settings_changes')
        .onPostgresChanges(
          event: PostgresChangeEvent.update,
          schema: 'public',
          table: 'app_settings',
          callback: (payload) {
            debugPrint('App settings updated via realtime');
            if (payload.newRecord.isNotEmpty) {
              _settings = payload.newRecord;
            }
          },
        )
        .subscribe();
  }

  static Future<void> reload() async {
    _loaded = false;
    await load();
  }

  static bool get sosEnabled => _settings?['enable_sos'] ?? true;
  static bool get chatEnabled => _settings?['enable_chat'] ?? true;
  static bool get ratingsEnabled => _settings?['enable_ratings'] ?? true;
  static int get maxRideDistanceKm => _settings?['max_ride_distance_km'] ?? 50;
  static int get defaultWaitTimeMin => _settings?['default_wait_time_min'] ?? 10;
  static String get supportPhone => _settings?['support_phone'] ?? '+960 333-3333';
  static String get supportEmail => _settings?['support_email'] ?? 'support@myride.com';
  static String get companyName => _settings?['company_name'] ?? 'MyRide';
}
