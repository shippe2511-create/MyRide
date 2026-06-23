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

class PushToTalkScreen extends StatefulWidget {
  const PushToTalkScreen({super.key});

  @override
  State<PushToTalkScreen> createState() => _PushToTalkScreenState();
}

class _PushToTalkScreenState extends State<PushToTalkScreen> {
  final PushToTalkService _service = PushToTalkService();
  late RecorderController _recorderController;
  final AudioPlayer _player = AudioPlayer();

  List<Map<String, dynamic>> _messages = [];
  bool _loading = true;
  bool _isRecording = false;
  int _recordingDuration = 0;
  Timer? _recordingTimer;
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
    _loadMessages();
    _subscribeToNewMessages();
  }

  @override
  void dispose() {
    _messageSubscription?.cancel();
    _recordingTimer?.cancel();
    _recorderController.dispose();
    _player.dispose();
    super.dispose();
  }

  void _subscribeToNewMessages() {
    _messageSubscription = _service.onNewMessage.listen((message) {
      setState(() {
        _messages.insert(0, message);
      });
    });
  }

  Future<void> _loadMessages() async {
    setState(() => _loading = true);
    await _service.loadSettings();
    final messages = await _service.getMessages();
    setState(() {
      _messages = messages;
      _loading = false;
    });
  }

  Future<void> _startRecording() async {
    if (!_service.canDriverSend) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Driver voice messages are disabled'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    try {
      final dir = await getTemporaryDirectory();
      _recordingPath = '${dir.path}/voice_${DateTime.now().millisecondsSinceEpoch}.m4a';

      await _recorderController.record(path: _recordingPath);

      HapticFeedback.mediumImpact();
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
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Failed to start recording: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  Future<void> _stopRecording() async {
    if (!_isRecording) return;

    _recordingTimer?.cancel();
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

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Voice message sent to dispatch'),
            backgroundColor: Colors.green,
          ),
        );
      }

      // Clean up temp file
      await file.delete();

      // Reload messages
      _loadMessages();
    } catch (e) {
      debugPrint('Error sending voice message: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to send: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
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
    final date = DateTime.tryParse(dateStr);
    if (date == null) return '';
    final now = DateTime.now();
    final diff = now.difference(date);
    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    return '${diff.inDays}d ago';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => Navigator.pop(context),
        ),
        title: const Row(
          children: [
            Icon(Icons.radio, color: Colors.yellow),
            SizedBox(width: 8),
            Text('Push to Talk', style: TextStyle(color: Colors.white)),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Colors.white),
            onPressed: _loadMessages,
          ),
        ],
      ),
      body: Column(
        children: [
          // Info Card
          Container(
            margin: const EdgeInsets.all(16),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.grey[900],
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.grey[800]!),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: Colors.yellow.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.mic, color: Colors.yellow, size: 24),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Voice Messages',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _service.featureEnabled
                            ? 'Talk with dispatch'
                            : 'Feature disabled',
                        style: TextStyle(
                          color: Colors.grey[400],
                          fontSize: 14,
                        ),
                      ),
                    ],
                  ),
                ),
                Badge(
                  backgroundColor: _service.featureEnabled ? Colors.green : Colors.grey,
                  label: Text(
                    _service.featureEnabled ? 'ON' : 'OFF',
                    style: const TextStyle(fontSize: 10),
                  ),
                ),
              ],
            ),
          ),

          // Messages List
          Expanded(
            child: _loading
                ? const Center(
                    child: CircularProgressIndicator(color: Colors.yellow),
                  )
                : _messages.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              Icons.volume_off,
                              size: 64,
                              color: Colors.grey[700],
                            ),
                            const SizedBox(height: 16),
                            Text(
                              'No voice messages yet',
                              style: TextStyle(
                                color: Colors.grey[500],
                                fontSize: 16,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              'Hold the button below to send a message',
                              style: TextStyle(
                                color: Colors.grey[600],
                                fontSize: 14,
                              ),
                            ),
                          ],
                        ),
                      )
                    : RefreshIndicator(
                        onRefresh: _loadMessages,
                        color: Colors.yellow,
                        child: ListView.builder(
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          itemCount: _messages.length,
                          itemBuilder: (context, index) {
                            final message = _messages[index];
                            return _buildMessageCard(message);
                          },
                        ),
                      ),
          ),

          // Recording Button
          if (_service.featureEnabled && _service.canDriverSend)
            Container(
              padding: EdgeInsets.fromLTRB(20, 16, 20, MediaQuery.of(context).padding.bottom + 16),
              decoration: BoxDecoration(
                color: Colors.grey[900],
                border: Border(top: BorderSide(color: Colors.grey[800]!)),
              ),
              child: Column(
                children: [
                  if (_isRecording)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Text(
                        _formatDuration(_recordingDuration),
                        style: const TextStyle(
                          color: Colors.red,
                          fontSize: 24,
                          fontWeight: FontWeight.bold,
                          fontFamily: 'monospace',
                        ),
                      ),
                    ),
                  GestureDetector(
                    onLongPressStart: (_) => _startRecording(),
                    onLongPressEnd: (_) => _stopRecording(),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      width: _isRecording ? 90 : 70,
                      height: _isRecording ? 90 : 70,
                      decoration: BoxDecoration(
                        color: _isRecording ? Colors.red : Colors.yellow,
                        shape: BoxShape.circle,
                        boxShadow: _isRecording
                            ? [
                                BoxShadow(
                                  color: Colors.red.withOpacity(0.5),
                                  blurRadius: 20,
                                  spreadRadius: 5,
                                )
                              ]
                            : null,
                      ),
                      child: Icon(
                        _isRecording ? Icons.mic : Icons.mic_none,
                        color: Colors.black,
                        size: _isRecording ? 40 : 32,
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    _isRecording ? 'Release to send' : 'Hold to talk',
                    style: TextStyle(
                      color: Colors.grey[400],
                      fontSize: 14,
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildMessageCard(Map<String, dynamic> message) {
    final isPlaying = _playingId == message['id'];
    final isPlayed = message['is_played'] == true;
    final senderType = message['sender_type'] ?? 'admin';
    final isFromAdmin = senderType == 'admin';
    final senderName = message['sender']?['full_name'] ?? (isFromAdmin ? 'Dispatch' : 'Driver');
    final recipientType = message['recipient_type'] ?? '';

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.grey[900],
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isFromAdmin ? Colors.yellow.withOpacity(0.3) : Colors.blue.withOpacity(0.3),
        ),
      ),
      child: Row(
        children: [
          GestureDetector(
            onTap: () => _playMessage(message),
            child: Container(
              width: 50,
              height: 50,
              decoration: const BoxDecoration(
                color: Colors.yellow,
                shape: BoxShape.circle,
              ),
              child: Icon(
                isPlaying ? Icons.pause : Icons.play_arrow,
                color: Colors.black,
                size: 28,
              ),
            ),
          ),
          const SizedBox(width: 12),
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
                      ),
                    ),
                    if (recipientType == 'broadcast' || recipientType == 'all_drivers')
                      Container(
                        margin: const EdgeInsets.only(left: 8),
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: Colors.yellow.withOpacity(0.2),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          recipientType == 'broadcast' ? 'BROADCAST' : 'ALL DRIVERS',
                          style: const TextStyle(
                            color: Colors.yellow,
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    if (!isPlayed)
                      Container(
                        margin: const EdgeInsets.only(left: 8),
                        width: 8,
                        height: 8,
                        decoration: const BoxDecoration(
                          color: Colors.blue,
                          shape: BoxShape.circle,
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Icon(Icons.access_time, size: 14, color: Colors.grey[500]),
                    const SizedBox(width: 4),
                    Text(
                      _formatDuration(message['duration_seconds'] ?? 0),
                      style: TextStyle(color: Colors.grey[500], fontSize: 12),
                    ),
                    const SizedBox(width: 12),
                    Text(
                      _formatTime(message['created_at']),
                      style: TextStyle(color: Colors.grey[600], fontSize: 12),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
