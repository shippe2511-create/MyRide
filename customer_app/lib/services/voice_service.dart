import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'supabase_service.dart';

/// Model for voice messages
class VoiceMessage {
  final String id;
  final String senderId;
  final String senderType;
  final String? recipientId;
  final String recipientType;
  final String audioUrl;
  final int durationSeconds;
  final bool isPlayed;
  final DateTime createdAt;

  VoiceMessage({
    required this.id,
    required this.senderId,
    required this.senderType,
    this.recipientId,
    required this.recipientType,
    required this.audioUrl,
    required this.durationSeconds,
    required this.isPlayed,
    required this.createdAt,
  });

  factory VoiceMessage.fromJson(Map<String, dynamic> json) {
    return VoiceMessage(
      id: json['id'] as String,
      senderId: json['sender_id'] as String,
      senderType: json['sender_type'] as String? ?? 'admin',
      recipientId: json['recipient_id'] as String?,
      recipientType: json['recipient_type'] as String? ?? 'broadcast',
      audioUrl: json['audio_url'] as String,
      durationSeconds: json['duration_seconds'] as int? ?? 0,
      isPlayed: json['is_played'] as bool? ?? false,
      createdAt: DateTime.tryParse(json['created_at'] as String? ?? '') ?? DateTime.now(),
    );
  }

  /// Get the full URL for the audio file from Supabase storage
  String get fullAudioUrl {
    // If it's already a full URL, return as-is
    if (audioUrl.startsWith('http')) {
      return audioUrl;
    }
    // Otherwise, construct the storage URL
    return SupabaseService.client.storage.from('voice-messages').getPublicUrl(audioUrl);
  }
}

/// Service for handling voice messages (broadcast messages from admin)
/// Customers only receive broadcast messages - they don't send.
class VoiceService {
  static final VoiceService _instance = VoiceService._internal();
  factory VoiceService() => _instance;
  VoiceService._internal();

  final SupabaseClient _client = Supabase.instance.client;
  RealtimeChannel? _broadcastChannel;

  // Stream controller for new voice messages
  final StreamController<VoiceMessage> _newMessageController =
      StreamController<VoiceMessage>.broadcast();

  Stream<VoiceMessage> get onNewMessage => _newMessageController.stream;

  // Track if service is initialized
  bool _isInitialized = false;
  bool get isInitialized => _isInitialized;

  /// Initialize the voice service and start listening for broadcast messages
  Future<void> initialize() async {
    if (_isInitialized) {
      debugPrint('VoiceService: Already initialized');
      return;
    }

    try {
      debugPrint('VoiceService: Initializing...');
      await _subscribeTobroadcasts();
      _isInitialized = true;
      debugPrint('VoiceService: Initialization complete');
    } catch (e) {
      debugPrint('VoiceService: Initialization error: $e');
    }
  }

  /// Subscribe to broadcast voice messages in realtime
  Future<void> _subscribeTobroadcasts() async {
    // Unsubscribe from any existing channel
    await _broadcastChannel?.unsubscribe();

    _broadcastChannel = _client
        .channel('voice_broadcasts')
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'voice_messages',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'recipient_type',
            value: 'broadcast',
          ),
          callback: (payload) {
            debugPrint('VoiceService: New broadcast message received');
            try {
              final message = VoiceMessage.fromJson(payload.newRecord);
              _newMessageController.add(message);
            } catch (e) {
              debugPrint('VoiceService: Error parsing message: $e');
            }
          },
        )
        .subscribe((status, [error]) {
          debugPrint('VoiceService: Subscription status: $status');
          if (error != null) {
            debugPrint('VoiceService: Subscription error: $error');
          }
        });
  }

  /// Fetch recent broadcast messages (unplayed first)
  Future<List<VoiceMessage>> getRecentBroadcasts({int limit = 10}) async {
    try {
      // Check if voice feature is enabled
      final settings = await getVoiceSettings();
      if (settings == null || settings['feature_enabled'] != true) {
        debugPrint('VoiceService: Feature disabled, returning empty list');
        return [];
      }

      final response = await _client
          .from('voice_messages')
          .select()
          .eq('recipient_type', 'broadcast')
          .order('created_at', ascending: false)
          .limit(limit);

      return (response as List)
          .map((json) => VoiceMessage.fromJson(json as Map<String, dynamic>))
          .toList();
    } catch (e) {
      debugPrint('VoiceService: Error fetching broadcasts: $e');
      return [];
    }
  }

  /// Fetch unplayed broadcast messages for the current user
  Future<List<VoiceMessage>> getUnplayedBroadcasts() async {
    try {
      final userId = SupabaseService.userId;
      if (userId == null) return [];

      // Check if voice feature is enabled
      final settings = await getVoiceSettings();
      if (settings == null || settings['feature_enabled'] != true) {
        return [];
      }

      // Get all broadcast messages
      final response = await _client
          .from('voice_messages')
          .select()
          .eq('recipient_type', 'broadcast')
          .order('created_at', ascending: false)
          .limit(20);

      // Get played message IDs for this user
      final playedResponse = await _client
          .from('voice_message_plays')
          .select('message_id')
          .eq('user_id', userId);

      final playedIds = (playedResponse as List)
          .map((p) => p['message_id'] as String)
          .toSet();

      // Filter out played messages
      return (response as List)
          .map((json) => VoiceMessage.fromJson(json as Map<String, dynamic>))
          .where((msg) => !playedIds.contains(msg.id))
          .toList();
    } catch (e) {
      debugPrint('VoiceService: Error fetching unplayed broadcasts: $e');
      return [];
    }
  }

  /// Mark a message as played by the current user
  Future<bool> markAsPlayed(String messageId) async {
    try {
      final userId = SupabaseService.userId;
      if (userId == null) return false;

      // Insert into the plays tracking table (upsert to avoid duplicates)
      await _client.from('voice_message_plays').upsert({
        'message_id': messageId,
        'user_id': userId,
        'played_at': DateTime.now().toIso8601String(),
      }, onConflict: 'message_id,user_id');

      debugPrint('VoiceService: Marked message $messageId as played');
      return true;
    } catch (e) {
      debugPrint('VoiceService: Error marking as played: $e');
      return false;
    }
  }

  /// Get voice settings from the database
  Future<Map<String, dynamic>?> getVoiceSettings() async {
    try {
      final response = await _client
          .from('voice_settings')
          .select()
          .limit(1)
          .maybeSingle();
      return response;
    } catch (e) {
      debugPrint('VoiceService: Error fetching settings: $e');
      return null;
    }
  }

  /// Check if voice feature is enabled
  Future<bool> isFeatureEnabled() async {
    final settings = await getVoiceSettings();
    return settings?['feature_enabled'] == true;
  }

  /// Get maximum allowed duration for voice messages
  Future<int> getMaxDurationSeconds() async {
    final settings = await getVoiceSettings();
    return settings?['max_duration_seconds'] as int? ?? 60;
  }

  /// Dispose of resources
  void dispose() {
    _broadcastChannel?.unsubscribe();
    _broadcastChannel = null;
    _isInitialized = false;
    debugPrint('VoiceService: Disposed');
  }

  /// Reconnect to realtime subscription (useful after network reconnection)
  Future<void> reconnect() async {
    debugPrint('VoiceService: Reconnecting...');
    await _subscribeTobroadcasts();
  }
}
