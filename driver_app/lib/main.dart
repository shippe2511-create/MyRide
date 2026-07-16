import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:audioplayers/audioplayers.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'providers/driver_state.dart';
import 'screens/splash_screen.dart';
import 'screens/onboarding_screen.dart';
import 'screens/login_screen.dart';
import 'screens/registration_screen.dart';
import 'screens/home_screen.dart';
import 'screens/history_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/notifications_settings_screen.dart';
import 'screens/notifications_screen.dart';
import 'screens/ratings_screen.dart';
import 'screens/documents_screen.dart';
import 'screens/sos_screen.dart';
import 'screens/shift_schedule_screen.dart';
import 'screens/help_screen.dart';
import 'screens/about_screen.dart';
import 'screens/support_chat_screen.dart';
import 'screens/push_to_talk_screen.dart';
import 'services/push_to_talk_service.dart';
import 'theme/app_theme.dart';
import 'services/supabase_service.dart';
import 'services/notification_service.dart';
import 'services/voice_service.dart';
import 'services/offline_service.dart';
import 'services/app_settings_service.dart';
import 'widgets/offline_banner.dart';
import 'widgets/app_notification_banner.dart';

final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

void showAppNotification({
  required String title,
  String? message,
  NotificationType type = NotificationType.info,
  VoidCallback? onTap,
}) {
  debugPrint('showAppNotification: called with title=$title');
  // Use navigator's overlay directly
  final navigatorState = navigatorKey.currentState;
  debugPrint('showAppNotification: navigatorState=$navigatorState');
  if (navigatorState != null) {
    debugPrint('showAppNotification: overlay=${navigatorState.overlay}');
    if (navigatorState.overlay != null) {
      final overlay = navigatorState.overlay!;
      final entry = OverlayEntry(
        builder: (context) => _GlobalNotificationBanner(
          title: title,
          message: message,
          type: type,
          onTap: onTap,
        ),
      );
      overlay.insert(entry);
      debugPrint('showAppNotification: inserted overlay entry');
      // Auto dismiss after 3 seconds
      Future.delayed(const Duration(seconds: 3), () {
        entry.remove();
      });
      HapticFeedback.lightImpact();
      // Play notification sound (check setting)
      _playNotificationSound();
    } else {
      debugPrint('showAppNotification: overlay is null');
    }
  } else {
    debugPrint('showAppNotification: navigatorState is null');
  }
}

Future<void> _playNotificationSound() async {
  try {
    final prefs = await SharedPreferences.getInstance();
    final soundsEnabled = prefs.getBool('notification_sounds') ?? true;
    final vibrationEnabled = prefs.getBool('notification_vibration') ?? true;

    debugPrint('_playNotificationSound: soundsEnabled=$soundsEnabled, vibrationEnabled=$vibrationEnabled');

    // Play sound if enabled
    if (soundsEnabled) {
      debugPrint('_playNotificationSound: Playing sound...');
      final player = AudioPlayer();
      await player.play(AssetSource('sounds/notification.mp3'));
      debugPrint('_playNotificationSound: Sound played');
    }

    // Vibrate if enabled
    if (vibrationEnabled) {
      debugPrint('_playNotificationSound: Vibrating...');
      HapticFeedback.heavyImpact();
    }
  } catch (e) {
    debugPrint('Error playing notification sound: $e');
  }
}

class _GlobalNotificationBanner extends StatefulWidget {
  final String title;
  final String? message;
  final NotificationType type;
  final VoidCallback? onTap;

  const _GlobalNotificationBanner({
    required this.title,
    this.message,
    required this.type,
    this.onTap,
  });

  @override
  State<_GlobalNotificationBanner> createState() => _GlobalNotificationBannerState();
}

class _GlobalNotificationBannerState extends State<_GlobalNotificationBanner>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<Offset> _slideAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 300),
      vsync: this,
    );
    _slideAnimation = Tween<Offset>(
      begin: const Offset(0, -1),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: _controller, curve: Curves.easeOut));
    _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Color get _backgroundColor {
    switch (widget.type) {
      case NotificationType.success:
        return Colors.green;
      case NotificationType.error:
        return Colors.red;
      case NotificationType.warning:
        return Colors.orange;
      case NotificationType.info:
        return Colors.blue;
      case NotificationType.chat:
        return const Color(0xFF1E1E1E);
    }
  }

  IconData get _icon {
    switch (widget.type) {
      case NotificationType.success:
        return Icons.check_circle;
      case NotificationType.error:
        return Icons.error;
      case NotificationType.warning:
        return Icons.warning;
      case NotificationType.info:
        return Icons.info;
      case NotificationType.chat:
        return Icons.chat_bubble;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Positioned(
      top: MediaQuery.of(context).padding.top + 8,
      left: 16,
      right: 16,
      child: SlideTransition(
        position: _slideAnimation,
        child: Material(
          color: Colors.transparent,
          child: GestureDetector(
            onTap: widget.onTap,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: _backgroundColor,
                borderRadius: BorderRadius.circular(12),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.2),
                    blurRadius: 8,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: Row(
                children: [
                  Icon(_icon, color: Colors.white, size: 24),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          widget.title,
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                            fontSize: 14,
                          ),
                        ),
                        if (widget.message != null) ...[
                          const SizedBox(height: 2),
                          Text(
                            widget.message!,
                            style: const TextStyle(
                              color: Colors.white70,
                              fontSize: 12,
                            ),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
// Custom page route with smooth fade + slide transition
class SmoothPageRoute<T> extends PageRouteBuilder<T> {
  final Widget page;
  SmoothPageRoute({required this.page})
      : super(
          pageBuilder: (context, animation, secondaryAnimation) => page,
          transitionDuration: const Duration(milliseconds: 300),
          reverseTransitionDuration: const Duration(milliseconds: 250),
          transitionsBuilder: (context, animation, secondaryAnimation, child) {
            final curve =
                CurvedAnimation(parent: animation, curve: Curves.easeOutCubic);
            return FadeTransition(
              opacity: curve,
              child: SlideTransition(
                position: Tween<Offset>(
                  begin: const Offset(0.03, 0),
                  end: Offset.zero,
                ).animate(curve),
                child: child,
              ),
            );
          },
        );
}

// Handle background FCM messages
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  debugPrint('Background message: ${message.messageId}');
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  try {
    // Initialize Firebase
    await Firebase.initializeApp();
    // Set up background message handler
    FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);
  } catch (e) {
    debugPrint('Firebase init error: $e');
  }

  try {
    await SupabaseService.initialize();
    await AppSettingsService.load();
  } catch (e) {
    debugPrint('Supabase init failed: $e');
  }

  try {
    await NotificationService().init();
  } catch (e) {
    debugPrint('Notification init failed: $e');
  }

  try {
    await VoiceService().initialize();
  } catch (e) {
    debugPrint('Voice service init failed: $e');
  }

  try {
    await OfflineService.initialize();
  } catch (e) {
    debugPrint('Offline service init failed: $e');
  }

  try {
    await PushToTalkService().initialize();
  } catch (e) {
    debugPrint('Push to talk service init failed: $e');
  }

  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
    ),
  );

  runApp(
    ChangeNotifierProvider(
      create: (_) => DriverState(),
      child: const DriverApp(),
    ),
  );
}

class DriverApp extends StatefulWidget {
  const DriverApp({super.key});

  @override
  State<DriverApp> createState() => _DriverAppState();
}

class _DriverAppState extends State<DriverApp> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    NotificationService.setAppInForeground(true);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Track app foreground/background state for smart notifications
    final isInForeground = state == AppLifecycleState.resumed;
    NotificationService.setAppInForeground(isInForeground);
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<DriverState>(
      builder: (context, state, _) {
        return MaterialApp(
          title: 'MyRide Driver',
          navigatorKey: navigatorKey,
          debugShowCheckedModeBanner: false,
          theme: state.isDarkMode ? AppTheme.darkTheme : AppTheme.lightTheme,
          home: const SplashScreen(),
          onGenerateRoute: (settings) {
            // Use fade transition for /home to prevent flash
            if (settings.name == '/home') {
              return PageRouteBuilder(
                settings: settings,
                pageBuilder: (_, __, ___) => const HomeScreen(),
                transitionsBuilder: (_, animation, __, child) {
                  return FadeTransition(opacity: animation, child: child);
                },
                transitionDuration: const Duration(milliseconds: 200),
              );
            }
            // Default routes
            final routes = <String, WidgetBuilder>{
              '/splash': (_) => const SplashScreen(),
              '/onboarding': (_) => const OnboardingScreen(),
              '/login': (_) => const LoginScreen(),
              '/register': (_) => const RegistrationScreen(),
              '/suspended': (_) => const SuspendedScreen(),
              '/history': (_) => const HistoryScreen(),
              '/profile': (_) => const ProfileScreen(),
              '/notifications': (_) => const NotificationsSettingsScreen(),
              '/notifications-list': (_) => const NotificationsScreen(),
              '/ratings': (_) => const RatingsScreen(),
              '/documents': (_) => const DocumentsScreen(),
              '/sos': (_) => const SOSScreen(),
              '/shift-schedule': (_) => const ShiftScheduleScreen(),
              '/help': (_) => const HelpScreen(),
              '/about': (_) => const AboutScreen(),
              '/support-chat': (_) => const SupportChatScreen(),
              '/push-to-talk': (_) => const PushToTalkScreen(),
            };
            final builder = routes[settings.name];
            if (builder != null) {
              return MaterialPageRoute(builder: builder, settings: settings);
            }
            return null;
          },
          builder: (context, child) {
            return OfflineBanner(
              child: _GlobalRideRequestOverlay(child: child!),
            );
          },
        );
      },
    );
  }
}

// Global overlay that shows ride requests on ANY screen
class _GlobalRideRequestOverlay extends StatefulWidget {
  final Widget child;
  const _GlobalRideRequestOverlay({required this.child});

  @override
  State<_GlobalRideRequestOverlay> createState() => _GlobalRideRequestOverlayState();
}

class _GlobalRideRequestOverlayState extends State<_GlobalRideRequestOverlay> {


  void _navigateToHome() {
    // Ensure popup is expanded when we navigate
    final state = context.read<DriverState>();
    state.setOnHomeScreen(true);

    // Switch to home tab if already on home screen
    HomeScreen.switchToHomeTab();

    // Use root navigator to go to home
    Navigator.of(context, rootNavigator: true).pushNamedAndRemoveUntil('/home', (route) => false);
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<DriverState>(
      builder: (context, state, _) {
        final hasRequest = state.incomingRequests.isNotEmpty &&
                          !state.hasActiveRide &&
                          state.isOnline &&
                          !state.isOnHomeScreen; // Don't show banner on home (popup shows there)

        return Stack(
          children: [
            widget.child,
            // Show floating banner when there's a ride request
            if (hasRequest)
              Positioned(
                top: MediaQuery.of(context).padding.top + 10,
                left: 16,
                right: 16,
                child: _RideRequestBanner(
                  request: state.incomingRequests.first,
                  onTap: _navigateToHome,
                ),
              ),
          ],
        );
      },
    );
  }
}

class _RideRequestBanner extends StatelessWidget {
  final dynamic request;
  final VoidCallback onTap;

  const _RideRequestBanner({required this.request, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: const Color(0xFFFFD60A),
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: const Color(0xFFFFD60A).withValues(alpha: 0.4),
              blurRadius: 20,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Icons.local_taxi, color: Colors.black, size: 28),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    'New Ride Request!',
                    style: TextStyle(
                      color: Colors.black,
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      decoration: TextDecoration.none,
                    ),
                  ),
                  Text(
                    '${request.customerName} • ${request.pickupLocation}',
                    style: TextStyle(
                      color: Colors.black.withValues(alpha: 0.7),
                      fontSize: 13,
                      decoration: TextDecoration.none,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.black,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Text(
                'VIEW',
                style: TextStyle(
                  color: Color(0xFFFFD60A),
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  decoration: TextDecoration.none,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
