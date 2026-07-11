import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:timezone/timezone.dart' as tz;
import 'package:timezone/data/latest.dart' as tz_data;
import '../main.dart' show showAppNotification, navigatorKey;
import '../widgets/app_notification_banner.dart';
import 'supabase_service.dart';

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
  }) async {
    final routeInfo = route ?? (pickupName != null && dropoffName != null ? '$pickupName to $dropoffName' : 'Your ride');
    final timeInfo = time ?? (scheduledTime != null ? '${scheduledTime.hour}:${scheduledTime.minute.toString().padLeft(2, '0')}' : 'soon');

    if (scheduledTime == null) {
      // No scheduled time, show immediately
      showNotification(
        title: 'Upcoming Ride Reminder',
        body: '$routeInfo at $timeInfo',
      );
      return;
    }

    // Calculate when to show reminder (minutesBefore the scheduled time)
    final reminderTime = scheduledTime.subtract(Duration(minutes: minutesBefore ?? 15));

    if (reminderTime.isBefore(DateTime.now())) {
      // Reminder time already passed, show immediately
      showNotification(
        title: 'Upcoming Ride Reminder',
        body: '$routeInfo at $timeInfo',
      );
      return;
    }

    // Schedule the notification using flutter_local_notifications
    await _scheduleNotification(
      id: id ?? reminderTime.millisecondsSinceEpoch ~/ 1000,
      title: '🔔 Ride Reminder',
      body: '$routeInfo departs at $timeInfo (in ${minutesBefore ?? 15} minutes)',
      scheduledTime: reminderTime,
    );
  }

  static Future<void> _scheduleNotification({
    required int id,
    required String title,
    required String body,
    required DateTime scheduledTime,
  }) async {
    try {
      // Initialize timezone
      tz_data.initializeTimeZones();
      final location = tz.getLocation('Indian/Maldives');
      final tzScheduledTime = tz.TZDateTime.from(scheduledTime, location);

      const androidDetails = AndroidNotificationDetails(
        'ride_reminders',
        'Ride Reminders',
        channelDescription: 'Scheduled ride reminders',
        importance: Importance.high,
        priority: Priority.high,
        playSound: true,
        enableVibration: true,
      );

      const iosDetails = DarwinNotificationDetails(
        presentAlert: true,
        presentBadge: true,
        presentSound: true,
        sound: 'default',
        interruptionLevel: InterruptionLevel.timeSensitive,
      );

      const details = NotificationDetails(
        android: androidDetails,
        iOS: iosDetails,
      );

      await _notifications.zonedSchedule(
        id,
        title,
        body,
        tzScheduledTime,
        details,
        androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle,
        uiLocalNotificationDateInterpretation: UILocalNotificationDateInterpretation.absoluteTime,
      );

      debugPrint('Scheduled reminder for $scheduledTime (id: $id)');
    } catch (e) {
      debugPrint('Error scheduling notification: $e');
    }
  }

  static Future<void> cancelScheduledNotification(int id) async {
    await _notifications.cancel(id);
    debugPrint('Cancelled scheduled notification: $id');
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

      // Set up FCM
      await _setupFCM();
    } catch (e) {
      debugPrint('NotificationService: Init error: $e');
    }
  }

  static Future<void> _setupFCM() async {
    try {
      // Request FCM permission
      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );

      // Get FCM token and save to database
      final token = await messaging.getToken();
      if (token != null) {
        debugPrint('FCM Token: $token');
        await SupabaseService.registerFcmToken(token);
      }

      // Listen for token refresh
      messaging.onTokenRefresh.listen((newToken) {
        debugPrint('FCM Token refreshed: $newToken');
        SupabaseService.registerFcmToken(newToken);
      });

      // Handle foreground messages
      FirebaseMessaging.onMessage.listen((RemoteMessage message) {
        debugPrint('FCM foreground message: ${message.notification?.title}');
        if (message.notification != null) {
          showNotification(
            title: message.notification!.title ?? 'MyRide',
            body: message.notification!.body ?? '',
            payload: message.data['rideId'],
          );
        }
      });

      // Handle notification tap when app was in background
      FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
        debugPrint('FCM message opened app: ${message.data}');
        // Navigate based on payload if needed
      });
    } catch (e) {
      debugPrint('FCM setup error: $e');
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
    final lowerTitle = title.toLowerCase();
    if (lowerTitle.contains('error') || lowerTitle.contains('cancelled')) {
      bannerType = NotificationType.error;
    } else if (lowerTitle.contains('success') || lowerTitle.contains('completed') || lowerTitle.contains('accepted')) {
      bannerType = NotificationType.success;
    } else if (lowerTitle.contains('message') || lowerTitle.contains('chat')) {
      bannerType = NotificationType.chat; // Dark bg with chat icon
    } else if (lowerTitle.contains('arrived') || lowerTitle.contains('started')) {
      bannerType = NotificationType.info;
    }

    if (_isAppInForeground) {
      // Skip in-app banners for events that already have visual feedback on screen
      final lowerTitle = title.toLowerCase();
      if (lowerTitle.contains('driver accepted') || lowerTitle.contains('driver assigned') ||
          lowerTitle.contains('arrived') || lowerTitle.contains('trip started') ||
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

  static Future<void> showSOSAlert() async {
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

  static Timer? _chatPollTimer;
  static Set<String> _seenChatMessageIds = {};

  static String? _lastDriverMessageId;

  static void subscribeToChatMessages(String rideId, String myUserId) {
    if (_currentRideId == rideId && _chatPollTimer != null) return;

    _unsubscribeChat();
    _currentRideId = rideId;
    _lastDriverMessageId = null;
    _seenChatMessageIds.clear();

    debugPrint('NotificationService: subscribeToChatMessages rideId=$rideId');

    // Initial load to seed seen messages
    _initializeChatPolling(rideId);
  }

  static Future<void> _initializeChatPolling(String rideId) async {
    // Load existing messages first
    try {
      final messages = await SupabaseService.getChatMessages(rideId);
      for (final msg in messages) {
        final msgId = msg['id']?.toString();
        if (msgId != null) {
          _seenChatMessageIds.add(msgId);
        }
        if (msg['sender_type'] == 'driver') {
          _lastDriverMessageId = msgId;
        }
      }
      debugPrint('NotificationService: Initialized with ${_seenChatMessageIds.length} existing messages, lastDriverId=$_lastDriverMessageId');
    } catch (e) {
      debugPrint('NotificationService: Error loading initial messages: $e');
    }

    // Start polling
    _chatPollTimer = Timer.periodic(const Duration(seconds: 2), (_) {
      _pollChatMessages(rideId);
    });
  }

  static Future<void> _pollChatMessages(String rideId) async {
    // Don't show notifications if chat screen is open
    if (_isChatScreenOpen) return;

    try {
      final messages = await SupabaseService.getChatMessages(rideId);

      for (final msg in messages) {
        final msgId = msg['id']?.toString();
        final senderType = msg['sender_type'] as String?;
        final msgText = msg['message'] as String? ?? '';

        // Skip if already seen or empty
        if (msgId == null || _seenChatMessageIds.contains(msgId) || msgText.isEmpty) continue;

        // Mark as seen
        _seenChatMessageIds.add(msgId);

        // Only notify for driver messages
        if (senderType == 'driver') {
          debugPrint('NotificationService: NEW driver message detected: $msgText');
          showNotification(
            title: 'New message from Driver',
            body: msgText,
            payload: 'chat_$rideId',
          );
        }
      }
    } catch (e) {
      debugPrint('NotificationService: Poll error: $e');
    }
  }


  static void _unsubscribeChat() {
    _chatPollTimer?.cancel();
    _chatPollTimer = null;
    _chatChannel?.unsubscribe();
    _chatChannel = null;
    _currentRideId = null;
    _lastDriverMessageId = null;
    _seenChatMessageIds.clear();
  }

  static void _unsubscribe() {
    _notificationChannel?.unsubscribe();
    _notificationChannel = null;
    _unsubscribeChat();
    _unsubscribeSupportChat();
  }

  static void dispose() {
    _unsubscribe();
    _currentUserId = null;
  }

  // Support Chat Notifications
  static RealtimeChannel? _supportChatChannel;
  static String? _currentSupportChatId;

  static void subscribeToSupportChat(String chatId, String myUserId) {
    if (_currentSupportChatId == chatId && _supportChatChannel != null) return;

    _unsubscribeSupportChat();
    _currentSupportChatId = chatId;

    debugPrint('NotificationService: Subscribing to support chat notifications for chat $chatId');

    final channel = Supabase.instance.client.channel('support_chat_notif_$chatId');

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
        final senderId = data['sender_id'] as String?;
        final senderType = data['sender_type'] as String?;
        final message = data['message'] as String?;

        debugPrint('NotificationService: Support chat message received - senderId=$senderId, myId=$myUserId, senderType=$senderType');

        // Show notification if message is from admin
        if (senderType == 'admin' && message != null && message.isNotEmpty) {
          debugPrint('NotificationService: SHOWING support chat notification');
          showNotification(
            title: 'Support Team',
            body: message,
            payload: 'support_chat',
            onTap: () {
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
    // For ride chat, navigate to home which shows active ride with chat button
    final nav = navigatorKey.currentState;
    if (nav != null) {
      nav.popUntil((route) => route.isFirst);
    }
  }
}
