import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../main.dart' show showAppNotification, navigatorKey;
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

  void showSOSNotification() {
    // Always show system notification with sound for SOS (even in foreground)
    _showSOSSystemNotification();
  }

  static Future<void> _showSOSSystemNotification() async {
    const androidDetails = AndroidNotificationDetails(
      'sos_channel',
      'SOS Alerts',
      channelDescription: 'Emergency SOS alerts',
      importance: Importance.max,
      priority: Priority.max,
      showWhen: true,
      playSound: true,
      enableVibration: true,
      fullScreenIntent: true,
    );

    const iosDetails = DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
      presentSound: true,
      sound: 'default',
      interruptionLevel: InterruptionLevel.critical,
    );

    const details = NotificationDetails(
      android: androidDetails,
      iOS: iosDetails,
    );

    try {
      await _notifications.show(
        999999,
        '🚨 SOS ACTIVATED',
        'Emergency services have been notified. Help is on the way.',
        details,
      );
      debugPrint('SOS notification with sound shown');
    } catch (e) {
      debugPrint('Error showing SOS notification: $e');
    }
  }

  void showBreakReminderNow({required String breakType, int? minutes}) {
    showNotification(
      title: 'Break Reminder',
      body: minutes != null ? 'You\'ve been working for $minutes min - time for your $breakType break' : 'Time for your $breakType break',
    );
  }

  static const int _breakReminderNotificationId = 30001;
  static Timer? _breakReminderTimer;

  void scheduleBreakReminder({required String breakType, int? delayMinutes, Duration? delay}) {
    // Cancel any existing timer
    cancelBreakReminder();

    final actualDelay = delay ?? Duration(minutes: delayMinutes ?? 30);

    _breakReminderTimer = Timer(actualDelay, () {
      _showBreakExceededNotification(breakType);
    });

    debugPrint('Break reminder scheduled for ${actualDelay.inMinutes} minutes from now');
  }

  Future<void> _showBreakExceededNotification(String breakType) async {
    const androidDetails = AndroidNotificationDetails(
      'break_reminder_channel',
      'Break Reminders',
      channelDescription: 'Reminders when break time exceeds limit',
      importance: Importance.high,
      priority: Priority.high,
      showWhen: true,
      playSound: true,
      enableVibration: true,
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
      await _notifications.show(
        _breakReminderNotificationId,
        'Break Time Exceeded',
        'You\'ve been on $breakType break for 30+ minutes. Don\'t forget to go back online!',
        details,
      );
      debugPrint('Break exceeded notification shown');

      // Also show in-app banner if app is in foreground
      showAppNotification(
        title: 'Break Time Exceeded',
        message: 'You\'ve been on $breakType break for 30+ minutes. Don\'t forget to go back online!',
        type: NotificationType.warning,
      );
    } catch (e) {
      debugPrint('Error showing break notification: $e');
    }
  }

  void cancelBreakReminder() {
    _breakReminderTimer?.cancel();
    _breakReminderTimer = null;
    debugPrint('Break reminder cancelled');
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

  // Track if app is in foreground
  static bool _isAppInForeground = true;

  static void setAppInForeground(bool inForeground) {
    _isAppInForeground = inForeground;
    debugPrint('NotificationService: App in foreground = $inForeground');
  }

  static Future<void> showNotification({
    required String title,
    required String body,
    String? payload,
    VoidCallback? onTap,
  }) async {
    debugPrint('NotificationService.showNotification called: title=$title, body=$body, inForeground=$_isAppInForeground');

    // Determine notification type for in-app banner
    NotificationType bannerType = NotificationType.info;
    if (title.toLowerCase().contains('error') || title.toLowerCase().contains('cancelled')) {
      bannerType = NotificationType.error;
    } else if (title.toLowerCase().contains('completed') || title.toLowerCase().contains('accepted')) {
      bannerType = NotificationType.success;
    } else if (title.toLowerCase().contains('new ride') || title.toLowerCase().contains('request')) {
      bannerType = NotificationType.info;
    } else if (title.toLowerCase().contains('arrived') || title.toLowerCase().contains('started')) {
      bannerType = NotificationType.success;
    }

    if (_isAppInForeground) {
      // Skip in-app banners for events that already have visual feedback on screen
      final lowerTitle = title.toLowerCase();
      if (lowerTitle.contains('new ride') || lowerTitle.contains('ride request') ||
          lowerTitle.contains('arrived') || lowerTitle.contains('pickup') ||
          lowerTitle.contains('trip completed') || lowerTitle.contains('completed')) {
        debugPrint('NotificationService: Skipping banner - screen already shows this info');
        return;
      }
      // App is in foreground - show only in-app banner (less intrusive)
      debugPrint('NotificationService: Showing in-app banner only (foreground)');
      showAppNotification(title: title, message: body, type: bannerType, onTap: onTap);
    } else {
      // App is in background - show system notification
      debugPrint('NotificationService: Showing system notification (background)');

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
        await _notifications.show(
          notificationId,
          title,
          body,
          details,
          payload: payload,
        );
        debugPrint('NotificationService: System notification shown');
      } catch (e) {
        debugPrint('NotificationService: ERROR showing notification: $e');
      }
    }

    // Legacy callback
    final isChat = payload?.startsWith('chat_') ?? false;
    final rideId = isChat ? payload!.replaceFirst('chat_', '') : null;
    onShowInAppMessage?.call(title, body, rideId);
  }

  static void subscribeToNewRides(void Function(Map<String, dynamic>) onNewRide) {
    _rideChannel?.unsubscribe();

    _rideChannel = Supabase.instance.client
        .channel('new_rides_driver')
        // Listen for new rides inserted with pending status
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'rides',
          callback: (payload) async {
            final ride = payload.newRecord;
            if (ride['status'] == 'pending') {
              await _handleNewPendingRide(ride, onNewRide);
            }
          },
        )
        // Also listen for scheduled rides that become pending
        .onPostgresChanges(
          event: PostgresChangeEvent.update,
          schema: 'public',
          table: 'rides',
          callback: (payload) async {
            final oldRide = payload.oldRecord;
            final newRide = payload.newRecord;
            // Only notify if status changed TO pending (from scheduled)
            if (oldRide['status'] != 'pending' && newRide['status'] == 'pending' && newRide['driver_id'] == null) {
              await _handleNewPendingRide(newRide, onNewRide);
            }
          },
        )
        .subscribe();

    debugPrint('Subscribed to new ride requests (insert + update)');
  }

  static Future<void> _handleNewPendingRide(Map<String, dynamic> ride, void Function(Map<String, dynamic>) onNewRide) async {
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
            onTap: () {
              _navigateToRideChat(rideId);
            },
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
    _unsubscribeSupportChat();
    _currentDriverId = null;
  }

  // Support Chat Notifications
  static RealtimeChannel? _supportChatChannel;
  static String? _currentSupportChatId;

  static void subscribeToSupportChat(String chatId, String myUserId) {
    if (_currentSupportChatId == chatId && _supportChatChannel != null) return;

    _unsubscribeSupportChat();
    _currentSupportChatId = chatId;

    debugPrint('NotificationService: Subscribing to support chat notifications for chat $chatId');

    final channel = Supabase.instance.client.channel('driver_support_chat_notif_$chatId');

    channel.onPostgresChanges(
      event: PostgresChangeEvent.insert,
      schema: 'public',
      table: 'support_chat_messages',
      filter: PostgresChangeFilter(
        type: PostgresChangeFilterType.eq,
        column: 'chat_id',
        value: chatId,
      ),
      callback: (payload) {
        final data = payload.newRecord;
        final senderType = data['sender_type'] as String?;
        final message = data['message'] as String?;

        debugPrint('NotificationService: Support chat message received - senderType=$senderType');

        // Show notification if message is from admin
        if (senderType == 'admin' && message != null && message.isNotEmpty) {
          debugPrint('NotificationService: SHOWING support chat notification');
          showNotification(
            title: 'Support Team',
            body: message,
            payload: 'support_chat',
            onTap: () {
              // Navigate to support chat
              _navigateToSupportChat();
            },
          );
        }
      },
    );

    channel.subscribe((status, error) {
      debugPrint('NotificationService: Support chat subscription status=$status, error=$error');
    });

    _supportChatChannel = channel;
  }

  static void _unsubscribeSupportChat() {
    _supportChatChannel?.unsubscribe();
    _supportChatChannel = null;
    _currentSupportChatId = null;
  }

  static void _navigateToSupportChat() {
    final nav = navigatorKey.currentState;
    if (nav != null) {
      nav.pushNamed('/support-chat');
    }
  }

  static void _navigateToRideChat(String rideId) {
    // For ride chat, we navigate to home which has the active ride with chat button
    // The user can then tap the chat button to open the chat
    final nav = navigatorKey.currentState;
    if (nav != null) {
      // Pop to home first, then the user is already on the active ride screen
      nav.popUntil((route) => route.isFirst);
    }
  }
}
