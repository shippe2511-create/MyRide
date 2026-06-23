import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'supabase_service.dart';

/// Centralized service for managing Supabase realtime subscriptions.
/// Provides streams for shifts, rides, notifications, documents, and profile changes.
class RealtimeService {
  static final RealtimeService _instance = RealtimeService._internal();
  factory RealtimeService() => _instance;
  RealtimeService._internal();

  final Map<String, RealtimeChannel> _channels = {};
  final Map<String, StreamController<Map<String, dynamic>>> _controllers = {};

  Timer? _reconnectTimer;

  SupabaseClient get _client => SupabaseService.client;

  /// Initialize the service and set up connection monitoring
  void initialize() {
    _monitorConnection();
  }

  /// Monitor connection and auto-reconnect on loss
  void _monitorConnection() {
    // Supabase handles reconnection internally, but we add extra resilience
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      _checkAndReconnect();
    });
  }

  void _checkAndReconnect() {
    // Supabase client handles reconnection internally
    // This periodic check just logs the channel count for monitoring
    debugPrint('RealtimeService: Connection check - ${_channels.length} active channels');
  }

  /// Get or create a StreamController for a given key
  StreamController<Map<String, dynamic>> _getController(String key) {
    if (!_controllers.containsKey(key) || _controllers[key]!.isClosed) {
      _controllers[key] = StreamController<Map<String, dynamic>>.broadcast();
    }
    return _controllers[key]!;
  }

  // ============================================================
  // SHIFTS SUBSCRIPTION
  // ============================================================

  /// Subscribe to shifts table changes for a driver
  Stream<Map<String, dynamic>> subscribeToShifts(String driverId) {
    final key = 'shifts_$driverId';
    final controller = _getController(key);

    if (!_channels.containsKey(key)) {
      final channel = _client
          .channel(key)
          .onPostgresChanges(
            event: PostgresChangeEvent.all,
            schema: 'public',
            table: 'shifts',
            filter: PostgresChangeFilter(
              type: PostgresChangeFilterType.eq,
              column: 'driver_id',
              value: driverId,
            ),
            callback: (payload) {
              debugPrint('RealtimeService: Shifts update - ${payload.eventType}');
              controller.add({
                'event': payload.eventType.name,
                'new': payload.newRecord,
                'old': payload.oldRecord,
              });
            },
          )
          .subscribe();

      _channels[key] = channel;
    }

    return controller.stream;
  }

  // ============================================================
  // RIDES SUBSCRIPTION
  // ============================================================

  /// Subscribe to active ride updates for a driver
  Stream<Map<String, dynamic>> subscribeToDriverRides(String driverId) {
    final key = 'driver_rides_$driverId';
    final controller = _getController(key);

    if (!_channels.containsKey(key)) {
      final channel = _client
          .channel(key)
          .onPostgresChanges(
            event: PostgresChangeEvent.all,
            schema: 'public',
            table: 'rides',
            filter: PostgresChangeFilter(
              type: PostgresChangeFilterType.eq,
              column: 'driver_id',
              value: driverId,
            ),
            callback: (payload) {
              debugPrint('RealtimeService: Ride update - ${payload.eventType}');
              controller.add({
                'event': payload.eventType.name,
                'new': payload.newRecord,
                'old': payload.oldRecord,
              });
            },
          )
          .subscribe();

      _channels[key] = channel;
    }

    return controller.stream;
  }

  /// Subscribe to a specific ride's updates
  Stream<Map<String, dynamic>> subscribeToRide(String rideId) {
    final key = 'ride_$rideId';
    final controller = _getController(key);

    if (!_channels.containsKey(key)) {
      final channel = _client
          .channel(key)
          .onPostgresChanges(
            event: PostgresChangeEvent.update,
            schema: 'public',
            table: 'rides',
            filter: PostgresChangeFilter(
              type: PostgresChangeFilterType.eq,
              column: 'id',
              value: rideId,
            ),
            callback: (payload) {
              debugPrint('RealtimeService: Specific ride update for $rideId');
              controller.add({
                'event': payload.eventType.name,
                'new': payload.newRecord,
                'old': payload.oldRecord,
              });
            },
          )
          .subscribe();

      _channels[key] = channel;
    }

    return controller.stream;
  }

  /// Subscribe to completed rides for history
  Stream<Map<String, dynamic>> subscribeToCompletedRides(String driverId) {
    final key = 'completed_rides_$driverId';
    final controller = _getController(key);

    if (!_channels.containsKey(key)) {
      final channel = _client
          .channel(key)
          .onPostgresChanges(
            event: PostgresChangeEvent.all,
            schema: 'public',
            table: 'rides',
            filter: PostgresChangeFilter(
              type: PostgresChangeFilterType.eq,
              column: 'driver_id',
              value: driverId,
            ),
            callback: (payload) {
              final status = payload.newRecord['status'] as String?;
              // Only emit for completed, cancelled, or rejected rides
              if (status == 'completed' || status == 'cancelled' || status == 'rejected') {
                debugPrint('RealtimeService: Completed ride update - $status');
                controller.add({
                  'event': payload.eventType.name,
                  'new': payload.newRecord,
                  'old': payload.oldRecord,
                });
              }
            },
          )
          .subscribe();

      _channels[key] = channel;
    }

    return controller.stream;
  }

  // ============================================================
  // NOTIFICATIONS SUBSCRIPTION
  // ============================================================

  /// Subscribe to notifications for a user
  Stream<Map<String, dynamic>> subscribeToNotifications(String userId) {
    final key = 'notifications_$userId';
    final controller = _getController(key);

    if (!_channels.containsKey(key)) {
      final channel = _client
          .channel(key)
          .onPostgresChanges(
            event: PostgresChangeEvent.all,
            schema: 'public',
            table: 'notifications',
            filter: PostgresChangeFilter(
              type: PostgresChangeFilterType.eq,
              column: 'user_id',
              value: userId,
            ),
            callback: (payload) {
              debugPrint('RealtimeService: Notification update - ${payload.eventType}');
              controller.add({
                'event': payload.eventType.name,
                'new': payload.newRecord,
                'old': payload.oldRecord,
              });
            },
          )
          .subscribe();

      _channels[key] = channel;
    }

    return controller.stream;
  }

  // ============================================================
  // DOCUMENTS SUBSCRIPTION
  // ============================================================

  /// Subscribe to driver documents updates
  Stream<Map<String, dynamic>> subscribeToDocuments(String driverId) {
    final key = 'documents_$driverId';
    final controller = _getController(key);

    if (!_channels.containsKey(key)) {
      final channel = _client
          .channel(key)
          .onPostgresChanges(
            event: PostgresChangeEvent.all,
            schema: 'public',
            table: 'driver_documents',
            filter: PostgresChangeFilter(
              type: PostgresChangeFilterType.eq,
              column: 'driver_id',
              value: driverId,
            ),
            callback: (payload) {
              debugPrint('RealtimeService: Document update - ${payload.eventType}');
              controller.add({
                'event': payload.eventType.name,
                'new': payload.newRecord,
                'old': payload.oldRecord,
              });
            },
          )
          .subscribe();

      _channels[key] = channel;
    }

    return controller.stream;
  }

  // ============================================================
  // PROFILE SUBSCRIPTION
  // ============================================================

  /// Subscribe to driver profile changes
  Stream<Map<String, dynamic>> subscribeToDriverProfile(String driverId) {
    final key = 'driver_profile_$driverId';
    final controller = _getController(key);

    if (!_channels.containsKey(key)) {
      final channel = _client
          .channel(key)
          .onPostgresChanges(
            event: PostgresChangeEvent.update,
            schema: 'public',
            table: 'drivers',
            filter: PostgresChangeFilter(
              type: PostgresChangeFilterType.eq,
              column: 'id',
              value: driverId,
            ),
            callback: (payload) {
              debugPrint('RealtimeService: Driver profile update');
              controller.add({
                'event': payload.eventType.name,
                'new': payload.newRecord,
                'old': payload.oldRecord,
              });
            },
          )
          .subscribe();

      _channels[key] = channel;
    }

    return controller.stream;
  }

  /// Subscribe to user profile changes (profiles table)
  Stream<Map<String, dynamic>> subscribeToProfile(String profileId) {
    final key = 'profile_$profileId';
    final controller = _getController(key);

    if (!_channels.containsKey(key)) {
      final channel = _client
          .channel(key)
          .onPostgresChanges(
            event: PostgresChangeEvent.update,
            schema: 'public',
            table: 'profiles',
            filter: PostgresChangeFilter(
              type: PostgresChangeFilterType.eq,
              column: 'id',
              value: profileId,
            ),
            callback: (payload) {
              debugPrint('RealtimeService: Profile update');
              controller.add({
                'event': payload.eventType.name,
                'new': payload.newRecord,
                'old': payload.oldRecord,
              });
            },
          )
          .subscribe();

      _channels[key] = channel;
    }

    return controller.stream;
  }

  // ============================================================
  // UNSUBSCRIBE METHODS
  // ============================================================

  /// Unsubscribe from a specific channel
  Future<void> unsubscribe(String key) async {
    final channel = _channels[key];
    if (channel != null) {
      await channel.unsubscribe();
      _channels.remove(key);
    }

    final controller = _controllers[key];
    if (controller != null && !controller.isClosed) {
      await controller.close();
      _controllers.remove(key);
    }
  }

  /// Unsubscribe from shifts
  Future<void> unsubscribeFromShifts(String driverId) async {
    await unsubscribe('shifts_$driverId');
  }

  /// Unsubscribe from driver rides
  Future<void> unsubscribeFromDriverRides(String driverId) async {
    await unsubscribe('driver_rides_$driverId');
  }

  /// Unsubscribe from a specific ride
  Future<void> unsubscribeFromRide(String rideId) async {
    await unsubscribe('ride_$rideId');
  }

  /// Unsubscribe from completed rides
  Future<void> unsubscribeFromCompletedRides(String driverId) async {
    await unsubscribe('completed_rides_$driverId');
  }

  /// Unsubscribe from notifications
  Future<void> unsubscribeFromNotifications(String userId) async {
    await unsubscribe('notifications_$userId');
  }

  /// Unsubscribe from documents
  Future<void> unsubscribeFromDocuments(String driverId) async {
    await unsubscribe('documents_$driverId');
  }

  /// Unsubscribe from driver profile
  Future<void> unsubscribeFromDriverProfile(String driverId) async {
    await unsubscribe('driver_profile_$driverId');
  }

  /// Unsubscribe from profile
  Future<void> unsubscribeFromProfile(String profileId) async {
    await unsubscribe('profile_$profileId');
  }

  // ============================================================
  // CLEANUP
  // ============================================================

  /// Dispose all subscriptions and clean up
  Future<void> dispose() async {
    _reconnectTimer?.cancel();
    _reconnectTimer = null;

    for (final channel in _channels.values) {
      await channel.unsubscribe();
    }
    _channels.clear();

    for (final controller in _controllers.values) {
      if (!controller.isClosed) {
        await controller.close();
      }
    }
    _controllers.clear();

    debugPrint('RealtimeService: Disposed all subscriptions');
  }

  /// Dispose subscriptions for a specific driver (call on logout)
  Future<void> disposeForDriver(String driverId) async {
    await unsubscribeFromShifts(driverId);
    await unsubscribeFromDriverRides(driverId);
    await unsubscribeFromCompletedRides(driverId);
    await unsubscribeFromDocuments(driverId);
    await unsubscribeFromDriverProfile(driverId);

    debugPrint('RealtimeService: Disposed subscriptions for driver $driverId');
  }
}
