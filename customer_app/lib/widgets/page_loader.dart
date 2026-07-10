import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class PageLoader {
  static OverlayEntry? _currentLoader;

  static void show(BuildContext context) {
    hide();

    _currentLoader = OverlayEntry(
      builder: (context) => const _LoaderOverlay(),
    );

    Overlay.of(context).insert(_currentLoader!);
  }

  static void hide() {
    _currentLoader?.remove();
    _currentLoader = null;
  }
}

class _LoaderOverlay extends StatelessWidget {
  const _LoaderOverlay();

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.black.withValues(alpha: 0.3),
      child: Center(
        child: Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: Theme.of(context).scaffoldBackgroundColor,
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.2),
                blurRadius: 20,
              ),
            ],
          ),
          child: const SizedBox(
            width: 40,
            height: 40,
            child: CircularProgressIndicator(
              strokeWidth: 3,
              valueColor: AlwaysStoppedAnimation<Color>(AppColors.yellow),
            ),
          ),
        ),
      ),
    );
  }
}

Future<T?> navigateWithLoader<T>(
  BuildContext context,
  String routeName, {
  Object? arguments,
}) async {
  PageLoader.show(context);

  await Future.delayed(const Duration(milliseconds: 100));

  if (context.mounted) {
    PageLoader.hide();
    return Navigator.pushNamed<T>(context, routeName, arguments: arguments);
  }

  PageLoader.hide();
  return null;
}

Future<T?> navigateReplacementWithLoader<T>(
  BuildContext context,
  String routeName, {
  Object? arguments,
}) async {
  PageLoader.show(context);

  await Future.delayed(const Duration(milliseconds: 100));

  if (context.mounted) {
    PageLoader.hide();
    return Navigator.pushReplacementNamed<T, dynamic>(context, routeName, arguments: arguments);
  }

  PageLoader.hide();
  return null;
}
