import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
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
import 'theme/app_theme.dart';
import 'services/supabase_service.dart';
import 'services/notification_service.dart';
import 'services/voice_service.dart';
import 'services/offline_service.dart';
import 'widgets/offline_banner.dart';
// import 'services/firebase_service.dart'; // Disabled - requires paid Apple Developer Program

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

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  try {
    await SupabaseService.initialize();
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

class DriverApp extends StatelessWidget {
  const DriverApp({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<DriverState>(
      builder: (context, state, _) {
        return MaterialApp(
          title: 'MyRide Driver',
          debugShowCheckedModeBanner: false,
          theme: state.isDarkMode ? AppTheme.darkTheme : AppTheme.lightTheme,
          home: const SplashScreen(),
          routes: {
            '/splash': (_) => const SplashScreen(),
            '/onboarding': (_) => const OnboardingScreen(),
            '/login': (_) => const LoginScreen(),
            '/register': (_) => const RegistrationScreen(),
            '/home': (_) => const HomeScreen(),
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
  final GlobalKey<NavigatorState> _navKey = GlobalKey<NavigatorState>();

  void _navigateToHome() {
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
                    ),
                  ),
                  Text(
                    '${request.customerName} • ${request.pickupLocation}',
                    style: TextStyle(
                      color: Colors.black.withValues(alpha: 0.7),
                      fontSize: 13,
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
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
