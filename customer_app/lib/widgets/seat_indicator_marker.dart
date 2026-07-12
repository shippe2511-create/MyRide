import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

/// Creates a custom BitmapDescriptor for seat indicator markers
class SeatIndicatorMarker {
  /// Creates a seat indicator marker showing available seats
  static Future<BitmapDescriptor> create({
    required int availableSeats,
    Color backgroundColor = const Color(0xFF1A1A1A),
    Color seatColor = const Color(0xFF22C55E),
    Color textColor = Colors.white,
    double size = 80,
  }) async {
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);

    final width = size;
    final height = size * 0.5;

    // Background pill
    final bgPaint = Paint()
      ..color = backgroundColor
      ..style = PaintingStyle.fill;

    final bgRect = RRect.fromRectAndRadius(
      Rect.fromLTWH(0, 0, width, height),
      Radius.circular(height / 2),
    );
    canvas.drawRRect(bgRect, bgPaint);

    // Border
    final borderPaint = Paint()
      ..color = seatColor.withOpacity(0.5)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;
    canvas.drawRRect(bgRect, borderPaint);

    // Seat icon (simplified chair shape)
    final seatPaint = Paint()
      ..color = seatColor
      ..style = PaintingStyle.fill;

    final iconSize = height * 0.5;
    final iconX = width * 0.25;
    final iconY = (height - iconSize) / 2;

    // Chair back
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(iconX, iconY, iconSize * 0.3, iconSize * 0.7),
        Radius.circular(2),
      ),
      seatPaint,
    );

    // Chair seat
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(iconX, iconY + iconSize * 0.5, iconSize * 0.8, iconSize * 0.3),
        Radius.circular(2),
      ),
      seatPaint,
    );

    // Number text
    final textPainter = TextPainter(
      text: TextSpan(
        text: '$availableSeats',
        style: TextStyle(
          color: seatColor,
          fontSize: height * 0.5,
          fontWeight: FontWeight.bold,
        ),
      ),
      textDirection: TextDirection.ltr,
    );
    textPainter.layout();

    textPainter.paint(
      canvas,
      Offset(
        width * 0.6 - textPainter.width / 2,
        (height - textPainter.height) / 2,
      ),
    );

    final picture = recorder.endRecording();
    final image = await picture.toImage(width.toInt(), height.toInt());
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);

    if (bytes == null) {
      return BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueGreen);
    }

    return BitmapDescriptor.bytes(bytes.buffer.asUint8List());
  }

  /// Creates multiple markers for a list of vehicles
  static Future<Map<String, BitmapDescriptor>> createForVehicles(
    List<Map<String, dynamic>> vehicles,
  ) async {
    final markers = <String, BitmapDescriptor>{};

    for (final vehicle in vehicles) {
      final tripId = vehicle['trip_id'] as String?;
      final seats = vehicle['available_seats'] as int? ?? 0;

      if (tripId != null) {
        markers[tripId] = await create(
          availableSeats: seats,
          seatColor: seats > 0 ? const Color(0xFF22C55E) : const Color(0xFFEF4444),
        );
      }
    }

    return markers;
  }
}

/// Widget to display seat count inline
class SeatCountBadge extends StatelessWidget {
  final int available;
  final int total;
  final double size;

  const SeatCountBadge({
    super.key,
    required this.available,
    required this.total,
    this.size = 24,
  });

  @override
  Widget build(BuildContext context) {
    final hasSeats = available > 0;

    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: size * 0.5,
        vertical: size * 0.25,
      ),
      decoration: BoxDecoration(
        color: hasSeats
            ? const Color(0xFF22C55E).withOpacity(0.2)
            : const Color(0xFFEF4444).withOpacity(0.2),
        borderRadius: BorderRadius.circular(size),
        border: Border.all(
          color: hasSeats ? const Color(0xFF22C55E) : const Color(0xFFEF4444),
          width: 1.5,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.event_seat,
            size: size * 0.7,
            color: hasSeats ? const Color(0xFF22C55E) : const Color(0xFFEF4444),
          ),
          SizedBox(width: size * 0.2),
          Text(
            '$available',
            style: TextStyle(
              color: hasSeats ? const Color(0xFF22C55E) : const Color(0xFFEF4444),
              fontSize: size * 0.6,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }
}

/// Live seat indicator that updates in real-time
class LiveSeatIndicator extends StatelessWidget {
  final int totalSeats;
  final int availableSeats;
  final VoidCallback? onTap;

  const LiveSeatIndicator({
    super.key,
    required this.totalSeats,
    required this.availableSeats,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final hasSeats = availableSeats > 0;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: Colors.black.withOpacity(0.8),
          borderRadius: BorderRadius.circular(30),
          border: Border.all(
            color: hasSeats
                ? const Color(0xFF22C55E).withOpacity(0.5)
                : const Color(0xFFEF4444).withOpacity(0.5),
            width: 2,
          ),
          boxShadow: [
            BoxShadow(
              color: (hasSeats ? const Color(0xFF22C55E) : const Color(0xFFEF4444))
                  .withOpacity(0.3),
              blurRadius: 12,
              spreadRadius: 2,
            ),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.event_seat,
              color: hasSeats ? const Color(0xFF22C55E) : const Color(0xFFEF4444),
              size: 24,
            ),
            const SizedBox(width: 8),
            Text(
              '$availableSeats',
              style: TextStyle(
                color: hasSeats ? const Color(0xFF22C55E) : const Color(0xFFEF4444),
                fontSize: 20,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
