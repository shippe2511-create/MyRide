import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:geolocator/geolocator.dart';
import 'package:local_auth/local_auth.dart';
import '../providers/driver_state.dart';
import '../services/supabase_service.dart';
import '../theme/app_theme.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with TickerProviderStateMixin {
  final _localAuth = LocalAuthentication();
  late AnimationController _controller;
  late AnimationController _logoController;
  late AnimationController _textController;
  late Animation<double> _logoScale;
  late Animation<double> _logoOpacity;
  late Animation<double> _textSlide;
  late Animation<double> _textOpacity;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
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

    // Request location permission first, then navigate
    _requestLocationAndNavigate();
  }

  Future<void> _requestLocationAndNavigate() async {
    // Wait for animations
    await Future.delayed(const Duration(milliseconds: 1500));

    // Request location permission
    await _requestLocationPermission();

    // Then navigate
    _navigate();
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

  Future<void> _navigate() async {
    if (!mounted) return;
    final state = Provider.of<DriverState>(context, listen: false);

    if (!state.hasCompletedOnboarding) {
      Navigator.pushReplacementNamed(context, '/onboarding');
    } else if (!state.isLoggedIn) {
      Navigator.pushReplacementNamed(context, '/login');
    } else {
      // Check account status before allowing access
      final phone = state.phoneNumber;
      if (phone.isNotEmpty) {
        try {
          final fullPhone = phone.startsWith('+') ? phone : '+960$phone';
          final profile = await SupabaseService.checkPhoneExists(fullPhone);
          if (profile == null) {
            // Profile deleted - clear local data and go to login
            debugPrint('Profile not found in database, clearing local data');
            state.logout();
            if (!mounted) return;
            Navigator.pushReplacementNamed(context, '/login');
            return;
          }
          final status = profile['status'] as String?;
          if (status == 'suspended' || (status != null && status != 'approved')) {
            Navigator.pushReplacementNamed(context, '/suspended');
            return;
          }
          // Set profile ID for session management and load session token
          if (profile['id'] != null) {
            SupabaseService.setProfileId(profile['id']);
            // Also fetch and set actual driver ID
            final driver = await SupabaseService.getDriverByProfileId(profile['id']);
            if (driver != null) {
              SupabaseService.setDriverId(driver['id']);
            }
            await SupabaseService.loadSessionToken();
          }
        } catch (e) {
          debugPrint('Error checking status: $e');
        }
      }

      // Check Face ID if enabled
      if (state.faceIdEnabled) {
        try {
          final canCheck = await _localAuth.canCheckBiometrics;
          if (canCheck) {
            final authenticated = await _localAuth.authenticate(
              localizedReason: 'Sign in to MyRide Driver',
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
          debugPrint('Face ID error: $e');
        }
      }

      Navigator.pushReplacementNamed(context, '/home');
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    _logoController.dispose();
    _textController.dispose();
    super.dispose();
  }

  double _pulse(double t) {
    if (t < 0.5) return 2 * t;
    return 2 * (1 - t);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.bgColor,
      body: Stack(
        children: [
          // Yellow accent shape
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

          // Main content
          Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Animated driver icon
                AnimatedBuilder(
                  animation: _logoController,
                  builder: (context, child) {
                    return Transform.scale(
                      scale: _logoScale.value,
                      child: Opacity(
                        opacity: _logoOpacity.value,
                        child: Container(
                          width: 100,
                          height: 100,
                          decoration: BoxDecoration(
                            color: AppColors.yellow,
                            borderRadius: BorderRadius.circular(24),
                            boxShadow: [
                              BoxShadow(
                                color: AppColors.yellow.withValues(alpha: 0.4),
                                blurRadius: 20,
                                spreadRadius: 2,
                              ),
                            ],
                          ),
                          child: const Icon(
                            Icons.local_taxi,
                            size: 56,
                            color: Colors.black,
                          ),
                        ),
                      ),
                    );
                  },
                ),
                const SizedBox(height: 20),
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
                            const SizedBox(height: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                              decoration: BoxDecoration(
                                color: AppColors.yellow,
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: const Text(
                                'DRIVER',
                                style: TextStyle(
                                  color: Colors.black,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                  letterSpacing: 2,
                                ),
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

          // Loading indicator
          Positioned(
            bottom: 80,
            left: 0,
            right: 0,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(
                3,
                (i) => AnimatedBuilder(
                  animation: _controller,
                  builder: (context, child) {
                    final delay = i * 0.15;
                    final value = (_controller.value - delay) % 1.0;
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
}
