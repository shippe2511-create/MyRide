import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'package:audio_waveforms/audio_waveforms.dart';
import 'package:just_audio/just_audio.dart';
import 'package:provider/provider.dart';
import '../services/push_to_talk_service.dart';
import '../services/supabase_service.dart';
import '../providers/driver_state.dart';
import '../theme/app_theme.dart';
import '../utils/timezone_utils.dart';
import '../widgets/app_snackbar.dart';

class PushToTalkScreen extends StatefulWidget {
  const PushToTalkScreen({super.key});

  @override
  State<PushToTalkScreen> createState() => _PushToTalkScreenState();
}

class _PushToTalkScreenState extends State<PushToTalkScreen> with SingleTickerProviderStateMixin {
  final PushToTalkService _service = PushToTalkService();
  late RecorderController _recorderController;
  final AudioPlayer _player = AudioPlayer();
  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;

  List<Map<String, dynamic>> _messages = [];
  bool _loading = true;
  bool _isRecording = false;
  int _recordingDuration = 0;
  Timer? _recordingTimer;
  Timer? _pollingTimer;
  String? _recordingPath;
  StreamSubscription? _messageSubscription;
  String? _playingId;

  @override
  void initState() {
    super.initState();
    _recorderController = RecorderController()
      ..androidEncoder = AndroidEncoder.aac
      ..androidOutputFormat = AndroidOutputFormat.mpeg4
      ..iosEncoder = IosEncoder.kAudioFormatMPEG4AAC;

    _pulseController = AnimationController(
      duration: const Duration(milliseconds: 1000),
      vsync: this,
    );
    _pulseAnimation = Tween<double>(begin: 1.0, end: 1.15).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );

    _service.initialize();
    _loadMessages();
    _subscribeToNewMessages();
    _startPolling();
  }

  void _startPolling() {
    _pollingTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      _loadMessages(showLoading: false);
    });
  }

  @override
  void dispose() {
    _messageSubscription?.cancel();
    _recordingTimer?.cancel();
    _pollingTimer?.cancel();
    _recorderController.dispose();
    _player.dispose();
    _pulseController.dispose();
    super.dispose();
  }

  void _subscribeToNewMessages() {
    _messageSubscription = _service.onNewMessage.listen((message) {
      setState(() {
        _messages.insert(0, message);
      });
      HapticFeedback.heavyImpact();

      // Show notification if message is from admin
      final senderType = message['sender_type'] as String?;
      if (senderType == 'admin' && mounted) {
        AppSnackbar.info(context, 'New voice message from dispatch');
      }
    });

    // Also listen for deleted messages
    _service.onMessageDeleted.listen((messageId) {
      setState(() {
        _messages.removeWhere((m) => m['id'] == messageId);
      });
    });
  }

  Future<void> _loadMessages({bool showLoading = true}) async {
    if (showLoading && _messages.isEmpty) {
      setState(() => _loading = true);
    }
    await _service.loadSettings();
    final driverState = context.read<DriverState>();
    final messages = await _service.getMessages(profileId: driverState.profileId);
    if (mounted) {
      setState(() {
        _messages = messages;
        _loading = false;
      });
    }
  }

  Future<void> _startRecording() async {
    if (!_service.canDriverSend) {
      _showSnackBar('Driver voice messages are disabled', isError: true);
      return;
    }

    try {
      final dir = await getTemporaryDirectory();
      _recordingPath = '${dir.path}/voice_${DateTime.now().millisecondsSinceEpoch}.m4a';

      await _recorderController.record(path: _recordingPath);

      HapticFeedback.heavyImpact();
      _pulseController.repeat(reverse: true);

      setState(() {
        _isRecording = true;
        _recordingDuration = 0;
      });

      _recordingTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
        setState(() {
          _recordingDuration++;
        });
        if (_recordingDuration >= _service.maxDurationSeconds) {
          _stopRecording();
        }
      });
    } catch (e) {
      debugPrint('Error starting recording: $e');
      _showSnackBar('Failed to start recording', isError: true);
    }
  }

  Future<void> _stopRecording() async {
    if (!_isRecording) return;

    _recordingTimer?.cancel();
    _pulseController.stop();
    _pulseController.reset();

    final path = await _recorderController.stop();

    HapticFeedback.lightImpact();
    setState(() => _isRecording = false);

    if (path != null && _recordingDuration > 0) {
      await _sendVoiceMessage(path);
    }
  }

  Future<void> _sendVoiceMessage(String filePath) async {
    try {
      final file = File(filePath);
      final bytes = await file.readAsBytes();
      final fileName = 'driver_voice_${DateTime.now().millisecondsSinceEpoch}.m4a';

      // Upload to Supabase Storage
      await SupabaseService.client.storage
          .from('voice-messages')
          .uploadBinary(fileName, bytes);

      // Get public URL
      final audioUrl = SupabaseService.client.storage
          .from('voice-messages')
          .getPublicUrl(fileName);

      // Get driver info
      final driverState = context.read<DriverState>();

      // Save message to database
      await SupabaseService.client.from('voice_messages').insert({
        'sender_id': driverState.profileId,
        'sender_type': 'driver',
        'recipient_id': null,
        'recipient_type': 'admin',
        'audio_url': audioUrl,
        'duration_seconds': _recordingDuration,
      });

      // Message sent successfully

      // Clean up temp file
      await file.delete();

      // Reload messages
      _loadMessages();
    } catch (e) {
      debugPrint('Error sending voice message: $e');
      _showSnackBar('Failed to send message', isError: true);
    }
  }

  void _showSnackBar(String message, {bool isError = false}) {
    if (!mounted) return;
    if (isError) {
      AppSnackbar.error(context, message);
    } else {
      AppSnackbar.success(context, message);
    }
  }

  Future<void> _playMessage(Map<String, dynamic> message) async {
    final messageId = message['id'] as String;
    final audioUrl = message['audio_url'] as String;

    if (_playingId == messageId) {
      await _player.stop();
      setState(() => _playingId = null);
      return;
    }

    try {
      setState(() => _playingId = messageId);
      await _player.setUrl(audioUrl);
      _player.play();

      _player.playerStateStream.listen((state) {
        if (state.processingState == ProcessingState.completed) {
          if (mounted) setState(() => _playingId = null);
        }
      });

      // Mark as played
      if (message['is_played'] != true) {
        await _service.markAsPlayed(messageId);
        setState(() {
          final index = _messages.indexWhere((m) => m['id'] == messageId);
          if (index >= 0) {
            _messages[index]['is_played'] = true;
          }
        });
      }
    } catch (e) {
      debugPrint('Error playing message: $e');
      setState(() => _playingId = null);
    }
  }

  String _formatDuration(int seconds) {
    final mins = seconds ~/ 60;
    final secs = seconds % 60;
    return '${mins.toString().padLeft(2, '0')}:${secs.toString().padLeft(2, '0')}';
  }

  String _formatTime(String? dateStr) {
    if (dateStr == null) return '';
    final date = MaldivesTimezone.parse(dateStr);
    if (date == null) return '';
    final now = MaldivesTimezone.now();
    final diff = now.difference(date);
    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    return '${diff.inDays}d ago';
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0A0A0A) : Colors.white,
      body: SafeArea(
        child: Column(
          children: [
            // Header
            _buildHeader(),

            // Messages List
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator(color: AppColors.yellow))
                  : _messages.isEmpty
                      ? _buildEmptyState()
                      : _buildMessagesList(),
            ),

            // Recording Button Area
            if (_service.featureEnabled)
              _buildRecordingArea(),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textColor = isDark ? Colors.white : Colors.black;
    final subtitleColor = isDark ? Colors.white54 : Colors.black54;
    final bgColor = isDark ? const Color(0xFF0A0A0A) : Colors.white;
    final buttonBgColor = isDark ? Colors.white.withValues(alpha: 0.1) : Colors.black.withValues(alpha: 0.05);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: bgColor,
        border: Border(bottom: BorderSide(color: isDark ? Colors.white.withValues(alpha: 0.1) : Colors.black.withValues(alpha: 0.1))),
      ),
      child: Row(
        children: [
          GestureDetector(
            onTap: () => Navigator.pop(context),
            child: Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: buttonBgColor,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(Icons.arrow_back_ios_new, color: textColor, size: 18),
            ),
          ),
          const SizedBox(width: 16),
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [AppColors.yellow, AppColors.yellow.withValues(alpha: 0.7)],
              ),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(Icons.mic, color: Colors.black, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Push to Talk',
                  style: TextStyle(
                    color: textColor,
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  'Voice messages with dispatch',
                  style: TextStyle(
                    color: subtitleColor,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
          GestureDetector(
            onTap: _loadMessages,
            child: Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: buttonBgColor,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(Icons.refresh, color: textColor, size: 20),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textColor = isDark ? Colors.white : Colors.black;
    final subtitleColor = isDark ? Colors.white.withValues(alpha: 0.5) : Colors.black.withValues(alpha: 0.5);

    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: AppColors.yellow.withValues(alpha: 0.1),
              shape: BoxShape.circle,
            ),
            child: Icon(
              Icons.headset_mic_rounded,
              size: 48,
              color: AppColors.yellow.withValues(alpha: 0.5),
            ),
          ),
          const SizedBox(height: 24),
          Text(
            'No messages yet',
            style: TextStyle(
              color: textColor,
              fontSize: 18,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Hold the mic button to send\na message to dispatch',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: subtitleColor,
              fontSize: 14,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMessagesList() {
    return RefreshIndicator(
      onRefresh: _loadMessages,
      color: AppColors.yellow,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _messages.length,
        itemBuilder: (context, index) {
          final message = _messages[index];
          return _buildMessageCard(message);
        },
      ),
    );
  }

  Future<void> _deleteMessage(String messageId) async {
    try {
      await SupabaseService.client
          .from('voice_messages')
          .delete()
          .eq('id', messageId);

      setState(() {
        _messages.removeWhere((m) => m['id'] == messageId);
      });
      _showSnackBar('Message deleted');
    } catch (e) {
      debugPrint('Error deleting message: $e');
      _showSnackBar('Failed to delete message', isError: true);
    }
  }

  Widget _buildMessageCard(Map<String, dynamic> message) {
    final isPlaying = _playingId == message['id'];
    final isPlayed = message['is_played'] == true;
    final senderType = message['sender_type'] ?? 'admin';
    final isFromAdmin = senderType == 'admin';
    final senderName = message['sender']?['full_name'] ?? (isFromAdmin ? 'Dispatch' : 'You');
    final recipientType = message['recipient_type'] ?? '';
    final duration = message['duration_seconds'] ?? 0;

    final card = Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: isFromAdmin
              ? [const Color(0xFF1A1A2E), const Color(0xFF16213E)]
              : [const Color(0xFF0F3460), const Color(0xFF1A1A2E)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isFromAdmin
              ? AppColors.yellow.withValues(alpha: 0.3)
              : Colors.blue.withValues(alpha: 0.3),
          width: 1,
        ),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () => _playMessage(message),
          borderRadius: BorderRadius.circular(16),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: isPlaying
                          ? [Colors.red, Colors.red.shade700]
                          : [AppColors.yellow, AppColors.yellow.withValues(alpha: 0.8)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: (isPlaying ? Colors.red : AppColors.yellow).withValues(alpha: 0.4),
                        blurRadius: 12,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: Icon(
                    isPlaying ? Icons.pause_rounded : Icons.play_arrow_rounded,
                    color: Colors.black,
                    size: 28,
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            senderName,
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.bold,
                              fontSize: 15,
                            ),
                          ),
                          const SizedBox(width: 8),
                          if (recipientType == 'all_drivers' || recipientType == 'broadcast')
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(
                                color: AppColors.yellow.withValues(alpha: 0.2),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(
                                'ALL',
                                style: TextStyle(
                                  color: AppColors.yellow,
                                  fontSize: 10,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                          if (!isPlayed) ...[
                            const SizedBox(width: 8),
                            Container(
                              width: 8,
                              height: 8,
                              decoration: const BoxDecoration(
                                color: Colors.blue,
                                shape: BoxShape.circle,
                              ),
                            ),
                          ],
                        ],
                      ),
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          Icon(Icons.graphic_eq_rounded, size: 16, color: Colors.white.withValues(alpha: 0.5)),
                          const SizedBox(width: 4),
                          Text(
                            _formatDuration(duration),
                            style: TextStyle(color: Colors.white.withValues(alpha: 0.5), fontSize: 13, fontFamily: 'monospace'),
                          ),
                          const SizedBox(width: 16),
                          Icon(Icons.access_time_rounded, size: 14, color: Colors.white.withValues(alpha: 0.4)),
                          const SizedBox(width: 4),
                          Text(
                            _formatTime(message['created_at']),
                            style: TextStyle(color: Colors.white.withValues(alpha: 0.4), fontSize: 12),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );

    return card;
  }

  Widget _buildRecordingArea() {
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(context).padding.bottom + 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Recording Duration
          AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            height: _isRecording ? 40 : 0,
            child: _isRecording
                ? Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Container(
                        width: 12,
                        height: 12,
                        decoration: const BoxDecoration(
                          color: Colors.red,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        _formatDuration(_recordingDuration),
                        style: const TextStyle(
                          color: Colors.red,
                          fontSize: 24,
                          fontWeight: FontWeight.bold,
                          fontFamily: 'monospace',
                        ),
                      ),
                    ],
                  )
                : const SizedBox(),
          ),
          const SizedBox(height: 16),

          // Modern Record Button
          GestureDetector(
            onLongPressStart: (_) => _startRecording(),
            onLongPressEnd: (_) => _stopRecording(),
            child: AnimatedBuilder(
              animation: _pulseAnimation,
              builder: (context, child) {
                final scale = _isRecording ? _pulseAnimation.value : 1.0;
                final baseColor = _isRecording ? Colors.red : AppColors.yellow;

                return SizedBox(
                  width: 180,
                  height: 180,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      // Outermost ring (always visible)
                      Transform.scale(
                        scale: _isRecording ? scale * 1.05 : 1.0,
                        child: Container(
                          width: 170,
                          height: 170,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            border: Border.all(
                              color: baseColor.withValues(alpha: 0.25),
                              width: 1.5,
                            ),
                          ),
                        ),
                      ),
                      // Second ring
                      Transform.scale(
                        scale: _isRecording ? scale : 1.0,
                        child: Container(
                          width: 150,
                          height: 150,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            border: Border.all(
                              color: baseColor.withValues(alpha: 0.4),
                              width: 2,
                            ),
                          ),
                        ),
                      ),
                      // Third ring with glow
                      Container(
                        width: 130,
                        height: 130,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: baseColor.withValues(alpha: 0.5),
                            width: 2.5,
                          ),
                          boxShadow: [
                            BoxShadow(
                              color: baseColor.withValues(alpha: 0.3),
                              blurRadius: 15,
                              spreadRadius: 2,
                            ),
                          ],
                        ),
                      ),
                      // Inner glow ring
                      Container(
                        width: 115,
                        height: 115,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: RadialGradient(
                            colors: [
                              baseColor.withValues(alpha: 0.5),
                              baseColor.withValues(alpha: 0.1),
                            ],
                          ),
                        ),
                      ),
                      // Main button with gradient border
                      Container(
                        width: 95,
                        height: 95,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: LinearGradient(
                            colors: [
                              baseColor.withValues(alpha: 0.6),
                              baseColor.withValues(alpha: 0.3),
                            ],
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                          ),
                        ),
                        padding: const EdgeInsets.all(4),
                        child: Container(
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: LinearGradient(
                              colors: _isRecording
                                  ? [const Color(0xFFFF4757), const Color(0xFFFF6B81)]
                                  : [AppColors.yellow, const Color(0xFFFFE066)],
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                            ),
                            boxShadow: [
                              BoxShadow(
                                color: baseColor.withValues(alpha: 0.8),
                                blurRadius: 30,
                                spreadRadius: _isRecording ? 10 : 5,
                              ),
                            ],
                          ),
                          child: Icon(
                            _isRecording ? Icons.stop_rounded : Icons.mic_rounded,
                            color: _isRecording ? Colors.white : Colors.black,
                            size: 44,
                          ),
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 16),

          // Instructions
          Text(
            _isRecording ? 'Release to send' : 'Hold to talk',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.6),
              fontSize: 14,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}
