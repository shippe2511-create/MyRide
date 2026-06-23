import 'dart:async';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';
import 'package:audioplayers/audioplayers.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';
import 'supabase_service.dart';

/// Service for Push to Talk (walkie-talkie) voice messaging feature.
/// Handles recording, uploading, fetching, and playing voice messages.
class PushToTalkService {
  static final PushToTalkService _instance = PushToTalkService._internal();
  factory PushToTalkService() => _instance;
  PushToTalkService._internal();

  final AudioRecorder _recorder = AudioRecorder();
  final AudioPlayer _player = AudioPlayer();
  final _uuid = const Uuid();

  bool _isRecording = false;
  bool _isPlaying = false;
  String? _currentPlayingId;
  DateTime? _recordingStartTime;
  String? _currentRecordingPath;

  // Settings from voice_settings table
  bool _featureEnabled = false;
  int _maxDurationSeconds = 60;
  List<String> _allowedSenders = [];
  bool _broadcastEnabled = false;

  // Realtime subscription
  RealtimeChannel? _voiceMessageSubscription;
  final StreamController<Map<String, dynamic>> _newMessageController =
      StreamController<Map<String, dynamic>>.broadcast();

  // Getters
  bool get isRecording => _isRecording;
  bool get isPlaying => _isPlaying;
  String? get currentPlayingId => _currentPlayingId;
  bool get featureEnabled => _featureEnabled;
  int get maxDurationSeconds => _maxDurationSeconds;
  bool get canDriverSend => _allowedSenders.contains('driver');
  bool get broadcastEnabled => _broadcastEnabled;
  Stream<Map<String, dynamic>> get onNewMessage => _newMessageController.stream;

  int get recordingDurationSeconds {
    if (_recordingStartTime == null) return 0;
    return DateTime.now().difference(_recordingStartTime!).inSeconds;
  }

  /// Initialize the service and load settings
  Future<void> initialize() async {
    await loadSettings();
    _setupPlayerListener();
  }

  void _setupPlayerListener() {
    _player.onPlayerComplete.listen((_) {
      _isPlaying = false;
      _currentPlayingId = null;
    });
  }

  /// Load voice settings from Supabase
  Future<void> loadSettings() async {
    try {
      final response = await SupabaseService.client
          .from('voice_settings')
          .select()
          .limit(1)
          .maybeSingle();

      if (response != null) {
        _featureEnabled = response['feature_enabled'] ?? false;
        _maxDurationSeconds = response['max_duration_seconds'] ?? 60;
        _broadcastEnabled = response['broadcast_enabled'] ?? false;

        // Parse allowed_senders - could be array or string
        final senders = response['allowed_senders'];
        if (senders is List) {
          _allowedSenders = senders.map((e) => e.toString()).toList();
        } else if (senders is String) {
          _allowedSenders = senders.split(',').map((e) => e.trim()).toList();
        } else {
          _allowedSenders = [];
        }

        debugPrint('Voice settings loaded: enabled=$_featureEnabled, maxDuration=$_maxDurationSeconds, allowedSenders=$_allowedSenders');
      }
    } catch (e) {
      debugPrint('Error loading voice settings: $e');
    }
  }

  /// Check if recording is allowed
  Future<bool> canRecord() async {
    // Reload settings to get latest
    await loadSettings();

    if (!_featureEnabled) {
      debugPrint('Voice feature is disabled');
      return false;
    }

    if (!canDriverSend) {
      debugPrint('Drivers are not allowed to send voice messages');
      return false;
    }

    // Check microphone permission
    final hasPermission = await _recorder.hasPermission();
    if (!hasPermission) {
      debugPrint('No microphone permission');
      return false;
    }

    return true;
  }

  /// Start recording a voice message
  Future<bool> startRecording() async {
    if (_isRecording) {
      debugPrint('Already recording');
      return false;
    }

    if (!await canRecord()) {
      return false;
    }

    try {
      final directory = await getTemporaryDirectory();
      final fileName = 'voice_${DateTime.now().millisecondsSinceEpoch}.m4a';
      _currentRecordingPath = '${directory.path}/$fileName';

      await _recorder.start(
        const RecordConfig(
          encoder: AudioEncoder.aacLc,
          bitRate: 128000,
          sampleRate: 44100,
        ),
        path: _currentRecordingPath!,
      );

      _isRecording = true;
      _recordingStartTime = DateTime.now();
      debugPrint('Recording started: $_currentRecordingPath');
      return true;
    } catch (e) {
      debugPrint('Error starting recording: $e');
      _isRecording = false;
      _currentRecordingPath = null;
      return false;
    }
  }

  /// Stop recording and return the file path
  Future<String?> stopRecording() async {
    if (!_isRecording) {
      return null;
    }

    try {
      final path = await _recorder.stop();
      _isRecording = false;
      final duration = recordingDurationSeconds;
      _recordingStartTime = null;

      debugPrint('Recording stopped: $path, duration: ${duration}s');

      // Check minimum duration (at least 1 second)
      if (duration < 1) {
        debugPrint('Recording too short, discarding');
        if (path != null) {
          final file = File(path);
          if (await file.exists()) {
            await file.delete();
          }
        }
        return null;
      }

      return path;
    } catch (e) {
      debugPrint('Error stopping recording: $e');
      _isRecording = false;
      _recordingStartTime = null;
      return null;
    }
  }

  /// Cancel recording without saving
  Future<void> cancelRecording() async {
    if (!_isRecording) return;

    try {
      await _recorder.stop();
      _isRecording = false;
      _recordingStartTime = null;

      // Delete the partial file
      if (_currentRecordingPath != null) {
        final file = File(_currentRecordingPath!);
        if (await file.exists()) {
          await file.delete();
        }
      }
      _currentRecordingPath = null;
      debugPrint('Recording cancelled');
    } catch (e) {
      debugPrint('Error cancelling recording: $e');
    }
  }

  /// Upload a voice message to Supabase storage and save metadata
  Future<Map<String, dynamic>?> sendVoiceMessage({
    required String filePath,
    required String senderId,
    required String senderType,
    String? recipientId,
    String? recipientType,
    required int durationSeconds,
  }) async {
    try {
      final file = File(filePath);
      if (!await file.exists()) {
        debugPrint('File does not exist: $filePath');
        return null;
      }

      // Generate unique filename
      final messageId = _uuid.v4();
      final fileName = 'voice_${senderId}_$messageId.m4a';
      final storagePath = '$senderId/$fileName';

      // Upload to Supabase storage
      await SupabaseService.client.storage
          .from('voice-messages')
          .upload(storagePath, file);

      // Get public URL
      final audioUrl = SupabaseService.client.storage
          .from('voice-messages')
          .getPublicUrl(storagePath);

      // Insert message record
      final messageData = {
        'sender_id': senderId,
        'sender_type': senderType,
        'recipient_id': recipientId,
        'recipient_type': recipientType,
        'audio_url': audioUrl,
        'duration_seconds': durationSeconds,
        'is_played': false,
      };

      final response = await SupabaseService.client
          .from('voice_messages')
          .insert(messageData)
          .select()
          .single();

      debugPrint('Voice message sent: ${response['id']}');

      // Clean up local file
      await file.delete();

      return response;
    } catch (e) {
      debugPrint('Error sending voice message: $e');
      return null;
    }
  }

  /// Fetch voice messages for a driver
  Future<List<Map<String, dynamic>>> getMessages({
    required String driverId,
    int limit = 50,
  }) async {
    try {
      // Get messages where driver is recipient OR sender (for sent confirmation)
      final response = await SupabaseService.client
          .from('voice_messages')
          .select()
          .or('recipient_id.eq.$driverId,recipient_type.eq.all_drivers,sender_id.eq.$driverId')
          .order('created_at', ascending: false)
          .limit(limit);

      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      debugPrint('Error fetching voice messages: $e');
      return [];
    }
  }

  /// Get sender name from profile
  Future<String> getSenderName(String senderId, String senderType) async {
    try {
      if (senderType == 'admin') {
        // Admin sender - could be from profiles table
        final response = await SupabaseService.client
            .from('profiles')
            .select('full_name')
            .eq('id', senderId)
            .maybeSingle();
        return response?['full_name'] ?? 'Admin';
      } else if (senderType == 'driver') {
        // Driver sender - from drivers -> profiles
        final response = await SupabaseService.client
            .from('drivers')
            .select('profile:profiles(full_name)')
            .eq('id', senderId)
            .maybeSingle();
        return response?['profile']?['full_name'] ?? 'Driver';
      }
      return 'Unknown';
    } catch (e) {
      debugPrint('Error getting sender name: $e');
      return 'Unknown';
    }
  }

  /// Play a voice message
  Future<void> playMessage(String audioUrl, String messageId) async {
    try {
      // Stop any currently playing message
      if (_isPlaying) {
        await _player.stop();
      }

      _isPlaying = true;
      _currentPlayingId = messageId;

      await _player.play(UrlSource(audioUrl));
      debugPrint('Playing message: $messageId');

      // Mark as played
      await markAsPlayed(messageId);
    } catch (e) {
      debugPrint('Error playing message: $e');
      _isPlaying = false;
      _currentPlayingId = null;
    }
  }

  /// Stop playing current message
  Future<void> stopPlaying() async {
    try {
      await _player.stop();
      _isPlaying = false;
      _currentPlayingId = null;
    } catch (e) {
      debugPrint('Error stopping playback: $e');
    }
  }

  /// Pause current message
  Future<void> pausePlaying() async {
    try {
      await _player.pause();
      _isPlaying = false;
    } catch (e) {
      debugPrint('Error pausing playback: $e');
    }
  }

  /// Resume paused message
  Future<void> resumePlaying() async {
    try {
      await _player.resume();
      _isPlaying = true;
    } catch (e) {
      debugPrint('Error resuming playback: $e');
    }
  }

  /// Mark a message as played
  Future<void> markAsPlayed(String messageId) async {
    try {
      await SupabaseService.client
          .from('voice_messages')
          .update({'is_played': true})
          .eq('id', messageId);
    } catch (e) {
      debugPrint('Error marking message as played: $e');
    }
  }

  /// Subscribe to new voice messages for a driver
  void subscribeToMessages(String driverId) {
    _voiceMessageSubscription?.unsubscribe();

    _voiceMessageSubscription = SupabaseService.client
        .channel('voice_messages_$driverId')
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'voice_messages',
          callback: (payload) {
            final newRecord = payload.newRecord;
            final recipientId = newRecord['recipient_id'];
            final recipientType = newRecord['recipient_type'];

            // Check if this message is for this driver
            if (recipientId == driverId || recipientType == 'all_drivers') {
              debugPrint('New voice message received: ${newRecord['id']}');
              _newMessageController.add(newRecord);
            }
          },
        )
        .subscribe();

    debugPrint('Subscribed to voice messages for driver: $driverId');
  }

  /// Unsubscribe from voice messages
  void unsubscribeFromMessages() {
    _voiceMessageSubscription?.unsubscribe();
    _voiceMessageSubscription = null;
  }

  /// Get unread message count
  Future<int> getUnreadCount(String driverId) async {
    try {
      final response = await SupabaseService.client
          .from('voice_messages')
          .select('id')
          .or('recipient_id.eq.$driverId,recipient_type.eq.all_drivers')
          .eq('is_played', false)
          .neq('sender_id', driverId); // Don't count own messages

      return (response as List).length;
    } catch (e) {
      debugPrint('Error getting unread count: $e');
      return 0;
    }
  }

  /// Dispose resources
  void dispose() {
    _recorder.dispose();
    _player.dispose();
    _voiceMessageSubscription?.unsubscribe();
    _newMessageController.close();
  }
}
