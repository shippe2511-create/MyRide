import 'package:flutter/material.dart';

class BottomSheetHandle extends StatelessWidget {
  final Color? color;
  final double width;
  final double height;
  final EdgeInsets margin;

  const BottomSheetHandle({
    super.key,
    this.color,
    this.width = 40,
    this.height = 4,
    this.margin = const EdgeInsets.only(top: 12, bottom: 8),
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final handleColor = color ?? (isDark ? Colors.white24 : Colors.black12);

    return Container(
      margin: margin,
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: handleColor,
        borderRadius: BorderRadius.circular(height / 2),
      ),
    );
  }
}

class DraggableBottomSheet extends StatelessWidget {
  final Widget child;
  final double? maxHeight;
  final double? minHeight;
  final Color? backgroundColor;
  final BorderRadius? borderRadius;
  final bool showHandle;

  const DraggableBottomSheet({
    super.key,
    required this.child,
    this.maxHeight,
    this.minHeight,
    this.backgroundColor,
    this.borderRadius,
    this.showHandle = true,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bgColor = backgroundColor ?? (isDark ? const Color(0xFF1A1A1A) : Colors.white);
    final radius = borderRadius ?? const BorderRadius.vertical(top: Radius.circular(24));

    return Container(
      constraints: BoxConstraints(
        maxHeight: maxHeight ?? MediaQuery.of(context).size.height * 0.9,
        minHeight: minHeight ?? 0,
      ),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: radius,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.15),
            blurRadius: 20,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (showHandle) const Center(child: BottomSheetHandle()),
          Flexible(child: child),
        ],
      ),
    );
  }
}

void showStyledBottomSheet({
  required BuildContext context,
  required Widget Function(BuildContext) builder,
  bool isDismissible = true,
  bool enableDrag = true,
  bool isScrollControlled = true,
  double? maxHeight,
}) {
  showModalBottomSheet(
    context: context,
    backgroundColor: Colors.transparent,
    isDismissible: isDismissible,
    enableDrag: enableDrag,
    isScrollControlled: isScrollControlled,
    builder: (ctx) => DraggableBottomSheet(
      maxHeight: maxHeight,
      child: builder(ctx),
    ),
  );
}
