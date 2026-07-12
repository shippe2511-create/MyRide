import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Centralized service for managing Supabase realtime subscriptions.
/// Provides streams for rides, notifications, announcements, profile changes,
/// and driver locations with auto-reconnect capability.
class RealtimeService {
  static final RealtimeService _instance = RealtimeService._internal();
  factory RealtimeService() => _instance;
  RealtimeService._internal();

  final SupabaseClient _client = Supabase.instance.client;
  final Map<String, RealtimeChannel> _channels = {};
  final Map<String, StreamController> _controllers = {};
  final Map<String, int> _reconnectAttempts = {};

  // ============ RIDES ============

  /// Subscribe to a specific ride's updates (status changes, driver assignment, etc.)
  Stream<Map<String, dynamic>> subscribeToRide(String rideId) {
    final key = 'ride_$rideId';

    if (_controllers.containsKey(key)) {
      return (_controllers[key] as StreamController<Map<String, dynamic>>).stream;
    }

    final controller = StreamController<Map<String, dynamic>>.broadcast(
      onCancel: () => _unsubscribe(key),
    );
    _controllers[key] = controller;

    _channels[key] = _client
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
            if (!controller.isClosed) {
              controller.add(payload.newRecord);
            }
          },
        )
        .subscribe((status, [error]) {
          debugPrint('Ride $rideId subscription: $status');
          if (status == RealtimeSubscribeStatus.channelError && error != null) {
            debugPrint('Ride subscription error: $error');
            _reconnect(key, () => subscribeToRide(rideId));
          }
        });

    return controller.stream;
  }

  /// Subscribe to all rides for the current customer
  Stream<Map<String, dynamic>> subscribeToCustomerRides(String customerId) {
    final key = 'customer_rides_$customerId';

    if (_controllers.containsKey(key)) {
      return (_controllers[key] as StreamController<Map<String, dynamic>>).stream;
    }

    final controller = StreamController<Map<String, dynamic>>.broadcast(
      onCancel: () => _unsubscribe(key),
    );
    _controllers[key] = controller;

    _channels[key] = _client
        .channel(key)
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'rides',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'customer_id',
            value: customerId,
          ),
          callback: (payload) {
            if (!controller.isClosed) {
              controller.add({
                'eventType': payload.eventType.name,
                'oldRecord': payload.oldRecord,
                'newRecord': payload.newRecord,
              });
            }
          },
        )
        .subscribe((status, [error]) {
          debugPrint('Customer rides subscription: $status');
          if (status == RealtimeSubscribeStatus.channelError && error != null) {
            _reconnect(key, () => subscribeToCustomerRides(customerId));
          }
        });

    return controller.stream;
  }

  // ============ DRIVER LOCATION ============

  /// Subscribe to a driver's location updates
  Stream<Map<String, dynamic>> subscribeToDriverLocation(String driverId) {
    final key = 'driver_location_$driverId';

    if (_controllers.containsKey(key)) {
      return (_controllers[key] as StreamController<Map<String, dynamic>>).stream;
    }

    final controller = StreamController<Map<String, dynamic>>.broadcast(
      onCancel: () => _unsubscribe(key),
    );
    _controllers[key] = controller;

    _channels[key] = _client
        .channel(key)
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'drivers',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'id',
            value: driverId,
          ),
          callback: (payload) {
            if (!controller.isClosed) {
              final data = payload.newRecord;
              final lat = data['current_location_lat'] as num?;
              final lng = data['current_location_lng'] as num?;
              if (lat != null && lng != null) {
                controller.add({
                  'lat': lat.toDouble(),
                  'lng': lng.toDouble(),
                  'heading': null,
                  'speed': null,
                });
              }
            }
          },
        )
        .subscribe((status, [error]) {
          debugPrint('Driver location subscription: $status');
          if (status == RealtimeSubscribeStatus.channelError && error != null) {
            _reconnect(key, () => subscribeToDriverLocation(driverId));
          }
        });

    return controller.stream;
  }

  // ============ NOTIFICATIONS ============

  /// Subscribe to new notifications for the current user
  Stream<Map<String, dynamic>> subscribeToNotifications(String userId) {
    final key = 'notifications_$userId';

    if (_controllers.containsKey(key)) {
      return (_controllers[key] as StreamController<Map<String, dynamic>>).stream;
    }

    final controller = StreamController<Map<String, dynamic>>.broadcast(
      onCancel: () => _unsubscribe(key),
    );
    _controllers[key] = controller;

    _channels[key] = _client
        .channel(key)
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'notifications',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'user_id',
            value: userId,
          ),
          callback: (payload) {
            if (!controller.isClosed) {
              controller.add(payload.newRecord);
            }
          },
        )
        .subscribe((status, [error]) {
          debugPrint('Notifications subscription: $status');
          if (status == RealtimeSubscribeStatus.channelError && error != null) {
            _reconnect(key, () => subscribeToNotifications(userId));
          }
        });

    return controller.stream;
  }

  // ============ ANNOUNCEMENTS ============

  /// Subscribe to announcements (new, updated, deleted)
  Stream<Map<String, dynamic>> subscribeToAnnouncements() {
    const key = 'announcements_realtime';

    if (_controllers.containsKey(key)) {
      return (_controllers[key] as StreamController<Map<String, dynamic>>).stream;
    }

    final controller = StreamController<Map<String, dynamic>>.broadcast(
      onCancel: () => _unsubscribe(key),
    );
    _controllers[key] = controller;

    _channels[key] = _client
        .channel(key)
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'announcements',
          callback: (payload) {
            if (!controller.isClosed) {
              controller.add({
                'eventType': payload.eventType.name,
                'newRecord': payload.newRecord,
                'oldRecord': payload.oldRecord,
              });
            }
          },
        )
        .subscribe((status, [error]) {
          debugPrint('Announcements subscription: $status');
          if (status == RealtimeSubscribeStatus.channelError && error != null) {
            _reconnect(key, () => subscribeToAnnouncements());
          }
        });

    return controller.stream;
  }

  // ============ PROFILE ============

  /// Subscribe to profile changes for the current user
  Stream<Map<String, dynamic>> subscribeToProfile(String userId) {
    final key = 'profile_$userId';

    if (_controllers.containsKey(key)) {
      return (_controllers[key] as StreamController<Map<String, dynamic>>).stream;
    }

    final controller = StreamController<Map<String, dynamic>>.broadcast(
      onCancel: () => _unsubscribe(key),
    );
    _controllers[key] = controller;

    _channels[key] = _client
        .channel(key)
        .onPostgresChanges(
          event: PostgresChangeEvent.update,
          schema: 'public',
          table: 'profiles',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'id',
            value: userId,
          ),
          callback: (payload) {
            if (!controller.isClosed) {
              controller.add(payload.newRecord);
            }
          },
        )
        .subscribe((status, [error]) {
          debugPrint('Profile subscription: $status');
          if (status == RealtimeSubscribeStatus.channelError && error != null) {
            _reconnect(key, () => subscribeToProfile(userId));
          }
        });

    return controller.stream;
  }

  // ============ CHAT MESSAGES ============

  /// Subscribe to chat messages for a specific ride
  Stream<Map<String, dynamic>> subscribeToChatMessages(String rideId) {
    final key = 'chat_$rideId';

    if (_controllers.containsKey(key)) {
      return (_controllers[key] as StreamController<Map<String, dynamic>>).stream;
    }

    final controller = StreamController<Map<String, dynamic>>.broadcast(
      onCancel: () => _unsubscribe(key),
    );
    _controllers[key] = controller;

    _channels[key] = _client
        .channel(key)
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'chat_messages',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'ride_id',
            value: rideId,
          ),
          callback: (payload) {
            if (!controller.isClosed) {
              controller.add(payload.newRecord);
            }
          },
        )
        .subscribe((status, [error]) {
          debugPrint('Chat subscription: $status');
          if (status == RealtimeSubscribeStatus.channelError && error != null) {
            _reconnect(key, () => subscribeToChatMessages(rideId));
          }
        });

    return controller.stream;
  }

  // ============ MANAGEMENT ============

  /// Unsubscribe from a specific channel
  void unsubscribe(String key) {
    _unsubscribe(key);
  }

  void _unsubscribe(String key) {
    _channels[key]?.unsubscribe();
    _channels.remove(key);

    final controller = _controllers[key];
    if (controller != null && !controller.isClosed) {
      controller.close();
    }
    _controllers.remove(key);

    debugPrint('Unsubscribed from: $key');
  }

  /// Unsubscribe from all channels
  void disposeAll() {
    final keys = List<String>.from(_channels.keys);
    for (final key in keys) {
      _unsubscribe(key);
    }
    debugPrint('All realtime subscriptions disposed');
  }

  /// Auto-reconnect with exponential backoff (2s, 4s, 8s, 16s, max 30s)
  void _reconnect(String key, Stream<Map<String, dynamic>> Function() resubscribe) {
    final attempts = _reconnectAttempts[key] ?? 0;
    final delaySeconds = (2 * (1 << attempts)).clamp(2, 30);
    _reconnectAttempts[key] = attempts + 1;

    debugPrint('Reconnect $key in ${delaySeconds}s (attempt ${attempts + 1})');

    Future.delayed(Duration(seconds: delaySeconds), () {
      if (!_controllers.containsKey(key) || (_controllers[key]?.isClosed ?? true)) {
        _reconnectAttempts.remove(key);
        return;
      }
      debugPrint('Attempting to reconnect: $key');
      _unsubscribe(key);
      resubscribe();
    });
  }

  /// Check if a subscription exists
  bool isSubscribed(String key) => _channels.containsKey(key);

  /// Get count of active subscriptions
  int get activeSubscriptionCount => _channels.length;
}
