import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class NotificationService {
  static final FlutterLocalNotificationsPlugin _notifications = FlutterLocalNotificationsPlugin();
  static RealtimeChannel? _notificationChannel;
  // ignore: unused_field
  static String? _currentUserId;
  static bool _initialized = false;

  // Callback for showing in-app toast
  static void Function(String title, String body, String? rideId)? onShowInAppMessage;

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

    try {
      await _notifications.initialize(
        initSettings,
        onDidReceiveNotificationResponse: _onNotificationTap,
      );
      debugPrint('NotificationService: Plugin initialized');

      final granted = await _requestPermissions();
      debugPrint('NotificationService: Permissions granted=$granted');
      _initialized = true;
    } catch (e) {
      debugPrint('NotificationService: Init error: $e');
    }
  }

  static Future<bool> _requestPermissions() async {
    final iOS = _notifications.resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>();
    if (iOS != null) {
      final result = await iOS.requestPermissions(alert: true, badge: true, sound: true);
      return result ?? false;
    }
    return true;
  }

  static void _onNotificationTap(NotificationResponse response) {
    debugPrint('Notification tapped: ${response.payload}');
  }

  static Future<void> showNotification({
    required String title,
    required String body,
    String? payload,
  }) async {
    debugPrint('NotificationService.showNotification called: title=$title, body=$body');

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
      interruptionLevel: InterruptionLevel.timeSensitive,
    );

    const details = NotificationDetails(
      android: androidDetails,
      iOS: iosDetails,
    );

    try {
      final notificationId = DateTime.now().millisecondsSinceEpoch ~/ 1000;
      debugPrint('NotificationService: Showing notification with ID $notificationId');
      await _notifications.show(
        notificationId,
        title,
        body,
        details,
        payload: payload,
      );
      debugPrint('NotificationService: Notification shown successfully');

      // Also show in-app toast via callback
      final isChat = payload?.startsWith('chat_') ?? false;
      final rideId = isChat ? payload!.replaceFirst('chat_', '') : null;
      onShowInAppMessage?.call(title, body, rideId);
    } catch (e) {
      debugPrint('NotificationService: ERROR showing notification: $e');
    }
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

  static RealtimeChannel? _chatChannel;
  static String? _currentRideId;
  static bool _isChatScreenOpen = false;

  static void setChatScreenOpen(bool isOpen) {
    _isChatScreenOpen = isOpen;
    debugPrint('NotificationService: Chat screen open = $isOpen');
  }

  static void subscribeToChatMessages(String rideId, String myUserId) {
    if (_currentRideId == rideId && _chatChannel != null) return;

    _unsubscribeChat();
    _currentRideId = rideId;

    debugPrint('NotificationService: Subscribing to chat notifications for ride $rideId, myUserId=$myUserId');

    final channel = Supabase.instance.client.channel('notif_chat_$rideId');

    channel.onPostgresChanges(
      event: PostgresChangeEvent.insert,
      schema: 'public',
      table: 'chat_messages',
      filter: PostgresChangeFilter(
        type: PostgresChangeFilterType.eq,
        column: 'ride_id',
        value: rideId,
      ),
      callback: (payload) {
        final data = payload.newRecord;
        final senderId = data['sender_id'] as String?;
        final senderType = data['sender_type'] as String?;
        final message = data['message'] as String?;

        debugPrint('NotificationService: Chat message received - isChatOpen=$_isChatScreenOpen, senderId=$senderId, myId=$myUserId, senderType=$senderType, message=$message');

        // Show notification if message is from other party
        if (senderId != myUserId && message != null && message.isNotEmpty) {
          final senderName = senderType == 'driver' ? 'Driver' : 'Customer';
          debugPrint('NotificationService: SHOWING notification for message from $senderName: $message');
          showNotification(
            title: 'New message from $senderName',
            body: message,
            payload: 'chat_$rideId',
          );
        } else {
          debugPrint('NotificationService: NOT showing notification - senderId=$senderId vs myUserId=$myUserId, message=$message');
        }
      },
    );

    channel.subscribe((status, error) {
      debugPrint('NotificationService: Chat subscription status=$status, error=$error');
    });

    _chatChannel = channel;
  }

  static void _unsubscribeChat() {
    _chatChannel?.unsubscribe();
    _chatChannel = null;
    _currentRideId = null;
  }

  static void _unsubscribe() {
    _notificationChannel?.unsubscribe();
    _notificationChannel = null;
    _unsubscribeChat();
  }

  static void dispose() {
    _unsubscribe();
    _currentUserId = null;
  }
}
