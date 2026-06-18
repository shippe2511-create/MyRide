import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../theme/app_theme.dart';

enum DriverStatus { offline, online, onBreak }

class StatusToggle extends StatefulWidget {
  final bool isOnline;
  final bool isOnBreak;
  final VoidCallback? onTap;

  const StatusToggle({
    super.key,
    required this.isOnline,
    this.isOnBreak = false,
    this.onTap,
  });

  @override
  State<StatusToggle> createState() => _StatusToggleState();
}

class _StatusToggleState extends State<StatusToggle> with SingleTickerProviderStateMixin {
  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;

  DriverStatus get _status {
    if (widget.isOnBreak) return DriverStatus.onBreak;
    if (widget.isOnline) return DriverStatus.online;
    return DriverStatus.offline;
  }

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    );
    _pulseAnimation = Tween<double>(begin: 1.0, end: 1.15).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );

    if (_status == DriverStatus.online) {
      _pulseController.repeat(reverse: true);
    }
  }

  @override
  void didUpdateWidget(StatusToggle oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_status == DriverStatus.online && !_pulseController.isAnimating) {
      _pulseController.repeat(reverse: true);
    } else if (_status != DriverStatus.online && _pulseController.isAnimating) {
      _pulseController.stop();
      _pulseController.reset();
    }
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  Color _getColor(BuildContext context) {
    switch (_status) {
      case DriverStatus.online:
        return AppColors.success;
      case DriverStatus.onBreak:
        return AppColors.warning;
      case DriverStatus.offline:
        return context.cardColor;
    }
  }

  Color _getBorderColor(BuildContext context) {
    switch (_status) {
      case DriverStatus.online:
        return AppColors.success;
      case DriverStatus.onBreak:
        return AppColors.warning;
      case DriverStatus.offline:
        return context.borderColor;
    }
  }

  String get _text {
    switch (_status) {
      case DriverStatus.online:
        return 'ONLINE';
      case DriverStatus.onBreak:
        return 'ON BREAK';
      case DriverStatus.offline:
        return 'OFFLINE';
    }
  }

  IconData get _icon {
    switch (_status) {
      case DriverStatus.online:
        return Icons.wifi;
      case DriverStatus.onBreak:
        return Icons.pause_circle_filled;
      case DriverStatus.offline:
        return Icons.wifi_off;
    }
  }

  @override
  Widget build(BuildContext context) {
    final color = _getColor(context);
    final borderColor = _getBorderColor(context);
    final isActive = _status != DriverStatus.offline;

    return GestureDetector(
      onTap: () {
        HapticFeedback.mediumImpact();
        widget.onTap?.call();
      },
      child: Stack(
        alignment: Alignment.center,
        children: [
          // Pulsing glow effect when online
          if (_status == DriverStatus.online)
            AnimatedBuilder(
              animation: _pulseAnimation,
              builder: (context, child) {
                return Transform.scale(
                  scale: _pulseAnimation.value,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(30),
                      boxShadow: [
                        BoxShadow(
                          color: color.withValues(alpha: 0.4 * (1.15 - _pulseAnimation.value) * 6.67),
                          blurRadius: 20,
                          spreadRadius: 4,
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          // Main container
          AnimatedContainer(
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeInOut,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(30),
              border: Border.all(
                color: borderColor,
                width: 2,
              ),
              boxShadow: isActive
                  ? [
                      BoxShadow(
                        color: color.withValues(alpha: 0.3),
                        blurRadius: 12,
                        spreadRadius: 2,
                      )
                    ]
                  : null,
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  _icon,
                  color: isActive
                      ? (_status == DriverStatus.onBreak ? Colors.black : Colors.white)
                      : context.textColor,
                  size: 16,
                ),
                const SizedBox(width: 8),
                Text(
                  _text,
                  style: TextStyle(
                    color: isActive
                        ? (_status == DriverStatus.onBreak ? Colors.black : Colors.white)
                        : context.textColor,
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class AnimatedOnlineIndicator extends StatefulWidget {
  final bool isOnline;
  final double size;

  const AnimatedOnlineIndicator({
    super.key,
    required this.isOnline,
    this.size = 12,
  });

  @override
  State<AnimatedOnlineIndicator> createState() => _AnimatedOnlineIndicatorState();
}

class _AnimatedOnlineIndicatorState extends State<AnimatedOnlineIndicator>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scaleAnimation;
  late Animation<double> _opacityAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 1200),
      vsync: this,
    );
    _scaleAnimation = Tween<double>(begin: 1.0, end: 2.0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeOut),
    );
    _opacityAnimation = Tween<double>(begin: 0.6, end: 0.0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeOut),
    );

    if (widget.isOnline) {
      _controller.repeat();
    }
  }

  @override
  void didUpdateWidget(AnimatedOnlineIndicator oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.isOnline && !_controller.isAnimating) {
      _controller.repeat();
    } else if (!widget.isOnline && _controller.isAnimating) {
      _controller.stop();
      _controller.reset();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final color = widget.isOnline ? AppColors.success : AppColors.error;

    return SizedBox(
      width: widget.size * 2.5,
      height: widget.size * 2.5,
      child: Stack(
        alignment: Alignment.center,
        children: [
          if (widget.isOnline)
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
                      color: color.withValues(alpha: _opacityAnimation.value),
                    ),
                  ),
                );
              },
            ),
          AnimatedContainer(
            duration: const Duration(milliseconds: 300),
            width: widget.size,
            height: widget.size,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: color,
              boxShadow: [
                BoxShadow(
                  color: color.withValues(alpha: 0.4),
                  blurRadius: 6,
                  spreadRadius: 1,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
