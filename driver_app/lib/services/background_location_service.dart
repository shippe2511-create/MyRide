import 'dart:async';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'supabase_service.dart';

class BackgroundLocationService {
  static final BackgroundLocationService _instance = BackgroundLocationService._internal();
  factory BackgroundLocationService() => _instance;
  BackgroundLocationService._internal();

  StreamSubscription<Position>? _positionStreamSubscription;
  String? _driverId;
  bool _isTracking = false;
  Position? _lastPosition;
  DateTime? _lastUpdateTime;

  bool get isTracking => _isTracking;

  Future<bool> checkPermission() async {
    LocationPermission permission = await Geolocator.checkPermission();

    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }

    if (permission == LocationPermission.deniedForever) {
      debugPrint('BackgroundLocation: Permission denied forever');
      return false;
    }

    return permission == LocationPermission.always || permission == LocationPermission.whileInUse;
  }

  Future<bool> hasAlwaysPermission() async {
    final permission = await Geolocator.checkPermission();
    return permission == LocationPermission.always;
  }

  Future<void> openLocationSettings() async {
    await Geolocator.openAppSettings();
  }

  Future<void> startTracking(String driverId) async {
    if (_isTracking && _driverId == driverId) {
      debugPrint('BackgroundLocation: Already tracking this driver');
      return;
    }

    await stopTracking();

    _driverId = driverId;
    debugPrint('BackgroundLocation: Starting tracking for driver $driverId');

    final hasPermission = await checkPermission();
    if (!hasPermission) {
      debugPrint('BackgroundLocation: No permission');
      return;
    }

    // Configure location settings
    late LocationSettings locationSettings;

    if (Platform.isAndroid) {
      locationSettings = AndroidSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 0,
        intervalDuration: const Duration(seconds: 2),
        foregroundNotificationConfig: const ForegroundNotificationConfig(
          notificationText: "MyRide Driver is tracking your location",
          notificationTitle: "Location Active",
          enableWakeLock: true,
          notificationIcon: AndroidResource(name: 'ic_launcher', defType: 'mipmap'),
        ),
      );
    } else if (Platform.isIOS) {
      locationSettings = AppleSettings(
        accuracy: LocationAccuracy.bestForNavigation,
        activityType: ActivityType.automotiveNavigation,
        distanceFilter: 0,
        pauseLocationUpdatesAutomatically: true,
        showBackgroundLocationIndicator: false,
        allowBackgroundLocationUpdates: false,
      );
    } else {
      locationSettings = const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 0,
      );
    }

    // Get and send initial position
    try {
      final initialPosition = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 5),
        ),
      );
      await _onPositionUpdate(initialPosition);
      debugPrint('BackgroundLocation: Initial position sent');
    } catch (e) {
      debugPrint('BackgroundLocation: Initial position error - $e');
    }

    // Start position stream
    _positionStreamSubscription = Geolocator.getPositionStream(
      locationSettings: locationSettings,
    ).listen(
      (position) {
        _onPositionUpdate(position);
      },
      onError: (error) {
        debugPrint('BackgroundLocation: Stream error - $error');
      },
      cancelOnError: false,
    );

    _isTracking = true;
    debugPrint('BackgroundLocation: Tracking started');
  }

  Future<void> _onPositionUpdate(Position position) async {
    if (_driverId == null || _driverId!.isEmpty) return;

    final now = DateTime.now();

    // Throttle: max 1 update per second
    if (_lastUpdateTime != null && now.difference(_lastUpdateTime!).inMilliseconds < 1000) {
      return;
    }

    // Skip if moved less than 2 meters AND less than 5 seconds passed
    if (_lastPosition != null) {
      final distance = Geolocator.distanceBetween(
        _lastPosition!.latitude,
        _lastPosition!.longitude,
        position.latitude,
        position.longitude,
      );
      if (distance < 2 && _lastUpdateTime != null && now.difference(_lastUpdateTime!).inSeconds < 5) {
        return;
      }
    }

    double lat = position.latitude;
    double lng = position.longitude;

    if (!_isValidMaldivesCoord(lat, lng)) {
      debugPrint('BackgroundLocation: Invalid coords (not in Maldives)');
      return;
    }

    _lastPosition = position;
    _lastUpdateTime = now;

    debugPrint('BackgroundLocation: Updating lat=$lat, lng=$lng');

    try {
      await SupabaseService.updateLocation(
        _driverId!,
        lat,
        lng,
        heading: position.heading,
        speed: position.speed,
      );
    } catch (e) {
      debugPrint('BackgroundLocation: Error updating - $e');
    }
  }

  bool _isValidMaldivesCoord(double lat, double lng) {
    return lat >= -0.7 && lat <= 7.1 && lng >= 72.6 && lng <= 73.8;
  }

  Future<void> stopTracking() async {
    debugPrint('BackgroundLocation: Stopping tracking');
    await _positionStreamSubscription?.cancel();
    _positionStreamSubscription = null;
    _isTracking = false;
    _driverId = null;
    _lastPosition = null;
    _lastUpdateTime = null;
  }

  void updateDriverId(String driverId) {
    _driverId = driverId;
  }
}
