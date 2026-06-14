import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class NotificationService {
  static final FlutterLocalNotificationsPlugin _notifications = FlutterLocalNotificationsPlugin();
  static RealtimeChannel? _rideChannel;
  static String? _currentDriverId;
  static bool _initialized = false;

  // Instance methods for backward compatibility
  Future<void> init() async {
    await initialize();
  }

  Future<void> requestPermissions() async {
    await _requestPermissions();
  }

  void showRideRequestNotification({String? pickupName, String? customerName, String? pickup, String? dropoff, double? distance}) {
    final pickupLoc = pickupName ?? pickup ?? 'Unknown';
    final customer = customerName ?? 'Customer';
    showNotification(
      title: 'New Ride Request',
      body: 'Pickup: $pickupLoc${dropoff != null ? " to $dropoff" : ""} from $customer',
    );
  }

  void showBreakReminderNow({required String breakType, int? minutes}) {
    showNotification(
      title: 'Break Reminder',
      body: minutes != null ? 'You\'ve been working for $minutes min - time for your $breakType break' : 'Time for your $breakType break',
    );
  }

  void scheduleBreakReminder({required String breakType, int? delayMinutes, Duration? delay}) {
    final actualDelay = delay ?? Duration(minutes: delayMinutes ?? 30);
    Future.delayed(actualDelay, () {
      showNotification(
        title: 'Break Reminder',
        body: 'Time for your $breakType break',
      );
    });
  }

  void cancelBreakReminder() {
    // Cancel any pending notifications if needed
  }

  void showCustomerArrivedNotification({required String customerName, String? location}) {
    showNotification(
      title: 'Arrived at Pickup',
      body: 'Notifying $customerName${location != null ? " at $location" : ""}',
    );
  }

  void showTripCompletedNotification({String? destination, double? distance, int? duration}) {
    showNotification(
      title: 'Trip Completed',
      body: destination != null ? 'Arrived at $destination' : 'Trip completed successfully',
    );
  }

  void showGenericNotification({required String title, required String body}) {
    showNotification(title: title, body: body);
  }

  // Static methods
  static Future<void> initialize() async {
    if (_initialized) return;

    const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosSettings = DarwinInitializationSettings(
      requestAlertPermission: true,
      requestBadgePermission: true,
      requestSoundPermission: true,
    );

    const initSettings = InitializationSettings(
      android: androidSettings,
      iOS: iosSettings,
    );

    await _notifications.initialize(
      initSettings,
      onDidReceiveNotificationResponse: _onNotificationTap,
    );

    await _requestPermissions();
    _initialized = true;
  }

  static Future<void> _requestPermissions() async {
    await _notifications
        .resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>()
        ?.requestPermissions(alert: true, badge: true, sound: true);
  }

  static void _onNotificationTap(NotificationResponse response) {
    debugPrint('Notification tapped: ${response.payload}');
  }

  static Future<void> showNotification({
    required String title,
    required String body,
    String? payload,
  }) async {
    const androidDetails = AndroidNotificationDetails(
      'driver_channel',
      'Driver Notifications',
      channelDescription: 'New ride requests and updates',
      importance: Importance.high,
      priority: Priority.high,
      showWhen: true,
    );

    const iosDetails = DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
      presentSound: true,
    );

    const details = NotificationDetails(
      android: androidDetails,
      iOS: iosDetails,
    );

    await _notifications.show(
      DateTime.now().millisecondsSinceEpoch ~/ 1000,
      title,
      body,
      details,
      payload: payload,
    );
  }

  static void subscribeToNewRides(void Function(Map<String, dynamic>) onNewRide) {
    _rideChannel?.unsubscribe();

    _rideChannel = Supabase.instance.client
        .channel('new_rides_driver')
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'rides',
          callback: (payload) async {
            final ride = payload.newRecord;
            if (ride['status'] == 'pending') {
              // Fetch full ride data
              try {
                final fullRide = await Supabase.instance.client
                    .from('rides')
                    .select('*, customer:profiles!customer_id(*)')
                    .eq('id', ride['id'])
                    .single();
                
                onNewRide(fullRide);
                
                final pickupName = fullRide['pickup_name'] ?? 'Unknown location';
                showNotification(
                  title: 'New Ride Request',
                  body: 'Pickup from $pickupName',
                  payload: ride['id'],
                );
              } catch (e) {
                debugPrint('Error fetching ride details: $e');
              }
            }
          },
        )
        .subscribe();

    debugPrint('Subscribed to new ride requests');
  }

  static void subscribeToRideCancellations(String rideId, void Function() onCancelled) {
    Supabase.instance.client
        .channel('ride_cancel_$rideId')
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
            final newStatus = payload.newRecord['status'] as String?;
            if (newStatus == 'cancelled') {
              showNotification(
                title: 'Ride Cancelled',
                body: 'The customer has cancelled this ride',
                payload: rideId,
              );
              onCancelled();
            }
          },
        )
        .subscribe();
  }

  static void dispose() {
    _rideChannel?.unsubscribe();
    _rideChannel = null;
    _currentDriverId = null;
  }
}
