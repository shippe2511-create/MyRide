import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:audioplayers/audioplayers.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'providers/app_state.dart';
import 'screens/splash_screen.dart';
import 'screens/onboarding_screen.dart';
import 'screens/welcome_screen.dart';
import 'screens/login_screen.dart';
import 'screens/registration_screen.dart';
import 'screens/home_screen.dart';
import 'screens/search_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/activity_screen.dart';
import 'screens/schedule_screen.dart';
import 'screens/trip_complete_screen.dart';
import 'screens/sos_screen.dart';
import 'screens/notifications_screen.dart';
import 'screens/schedules_screen.dart';
import 'theme/app_theme.dart';
import 'services/notification_service.dart';
import 'services/cache_service.dart';
import 'services/supabase_service.dart';
import 'services/location_service.dart';
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
  if (navigatorState != null && navigatorState.overlay != null) {
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
    debugPrint('showAppNotification: Navigator overlay not available');
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
            final curve = CurvedAnimation(parent: animation, curve: Curves.easeOutCubic);
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

  bool firebaseInitialized = false;
  try {
    // Initialize Firebase - wrapped carefully for devices without Google Play Services
    await Firebase.initializeApp();
    firebaseInitialized = true;
    // Set up background message handler only if Firebase initialized
    FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);
  } catch (e) {
    debugPrint('Firebase init error (continuing without Firebase): $e');
    // Continue without Firebase - app should still work
  }

  try {
    // Initialize Supabase
    await SupabaseService.initialize();
    // Load app settings
    await AppSettingsService.load();
  } catch (e) {
    debugPrint('Supabase init error: $e');
  }

  try {
    // Initialize notifications
    await NotificationService().init();
    await NotificationService().requestPermissions();
  } catch (e) {
    debugPrint('Notification init error: $e');
  }

  try {
    // Initialize offline cache
    await CacheService.initializeCache();
  } catch (e) {
    debugPrint('Cache init error: $e');
  }

  try {
    // Initialize location service early
    await LocationService.initialize();
  } catch (e) {
    debugPrint('Location init error: $e');
  }

  // Voice service removed - push to talk is only for admin-driver communication

  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
    ),
  );
  runApp(
    ChangeNotifierProvider(
      create: (_) => AppState(),
      child: const MyRideApp(),
    ),
  );
}

class MyRideApp extends StatefulWidget {
  const MyRideApp({super.key});

  @override
  State<MyRideApp> createState() => _MyRideAppState();
}

class _MyRideAppState extends State<MyRideApp> with WidgetsBindingObserver {
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
    return Consumer<AppState>(
      builder: (context, appState, child) {
        SystemChrome.setSystemUIOverlayStyle(
          SystemUiOverlayStyle(
            statusBarColor: Colors.transparent,
            statusBarIconBrightness: appState.isDarkMode ? Brightness.light : Brightness.dark,
          ),
        );

        return MaterialApp(
          title: 'MyRide',
          navigatorKey: navigatorKey,
          debugShowCheckedModeBanner: false,
          theme: appState.isDarkMode ? AppTheme.darkTheme : AppTheme.lightTheme,
          home: appState.isSuspended ? const SuspendedScreen() : const SplashScreen(),
          builder: (context, child) {
            return OfflineBanner(child: child!);
          },
          onGenerateRoute: (settings) {
            Widget page;
            switch (settings.name) {
              case '/splash':
                page = const SplashScreen();
                break;
              case '/onboarding':
                page = const OnboardingScreen();
                break;
              case '/welcome':
                page = const WelcomeScreen();
                break;
              case '/login':
                page = const LoginScreen();
                break;
              case '/register':
                page = const RegistrationScreen();
                break;
              case '/pending':
                page = const PendingApprovalScreen();
                break;
              case '/rejected':
                page = const RejectedScreen();
                break;
              case '/suspended':
                page = const SuspendedScreen();
                break;
              case '/home':
                page = const HomeScreen();
                break;
              case '/search':
                page = const SearchScreen();
                break;
              case '/profile':
                page = const ProfileScreen();
                break;
              case '/activity':
                page = const ActivityScreen();
                break;
              case '/settings':
                page = const ProfileScreen();
                break;
              case '/schedule':
                page = const ScheduleScreen();
                break;
              case '/trip-complete':
                page = const TripCompleteScreen();
                break;
              case '/rate':
                page = const RateDriverScreen();
                break;
              case '/sos':
                page = const SOSScreen();
                break;
              case '/notifications':
                page = const NotificationsScreen();
                break;
              case '/schedules':
                page = const SchedulesScreen();
                break;
              default:
                page = const HomeScreen();
            }
            return SmoothPageRoute(page: page);
          },
        );
      },
    );
  }
}
