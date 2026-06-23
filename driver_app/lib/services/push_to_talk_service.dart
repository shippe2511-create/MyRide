import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'supabase_service.dart';

/// Service for Push to Talk (walkie-talkie) voice messaging feature.
/// For now, drivers can only receive messages from admin. Recording will be added later.
class PushToTalkService {
  static final PushToTalkService _instance = PushToTalkService._internal();
  factory PushToTalkService() => _instance;
  PushToTalkService._internal();

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
  bool get featureEnabled => _featureEnabled;
  int get maxDurationSeconds => _maxDurationSeconds;
  bool get canDriverSend => _allowedSenders.contains('driver');
  bool get broadcastEnabled => _broadcastEnabled;
  Stream<Map<String, dynamic>> get onNewMessage => _newMessageController.stream;

  /// Initialize the service and load settings
  Future<void> initialize() async {
    await loadSettings();
    _subscribeToVoiceMessages();
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

  /// Subscribe to voice messages for this driver
  void _subscribeToVoiceMessages() {
    final userId = SupabaseService.visibleUserId;
    if (userId == null) return;

    _voiceMessageSubscription = SupabaseService.client
        .channel('voice_messages_driver')
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'voice_messages',
          callback: (payload) {
            final message = payload.newRecord;
            // Check if this message is for us
            final recipientType = message['recipient_type'];
            final recipientId = message['recipient_id'];

            if (recipientType == 'broadcast' ||
                recipientType == 'all_drivers' ||
                recipientId == userId) {
              debugPrint('New voice message received: ${message['id']}');
              _newMessageController.add(message);
            }
          },
        )
        .subscribe();

    debugPrint('Subscribed to voice messages');
  }

  /// Get recent voice messages for this driver
  Future<List<Map<String, dynamic>>> getMessages({int limit = 20}) async {
    final userId = SupabaseService.visibleUserId;
    if (userId == null) return [];

    try {
      final response = await SupabaseService.client
          .from('voice_messages')
          .select('*, sender:profiles!voice_messages_sender_id_fkey(full_name)')
          .or('recipient_type.eq.broadcast,recipient_type.eq.all_drivers,recipient_id.eq.$userId')
          .order('created_at', ascending: false)
          .limit(limit);

      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      debugPrint('Error fetching voice messages: $e');
      return [];
    }
  }

  /// Mark a message as played
  Future<void> markAsPlayed(String messageId) async {
    try {
      await SupabaseService.client
          .from('voice_messages')
          .update({
            'is_played': true,
            'played_at': DateTime.now().toIso8601String(),
          })
          .eq('id', messageId);
      debugPrint('Marked message as played: $messageId');
    } catch (e) {
      debugPrint('Error marking message as played: $e');
    }
  }

  /// Get count of unread messages
  Future<int> getUnreadCount() async {
    final userId = SupabaseService.visibleUserId;
    if (userId == null) return 0;

    try {
      final response = await SupabaseService.client
          .from('voice_messages')
          .select('id')
          .or('recipient_type.eq.broadcast,recipient_type.eq.all_drivers,recipient_id.eq.$userId')
          .eq('is_played', false);

      return (response as List).length;
    } catch (e) {
      debugPrint('Error getting unread count: $e');
      return 0;
    }
  }

  /// Dispose resources
  void dispose() {
    _voiceMessageSubscription?.unsubscribe();
    _newMessageController.close();
  }
}
