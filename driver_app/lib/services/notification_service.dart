import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../main.dart' show showAppNotification;
import '../widgets/app_notification_banner.dart';

class NotificationService {
  static final FlutterLocalNotificationsPlugin _notifications = FlutterLocalNotificationsPlugin();
  static RealtimeChannel? _rideChannel;
  // ignore: unused_field
  static String? _currentDriverId;
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
    const macOSSettings = DarwinInitializationSettings(
      requestAlertPermission: true,
      requestBadgePermission: true,
      requestSoundPermission: true,
      defaultPresentAlert: true,
      defaultPresentBadge: true,
      defaultPresentSound: true,
    );

    final initSettings = InitializationSettings(
      android: androidSettings,
      iOS: iosSettings,
      macOS: macOSSettings,
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
      // Still mark as initialized to prevent repeated attempts
      _initialized = true;
    }
  }

  static Future<bool> _requestPermissions() async {
    // iOS permissions
    final iOS = _notifications.resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>();
    if (iOS != null) {
      final result = await iOS.requestPermissions(alert: true, badge: true, sound: true);
      return result ?? false;
    }
    // macOS permissions
    final macOS = _notifications.resolvePlatformSpecificImplementation<MacOSFlutterLocalNotificationsPlugin>();
    if (macOS != null) {
      final result = await macOS.requestPermissions(alert: true, badge: true, sound: true);
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

      // Show modern in-app banner
      NotificationType bannerType = NotificationType.info;
      if (title.toLowerCase().contains('error') || title.toLowerCase().contains('cancelled')) {
        bannerType = NotificationType.error;
      } else if (title.toLowerCase().contains('completed') || title.toLowerCase().contains('accepted')) {
        bannerType = NotificationType.success;
      } else if (title.toLowerCase().contains('new ride') || title.toLowerCase().contains('request')) {
        bannerType = NotificationType.warning;
      } else if (title.toLowerCase().contains('arrived') || title.toLowerCase().contains('started')) {
        bannerType = NotificationType.success;
      }
      showAppNotification(title: title, message: body, type: bannerType);

      // Legacy callback
      final isChat = payload?.startsWith('chat_') ?? false;
      final rideId = isChat ? payload!.replaceFirst('chat_', '') : null;
      onShowInAppMessage?.call(title, body, rideId);
    } catch (e) {
      debugPrint('NotificationService: ERROR showing notification: $e');
    }
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

    final channel = Supabase.instance.client.channel('driver_notif_chat_$rideId');

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
          final senderName = senderType == 'customer' ? 'Customer' : 'Driver';
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

  static void dispose() {
    _rideChannel?.unsubscribe();
    _rideChannel = null;
    _unsubscribeChat();
    _currentDriverId = null;
  }
}
