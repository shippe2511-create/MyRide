import 'package:onesignal_flutter/onesignal_flutter.dart';
import 'package:flutter/foundation.dart';

/// OneSignal Push Notification Service for MyRide Customer App
class OneSignalService {
  // OneSignal Customer App ID
  static const String _appId = 'ddb93663-5792-489f-9c3a-f5b8ba4868e1';

  static bool _initialized = false;
  static String? _pendingLoginId;
  static Function(String rideId, String eventType)? _onNotificationTap;

  /// Initialize OneSignal - call in main() before runApp()
  static Future<void> initialize() async {
    if (_initialized) return;

    // Enable verbose logging in debug mode
    if (kDebugMode) {
      OneSignal.Debug.setLogLevel(OSLogLevel.verbose);
    }

    OneSignal.initialize(_appId);

    // Setup notification handlers
    _setupNotificationHandlers();

    _initialized = true;
    debugPrint('OneSignal: initialized for customer app');

    // If there was a pending login, do it now
    if (_pendingLoginId != null) {
      await _doLogin(_pendingLoginId!);
      _pendingLoginId = null;
    }
  }

  /// Set callback for notification tap - for deep linking
  static void setNotificationTapHandler(Function(String rideId, String eventType) handler) {
    _onNotificationTap = handler;
  }

  /// Login - call after user authenticates
  /// Pass the profile_id (UUID) so backend can target this user
  static Future<void> login(String profileId) async {
    if (profileId.isEmpty) return;

    if (!_initialized) {
      // Queue the login for after initialization
      _pendingLoginId = profileId;
      debugPrint('OneSignal: queued login for $profileId (SDK not yet initialized)');
      return;
    }

    await _doLogin(profileId);
  }

  static Future<void> _doLogin(String profileId) async {
    try {
      // Login sets the external_id for this user
      await OneSignal.login(profileId);
      debugPrint('OneSignal: logged in customer $profileId');

      // Verify the login worked
      await Future.delayed(const Duration(milliseconds: 500));
      final subscriptionId = OneSignal.User.pushSubscription.id;
      debugPrint('OneSignal: subscriptionId=$subscriptionId');
    } catch (e) {
      debugPrint('OneSignal: login error: $e');
    }
  }

  /// Logout - call when user logs out
  static Future<void> logout() async {
    await OneSignal.logout();
    debugPrint('OneSignal: logged out');
  }

  /// Request notification permission
  /// Call after login when user has context, not on first launch
  static Future<bool> requestPermission() async {
    final granted = await OneSignal.Notifications.requestPermission(true);
    debugPrint('OneSignal: permission ${granted ? 'granted' : 'denied'}');
    return granted;
  }

  /// Check if permission is granted
  static bool get hasPermission => OneSignal.Notifications.permission;

  /// Get the OneSignal subscription ID (for debugging)
  static String? get subscriptionId => OneSignal.User.pushSubscription.id;


  /// Add a tag for segmentation (e.g., department, pool)
  static void setTag(String key, String value) {
    OneSignal.User.addTagWithKey(key, value);
  }

  /// Remove a tag
  static void removeTag(String key) {
    OneSignal.User.removeTag(key);
  }

  static void _setupNotificationHandlers() {
    // Notification clicked - works for foreground, background, and terminated
    OneSignal.Notifications.addClickListener((event) {
      debugPrint('OneSignal: notification clicked');
      debugPrint('OneSignal: title=${event.notification.title}');
      debugPrint('OneSignal: body=${event.notification.body}');

      final data = event.notification.additionalData;
      if (data != null) {
        _handleNotificationData(data);
      }
    });

    // Foreground notification - display it (don't suppress)
    OneSignal.Notifications.addForegroundWillDisplayListener((event) {
      debugPrint('OneSignal: foreground notification received');
      debugPrint('OneSignal: title=${event.notification.title}');

      // Display the notification even when app is in foreground
      // For ride updates, we want the user to see them
      event.notification.display();
    });

    // Permission change observer
    OneSignal.Notifications.addPermissionObserver((permission) {
      debugPrint('OneSignal: permission changed to $permission');
    });

    // Subscription change observer - this fires when push token is received
    OneSignal.User.pushSubscription.addObserver((state) {
      debugPrint('OneSignal: subscription changed');
      debugPrint('OneSignal: subscriptionId=${state.current.id}');
      debugPrint('OneSignal: optedIn=${state.current.optedIn}');
      debugPrint('OneSignal: token=${state.current.token?.substring(0, 20)}...');
    });
  }

  static void _handleNotificationData(Map<String, dynamic> data) {
    final rideId = data['ride_id'] as String?;
    final eventType = data['event_type'] as String?;

    debugPrint('OneSignal: data payload - ride_id=$rideId, event_type=$eventType');

    if (rideId != null && eventType != null && _onNotificationTap != null) {
      _onNotificationTap!(rideId, eventType);
    }
  }
}
