import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class SlideToAccept extends StatefulWidget {
  final VoidCallback onAccept;
  final VoidCallback? onDecline;
  final String text;
  final Color backgroundColor;
  final Color sliderColor;
  final Color textColor;
  final double height;

  const SlideToAccept({
    super.key,
    required this.onAccept,
    this.onDecline,
    this.text = 'Slide to Accept',
    this.backgroundColor = const Color(0xFF1A1A1A),
    this.sliderColor = const Color(0xFFFFD60A),
    this.textColor = Colors.white,
    this.height = 70,
  });

  @override
  State<SlideToAccept> createState() => _SlideToAcceptState();
}

class _SlideToAcceptState extends State<SlideToAccept>
    with SingleTickerProviderStateMixin {
  double _dragPosition = 0;
  bool _isCompleted = false;
  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;

  double get _maxDrag => MediaQuery.of(context).size.width - 100;
  double get _progress => (_dragPosition / _maxDrag).clamp(0, 1);

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat(reverse: true);

    _pulseAnimation = Tween<double>(begin: 0.8, end: 1.0).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  void _onDragUpdate(DragUpdateDetails details) {
    if (_isCompleted) return;

    setState(() {
      _dragPosition += details.delta.dx;
      _dragPosition = _dragPosition.clamp(0, _maxDrag);
    });

    if (_progress > 0.3) {
      HapticFeedback.selectionClick();
    }
  }

  void _onDragEnd(DragEndDetails details) {
    if (_isCompleted) return;

    if (_progress >= 0.85) {
      HapticFeedback.heavyImpact();
      setState(() {
        _isCompleted = true;
        _dragPosition = _maxDrag;
      });

      Future.delayed(const Duration(milliseconds: 200), () {
        widget.onAccept();
      });
    } else {
      HapticFeedback.lightImpact();
      setState(() {
        _dragPosition = 0;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      height: widget.height,
      margin: const EdgeInsets.symmetric(horizontal: 20),
      decoration: BoxDecoration(
        color: widget.backgroundColor,
        borderRadius: BorderRadius.circular(widget.height / 2),
        boxShadow: [
          BoxShadow(
            color: widget.sliderColor.withValues(alpha: 0.3),
            blurRadius: 20,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Stack(
        children: [
          // Progress background
          AnimatedContainer(
            duration: const Duration(milliseconds: 100),
            width: _dragPosition + widget.height,
            decoration: BoxDecoration(
              color: widget.sliderColor.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(widget.height / 2),
            ),
          ),

          // Text with shimmer effect
          Center(
            child: AnimatedOpacity(
              duration: const Duration(milliseconds: 200),
              opacity: 1 - _progress,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    widget.text,
                    style: TextStyle(
                      color: widget.textColor.withValues(alpha: 0.8),
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 0.5,
                    ),
                  ),
                  const SizedBox(width: 8),
                  AnimatedBuilder(
                    animation: _pulseAnimation,
                    builder: (context, child) {
                      return Transform.translate(
                        offset: Offset(_pulseAnimation.value * 5, 0),
                        child: Icon(
                          Icons.chevron_right,
                          color: widget.textColor.withValues(alpha: 0.6),
                          size: 24,
                        ),
                      );
                    },
                  ),
                ],
              ),
            ),
          ),

          // Slider thumb
          AnimatedPositioned(
            duration: _isCompleted
                ? const Duration(milliseconds: 200)
                : const Duration(milliseconds: 0),
            curve: Curves.easeOut,
            left: _dragPosition + 4,
            top: 4,
            bottom: 4,
            child: GestureDetector(
              onHorizontalDragUpdate: _onDragUpdate,
              onHorizontalDragEnd: _onDragEnd,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                width: widget.height - 8,
                decoration: BoxDecoration(
                  color: _isCompleted
                      ? Colors.green
                      : widget.sliderColor,
                  borderRadius: BorderRadius.circular((widget.height - 8) / 2),
                  boxShadow: [
                    BoxShadow(
                      color: (_isCompleted ? Colors.green : widget.sliderColor)
                          .withValues(alpha: 0.5),
                      blurRadius: 10,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                child: Center(
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 200),
                    child: _isCompleted
                        ? const Icon(
                            Icons.check,
                            color: Colors.white,
                            size: 28,
                            key: ValueKey('check'),
                          )
                        : Icon(
                            Icons.arrow_forward_rounded,
                            color: widget.backgroundColor,
                            size: 28,
                            key: const ValueKey('arrow'),
                          ),
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

class SlideToAction extends StatefulWidget {
  final VoidCallback onComplete;
  final String text;
  final Color color;
  final IconData icon;

  const SlideToAction({
    super.key,
    required this.onComplete,
    required this.text,
    this.color = Colors.green,
    this.icon = Icons.check,
  });

  @override
  State<SlideToAction> createState() => _SlideToActionState();
}

class _SlideToActionState extends State<SlideToAction> {
  double _dragPosition = 0;
  bool _isCompleted = false;

  double get _maxDrag => MediaQuery.of(context).size.width - 120;
  double get _progress => (_dragPosition / _maxDrag).clamp(0, 1);

  void _onDragUpdate(DragUpdateDetails details) {
    if (_isCompleted) return;
    setState(() {
      _dragPosition += details.delta.dx;
      _dragPosition = _dragPosition.clamp(0, _maxDrag);
    });
  }

  void _onDragEnd(DragEndDetails details) {
    if (_isCompleted) return;

    if (_progress >= 0.85) {
      HapticFeedback.heavyImpact();
      setState(() {
        _isCompleted = true;
        _dragPosition = _maxDrag;
      });
      Future.delayed(const Duration(milliseconds: 200), widget.onComplete);
    } else {
      setState(() => _dragPosition = 0);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 56,
      margin: const EdgeInsets.symmetric(horizontal: 20),
      decoration: BoxDecoration(
        color: widget.color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: widget.color.withValues(alpha: 0.3)),
      ),
      child: Stack(
        children: [
          Center(
            child: AnimatedOpacity(
              duration: const Duration(milliseconds: 200),
              opacity: 1 - _progress,
              child: Text(
                widget.text,
                style: TextStyle(
                  color: widget.color,
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
          AnimatedPositioned(
            duration: _isCompleted
                ? const Duration(milliseconds: 200)
                : Duration.zero,
            left: _dragPosition + 4,
            top: 4,
            bottom: 4,
            child: GestureDetector(
              onHorizontalDragUpdate: _onDragUpdate,
              onHorizontalDragEnd: _onDragEnd,
              child: Container(
                width: 48,
                decoration: BoxDecoration(
                  color: widget.color,
                  borderRadius: BorderRadius.circular(24),
                ),
                child: Icon(
                  _isCompleted ? Icons.check : widget.icon,
                  color: Colors.white,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
