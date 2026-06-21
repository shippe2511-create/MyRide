import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../theme/app_theme.dart';

class FloatingNavBar extends StatelessWidget {
  final int selectedIndex;
  final ValueChanged<int> onTap;

  const FloatingNavBar({
    super.key,
    required this.selectedIndex,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = context.isDark;
    final navBgColor = isDark
        ? const Color(0xFF1A1A1A).withValues(alpha: 0.85)
        : Colors.white.withValues(alpha: 0.9);
    final navBorderColor = isDark
        ? Colors.white.withValues(alpha: 0.08)
        : Colors.black.withValues(alpha: 0.08);
    final bottomPadding = MediaQuery.of(context).padding.bottom;

    return Padding(
      padding: EdgeInsets.fromLTRB(24, 8, 24, bottomPadding + 12),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(40),
        child: BackdropFilter(
          filter: ui.ImageFilter.blur(sigmaX: 25, sigmaY: 25),
          child: Container(
            height: 64,
            decoration: BoxDecoration(
              color: navBgColor,
              borderRadius: BorderRadius.circular(40),
              border: Border.all(
                color: navBorderColor,
                width: 1,
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: isDark ? 0.3 : 0.1),
                  blurRadius: 20,
                  offset: const Offset(0, 10),
                  spreadRadius: -5,
                ),
              ],
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                _buildNavItem(context, 0, Icons.home_rounded, Icons.home_outlined),
                _buildNavItem(context, 1, Icons.history_rounded, Icons.history_outlined),
                _buildNavItem(context, 2, Icons.person_rounded, Icons.person_outline_rounded),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildNavItem(BuildContext context, int index, IconData activeIcon, IconData inactiveIcon) {
    final isActive = selectedIndex == index;
    final isDark = context.isDark;
    final activeColor = isDark ? Colors.white : Colors.black;
    final inactiveColor = isDark ? Colors.white.withValues(alpha: 0.5) : Colors.black.withValues(alpha: 0.4);
    final activeBgColor = isDark ? Colors.white.withValues(alpha: 0.15) : Colors.black.withValues(alpha: 0.08);

    return GestureDetector(
      onTap: () {
        if (selectedIndex != index) {
          HapticFeedback.selectionClick();
          onTap(index);
        }
      },
      behavior: HitTestBehavior.opaque,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOutCubic,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: isActive ? activeBgColor : Colors.transparent,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Icon(
          isActive ? activeIcon : inactiveIcon,
          color: isActive ? activeColor : inactiveColor,
          size: 26,
        ),
      ),
    );
  }
}

class FloatingAppBar extends StatelessWidget implements PreferredSizeWidget {
  final String title;
  final List<Widget>? actions;
  final Widget? leading;
  final bool showBackButton;

  const FloatingAppBar({
    super.key,
    required this.title,
    this.actions,
    this.leading,
    this.showBackButton = false,
  });

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight + 24);

  @override
  Widget build(BuildContext context) {
    final topPadding = MediaQuery.of(context).padding.top;
    final isDark = context.isDark;
    final navBgColor = isDark
        ? const Color(0xFF1A1A1A).withValues(alpha: 0.85)
        : Colors.white.withValues(alpha: 0.9);
    final navBorderColor = isDark
        ? Colors.white.withValues(alpha: 0.08)
        : Colors.black.withValues(alpha: 0.08);

    return Container(
      padding: EdgeInsets.only(top: topPadding + 8, left: 16, right: 16, bottom: 8),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(20),
        child: BackdropFilter(
          filter: ui.ImageFilter.blur(sigmaX: 25, sigmaY: 25),
          child: Container(
            height: 56,
            decoration: BoxDecoration(
              color: navBgColor,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: navBorderColor,
                width: 1,
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: isDark ? 0.3 : 0.1),
                  blurRadius: 15,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Row(
              children: [
                if (showBackButton)
                  IconButton(
                    icon: Icon(Icons.arrow_back_ios_new_rounded, color: context.textColor, size: 20),
                    onPressed: () => Navigator.of(context).pop(),
                  )
                else if (leading != null)
                  leading!
                else
                  const SizedBox(width: 16),
                Expanded(
                  child: Text(
                    title,
                    style: TextStyle(
                      color: context.textColor,
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                if (actions != null) ...actions!,
                const SizedBox(width: 8),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

double getNavBarHeight(BuildContext context) {
  return 64 + MediaQuery.of(context).padding.bottom + 24;
}

double getAppBarHeight(BuildContext context) {
  return kToolbarHeight + MediaQuery.of(context).padding.top + 32;
}
