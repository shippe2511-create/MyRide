import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class NotificationService {
  static final FlutterLocalNotificationsPlugin _notifications = FlutterLocalNotificationsPlugin();
  static RealtimeChannel? _notificationChannel;
  static String? _currentUserId;
  static bool _initialized = false;

  // Instance methods for backward compatibility
  Future<void> init() async {
    await initialize();
  }

  Future<void> requestPermissions() async {
    await _requestPermissions();
  }

  void showDriverAcceptedNotification({required String driverName, String? vehicleNumber, String? vehicle, int? minutesAway}) {
    final vehicleInfo = vehicleNumber ?? vehicle ?? '';
    final etaInfo = minutesAway != null ? ' - $minutesAway min away' : '';
    showNotification(
      title: 'Driver Accepted',
      body: '$driverName${vehicleInfo.isNotEmpty ? " ($vehicleInfo)" : ""} is on the way$etaInfo',
    );
  }

  void showDriverArrivedNotification({required String driverName, String? location, String? vehicle}) {
    showNotification(
      title: 'Driver Arrived',
      body: '$driverName${vehicle != null ? " ($vehicle)" : ""} has arrived',
    );
  }

  void showTripStartedNotification({required String destination, String? eta}) {
    showNotification(
      title: 'Trip Started',
      body: 'Your trip to $destination has started${eta != null ? " - ETA: $eta" : ""}',
    );
  }

  void showTripCompletedNotification({required String destination}) {
    showNotification(
      title: 'Trip Completed',
      body: 'You have arrived at $destination',
    );
  }

  void scheduleRideReminder({
    String? pickupName,
    String? dropoffName,
    DateTime? scheduledTime,
    int? id,
    String? route,
    String? time,
    int? minutesBefore,
  }) {
    final routeInfo = route ?? (pickupName != null && dropoffName != null ? '$pickupName to $dropoffName' : 'Your ride');
    final timeInfo = time ?? (scheduledTime != null ? '${scheduledTime.hour}:${scheduledTime.minute.toString().padLeft(2, '0')}' : 'soon');
    showNotification(
      title: 'Upcoming Ride Reminder',
      body: '$routeInfo at $timeInfo',
    );
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
      'myride_channel',
      'MyRide Notifications',
      channelDescription: 'Ride updates and alerts',
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

  static void subscribeToNotifications(String userId) {
    _currentUserId = userId;
    _unsubscribe();

    _notificationChannel = Supabase.instance.client
        .channel('user_notifications_$userId')
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
            final data = payload.newRecord;
            final title = data['title'] as String? ?? 'Notification';
            final message = data['message'] as String? ?? '';
            showNotification(title: title, body: message);
          },
        )
        .subscribe();

    debugPrint('Subscribed to notifications for user: $userId');
  }

  static void subscribeToRideUpdates(String rideId, void Function(String status) onUpdate) {
    Supabase.instance.client
        .channel('ride_updates_$rideId')
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
            if (newStatus != null) {
              onUpdate(newStatus);

              String? title;
              String? body;

              switch (newStatus) {
                case 'accepted':
                  title = 'Driver Assigned';
                  body = 'A driver is on the way to pick you up';
                  break;
                case 'arrived':
                  title = 'Driver Arrived';
                  body = 'Your driver has arrived at the pickup location';
                  break;
                case 'in_progress':
                  title = 'Trip Started';
                  body = 'Your trip is now in progress';
                  break;
                case 'completed':
                  title = 'Trip Completed';
                  body = 'You have arrived at your destination';
                  break;
                case 'cancelled':
                  title = 'Ride Cancelled';
                  body = 'Your ride has been cancelled';
                  break;
              }

              if (title != null && body != null) {
                showNotification(title: title, body: body, payload: rideId);
              }
            }
          },
        )
        .subscribe();
  }

  static void _unsubscribe() {
    _notificationChannel?.unsubscribe();
    _notificationChannel = null;
  }

  static void dispose() {
    _unsubscribe();
    _currentUserId = null;
  }
}
