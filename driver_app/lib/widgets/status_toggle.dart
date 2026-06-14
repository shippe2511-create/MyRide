import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

enum DriverStatus { offline, online, onBreak }

class StatusToggle extends StatelessWidget {
  final bool isOnline;
  final bool isOnBreak;
  final VoidCallback? onTap;

  const StatusToggle({
    super.key,
    required this.isOnline,
    this.isOnBreak = false,
    this.onTap,
  });

  DriverStatus get _status {
    if (isOnBreak) return DriverStatus.onBreak;
    if (isOnline) return DriverStatus.online;
    return DriverStatus.offline;
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

  @override
  Widget build(BuildContext context) {
    final color = _getColor(context);
    final borderColor = _getBorderColor(context);
    final isActive = _status != DriverStatus.offline;

    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
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
        child: Text(
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
      ),
    );
  }
}
