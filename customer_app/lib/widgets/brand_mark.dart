import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class BrandMark extends StatelessWidget {
  final double size;
  final Color color;
  final bool checker;

  const BrandMark({
    super.key,
    this.size = 56,
    this.color = AppColors.yellow,
    this.checker = true,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(size * 0.28),
      ),
      child: CustomPaint(
        size: Size(size, size),
        painter: _BrandMarkPainter(checker: checker),
      ),
    );
  }
}

class _BrandMarkPainter extends CustomPainter {
  final bool checker;

  _BrandMarkPainter({this.checker = true});

  @override
  void paint(Canvas canvas, Size size) {
    final scale = size.width / 64;
    final paint = Paint()..color = const Color(0xFF0B0B0C);

    final path = Path();
    path.moveTo(14 * scale, 46 * scale);
    path.lineTo(14 * scale, 22 * scale);
    path.lineTo(22 * scale, 22 * scale);
    path.lineTo(32 * scale, 36 * scale);
    path.lineTo(42 * scale, 22 * scale);
    path.lineTo(50 * scale, 22 * scale);
    path.lineTo(50 * scale, 46 * scale);
    path.lineTo(43 * scale, 46 * scale);
    path.lineTo(43 * scale, 32 * scale);
    path.lineTo(34 * scale, 44 * scale);
    path.lineTo(30 * scale, 44 * scale);
    path.lineTo(21 * scale, 32 * scale);
    path.lineTo(21 * scale, 46 * scale);
    path.close();

    canvas.drawPath(path, paint);

    if (checker) {
      final yellowPaint = Paint()..color = AppColors.yellow;
      canvas.drawRect(
          Rect.fromLTWH(46 * scale, 46 * scale, 4 * scale, 4 * scale), paint);
      canvas.drawRect(
          Rect.fromLTWH(50 * scale, 50 * scale, 4 * scale, 4 * scale), paint);
      canvas.drawRect(
          Rect.fromLTWH(54 * scale, 46 * scale, 4 * scale, 4 * scale), paint);
      canvas.drawRect(
          Rect.fromLTWH(50 * scale, 46 * scale, 4 * scale, 4 * scale),
          yellowPaint);
      canvas.drawRect(
          Rect.fromLTWH(46 * scale, 50 * scale, 4 * scale, 4 * scale),
          yellowPaint);
      canvas.drawRect(
          Rect.fromLTWH(54 * scale, 50 * scale, 4 * scale, 4 * scale),
          yellowPaint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class CheckerBand extends StatelessWidget {
  final int rows;
  final int cells;
  final double cellSize;
  final bool isDark;

  const CheckerBand({
    super.key,
    this.rows = 1,
    this.cells = 18,
    this.cellSize = 10,
    this.isDark = true,
  });

  @override
  Widget build(BuildContext context) {
    final bgColor = isDark ? AppColors.bgDark : AppColors.bgLight;

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      physics: const NeverScrollableScrollPhysics(),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: List.generate(
          rows,
          (r) => Row(
            mainAxisSize: MainAxisSize.min,
            children: List.generate(
              cells,
              (c) => Container(
                width: cellSize,
                height: cellSize,
                color: (r + c) % 2 == 0 ? AppColors.yellow : bgColor,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
