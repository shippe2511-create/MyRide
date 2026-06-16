import 'dart:ui';
import 'package:flutter/material.dart';

class GlassContainer extends StatelessWidget {
  final Widget child;
  final double blur;
  final Color? backgroundColor;
  final BorderRadius? borderRadius;
  final EdgeInsetsGeometry? padding;
  final BoxBorder? border;

  const GlassContainer({
    super.key,
    required this.child,
    this.blur = 20,
    this.backgroundColor,
    this.borderRadius,
    this.padding,
    this.border,
  });

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: borderRadius ?? BorderRadius.circular(32),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: blur, sigmaY: blur),
        child: Container(
          padding: padding ?? const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: backgroundColor ?? const Color(0xB8141416),
            borderRadius: borderRadius ?? BorderRadius.circular(32),
            border: border ??
                Border.all(
                  color: Colors.white.withValues(alpha: 0.1),
                  width: 1,
                ),
          ),
          child: child,
        ),
      ),
    );
  }
}
