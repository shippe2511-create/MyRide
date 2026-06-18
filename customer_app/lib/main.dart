import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
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
import 'screens/recurring_rides_screen.dart';
import 'theme/app_theme.dart';
import 'services/notification_service.dart';
import 'services/cache_service.dart';
import 'services/supabase_service.dart';
import 'services/location_service.dart';

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

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  try {
    // Initialize Supabase
    await SupabaseService.initialize();
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

class MyRideApp extends StatelessWidget {
  const MyRideApp({super.key});

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
          debugShowCheckedModeBanner: false,
          theme: appState.isDarkMode ? AppTheme.darkTheme : AppTheme.lightTheme,
          home: const SplashScreen(),
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
              case '/recurring-rides':
                page = const RecurringRidesScreen();
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
