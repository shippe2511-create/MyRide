import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../theme/app_theme.dart';
import '../providers/driver_state.dart';
import '../services/push_to_talk_service.dart';
import '../widgets/voice_message_widget.dart';

/// Push to Talk (walkie-talkie) screen for voice messaging.
class PushToTalkScreen extends StatefulWidget {
  const PushToTalkScreen({super.key});

  @override
  State<PushToTalkScreen> createState() => _PushToTalkScreenState();
}

class _PushToTalkScreenState extends State<PushToTalkScreen> with TickerProviderStateMixin {
  final PushToTalkService _service = PushToTalkService();
  final ScrollController _scrollController = ScrollController();

  List<Map<String, dynamic>> _messages = [];
  bool _isLoading = true;
  bool _isRecording = false;
  bool _isSending = false;
  String? _currentPlayingId;
  String? _errorMessage;
  bool _canRecord = false;
  Timer? _recordingTimer;
  int _recordingSeconds = 0;

  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;
  StreamSubscription? _newMessageSubscription;

  @override
  void initState() {
    super.initState();
    _initializePulseAnimation();
    _initialize();
  }

  void _initializePulseAnimation() {
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1000),
    );
    _pulseAnimation = Tween<double>(begin: 1.0, end: 1.15).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );
  }

  Future<void> _initialize() async {
    await _service.initialize();
    await _checkPermissions();
    await _loadMessages();
    _subscribeToNewMessages();
  }

  Future<void> _checkPermissions() async {
    final canRecord = await _service.canRecord();
    setState(() {
      _canRecord = canRecord;
      if (!_service.featureEnabled) {
        _errorMessage = 'Voice messaging is currently disabled';
      } else if (!_service.canDriverSend) {
        _errorMessage = 'Drivers are not permitted to send voice messages';
      }
    });
  }

  Future<void> _loadMessages() async {
    final state = context.read<DriverState>();
    if (state.driverId.isEmpty) {
      setState(() {
        _isLoading = false;
        _errorMessage = 'Not logged in';
      });
      return;
    }

    setState(() => _isLoading = true);

    try {
      final messages = await _service.getMessages(driverId: state.driverId);
      setState(() {
        _messages = messages;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _isLoading = false;
        _errorMessage = 'Failed to load messages';
      });
    }
  }

  void _subscribeToNewMessages() {
    final state = context.read<DriverState>();
    if (state.driverId.isEmpty) return;

    _service.subscribeToMessages(state.driverId);
    _newMessageSubscription = _service.onNewMessage.listen((message) {
      setState(() {
        // Add to beginning of list (newest first)
        _messages.insert(0, message);
      });
      HapticFeedback.mediumImpact();
    });
  }

  @override
  void dispose() {
    _pulseController.dispose();
    _recordingTimer?.cancel();
    _scrollController.dispose();
    _newMessageSubscription?.cancel();
    _service.unsubscribeFromMessages();
    _service.stopPlaying();
    super.dispose();
  }

  void _startRecording() async {
    if (!_canRecord || _isSending) return;

    final started = await _service.startRecording();
    if (started) {
      setState(() {
        _isRecording = true;
        _recordingSeconds = 0;
      });
      _pulseController.repeat(reverse: true);
      HapticFeedback.heavyImpact();

      // Start timer
      _recordingTimer = Timer.periodic(const Duration(seconds: 1), (_) {
        setState(() => _recordingSeconds++);

        // Auto-stop at max duration
        if (_recordingSeconds >= _service.maxDurationSeconds) {
          _stopRecording();
        }
      });
    } else {
      // Show error
      _showError('Cannot start recording. Check permissions.');
    }
  }

  void _stopRecording() async {
    if (!_isRecording) return;

    _pulseController.stop();
    _pulseController.reset();
    _recordingTimer?.cancel();

    final filePath = await _service.stopRecording();
    setState(() => _isRecording = false);

    if (filePath != null && _recordingSeconds >= 1) {
      await _sendVoiceMessage(filePath);
    }
  }

  void _cancelRecording() async {
    if (!_isRecording) return;

    _pulseController.stop();
    _pulseController.reset();
    _recordingTimer?.cancel();

    await _service.cancelRecording();
    setState(() {
      _isRecording = false;
      _recordingSeconds = 0;
    });
    HapticFeedback.lightImpact();
  }

  Future<void> _sendVoiceMessage(String filePath) async {
    final state = context.read<DriverState>();
    if (state.driverId.isEmpty) return;

    setState(() => _isSending = true);

    final result = await _service.sendVoiceMessage(
      filePath: filePath,
      senderId: state.driverId,
      senderType: 'driver',
      recipientType: 'admin', // Driver messages go to admin by default
      durationSeconds: _recordingSeconds,
    );

    setState(() {
      _isSending = false;
      _recordingSeconds = 0;
    });

    if (result != null) {
      HapticFeedback.mediumImpact();
      // Add to messages list
      setState(() {
        _messages.insert(0, result);
      });
      _showSuccess('Message sent');
    } else {
      _showError('Failed to send message');
    }
  }

  void _playMessage(Map<String, dynamic> message) async {
    final audioUrl = message['audio_url'] as String?;
    final messageId = message['id'] as String?;
    if (audioUrl == null || messageId == null) return;

    if (_currentPlayingId == messageId) {
      // Already playing this one - stop it
      await _service.stopPlaying();
      setState(() => _currentPlayingId = null);
    } else {
      // Play new message
      setState(() => _currentPlayingId = messageId);
      await _service.playMessage(audioUrl, messageId);

      // Update played status in local list
      final index = _messages.indexWhere((m) => m['id'] == messageId);
      if (index != -1) {
        setState(() {
          _messages[index] = {..._messages[index], 'is_played': true};
        });
      }
    }
  }

  void _stopPlaying() async {
    await _service.stopPlaying();
    setState(() => _currentPlayingId = null);
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: AppColors.error,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    );
  }

  void _showSuccess(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            const Icon(Icons.check_circle, color: Colors.white, size: 20),
            const SizedBox(width: 10),
            Text(message),
          ],
        ),
        backgroundColor: AppColors.success,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        duration: const Duration(seconds: 2),
      ),
    );
  }

  String _formatDuration(int seconds) {
    final minutes = seconds ~/ 60;
    final secs = seconds % 60;
    return '${minutes.toString().padLeft(2, '0')}:${secs.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<DriverState>();

    return Scaffold(
      backgroundColor: context.bgColor,
      appBar: AppBar(
        backgroundColor: context.bgColor,
        elevation: 0,
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: context.textColor),
          onPressed: () => Navigator.pop(context),
        ),
        title: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: AppColors.yellow.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(Icons.mic, color: AppColors.yellow, size: 20),
            ),
            const SizedBox(width: 12),
            Text(
              'Push to Talk',
              style: TextStyle(
                color: context.textColor,
                fontSize: 18,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: Icon(Icons.refresh, color: context.mutedColor),
            onPressed: _loadMessages,
          ),
        ],
      ),
      body: Column(
        children: [
          // Status bar
          if (_errorMessage != null && !_service.featureEnabled)
            _buildDisabledBanner(),

          // Messages list
          Expanded(
            child: _isLoading
                ? _buildLoadingState()
                : _messages.isEmpty
                    ? _buildEmptyState()
                    : _buildMessagesList(state),
          ),

          // Recording controls
          _buildRecordingControls(state),
        ],
      ),
    );
  }

  Widget _buildDisabledBanner() {
    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.warning.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.warning.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          Icon(Icons.warning_amber, color: AppColors.warning),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              _errorMessage ?? 'Voice messaging is disabled',
              style: TextStyle(
                color: context.textColor,
                fontSize: 14,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLoadingState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          CircularProgressIndicator(color: AppColors.yellow),
          const SizedBox(height: 16),
          Text(
            'Loading messages...',
            style: TextStyle(color: context.mutedColor),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                color: context.cardColor,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: context.borderColor),
              ),
              child: Icon(
                Icons.record_voice_over,
                size: 40,
                color: context.mutedColor,
              ),
            ),
            const SizedBox(height: 24),
            Text(
              'No Voice Messages',
              style: TextStyle(
                color: context.textColor,
                fontSize: 20,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Hold the button below to record and send a voice message to dispatch',
              style: TextStyle(
                color: context.mutedColor,
                fontSize: 14,
                height: 1.5,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMessagesList(DriverState state) {
    return RefreshIndicator(
      onRefresh: _loadMessages,
      color: AppColors.yellow,
      child: ListView.builder(
        controller: _scrollController,
        padding: const EdgeInsets.only(top: 8, bottom: 16),
        itemCount: _messages.length,
        itemBuilder: (context, index) {
          final message = _messages[index];
          final messageId = message['id'] as String?;
          return VoiceMessageWidget(
            message: message,
            currentDriverId: state.driverId,
            isPlaying: _currentPlayingId == messageId,
            onPlay: () => _playMessage(message),
            onStop: _stopPlaying,
          );
        },
      ),
    );
  }

  Widget _buildRecordingControls(DriverState state) {
    final canSend = _canRecord && _service.featureEnabled && _service.canDriverSend;

    return Container(
      padding: EdgeInsets.fromLTRB(20, 16, 20, MediaQuery.of(context).padding.bottom + 16),
      decoration: BoxDecoration(
        color: context.cardColor,
        border: Border(top: BorderSide(color: context.borderColor)),
      ),
      child: Column(
        children: [
          // Recording status
          if (_isRecording) ...[
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 12,
                  height: 12,
                  decoration: BoxDecoration(
                    color: AppColors.error,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 10),
                Text(
                  'Recording: ${_formatDuration(_recordingSeconds)}',
                  style: TextStyle(
                    color: AppColors.error,
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const Spacer(),
                Text(
                  'Max: ${_formatDuration(_service.maxDurationSeconds)}',
                  style: TextStyle(
                    color: context.mutedColor,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
          ],

          // Sending indicator
          if (_isSending) ...[
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: AppColors.yellow,
                  ),
                ),
                const SizedBox(width: 12),
                Text(
                  'Sending...',
                  style: TextStyle(
                    color: context.textColor,
                    fontSize: 14,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
          ],

          // Push to talk button
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // Cancel button (shown when recording)
              if (_isRecording)
                GestureDetector(
                  onTap: _cancelRecording,
                  child: Container(
                    width: 56,
                    height: 56,
                    decoration: BoxDecoration(
                      color: AppColors.error.withValues(alpha: 0.15),
                      shape: BoxShape.circle,
                      border: Border.all(color: AppColors.error.withValues(alpha: 0.3)),
                    ),
                    child: Icon(Icons.close, color: AppColors.error, size: 28),
                  ),
                ),
              if (_isRecording) const SizedBox(width: 24),

              // Main PTT button
              GestureDetector(
                onTapDown: canSend && !_isSending ? (_) => _startRecording() : null,
                onTapUp: canSend && !_isSending ? (_) => _stopRecording() : null,
                onTapCancel: canSend ? _cancelRecording : null,
                onLongPressEnd: canSend && !_isSending ? (_) => _stopRecording() : null,
                child: AnimatedBuilder(
                  animation: _pulseAnimation,
                  builder: (context, child) {
                    return Transform.scale(
                      scale: _isRecording ? _pulseAnimation.value : 1.0,
                      child: Container(
                        width: 80,
                        height: 80,
                        decoration: BoxDecoration(
                          color: _isRecording
                              ? AppColors.error
                              : canSend
                                  ? AppColors.yellow
                                  : context.borderColor,
                          shape: BoxShape.circle,
                          boxShadow: _isRecording
                              ? [
                                  BoxShadow(
                                    color: AppColors.error.withValues(alpha: 0.4),
                                    blurRadius: 20,
                                    spreadRadius: 5,
                                  )
                                ]
                              : canSend
                                  ? [
                                      BoxShadow(
                                        color: AppColors.yellow.withValues(alpha: 0.3),
                                        blurRadius: 15,
                                        offset: const Offset(0, 4),
                                      )
                                    ]
                                  : null,
                        ),
                        child: Icon(
                          _isRecording ? Icons.stop : Icons.mic,
                          color: _isRecording || canSend ? Colors.black : context.mutedColor,
                          size: 40,
                        ),
                      ),
                    );
                  },
                ),
              ),

              // Done button (shown when recording)
              if (_isRecording) ...[
                const SizedBox(width: 24),
                GestureDetector(
                  onTap: _stopRecording,
                  child: Container(
                    width: 56,
                    height: 56,
                    decoration: BoxDecoration(
                      color: AppColors.success.withValues(alpha: 0.15),
                      shape: BoxShape.circle,
                      border: Border.all(color: AppColors.success.withValues(alpha: 0.3)),
                    ),
                    child: Icon(Icons.check, color: AppColors.success, size: 28),
                  ),
                ),
              ],
            ],
          ),

          // Help text
          if (!_isRecording && !_isSending) ...[
            const SizedBox(height: 12),
            Text(
              canSend
                  ? 'Hold to record, release to send'
                  : 'Recording not available',
              style: TextStyle(
                color: context.mutedColor,
                fontSize: 13,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
