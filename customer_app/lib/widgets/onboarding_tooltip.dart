import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../theme/app_theme.dart';

class OnboardingTooltip extends StatefulWidget {
  final Widget child;
  final String tooltipKey;
  final String title;
  final String description;
  final IconData? icon;
  final TooltipPosition position;
  final VoidCallback? onDismiss;
  final bool showArrow;

  const OnboardingTooltip({
    super.key,
    required this.child,
    required this.tooltipKey,
    required this.title,
    required this.description,
    this.icon,
    this.position = TooltipPosition.bottom,
    this.onDismiss,
    this.showArrow = true,
  });

  @override
  State<OnboardingTooltip> createState() => _OnboardingTooltipState();
}

enum TooltipPosition { top, bottom, left, right }

class _OnboardingTooltipState extends State<OnboardingTooltip> with SingleTickerProviderStateMixin {
  bool _showTooltip = false;
  late AnimationController _controller;
  late Animation<double> _scaleAnimation;
  late Animation<double> _fadeAnimation;
  final GlobalKey _childKey = GlobalKey();

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 300),
      vsync: this,
    );
    _scaleAnimation = Tween<double>(begin: 0.8, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeOutBack),
    );
    _fadeAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeOut),
    );
    _checkIfShouldShow();
  }

  Future<void> _checkIfShouldShow() async {
    final prefs = await SharedPreferences.getInstance();
    final shown = prefs.getBool('tooltip_${widget.tooltipKey}') ?? false;
    if (!shown && mounted) {
      await Future.delayed(const Duration(milliseconds: 500));
      if (mounted) {
        setState(() => _showTooltip = true);
        _controller.forward();
      }
    }
  }

  Future<void> _dismiss() async {
    HapticFeedback.lightImpact();
    await _controller.reverse();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('tooltip_${widget.tooltipKey}', true);
    if (mounted) {
      setState(() => _showTooltip = false);
    }
    widget.onDismiss?.call();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        KeyedSubtree(
          key: _childKey,
          child: widget.child,
        ),
        if (_showTooltip)
          Positioned.fill(
            child: LayoutBuilder(
              builder: (context, constraints) {
                return FadeTransition(
                  opacity: _fadeAnimation,
                  child: ScaleTransition(
                    scale: _scaleAnimation,
                    alignment: _getAlignment(),
                    child: _buildTooltipOverlay(context),
                  ),
                );
              },
            ),
          ),
      ],
    );
  }

  Alignment _getAlignment() {
    switch (widget.position) {
      case TooltipPosition.top:
        return Alignment.bottomCenter;
      case TooltipPosition.bottom:
        return Alignment.topCenter;
      case TooltipPosition.left:
        return Alignment.centerRight;
      case TooltipPosition.right:
        return Alignment.centerLeft;
    }
  }

  Widget _buildTooltipOverlay(BuildContext context) {
    return GestureDetector(
      onTap: _dismiss,
      child: Container(
        color: Colors.transparent,
        child: Stack(
          children: [
            Positioned(
              left: 0,
              right: 0,
              top: widget.position == TooltipPosition.bottom ? null : 0,
              bottom: widget.position == TooltipPosition.top ? null : 0,
              child: _buildTooltipCard(context),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTooltipCard(BuildContext context) {
    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.yellow,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: AppColors.yellow.withValues(alpha: 0.4),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (widget.icon != null) ...[
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(widget.icon, color: Colors.black, size: 22),
                ),
                const SizedBox(width: 12),
              ],
              Expanded(
                child: Text(
                  widget.title,
                  style: const TextStyle(
                    color: Colors.black,
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              GestureDetector(
                onTap: _dismiss,
                child: Container(
                  width: 28,
                  height: 28,
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.1),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.close, color: Colors.black, size: 16),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            widget.description,
            style: TextStyle(
              color: Colors.black.withValues(alpha: 0.8),
              fontSize: 14,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 12),
          Align(
            alignment: Alignment.centerRight,
            child: GestureDetector(
              onTap: _dismiss,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                decoration: BoxDecoration(
                  color: Colors.black,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Text(
                  'Got it',
                  style: TextStyle(
                    color: AppColors.yellow,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class OnboardingOverlay extends StatefulWidget {
  final List<OnboardingStep> steps;
  final VoidCallback? onComplete;
  final Widget child;

  const OnboardingOverlay({
    super.key,
    required this.steps,
    required this.child,
    this.onComplete,
  });

  @override
  State<OnboardingOverlay> createState() => _OnboardingOverlayState();
}

class OnboardingStep {
  final String key;
  final String title;
  final String description;
  final IconData icon;
  final Offset? targetOffset;
  final Size? targetSize;

  const OnboardingStep({
    required this.key,
    required this.title,
    required this.description,
    required this.icon,
    this.targetOffset,
    this.targetSize,
  });
}

class _OnboardingOverlayState extends State<OnboardingOverlay> with SingleTickerProviderStateMixin {
  int _currentStep = 0;
  bool _showOverlay = false;
  late AnimationController _controller;
  late Animation<double> _fadeAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 300),
      vsync: this,
    );
    _fadeAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(_controller);
    _checkIfShouldShow();
  }

  Future<void> _checkIfShouldShow() async {
    final prefs = await SharedPreferences.getInstance();
    final completed = prefs.getBool('onboarding_complete') ?? false;
    if (!completed && mounted) {
      await Future.delayed(const Duration(milliseconds: 800));
      if (mounted) {
        setState(() => _showOverlay = true);
        _controller.forward();
      }
    }
  }

  Future<void> _nextStep() async {
    HapticFeedback.lightImpact();
    if (_currentStep < widget.steps.length - 1) {
      setState(() => _currentStep++);
    } else {
      await _complete();
    }
  }

  Future<void> _skip() async {
    HapticFeedback.lightImpact();
    await _complete();
  }

  Future<void> _complete() async {
    await _controller.reverse();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('onboarding_complete', true);
    if (mounted) {
      setState(() => _showOverlay = false);
    }
    widget.onComplete?.call();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        widget.child,
        if (_showOverlay)
          FadeTransition(
            opacity: _fadeAnimation,
            child: _buildOverlay(context),
          ),
      ],
    );
  }

  Widget _buildOverlay(BuildContext context) {
    final step = widget.steps[_currentStep];
    final isLast = _currentStep == widget.steps.length - 1;

    return GestureDetector(
      onTap: _nextStep,
      child: Container(
        color: Colors.black.withValues(alpha: 0.85),
        child: SafeArea(
          child: Column(
            children: [
              // Skip button
              Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      '${_currentStep + 1} of ${widget.steps.length}',
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.6),
                        fontSize: 14,
                      ),
                    ),
                    GestureDetector(
                      onTap: _skip,
                      child: Text(
                        'Skip',
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.6),
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),

              const Spacer(),

              // Content
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 40),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 100,
                      height: 100,
                      decoration: BoxDecoration(
                        color: AppColors.yellow.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(28),
                        border: Border.all(
                          color: AppColors.yellow.withValues(alpha: 0.3),
                          width: 2,
                        ),
                      ),
                      child: Icon(
                        step.icon,
                        color: AppColors.yellow,
                        size: 48,
                      ),
                    ),
                    const SizedBox(height: 32),
                    Text(
                      step.title,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 26,
                        fontWeight: FontWeight.w700,
                      ),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 16),
                    Text(
                      step.description,
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.7),
                        fontSize: 16,
                        height: 1.5,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),

              const Spacer(),

              // Progress dots and button
              Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  children: [
                    // Progress dots
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: List.generate(
                        widget.steps.length,
                        (index) => Container(
                          width: index == _currentStep ? 24 : 8,
                          height: 8,
                          margin: const EdgeInsets.symmetric(horizontal: 4),
                          decoration: BoxDecoration(
                            color: index == _currentStep
                                ? AppColors.yellow
                                : Colors.white.withValues(alpha: 0.3),
                            borderRadius: BorderRadius.circular(4),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 24),
                    // Next button
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: _nextStep,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.yellow,
                          foregroundColor: Colors.black,
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                        ),
                        child: Text(
                          isLast ? 'Get Started' : 'Next',
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class OnboardingService {
  static Future<void> resetOnboarding() async {
    final prefs = await SharedPreferences.getInstance();
    final keys = prefs.getKeys().where((k) => k.startsWith('tooltip_') || k == 'onboarding_complete');
    for (final key in keys) {
      await prefs.remove(key);
    }
  }

  static Future<bool> hasSeenTooltip(String key) async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool('tooltip_$key') ?? false;
  }

  static Future<void> markTooltipSeen(String key) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('tooltip_$key', true);
  }

  static Future<bool> isOnboardingComplete() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool('onboarding_complete') ?? false;
  }
}
