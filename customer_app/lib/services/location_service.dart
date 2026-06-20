import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';

class LocationService {
  static LatLng? _lastKnownLocation;
  static bool _isInitialized = false;

  // Maldives coordinate bounds
  static bool _isValidMaldivesLat(double lat) => lat >= 3.5 && lat <= 7.5;
  static bool _isValidMaldivesLng(double lng) => lng >= 72.0 && lng <= 74.0;
  static bool isValidMaldivesLocation(double lat, double lng) =>
      _isValidMaldivesLat(lat) && _isValidMaldivesLng(lng);

  static Future<bool> initialize() async {
    if (_isInitialized) return true;

    try {
      bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        debugPrint('LocationService: Location services are disabled');
        return false;
      }

      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
        if (permission == LocationPermission.denied) {
          debugPrint('LocationService: Permission denied');
          return false;
        }
      }

      if (permission == LocationPermission.deniedForever) {
        debugPrint('LocationService: Permission denied forever');
        return false;
      }

      _isInitialized = true;
      debugPrint('LocationService: Initialized successfully');
      return true;
    } catch (e) {
      debugPrint('LocationService: Error initializing: $e');
      return false;
    }
  }

  static Future<LatLng> getCurrentLocation() async {
    // Default location (Male, Maldives)
    const defaultLocation = LatLng(4.1755, 73.5093);

    try {
      // Ensure initialized
      bool ready = await initialize();
      if (!ready) {
        debugPrint('LocationService: Not ready, returning default');
        return _lastKnownLocation ?? defaultLocation;
      }

      // Try to get last known position first (instant)
      Position? lastPos = await Geolocator.getLastKnownPosition();
      if (lastPos != null && isValidMaldivesLocation(lastPos.latitude, lastPos.longitude)) {
        _lastKnownLocation = LatLng(lastPos.latitude, lastPos.longitude);
        debugPrint('LocationService: Last known (valid): ${lastPos.latitude}, ${lastPos.longitude}');
      }

      // Get current position
      final position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.best,
        timeLimit: const Duration(seconds: 20),
      );

      debugPrint('LocationService: GPS returned: ${position.latitude}, ${position.longitude} (accuracy: ${position.accuracy}m)');

      // Validate coordinates are in Maldives
      if (isValidMaldivesLocation(position.latitude, position.longitude)) {
        _lastKnownLocation = LatLng(position.latitude, position.longitude);
        debugPrint('LocationService: Using GPS location (valid Maldives)');
        return _lastKnownLocation!;
      } else {
        debugPrint('LocationService: GPS location outside Maldives, using default');
        return _lastKnownLocation ?? defaultLocation;
      }
    } catch (e) {
      debugPrint('LocationService: Error getting location: $e');
      return _lastKnownLocation ?? defaultLocation;
    }
  }

  static LatLng? get lastKnownLocation => _lastKnownLocation;

  static Future<Position?> getCurrentPosition() async {
    try {
      bool ready = await initialize();
      if (!ready) return null;

      return await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.best,
        timeLimit: const Duration(seconds: 20),
      );
    } catch (e) {
      debugPrint('LocationService: Error: $e');
      return null;
    }
  }

  static Stream<Position> getPositionStream() {
    return Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.best,
        distanceFilter: 10,
      ),
    );
  }
}
