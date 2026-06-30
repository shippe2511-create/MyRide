import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:local_auth/local_auth.dart';
import 'package:provider/provider.dart';
import 'package:geolocator/geolocator.dart';
import '../providers/app_state.dart';
import '../theme/app_theme.dart';
import '../widgets/brand_mark.dart';
import '../services/supabase_service.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with TickerProviderStateMixin {
  late AnimationController _pulseController;
  late AnimationController _logoController;
  late AnimationController _textController;
  late Animation<double> _logoScale;
  late Animation<double> _logoOpacity;
  late Animation<double> _textSlide;
  late Animation<double> _textOpacity;
  final _localAuth = LocalAuthentication();

  @override
  void initState() {
    super.initState();

    // Pulse animation for loading dots
    _pulseController = AnimationController(
      duration: const Duration(milliseconds: 1200),
      vsync: this,
    )..repeat();

    // Logo animation
    _logoController = AnimationController(
      duration: const Duration(milliseconds: 800),
      vsync: this,
    );
    _logoScale = Tween<double>(begin: 0.5, end: 1.0).animate(
      CurvedAnimation(parent: _logoController, curve: Curves.elasticOut),
    );
    _logoOpacity = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _logoController, curve: const Interval(0.0, 0.5, curve: Curves.easeOut)),
    );

    // Text animation
    _textController = AnimationController(
      duration: const Duration(milliseconds: 600),
      vsync: this,
    );
    _textSlide = Tween<double>(begin: 20, end: 0).animate(
      CurvedAnimation(parent: _textController, curve: Curves.easeOutCubic),
    );
    _textOpacity = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _textController, curve: Curves.easeOut),
    );

    // Start animations in sequence
    _logoController.forward();
    Future.delayed(const Duration(milliseconds: 400), () {
      _textController.forward();
    });

    Future.delayed(const Duration(seconds: 2), () => _checkAuthAndNavigate());
  }

  Future<void> _checkAuthAndNavigate() async {
    if (!mounted) return;

    // Request location permission early
    await _requestLocationPermission();
    if (!mounted) return;

    final appState = Provider.of<AppState>(context, listen: false);

    // Wait for AppState to fully load from SharedPreferences
    await appState.waitForInitialization();
    if (!mounted) return;

    // Check if onboarding is needed
    if (!appState.hasCompletedOnboarding) {
      Navigator.pushReplacementNamed(context, '/onboarding');
      return;
    }

    // If user has a saved phone, check database for latest status
    final savedPhone = appState.userPhone;
    if (savedPhone.isNotEmpty) {
      try {
        final dbUser = await SupabaseService.checkPhoneExists(savedPhone);
        if (dbUser != null) {
          final status = dbUser['status'] as String?;
          final role = dbUser['role'] as String? ?? 'customer';
          final isAdmin = role == 'admin' || role == 'super-admin';

          if (status == 'pending' && !isAdmin) {
            Navigator.pushReplacementNamed(context, '/pending');
            return;
          } else if (status == 'rejected') {
            Navigator.pushReplacementNamed(context, '/rejected');
            return;
          } else if (status == 'suspended') {
            Navigator.pushReplacementNamed(context, '/suspended');
            return;
          } else if (status != 'approved' && !isAdmin) {
            // Not approved, go to welcome
            Navigator.pushReplacementNamed(context, '/welcome');
            return;
          } else if (status == 'approved' || isAdmin) {
            // Store profile ID and update local state
            if (dbUser['id'] != null) {
              appState.setProfileId(dbUser['id']);
            }
            appState.setUserData(
              name: dbUser['full_name'] ?? 'User',
              email: dbUser['email'] ?? '',
              phone: savedPhone,
              profileId: dbUser['id'],
            );
            appState.simulateApproval();
            // Continue to Face ID check below
          }
        } else {
          // User not found in DB, go to welcome
          Navigator.pushReplacementNamed(context, '/welcome');
          return;
        }
      } catch (e) {
        // Fall back to local state
      }
    } else {
      // No saved phone, go to welcome/login
      Navigator.pushReplacementNamed(context, '/welcome');
      return;
    }

    // Check local registration status as fallback
    if (appState.isPendingApproval) {
      Navigator.pushReplacementNamed(context, '/pending');
      return;
    }

    if (appState.isRejected) {
      Navigator.pushReplacementNamed(context, '/rejected');
      return;
    }

    // If not registered/approved, go to welcome/login
    if (!appState.isApproved) {
      Navigator.pushReplacementNamed(context, '/welcome');
      return;
    }

    // User is approved - check Face ID
    if (appState.faceIdEnabled) {
      try {
        final canCheck = await _localAuth.canCheckBiometrics;
        if (canCheck) {
          final authenticated = await _localAuth.authenticate(
            localizedReason: 'Sign in to MyRide',
            options: const AuthenticationOptions(
              stickyAuth: true,
              biometricOnly: true,
            ),
          );
          if (authenticated && mounted) {
            HapticFeedback.lightImpact();
            Navigator.pushReplacementNamed(context, '/home');
            return;
          }
        }
      } catch (e) {
        // Fall through to home screen since user is approved
      }
    }

    // User is approved, go to home
    if (mounted) {
      Navigator.pushReplacementNamed(context, '/home');
    }
  }

  Future<void> _requestLocationPermission() async {
    try {
      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
    } catch (e) {
      debugPrint('Location permission error: $e');
    }
  }

  @override
  void dispose() {
    _pulseController.dispose();
    _logoController.dispose();
    _textController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = context.isDark;

    return Scaffold(
      backgroundColor: context.bgColor,
      body: Stack(
        children: [
          Positioned(
            top: -80,
            right: -120,
            child: Container(
              width: 360,
              height: 360,
              decoration: BoxDecoration(
                color: AppColors.yellow.withValues(alpha: 0.95),
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(180),
                  topRight: Radius.circular(180),
                  bottomLeft: Radius.circular(22),
                  bottomRight: Radius.circular(180),
                ),
              ),
            ),
          ),
          Positioned(
            top: -40,
            right: -60,
            child: Container(
              width: 240,
              height: 240,
              decoration: BoxDecoration(
                color: context.bgColor,
                shape: BoxShape.circle,
              ),
            ),
          ),
          Positioned(
            bottom: 120,
            left: -10,
            right: -10,
            child: CheckerBand(
              cells: (MediaQuery.of(context).size.width ~/ 10) + 4,
              isDark: isDark,
            ),
          ),
          Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Animated logo
                AnimatedBuilder(
                  animation: _logoController,
                  builder: (context, child) {
                    return Transform.scale(
                      scale: _logoScale.value,
                      child: Opacity(
                        opacity: _logoOpacity.value,
                        child: const BrandMark(size: 88),
                      ),
                    );
                  },
                ),
                const SizedBox(height: 18),
                // Animated text
                AnimatedBuilder(
                  animation: _textController,
                  builder: (context, child) {
                    return Transform.translate(
                      offset: Offset(0, _textSlide.value),
                      child: Opacity(
                        opacity: _textOpacity.value,
                        child: Column(
                          children: [
                            Text(
                              'MyRide',
                              style: TextStyle(
                                color: context.textColor,
                                fontSize: 38,
                                fontWeight: FontWeight.w700,
                                letterSpacing: -1.2,
                              ),
                            ),
                            const SizedBox(height: 6),
                            Text(
                              'STAFF TRANSPORT',
                              style: TextStyle(
                                color: context.mutedColor,
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                letterSpacing: 2,
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
              ],
            ),
          ),
          Positioned(
            bottom: 64,
            left: 0,
            right: 0,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(
                3,
                (i) => AnimatedBuilder(
                  animation: _pulseController,
                  builder: (context, child) {
                    final delay = i * 0.15;
                    final value = (_pulseController.value - delay) % 1.0;
                    final opacity = 0.35 + 0.65 * _pulse(value);
                    final scale = 1.0 + 0.4 * _pulse(value);
                    return Transform.scale(
                      scale: scale,
                      child: Container(
                        margin: const EdgeInsets.symmetric(horizontal: 3),
                        width: 6,
                        height: 6,
                        decoration: BoxDecoration(
                          color: AppColors.yellow.withValues(alpha: opacity),
                          shape: BoxShape.circle,
                        ),
                      ),
                    );
                  },
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  double _pulse(double t) {
    if (t < 0) t += 1;
    if (t < 0.5) {
      return 2 * t;
    } else {
      return 2 * (1 - t);
    }
  }
}
