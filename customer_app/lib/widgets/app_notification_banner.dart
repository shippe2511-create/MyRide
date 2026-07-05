import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../theme/app_theme.dart';

enum NotificationType { success, error, warning, info }

class AppNotificationBanner {
  static final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();
  static OverlayEntry? _currentOverlay;

  static void show(
    BuildContext context, {
    required String title,
    String? message,
    NotificationType type = NotificationType.info,
    Duration duration = const Duration(seconds: 3),
    VoidCallback? onTap,
    IconData? icon,
  }) {
    try {
      _dismiss();

      final overlay = Overlay.of(context, rootOverlay: true);

      _currentOverlay = OverlayEntry(
        builder: (context) => _NotificationBannerWidget(
          title: title,
          message: message,
          type: type,
          duration: duration,
          onTap: onTap,
          icon: icon,
          onDismiss: _dismiss,
        ),
      );

      overlay.insert(_currentOverlay!);
      HapticFeedback.lightImpact();
    } catch (e) {
      debugPrint('AppNotificationBanner: Failed to show - $e');
    }
  }

  static void showGlobal({
    required String title,
    String? message,
    NotificationType type = NotificationType.info,
    Duration duration = const Duration(seconds: 3),
    VoidCallback? onTap,
    IconData? icon,
  }) {
    final context = navigatorKey.currentContext;
    if (context != null) {
      show(
        context,
        title: title,
        message: message,
        type: type,
        duration: duration,
        onTap: onTap,
        icon: icon,
      );
    } else {
      debugPrint('AppNotificationBanner: No context available');
    }
  }

  static void _dismiss() {
    _currentOverlay?.remove();
    _currentOverlay = null;
  }

  static void dismiss() => _dismiss();
}

class _NotificationBannerWidget extends StatefulWidget {
  final String title;
  final String? message;
  final NotificationType type;
  final Duration duration;
  final VoidCallback? onTap;
  final VoidCallback onDismiss;
  final IconData? icon;

  const _NotificationBannerWidget({
    required this.title,
    this.message,
    required this.type,
    required this.duration,
    this.onTap,
    required this.onDismiss,
    this.icon,
  });

  @override
  State<_NotificationBannerWidget> createState() => _NotificationBannerWidgetState();
}

class _NotificationBannerWidgetState extends State<_NotificationBannerWidget>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<Offset> _slideAnimation;
  late Animation<double> _fadeAnimation;
  late Animation<double> _scaleAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 350),
      vsync: this,
    );

    _slideAnimation = Tween<Offset>(
      begin: const Offset(0, -1.2),
      end: Offset.zero,
    ).animate(CurvedAnimation(
      parent: _controller,
      curve: Curves.easeOutCubic,
    ));

    _fadeAnimation = Tween<double>(begin: 0, end: 1).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeOut),
    );

    _scaleAnimation = Tween<double>(begin: 0.9, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeOutBack),
    );

    _controller.forward();

    Future.delayed(widget.duration, () {
      if (mounted) _dismiss();
    });
  }

  void _dismiss() {
    _controller.reverse().then((_) {
      if (mounted) widget.onDismiss();
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Color get _backgroundColor {
    switch (widget.type) {
      case NotificationType.success:
        return const Color(0xFF00C853);
      case NotificationType.error:
        return const Color(0xFFFF1744);
      case NotificationType.warning:
        return AppColors.yellow;
      case NotificationType.info:
        return const Color(0xFF2979FF);
    }
  }

  Color get _iconBgColor {
    switch (widget.type) {
      case NotificationType.success:
        return Colors.white.withOpacity(0.25);
      case NotificationType.error:
        return Colors.white.withOpacity(0.25);
      case NotificationType.warning:
        return Colors.black.withOpacity(0.15);
      case NotificationType.info:
        return Colors.white.withOpacity(0.25);
    }
  }

  Color get _textColor {
    return widget.type == NotificationType.warning ? Colors.black : Colors.white;
  }

  IconData get _icon {
    if (widget.icon != null) return widget.icon!;
    switch (widget.type) {
      case NotificationType.success:
        return Icons.check_circle_rounded;
      case NotificationType.error:
        return Icons.error_rounded;
      case NotificationType.warning:
        return Icons.warning_amber_rounded;
      case NotificationType.info:
        return Icons.info_rounded;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Positioned(
      top: MediaQuery.of(context).padding.top + 12,
      left: 16,
      right: 16,
      child: SlideTransition(
        position: _slideAnimation,
        child: FadeTransition(
          opacity: _fadeAnimation,
          child: ScaleTransition(
            scale: _scaleAnimation,
            child: GestureDetector(
              onTap: () {
                widget.onTap?.call();
                _dismiss();
              },
              onVerticalDragEnd: (details) {
                if (details.primaryVelocity != null && details.primaryVelocity! < -100) {
                  _dismiss();
                }
              },
              child: Material(
                color: Colors.transparent,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [
                        _backgroundColor,
                        _backgroundColor.withOpacity(0.85),
                      ],
                    ),
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: [
                      BoxShadow(
                        color: _backgroundColor.withOpacity(0.35),
                        blurRadius: 24,
                        offset: const Offset(0, 10),
                        spreadRadius: -4,
                      ),
                      BoxShadow(
                        color: Colors.black.withOpacity(0.15),
                        blurRadius: 12,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 42,
                        height: 42,
                        decoration: BoxDecoration(
                          color: _iconBgColor,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Icon(_icon, color: _textColor, size: 24),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              widget.title,
                              style: TextStyle(
                                color: _textColor,
                                fontSize: 15,
                                fontWeight: FontWeight.w700,
                                letterSpacing: -0.2,
                              ),
                            ),
                            if (widget.message != null) ...[
                              const SizedBox(height: 3),
                              Text(
                                widget.message!,
                                style: TextStyle(
                                  color: _textColor.withOpacity(0.9),
                                  fontSize: 13,
                                  fontWeight: FontWeight.w500,
                                  height: 1.3,
                                ),
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ],
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        width: 28,
                        height: 28,
                        decoration: BoxDecoration(
                          color: _textColor.withOpacity(0.15),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Icon(
                          Icons.close_rounded,
                          color: _textColor.withOpacity(0.8),
                          size: 16,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
