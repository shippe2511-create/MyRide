import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'supabase_service.dart';

class NativeLocationService {
  static final NativeLocationService _instance = NativeLocationService._internal();
  factory NativeLocationService() => _instance;
  NativeLocationService._internal();

  static const _channel = MethodChannel('com.myride.driver/location');
  bool _isInitialized = false;
  bool _isTracking = false;
  String? _driverId;

  bool get isTracking => _isTracking;

  Future<void> initialize() async {
    if (_isInitialized) return;

    _channel.setMethodCallHandler(_handleMethodCall);
    _isInitialized = true;
    debugPrint('NativeLocation: Initialized');
  }

  Future<void> _handleMethodCall(MethodCall call) async {
    if (call.method == 'onLocationUpdate') {
      final args = Map<String, dynamic>.from(call.arguments);
      final lat = (args['lat'] as num).toDouble();
      final lng = (args['lng'] as num).toDouble();
      final heading = (args['heading'] as num?)?.toDouble() ?? -1;
      final speed = (args['speed'] as num?)?.toDouble() ?? 0;
      final driverId = args['driverId'] as String;

      debugPrint('NativeLocation: Received update lat=$lat, lng=$lng');

      try {
        await SupabaseService.updateLocation(
          driverId,
          lat,
          lng,
          heading: heading,
          speed: speed,
        );
      } catch (e) {
        debugPrint('NativeLocation: Error updating Supabase - $e');
      }
    }
  }

  Future<void> startTracking(String driverId) async {
    if (!Platform.isIOS) {
      debugPrint('NativeLocation: Not iOS, skipping');
      return;
    }

    await initialize();
    _driverId = driverId;

    try {
      final result = await _channel.invokeMethod('startTracking', {
        'driverId': driverId,
      });
      _isTracking = result == true;
      debugPrint('NativeLocation: startTracking result=$result');
    } catch (e) {
      debugPrint('NativeLocation: Error starting tracking - $e');
    }
  }

  Future<void> stopTracking() async {
    if (!Platform.isIOS) return;

    try {
      await _channel.invokeMethod('stopTracking');
      _isTracking = false;
      _driverId = null;
      debugPrint('NativeLocation: Stopped');
    } catch (e) {
      debugPrint('NativeLocation: Error stopping - $e');
    }
  }
}
