import 'dart:async';
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../models/ride_request.dart';
import '../theme/app_theme.dart';

class RideRequestPopup extends StatefulWidget {
  final RideRequest request;
  final Future<void> Function() onAccept;
  final VoidCallback onDecline;
  final VoidCallback? onSkip;
  final int timeoutSeconds;

  const RideRequestPopup({
    super.key,
    required this.request,
    required this.onAccept,
    required this.onDecline,
    this.onSkip,
    this.timeoutSeconds = 30,
  });

  @override
  State<RideRequestPopup> createState() => _RideRequestPopupState();
}

class _RideRequestPopupState extends State<RideRequestPopup>
    with TickerProviderStateMixin {
  late AnimationController _controller;
  late AnimationController _pulseController;
  late AnimationController _shimmerController;
  late Animation<double> _scaleAnimation;
  late Animation<double> _fadeAnimation;
  late Animation<double> _slideAnimation;
  Timer? _timer;
  int _remainingSeconds = 30;
  bool _isAccepting = false;
  double _swipeProgress = 0;

  @override
  void initState() {
    super.initState();
    _remainingSeconds = widget.timeoutSeconds;

    _controller = AnimationController(
      duration: const Duration(milliseconds: 500),
      vsync: this,
    );

    _pulseController = AnimationController(
      duration: const Duration(milliseconds: 1200),
      vsync: this,
    )..repeat(reverse: true);

    _shimmerController = AnimationController(
      duration: const Duration(milliseconds: 2000),
      vsync: this,
    )..repeat();

    _scaleAnimation = Tween<double>(begin: 0.7, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.elasticOut),
    );

    _fadeAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: const Interval(0, 0.5, curve: Curves.easeOut)),
    );

    _slideAnimation = Tween<double>(begin: 50.0, end: 0.0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeOutCubic),
    );

    _controller.forward();
    _startCountdown();

    HapticFeedback.heavyImpact();
  }

  void _startCountdown() {
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (_remainingSeconds > 0) {
        setState(() {
          _remainingSeconds--;
          if (_remainingSeconds == 0) {
            timer.cancel();
            Future.microtask(() {
              if (mounted) widget.onDecline();
            });
          }
        });
      }
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    _pulseController.dispose();
    _shimmerController.dispose();
    _timer?.cancel();
    super.dispose();
  }

  double get _progress => _remainingSeconds / widget.timeoutSeconds;
  bool get _isUrgent => _remainingSeconds <= 10;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: Listenable.merge([_controller, _pulseController]),
      builder: (context, _) {
        return FadeTransition(
          opacity: _fadeAnimation,
          child: Transform.translate(
            offset: Offset(0, _slideAnimation.value),
            child: Transform.scale(
              scale: _scaleAnimation.value,
              child: Container(
                margin: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(32),
                  boxShadow: [
                    BoxShadow(
                      color: (_isUrgent ? AppColors.error : AppColors.yellow).withValues(alpha: 0.3 + (_pulseController.value * 0.15)),
                      blurRadius: 40 + (_pulseController.value * 20),
                      spreadRadius: 2,
                    ),
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.6),
                      blurRadius: 30,
                      offset: const Offset(0, 15),
                    ),
                  ],
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(32),
                  child: BackdropFilter(
                    filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
                    child: Container(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: context.isDark
                              ? [const Color(0xFF2A2A2A), const Color(0xFF1A1A1A)]
                              : [Colors.white, const Color(0xFFF8F8F8)],
                        ),
                        borderRadius: BorderRadius.circular(32),
                        border: Border.all(
                          color: (_isUrgent ? AppColors.error : AppColors.yellow).withValues(alpha: 0.6),
                          width: 2.5,
                        ),
                      ),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          // Animated progress bar
                          _buildProgressBar(),

                          // Header with pulsing icon
                          _buildHeader(),

                          // Route card with glass effect
                          _buildRouteCard(),

                          const SizedBox(height: 20),

                          // Stats row
                          _buildStatsRow(),

                          const SizedBox(height: 24),

                          // Action buttons
                          _buildActionButtons(),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildProgressBar() {
    return Container(
      height: 6,
      decoration: BoxDecoration(
        color: context.isDark ? Colors.white.withValues(alpha: 0.1) : Colors.black.withValues(alpha: 0.05),
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          return Stack(
            children: [
              AnimatedContainer(
                duration: const Duration(milliseconds: 300),
                width: constraints.maxWidth * _progress,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: _isUrgent
                        ? [AppColors.error, AppColors.error.withValues(alpha: 0.7)]
                        : [AppColors.yellow, const Color(0xFFFFC107)],
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: (_isUrgent ? AppColors.error : AppColors.yellow).withValues(alpha: 0.5),
                      blurRadius: 8,
                    ),
                  ],
                ),
              ),
              // Shimmer effect
              AnimatedBuilder(
                animation: _shimmerController,
                builder: (context, _) {
                  return Positioned(
                    left: (constraints.maxWidth * _progress) * _shimmerController.value - 50,
                    child: Container(
                      width: 50,
                      height: 6,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [
                            Colors.white.withValues(alpha: 0),
                            Colors.white.withValues(alpha: 0.4),
                            Colors.white.withValues(alpha: 0),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            (_isUrgent ? AppColors.error : AppColors.yellow).withValues(alpha: 0.15),
            Colors.transparent,
          ],
        ),
      ),
      child: Row(
        children: [
          // Pulsing animated icon
          AnimatedBuilder(
            animation: _pulseController,
            builder: (context, child) {
              final scale = 1.0 + (_pulseController.value * 0.08);
              return Transform.scale(
                scale: scale,
                child: Container(
                  width: 64,
                  height: 64,
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: _isUrgent
                          ? [AppColors.error, AppColors.error.withValues(alpha: 0.7)]
                          : [AppColors.yellow, const Color(0xFFFFC107)],
                    ),
                    borderRadius: BorderRadius.circular(20),
                    boxShadow: [
                      BoxShadow(
                        color: (_isUrgent ? AppColors.error : AppColors.yellow).withValues(alpha: 0.5),
                        blurRadius: 16 + (_pulseController.value * 8),
                        spreadRadius: 2,
                      ),
                    ],
                  ),
                  child: Icon(
                    _isUrgent ? Icons.warning_amber_rounded : Icons.local_taxi_rounded,
                    color: _isUrgent ? Colors.white : Colors.black,
                    size: 34,
                  ),
                ),
              );
            },
          ),
          const SizedBox(width: 18),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: (_isUrgent ? AppColors.error : AppColors.yellow).withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        _isUrgent ? 'HURRY UP!' : 'NEW REQUEST',
                        style: TextStyle(
                          color: _isUrgent ? AppColors.error : AppColors.yellow,
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  widget.request.customerName,
                  style: TextStyle(
                    color: context.textColor,
                    fontSize: 24,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.5,
                  ),
                ),
              ],
            ),
          ),
          // Circular timer
          _buildCircularTimer(),
        ],
      ),
    );
  }

  Widget _buildCircularTimer() {
    return Container(
      width: 60,
      height: 60,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: context.isDark
              ? [Colors.white.withValues(alpha: 0.1), Colors.white.withValues(alpha: 0.05)]
              : [Colors.white, const Color(0xFFF5F5F5)],
        ),
        border: Border.all(
          color: _isUrgent ? AppColors.error : context.borderColor,
          width: 3,
        ),
        boxShadow: _isUrgent
            ? [BoxShadow(color: AppColors.error.withValues(alpha: 0.3), blurRadius: 12)]
            : null,
      ),
      child: Stack(
        alignment: Alignment.center,
        children: [
          // Progress ring
          SizedBox(
            width: 54,
            height: 54,
            child: CircularProgressIndicator(
              value: _progress,
              strokeWidth: 3,
              backgroundColor: Colors.transparent,
              valueColor: AlwaysStoppedAnimation(_isUrgent ? AppColors.error : AppColors.yellow),
            ),
          ),
          // Timer text
          Text(
            '$_remainingSeconds',
            style: TextStyle(
              color: _isUrgent ? AppColors.error : context.textColor,
              fontSize: 22,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRouteCard() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: context.isDark
                ? [Colors.white.withValues(alpha: 0.08), Colors.white.withValues(alpha: 0.03)]
                : [Colors.white, const Color(0xFFFAFAFA)],
          ),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: context.isDark ? Colors.white12 : Colors.black.withValues(alpha: 0.05)),
        ),
        child: Column(
          children: [
            _buildLocationRow(
              icon: Icons.trip_origin_rounded,
              color: AppColors.success,
              title: 'PICKUP',
              location: widget.request.pickupLocation,
              address: widget.request.pickupAddress,
              isTop: true,
            ),
            // Animated connector
            Padding(
              padding: const EdgeInsets.only(left: 11),
              child: Row(
                children: [
                  Container(
                    width: 3,
                    height: 32,
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          AppColors.success.withValues(alpha: 0.8),
                          AppColors.error.withValues(alpha: 0.8),
                        ],
                      ),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                  const SizedBox(width: 20),
                  // Distance badge
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: AppColors.yellow.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppColors.yellow.withValues(alpha: 0.3)),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.route_rounded, color: AppColors.yellow, size: 14),
                        const SizedBox(width: 6),
                        Text(
                          '${widget.request.estimatedDistance} km',
                          style: TextStyle(color: AppColors.yellow, fontSize: 13, fontWeight: FontWeight.w700),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            _buildLocationRow(
              icon: Icons.location_on_rounded,
              color: AppColors.error,
              title: 'DROP-OFF',
              location: widget.request.dropoffLocation,
              address: widget.request.dropoffAddress,
              isTop: false,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLocationRow({
    required IconData icon,
    required Color color,
    required String title,
    required String location,
    required String address,
    required bool isTop,
  }) {
    return Row(
      children: [
        Container(
          width: 24,
          height: 24,
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.2),
            shape: BoxShape.circle,
          ),
          child: Icon(icon, color: color, size: 14),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: TextStyle(
                  color: context.mutedColor,
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                location,
                style: TextStyle(
                  color: context.textColor,
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                ),
              ),
              Text(
                address,
                style: TextStyle(color: context.mutedColor, fontSize: 13),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildStatsRow() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Row(
        children: [
          _buildStatCard(Icons.timer_rounded, '${widget.request.estimatedDuration}', 'MIN'),
          const SizedBox(width: 12),
          _buildStatCard(Icons.straighten_rounded, '${widget.request.estimatedDistance}', 'KM'),
          if (widget.request.fare != null) ...[
            const SizedBox(width: 12),
            _buildStatCard(Icons.payments_rounded, '\$${widget.request.fare!.toStringAsFixed(0)}', 'FARE'),
          ],
        ],
      ),
    );
  }

  Widget _buildStatCard(IconData icon, String value, String label) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: context.isDark
                ? [Colors.white.withValues(alpha: 0.06), Colors.white.withValues(alpha: 0.02)]
                : [Colors.white, const Color(0xFFF8F8F8)],
          ),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: context.isDark ? Colors.white10 : Colors.black.withValues(alpha: 0.05)),
        ),
        child: Column(
          children: [
            Icon(icon, color: AppColors.yellow, size: 22),
            const SizedBox(height: 6),
            Text(
              value,
              style: TextStyle(
                color: context.textColor,
                fontSize: 18,
                fontWeight: FontWeight.w800,
              ),
            ),
            Text(
              label,
              style: TextStyle(
                color: context.mutedColor,
                fontSize: 10,
                fontWeight: FontWeight.w600,
                letterSpacing: 0.5,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildActionButtons() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
      child: _isAccepting
          ? _buildAcceptingState()
          : _buildSwipeToAccept(),
    );
  }

  Widget _buildAcceptingState() {
    return Container(
      height: 64,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [AppColors.yellow, const Color(0xFFFFC107)],
        ),
        borderRadius: BorderRadius.circular(32),
      ),
      child: Center(
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(
                strokeWidth: 3,
                valueColor: AlwaysStoppedAnimation(Colors.black),
              ),
            ),
            const SizedBox(width: 12),
            Text(
              'Accepting...',
              style: TextStyle(
                color: Colors.black,
                fontSize: 18,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSwipeToAccept() {
    return GestureDetector(
      onHorizontalDragEnd: (details) {
        if (_swipeProgress >= 0.8) {
          _triggerAccept();
        } else {
          setState(() => _swipeProgress = 0);
        }
      },
      onHorizontalDragUpdate: (details) {
        final width = MediaQuery.of(context).size.width - 40 - 64; // padding and thumb
        final delta = details.delta.dx / width;
        setState(() {
          _swipeProgress = (_swipeProgress + delta).clamp(0.0, 1.0);
          if (_swipeProgress > 0.3) {
            HapticFeedback.selectionClick();
          }
        });
      },
      child: Container(
        height: 64,
        decoration: BoxDecoration(
          color: context.isDark ? Colors.white.withValues(alpha: 0.1) : Colors.black.withValues(alpha: 0.05),
          borderRadius: BorderRadius.circular(32),
          border: Border.all(
            color: AppColors.yellow.withValues(alpha: 0.3 + (_swipeProgress * 0.7)),
            width: 2,
          ),
        ),
        child: Stack(
          children: [
            // Progress fill
            AnimatedContainer(
              duration: const Duration(milliseconds: 50),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    AppColors.yellow.withValues(alpha: 0.3),
                    AppColors.yellow.withValues(alpha: 0.1),
                  ],
                ),
                borderRadius: BorderRadius.circular(30),
              ),
              width: (MediaQuery.of(context).size.width - 40) * _swipeProgress,
            ),
            // Center text
            Center(
              child: AnimatedOpacity(
                duration: const Duration(milliseconds: 150),
                opacity: _swipeProgress < 0.3 ? 1 : (1 - _swipeProgress).clamp(0.0, 1.0),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.chevron_right, color: AppColors.yellow, size: 20),
                    Icon(Icons.chevron_right, color: AppColors.yellow.withValues(alpha: 0.6), size: 20),
                    Icon(Icons.chevron_right, color: AppColors.yellow.withValues(alpha: 0.3), size: 20),
                    const SizedBox(width: 8),
                    Text(
                      'Swipe to Accept',
                      style: TextStyle(
                        color: context.textColor,
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            // Thumb
            Positioned(
              left: 4 + ((MediaQuery.of(context).size.width - 40 - 64 - 8) * _swipeProgress),
              top: 4,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 50),
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [AppColors.yellow, const Color(0xFFFFC107)],
                  ),
                  borderRadius: BorderRadius.circular(28),
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.yellow.withValues(alpha: 0.4),
                      blurRadius: 12,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Icon(
                  _swipeProgress >= 0.8 ? Icons.check : Icons.chevron_right,
                  color: Colors.black,
                  size: 28,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _triggerAccept() async {
    HapticFeedback.heavyImpact();
    setState(() => _isAccepting = true);
    await widget.onAccept();
  }
}
