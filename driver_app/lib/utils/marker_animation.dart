import 'dart:math';
import 'package:google_maps_flutter/google_maps_flutter.dart';

/// Offset to adjust for vehicle icon orientation (0 if icon points north)
/// Adjust this if the car faces the wrong direction:
/// -90 if icon faces east, 90 if faces west, 180 if faces south
const double kVehicleIconOffset = 0;

/// Minimum distance in meters before recalculating bearing
/// Prevents spinning from GPS jitter when stationary
const double kMinDistanceForBearing = 2.0;

/// Calculate bearing (heading) from one point to another
/// Returns angle in degrees (0-360, 0 = north, 90 = east)
double calculateBearing(LatLng from, LatLng to) {
  final dLon = (to.longitude - from.longitude) * pi / 180;
  final lat1 = from.latitude * pi / 180;
  final lat2 = to.latitude * pi / 180;
  final y = sin(dLon) * cos(lat2);
  final x = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dLon);
  return (atan2(y, x) * 180 / pi + 360) % 360;
}

/// Calculate distance between two points in meters using Haversine formula
double calculateDistance(LatLng from, LatLng to) {
  const earthRadius = 6371000.0; // meters
  final dLat = (to.latitude - from.latitude) * pi / 180;
  final dLon = (to.longitude - from.longitude) * pi / 180;
  final lat1 = from.latitude * pi / 180;
  final lat2 = to.latitude * pi / 180;

  final a = sin(dLat / 2) * sin(dLat / 2) +
      cos(lat1) * cos(lat2) * sin(dLon / 2) * sin(dLon / 2);
  final c = 2 * atan2(sqrt(a), sqrt(1 - a));

  return earthRadius * c;
}

/// Interpolate angle using shortest path (handles 0/360 boundary)
double lerpAngle(double from, double to, double t) {
  final diff = ((to - from + 540) % 360) - 180;
  return (from + diff * t) % 360;
}

/// Interpolate between two LatLng positions
LatLng lerpLatLng(LatLng from, LatLng to, double t) {
  return LatLng(
    from.latitude + (to.latitude - from.latitude) * t,
    from.longitude + (to.longitude - from.longitude) * t,
  );
}

/// Get marker rotation with icon offset applied
double getMarkerRotation(double bearing) {
  return (bearing + kVehicleIconOffset) % 360;
}

/// State holder for smooth vehicle marker animation
class VehicleMarkerState {
  LatLng currentPosition;
  LatLng targetPosition;
  double currentBearing;
  double targetBearing;

  VehicleMarkerState({
    required this.currentPosition,
    this.currentBearing = 0,
  })  : targetPosition = currentPosition,
        targetBearing = currentBearing;

  /// Update target position, recalculate bearing if moved enough
  void updateTarget(LatLng newPosition) {
    final distance = calculateDistance(currentPosition, newPosition);

    if (distance >= kMinDistanceForBearing) {
      targetBearing = calculateBearing(currentPosition, newPosition);
    }
    // Keep previous bearing if below threshold (prevents spinning when idle)

    targetPosition = newPosition;
  }

  /// Get interpolated values for animation frame
  /// t is animation progress from 0.0 to 1.0
  void interpolate(double t) {
    currentPosition = lerpLatLng(currentPosition, targetPosition, t);
    currentBearing = lerpAngle(currentBearing, targetBearing, t);
  }

  /// Get marker rotation with icon offset
  double get markerRotation => getMarkerRotation(currentBearing);
}
