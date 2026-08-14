import 'package:onesignal_flutter/onesignal_flutter.dart';
import 'package:flutter/foundation.dart';

/// OneSignal Push Notification Service for MyRide Driver App
///
/// Setup required:
/// 1. Replace _appId with your OneSignal App ID from dashboard
/// 2. iOS: Add Push Notifications capability in Xcode
/// 3. iOS: Add Background Modes > Remote notifications in Xcode
/// 4. iOS: Create Notification Service Extension for terminated-state delivery
/// 5. iOS: Upload APNs credentials to OneSignal dashboard
class OneSignalService {
  // TODO: Replace with your OneSignal Driver App ID
  static const String _appId = 'YOUR_ONESIGNAL_DRIVER_APP_ID';

  static bool _initialized = false;
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
    debugPrint('OneSignal: initialized for driver app');
  }

  /// Set callback for notification tap - for deep linking
  static void setNotificationTapHandler(Function(String rideId, String eventType) handler) {
    _onNotificationTap = handler;
  }

  /// Login - call after driver authenticates
  /// Pass the driver_id (UUID) so backend can target this driver
  static void login(String driverId) {
    if (driverId.isEmpty) return;
    OneSignal.login(driverId);
    debugPrint('OneSignal: logged in driver $driverId');
  }

  /// Logout - call when driver logs out
  static void logout() {
    OneSignal.logout();
    debugPrint('OneSignal: logged out');
  }

  /// Request notification permission
  /// Call after login when driver has context, not on first launch
  static Future<bool> requestPermission() async {
    final granted = await OneSignal.Notifications.requestPermission(true);
    debugPrint('OneSignal: permission ${granted ? 'granted' : 'denied'}');
    return granted;
  }

  /// Check if permission is granted
  static bool get hasPermission => OneSignal.Notifications.permission;

  /// Get the OneSignal subscription ID (for debugging)
  static String? get subscriptionId => OneSignal.User.pushSubscription.id;

  /// Add a tag for segmentation (e.g., vehicle_type, department)
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
    // Driver needs to see ride requests immediately
    OneSignal.Notifications.addForegroundWillDisplayListener((event) {
      debugPrint('OneSignal: foreground notification received');
      debugPrint('OneSignal: title=${event.notification.title}');

      // Display the notification even when app is in foreground
      // Ride requests and updates are time-sensitive
      event.notification.display();
    });

    // Permission change observer
    OneSignal.Notifications.addPermissionObserver((permission) {
      debugPrint('OneSignal: permission changed to $permission');
    });

    // Subscription change observer
    OneSignal.User.pushSubscription.addObserver((state) {
      debugPrint('OneSignal: subscription changed');
      debugPrint('OneSignal: subscriptionId=${state.current.id}');
      debugPrint('OneSignal: optedIn=${state.current.optedIn}');
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
