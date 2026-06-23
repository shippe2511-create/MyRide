import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import '../theme/app_theme.dart';
import '../services/push_to_talk_service.dart';

/// Widget displaying a single voice message with play/pause controls.
class VoiceMessageWidget extends StatefulWidget {
  final Map<String, dynamic> message;
  final String currentDriverId;
  final bool isPlaying;
  final VoidCallback onPlay;
  final VoidCallback onStop;

  const VoiceMessageWidget({
    super.key,
    required this.message,
    required this.currentDriverId,
    required this.isPlaying,
    required this.onPlay,
    required this.onStop,
  });

  @override
  State<VoiceMessageWidget> createState() => _VoiceMessageWidgetState();
}

class _VoiceMessageWidgetState extends State<VoiceMessageWidget> {
  String _senderName = 'Loading...';
  bool _loadingSenderName = true;

  @override
  void initState() {
    super.initState();
    _loadSenderName();
  }

  Future<void> _loadSenderName() async {
    final senderId = widget.message['sender_id'] as String?;
    final senderType = widget.message['sender_type'] as String?;

    if (senderId == widget.currentDriverId) {
      setState(() {
        _senderName = 'You';
        _loadingSenderName = false;
      });
      return;
    }

    if (senderId != null && senderType != null) {
      final name = await PushToTalkService().getSenderName(senderId, senderType);
      if (mounted) {
        setState(() {
          _senderName = name;
          _loadingSenderName = false;
        });
      }
    } else {
      setState(() {
        _senderName = 'Unknown';
        _loadingSenderName = false;
      });
    }
  }

  String _formatDuration(int seconds) {
    final minutes = seconds ~/ 60;
    final secs = seconds % 60;
    return '${minutes.toString().padLeft(2, '0')}:${secs.toString().padLeft(2, '0')}';
  }

  String _formatTimestamp(String? timestamp) {
    if (timestamp == null) return '';
    try {
      final dt = DateTime.parse(timestamp).toLocal();
      final now = DateTime.now();
      final diff = now.difference(dt);

      if (diff.inMinutes < 1) {
        return 'Just now';
      } else if (diff.inHours < 1) {
        return '${diff.inMinutes}m ago';
      } else if (diff.inDays < 1) {
        return DateFormat('h:mm a').format(dt);
      } else if (diff.inDays == 1) {
        return 'Yesterday ${DateFormat('h:mm a').format(dt)}';
      } else if (diff.inDays < 7) {
        return DateFormat('EEE h:mm a').format(dt);
      } else {
        return DateFormat('MMM d, h:mm a').format(dt);
      }
    } catch (e) {
      return '';
    }
  }

  @override
  Widget build(BuildContext context) {
    final isFromMe = widget.message['sender_id'] == widget.currentDriverId;
    final isPlayed = widget.message['is_played'] == true;
    final duration = widget.message['duration_seconds'] as int? ?? 0;
    final timestamp = widget.message['created_at'] as String?;
    final senderType = widget.message['sender_type'] as String?;
    final recipientType = widget.message['recipient_type'] as String?;

    final isBroadcast = recipientType == 'all_drivers';
    final isFromAdmin = senderType == 'admin';

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: Row(
        mainAxisAlignment: isFromMe ? MainAxisAlignment.end : MainAxisAlignment.start,
        children: [
          if (!isFromMe) ...[
            // Sender avatar
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: isFromAdmin
                    ? AppColors.info.withValues(alpha: 0.2)
                    : AppColors.yellow.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(
                isFromAdmin ? Icons.admin_panel_settings : Icons.person,
                color: isFromAdmin ? AppColors.info : AppColors.yellow,
                size: 22,
              ),
            ),
            const SizedBox(width: 10),
          ],
          // Message bubble
          Flexible(
            child: Container(
              constraints: BoxConstraints(
                maxWidth: MediaQuery.of(context).size.width * 0.75,
              ),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: isFromMe
                    ? AppColors.yellow.withValues(alpha: 0.15)
                    : context.cardColor,
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(16),
                  topRight: const Radius.circular(16),
                  bottomLeft: Radius.circular(isFromMe ? 16 : 4),
                  bottomRight: Radius.circular(isFromMe ? 4 : 16),
                ),
                border: Border.all(
                  color: isFromMe
                      ? AppColors.yellow.withValues(alpha: 0.3)
                      : context.borderColor,
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Sender name and broadcast indicator
                  Row(
                    children: [
                      if (_loadingSenderName)
                        SizedBox(
                          width: 12,
                          height: 12,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: context.mutedColor,
                          ),
                        )
                      else
                        Expanded(
                          child: Text(
                            _senderName,
                            style: TextStyle(
                              color: isFromAdmin ? AppColors.info : context.textColor,
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      if (isBroadcast) ...[
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppColors.info.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.campaign, size: 12, color: AppColors.info),
                              const SizedBox(width: 3),
                              Text(
                                'Broadcast',
                                style: TextStyle(
                                  color: AppColors.info,
                                  fontSize: 10,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 10),
                  // Play button and duration
                  Row(
                    children: [
                      // Play/Stop button
                      GestureDetector(
                        onTap: () {
                          HapticFeedback.lightImpact();
                          if (widget.isPlaying) {
                            widget.onStop();
                          } else {
                            widget.onPlay();
                          }
                        },
                        child: Container(
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(
                            color: widget.isPlaying
                                ? AppColors.error
                                : AppColors.success,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Icon(
                            widget.isPlaying ? Icons.stop : Icons.play_arrow,
                            color: Colors.white,
                            size: 26,
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      // Waveform placeholder and duration
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            // Fake waveform
                            Row(
                              children: List.generate(12, (index) {
                                final height = 4.0 + (index % 3) * 6 + (index % 5) * 3;
                                return Container(
                                  margin: const EdgeInsets.only(right: 3),
                                  width: 3,
                                  height: height.clamp(4.0, 20.0),
                                  decoration: BoxDecoration(
                                    color: widget.isPlaying
                                        ? AppColors.success
                                        : context.mutedColor.withValues(alpha: 0.5),
                                    borderRadius: BorderRadius.circular(2),
                                  ),
                                );
                              }),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              _formatDuration(duration),
                              style: TextStyle(
                                color: context.mutedColor,
                                fontSize: 12,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ],
                        ),
                      ),
                      // Played indicator
                      if (!isFromMe && !isPlayed)
                        Container(
                          width: 8,
                          height: 8,
                          decoration: BoxDecoration(
                            color: AppColors.info,
                            shape: BoxShape.circle,
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  // Timestamp
                  Text(
                    _formatTimestamp(timestamp),
                    style: TextStyle(
                      color: context.mutedColor,
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (isFromMe) const SizedBox(width: 10),
        ],
      ),
    );
  }
}
