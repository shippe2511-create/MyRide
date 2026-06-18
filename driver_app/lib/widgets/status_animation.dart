import 'package:flutter/material.dart';
import 'package:lottie/lottie.dart';

enum TripAnimationType {
  searching,
  driverArriving,
  inProgress,
  complete,
  cancelled,
}

class StatusAnimation extends StatelessWidget {
  final TripAnimationType type;
  final double size;
  final bool repeat;
  final VoidCallback? onComplete;

  const StatusAnimation({
    super.key,
    required this.type,
    this.size = 150,
    this.repeat = true,
    this.onComplete,
  });

  String get _assetPath {
    switch (type) {
      case TripAnimationType.searching:
        return 'assets/animations/searching.json';
      case TripAnimationType.driverArriving:
        return 'assets/animations/driver_arriving.json';
      case TripAnimationType.inProgress:
        return 'assets/animations/in_progress.json';
      case TripAnimationType.complete:
        return 'assets/animations/trip_complete.json';
      case TripAnimationType.cancelled:
        return 'assets/animations/cancelled.json';
    }
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: Lottie.asset(
        _assetPath,
        width: size,
        height: size,
        repeat: repeat,
        onLoaded: (composition) {
          if (!repeat && onComplete != null) {
            Future.delayed(composition.duration, onComplete);
          }
        },
      ),
    );
  }
}

class AnimatedStatusCard extends StatelessWidget {
  final TripAnimationType type;
  final String title;
  final String subtitle;
  final Widget? action;

  const AnimatedStatusCard({
    super.key,
    required this.type,
    required this.title,
    required this.subtitle,
    this.action,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      margin: const EdgeInsets.all(20),
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1A1A1C) : Colors.white,
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.3 : 0.1),
            blurRadius: 20,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          StatusAnimation(
            type: type,
            size: 120,
            repeat: type != TripAnimationType.complete && type != TripAnimationType.cancelled,
          ),
          const SizedBox(height: 20),
          Text(
            title,
            style: TextStyle(
              color: isDark ? Colors.white : Colors.black,
              fontSize: 22,
              fontWeight: FontWeight.w700,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          Text(
            subtitle,
            style: TextStyle(
              color: isDark ? Colors.white60 : Colors.black54,
              fontSize: 15,
            ),
            textAlign: TextAlign.center,
          ),
          if (action != null) ...[
            const SizedBox(height: 20),
            action!,
          ],
        ],
      ),
    );
  }
}

class PulsingDot extends StatefulWidget {
  final Color color;
  final double size;

  const PulsingDot({
    super.key,
    required this.color,
    this.size = 12,
  });

  @override
  State<PulsingDot> createState() => _PulsingDotState();
}

class _PulsingDotState extends State<PulsingDot> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scaleAnimation;
  late Animation<double> _opacityAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    )..repeat();

    _scaleAnimation = Tween<double>(begin: 1.0, end: 2.5).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeOut),
    );
    _opacityAnimation = Tween<double>(begin: 0.6, end: 0.0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeOut),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: widget.size * 3,
      height: widget.size * 3,
      child: Stack(
        alignment: Alignment.center,
        children: [
          AnimatedBuilder(
            animation: _controller,
            builder: (context, child) {
              return Transform.scale(
                scale: _scaleAnimation.value,
                child: Container(
                  width: widget.size,
                  height: widget.size,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: widget.color.withValues(alpha: _opacityAnimation.value),
                  ),
                ),
              );
            },
          ),
          Container(
            width: widget.size,
            height: widget.size,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: widget.color,
              boxShadow: [
                BoxShadow(
                  color: widget.color.withValues(alpha: 0.4),
                  blurRadius: 8,
                  spreadRadius: 2,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class LoadingDots extends StatefulWidget {
  final Color color;
  final double size;

  const LoadingDots({
    super.key,
    this.color = const Color(0xFFFFD60A),
    this.size = 10,
  });

  @override
  State<LoadingDots> createState() => _LoadingDotsState();
}

class _LoadingDotsState extends State<LoadingDots> with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 1200),
      vsync: this,
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(3, (index) {
        return AnimatedBuilder(
          animation: _controller,
          builder: (context, child) {
            final delay = index * 0.2;
            final value = ((_controller.value + delay) % 1.0);
            final scale = value < 0.5 ? 1.0 + value : 2.0 - value;
            final opacity = value < 0.5 ? 0.4 + value * 1.2 : 1.0 - (value - 0.5) * 1.2;

            return Container(
              margin: EdgeInsets.symmetric(horizontal: widget.size * 0.3),
              child: Transform.scale(
                scale: scale,
                child: Container(
                  width: widget.size,
                  height: widget.size,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: widget.color.withValues(alpha: opacity.clamp(0.0, 1.0)),
                  ),
                ),
              ),
            );
          },
        );
      }),
    );
  }
}
