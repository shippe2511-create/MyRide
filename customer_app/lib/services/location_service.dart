import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';

class LocationService {
  static LatLng? _lastKnownLocation;
  static bool _isInitialized = false;

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
      if (lastPos != null) {
        _lastKnownLocation = LatLng(lastPos.latitude, lastPos.longitude);
        debugPrint('LocationService: Last known: ${lastPos.latitude}, ${lastPos.longitude}');
      }

      // Get current position
      final position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.best,
        timeLimit: const Duration(seconds: 20),
      );

      _lastKnownLocation = LatLng(position.latitude, position.longitude);
      debugPrint('LocationService: Current: ${position.latitude}, ${position.longitude} (accuracy: ${position.accuracy}m)');

      return _lastKnownLocation!;
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
