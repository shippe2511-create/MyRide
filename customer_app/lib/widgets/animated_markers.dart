import 'package:flutter/material.dart';
import 'dart:math' as math;

class PulsingMarker extends StatefulWidget {
  final Color color;
  final double size;
  final IconData icon;
  final String? label;

  const PulsingMarker({
    super.key,
    this.color = const Color(0xFFFFD60A),
    this.size = 50,
    this.icon = Icons.location_on,
    this.label,
  });

  @override
  State<PulsingMarker> createState() => _PulsingMarkerState();
}

class _PulsingMarkerState extends State<PulsingMarker>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scaleAnimation;
  late Animation<double> _opacityAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
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
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (widget.label != null)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            margin: const EdgeInsets.only(bottom: 4),
            decoration: BoxDecoration(
              color: Colors.black87,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              widget.label!,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 12,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        SizedBox(
          width: widget.size * 2.5,
          height: widget.size * 2.5,
          child: Stack(
            alignment: Alignment.center,
            children: [
              // Pulsing rings
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
              // Second ring (delayed)
              AnimatedBuilder(
                animation: _controller,
                builder: (context, child) {
                  final delayedValue = (_controller.value + 0.5) % 1.0;
                  final scale = 1.0 + (delayedValue * 1.5);
                  final opacity = 0.6 * (1.0 - delayedValue);
                  return Transform.scale(
                    scale: scale,
                    child: Container(
                      width: widget.size,
                      height: widget.size,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: widget.color.withValues(alpha: opacity),
                      ),
                    ),
                  );
                },
              ),
              // Main marker
              Container(
                width: widget.size,
                height: widget.size,
                decoration: BoxDecoration(
                  color: widget.color,
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: widget.color.withValues(alpha: 0.5),
                      blurRadius: 10,
                      spreadRadius: 2,
                    ),
                  ],
                ),
                child: Icon(
                  widget.icon,
                  color: Colors.black,
                  size: widget.size * 0.5,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class MovingCarMarker extends StatefulWidget {
  final double rotation;
  final Color color;
  final double size;

  const MovingCarMarker({
    super.key,
    this.rotation = 0,
    this.color = Colors.black,
    this.size = 40,
  });

  @override
  State<MovingCarMarker> createState() => _MovingCarMarkerState();
}

class _MovingCarMarkerState extends State<MovingCarMarker>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Transform.rotate(
          angle: widget.rotation * math.pi / 180,
          child: Transform.translate(
            offset: Offset(0, _controller.value * 2 - 1),
            child: Container(
              width: widget.size,
              height: widget.size,
              decoration: BoxDecoration(
                color: widget.color,
                borderRadius: BorderRadius.circular(widget.size * 0.25),
                boxShadow: [
                  BoxShadow(
                    color: widget.color.withValues(alpha: 0.4),
                    blurRadius: 8,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Icon(
                Icons.local_taxi,
                color: Colors.white,
                size: widget.size * 0.6,
              ),
            ),
          ),
        );
      },
    );
  }
}

class DestinationMarker extends StatelessWidget {
  final Color color;
  final double size;
  final String? label;

  const DestinationMarker({
    super.key,
    this.color = Colors.red,
    this.size = 40,
    this.label,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (label != null)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            margin: const EdgeInsets.only(bottom: 4),
            decoration: BoxDecoration(
              color: Colors.black87,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              label!,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 12,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            color: color,
            shape: BoxShape.circle,
            border: Border.all(color: Colors.white, width: 3),
            boxShadow: [
              BoxShadow(
                color: color.withValues(alpha: 0.4),
                blurRadius: 8,
                spreadRadius: 1,
              ),
            ],
          ),
          child: Icon(
            Icons.flag,
            color: Colors.white,
            size: size * 0.5,
          ),
        ),
        // Pin point
        CustomPaint(
          size: Size(size * 0.3, size * 0.4),
          painter: _PinPointPainter(color: color),
        ),
      ],
    );
  }
}

class _PinPointPainter extends CustomPainter {
  final Color color;

  _PinPointPainter({required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.fill;

    final path = Path()
      ..moveTo(0, 0)
      ..lineTo(size.width / 2, size.height)
      ..lineTo(size.width, 0)
      ..close();

    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class RouteProgressIndicator extends StatelessWidget {
  final double progress;
  final Color color;

  const RouteProgressIndicator({
    super.key,
    required this.progress,
    this.color = const Color(0xFFFFD60A),
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.black87,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.directions_car, color: color, size: 18),
          const SizedBox(width: 8),
          SizedBox(
            width: 100,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: progress,
                backgroundColor: Colors.white24,
                valueColor: AlwaysStoppedAnimation(color),
                minHeight: 6,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Text(
            '${(progress * 100).toInt()}%',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
