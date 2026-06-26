import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/voice_service.dart';
import 'app_snackbar.dart';

/// Widget that shows a notification banner when a new broadcast voice message arrives
/// and provides playback controls for the audio message.
class VoiceNotificationWidget extends StatefulWidget {
  final VoiceMessage message;
  final VoidCallback? onDismiss;
  final VoidCallback? onPlayComplete;

  const VoiceNotificationWidget({
    super.key,
    required this.message,
    this.onDismiss,
    this.onPlayComplete,
  });

  @override
  State<VoiceNotificationWidget> createState() => _VoiceNotificationWidgetState();
}

class _VoiceNotificationWidgetState extends State<VoiceNotificationWidget>
    with SingleTickerProviderStateMixin {
  late AnimationController _animationController;
  late Animation<Offset> _slideAnimation;
  late Animation<double> _fadeAnimation;

  bool _isPlaying = false;
  bool _isLoading = false;
  double _playbackProgress = 0.0;
  Timer? _progressTimer;

  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(
      duration: const Duration(milliseconds: 400),
      vsync: this,
    );

    _slideAnimation = Tween<Offset>(
      begin: const Offset(0, -1.5),
      end: Offset.zero,
    ).animate(CurvedAnimation(
      parent: _animationController,
      curve: Curves.easeOutBack,
    ));

    _fadeAnimation = Tween<double>(begin: 0, end: 1).animate(
      CurvedAnimation(parent: _animationController, curve: Curves.easeOut),
    );

    _animationController.forward();
  }

  @override
  void dispose() {
    _animationController.dispose();
    _progressTimer?.cancel();
    super.dispose();
  }

  void _dismiss() {
    _animationController.reverse().then((_) {
      widget.onDismiss?.call();
    });
  }

  Future<void> _playMessage() async {
    if (_isLoading) return;

    setState(() {
      _isLoading = true;
    });

    try {
      final audioUrl = widget.message.fullAudioUrl;
      debugPrint('VoiceNotificationWidget: Playing audio from $audioUrl');

      // Try to launch the audio URL in the browser/media player
      final uri = Uri.parse(audioUrl);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      } else {
        debugPrint('VoiceNotificationWidget: Cannot launch URL');
      }

      // Mark as played
      await VoiceService().markAsPlayed(widget.message.id);

      setState(() {
        _isPlaying = true;
        _isLoading = false;
      });

      // Simulate playback progress
      _startProgressSimulation();
    } catch (e) {
      debugPrint('VoiceNotificationWidget: Error playing message: $e');
      setState(() {
        _isLoading = false;
      });
      if (mounted) {
        AppSnackbar.error(context, 'Could not play voice message');
      }
    }
  }

  void _startProgressSimulation() {
    final duration = widget.message.durationSeconds;
    if (duration <= 0) {
      _onPlaybackComplete();
      return;
    }

    const tickInterval = Duration(milliseconds: 100);
    final totalTicks = duration * 10; // 10 ticks per second
    int currentTick = 0;

    _progressTimer = Timer.periodic(tickInterval, (timer) {
      currentTick++;
      if (mounted) {
        setState(() {
          _playbackProgress = currentTick / totalTicks;
        });
      }

      if (currentTick >= totalTicks) {
        timer.cancel();
        _onPlaybackComplete();
      }
    });
  }

  void _onPlaybackComplete() {
    if (mounted) {
      setState(() {
        _isPlaying = false;
        _playbackProgress = 0.0;
      });
      widget.onPlayComplete?.call();
    }
  }

  String _formatDuration(int seconds) {
    final mins = seconds ~/ 60;
    final secs = seconds % 60;
    return '${mins.toString().padLeft(2, '0')}:${secs.toString().padLeft(2, '0')}';
  }

  String _getTimeAgo() {
    final now = DateTime.now();
    final diff = now.difference(widget.message.createdAt);

    if (diff.inSeconds < 60) {
      return 'Just now';
    } else if (diff.inMinutes < 60) {
      return '${diff.inMinutes}m ago';
    } else if (diff.inHours < 24) {
      return '${diff.inHours}h ago';
    } else {
      return '${diff.inDays}d ago';
    }
  }

  @override
  Widget build(BuildContext context) {
    return SlideTransition(
      position: _slideAnimation,
      child: FadeTransition(
        opacity: _fadeAnimation,
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 16),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                const Color(0xFF6366F1), // Indigo
                const Color(0xFF8B5CF6), // Purple
              ],
            ),
            borderRadius: BorderRadius.circular(20),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFF6366F1).withValues(alpha: 0.4),
                blurRadius: 24,
                offset: const Offset(0, 10),
                spreadRadius: -4,
              ),
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.2),
                blurRadius: 12,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(20),
            child: Material(
              color: Colors.transparent,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Header with dismiss button
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 14, 8, 0),
                    child: Row(
                      children: [
                        // Voice icon with pulse animation
                        Container(
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.2),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Icon(
                            Icons.record_voice_over_rounded,
                            color: Colors.white,
                            size: 24,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 8,
                                      vertical: 3,
                                    ),
                                    decoration: BoxDecoration(
                                      color: Colors.white.withValues(alpha: 0.2),
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Icon(
                                          Icons.campaign_rounded,
                                          size: 12,
                                          color: Colors.white.withValues(alpha: 0.9),
                                        ),
                                        const SizedBox(width: 4),
                                        Text(
                                          'BROADCAST',
                                          style: TextStyle(
                                            color: Colors.white.withValues(alpha: 0.9),
                                            fontSize: 10,
                                            fontWeight: FontWeight.w700,
                                            letterSpacing: 0.5,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  const Spacer(),
                                  Text(
                                    _getTimeAgo(),
                                    style: TextStyle(
                                      color: Colors.white.withValues(alpha: 0.7),
                                      fontSize: 11,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 6),
                              const Text(
                                'New Voice Message from Admin',
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 15,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          onPressed: () {
                            HapticFeedback.lightImpact();
                            _dismiss();
                          },
                          icon: Container(
                            width: 28,
                            height: 28,
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Icon(
                              Icons.close_rounded,
                              color: Colors.white.withValues(alpha: 0.8),
                              size: 16,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),

                  // Playback controls
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                    child: Row(
                      children: [
                        // Play button
                        GestureDetector(
                          onTap: () {
                            HapticFeedback.mediumImpact();
                            _playMessage();
                          },
                          child: Container(
                            width: 56,
                            height: 56,
                            decoration: BoxDecoration(
                              color: Colors.white,
                              shape: BoxShape.circle,
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.black.withValues(alpha: 0.2),
                                  blurRadius: 12,
                                  offset: const Offset(0, 4),
                                ),
                              ],
                            ),
                            child: _isLoading
                                ? const Padding(
                                    padding: EdgeInsets.all(16),
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2.5,
                                      color: Color(0xFF6366F1),
                                    ),
                                  )
                                : Icon(
                                    _isPlaying
                                        ? Icons.pause_rounded
                                        : Icons.play_arrow_rounded,
                                    color: const Color(0xFF6366F1),
                                    size: 32,
                                  ),
                          ),
                        ),
                        const SizedBox(width: 16),

                        // Progress bar and duration
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              // Waveform-style progress bar
                              Container(
                                height: 32,
                                decoration: BoxDecoration(
                                  color: Colors.white.withValues(alpha: 0.15),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: ClipRRect(
                                  borderRadius: BorderRadius.circular(8),
                                  child: Stack(
                                    children: [
                                      // Progress fill
                                      FractionallySizedBox(
                                        widthFactor: _playbackProgress,
                                        child: Container(
                                          decoration: BoxDecoration(
                                            color: Colors.white.withValues(alpha: 0.3),
                                            borderRadius: BorderRadius.circular(8),
                                          ),
                                        ),
                                      ),
                                      // Waveform visualization
                                      Center(
                                        child: Row(
                                          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                                          children: List.generate(20, (index) {
                                            final heights = [0.3, 0.5, 0.8, 0.6, 0.9, 0.4, 0.7, 0.5, 0.85, 0.45, 0.75, 0.55, 0.9, 0.35, 0.65, 0.8, 0.4, 0.7, 0.5, 0.6];
                                            final isPlayed = _playbackProgress > (index / 20);
                                            return Container(
                                              width: 3,
                                              height: 24 * heights[index],
                                              decoration: BoxDecoration(
                                                color: isPlayed
                                                    ? Colors.white
                                                    : Colors.white.withValues(alpha: 0.4),
                                                borderRadius: BorderRadius.circular(2),
                                              ),
                                            );
                                          }),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                              const SizedBox(height: 8),
                              // Duration text
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    _isPlaying
                                        ? _formatDuration(
                                            (widget.message.durationSeconds *
                                                    _playbackProgress)
                                                .round())
                                        : '0:00',
                                    style: TextStyle(
                                      color: Colors.white.withValues(alpha: 0.8),
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  Text(
                                    _formatDuration(widget.message.durationSeconds),
                                    style: TextStyle(
                                      color: Colors.white.withValues(alpha: 0.8),
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Overlay manager for showing voice notification banners
class VoiceNotificationOverlay {
  static OverlayEntry? _currentEntry;

  /// Show a voice notification banner for a new message
  static void show(BuildContext context, VoiceMessage message) {
    dismiss(); // Dismiss any existing notification

    _currentEntry = OverlayEntry(
      builder: (context) => Positioned(
        top: MediaQuery.of(context).padding.top + 12,
        left: 0,
        right: 0,
        child: VoiceNotificationWidget(
          message: message,
          onDismiss: dismiss,
          onPlayComplete: () {
            // Auto-dismiss after playback completes
            Future.delayed(const Duration(seconds: 2), dismiss);
          },
        ),
      ),
    );

    Overlay.of(context, rootOverlay: true).insert(_currentEntry!);
    HapticFeedback.heavyImpact();
  }

  /// Dismiss the current notification
  static void dismiss() {
    _currentEntry?.remove();
    _currentEntry = null;
  }
}

/// Mixin to add voice message listening to any StatefulWidget
/// Add this mixin to your main app screen to listen for broadcast messages
mixin VoiceMessageListenerMixin<T extends StatefulWidget> on State<T> {
  StreamSubscription<VoiceMessage>? _voiceMessageSubscription;

  @protected
  void initVoiceMessageListener() {
    final voiceService = VoiceService();

    // Initialize the service if not already
    voiceService.initialize().then((_) {
      // Subscribe to new messages
      _voiceMessageSubscription = voiceService.onNewMessage.listen((message) {
        if (mounted) {
          VoiceNotificationOverlay.show(context, message);
        }
      });
    });
  }

  @protected
  void disposeVoiceMessageListener() {
    _voiceMessageSubscription?.cancel();
    _voiceMessageSubscription = null;
  }
}
