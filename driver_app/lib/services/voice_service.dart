import 'package:flutter_tts/flutter_tts.dart';
import 'package:flutter/foundation.dart';

class VoiceService {
  static final VoiceService _instance = VoiceService._internal();
  factory VoiceService() => _instance;
  VoiceService._internal();

  final FlutterTts _tts = FlutterTts();
  bool _isInitialized = false;
  bool _isEnabled = false; // Disabled by default

  Future<void> initialize() async {
    if (_isInitialized) return;

    try {
      await _tts.setLanguage("en-US");
      await _tts.setSpeechRate(0.5);
      await _tts.setVolume(1.0);
      await _tts.setPitch(1.0);
      _isInitialized = true;
    } catch (e) {
      debugPrint('Voice service init error: $e');
    }
  }

  void setEnabled(bool enabled) {
    _isEnabled = enabled;
  }

  bool get isEnabled => _isEnabled;

  Future<void> speak(String text) async {
    if (!_isEnabled) return;
    if (!_isInitialized) await initialize();

    try {
      await _tts.speak(text);
    } catch (e) {
      debugPrint('TTS error: $e');
    }
  }

  Future<void> stop() async {
    try {
      await _tts.stop();
    } catch (e) {
      debugPrint('TTS stop error: $e');
    }
  }

  Future<void> announceNewRide(String pickup, String dropoff) async {
    await speak("New ride request. Pickup at $pickup. Going to $dropoff.");
  }

  Future<void> announceRideAccepted() async {
    await speak("Ride accepted. Navigate to pickup location.");
  }

  Future<void> announceArrived() async {
    await speak("You have arrived. Customer has been notified.");
  }

  Future<void> announceTripStarted() async {
    await speak("Trip started. Drive safely.");
  }

  Future<void> announceTripCompleted() async {
    await speak("Trip completed. Great job!");
  }

  Future<void> announceDestinationChange(String newDestination) async {
    await speak("Customer changed destination to $newDestination.");
  }

  Future<void> announceGoingOnline() async {
    await speak("You are now online. Waiting for ride requests.");
  }

  Future<void> announceGoingOffline() async {
    await speak("You are now offline.");
  }
}
