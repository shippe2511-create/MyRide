import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

class VoiceMessageWidget extends StatefulWidget {
  final Map<String, dynamic> message;
  final VoidCallback? onPlayed;

  const VoiceMessageWidget({
    super.key,
    required this.message,
    this.onPlayed,
  });

  @override
  State<VoiceMessageWidget> createState() => _VoiceMessageWidgetState();
}

class _VoiceMessageWidgetState extends State<VoiceMessageWidget> {
  bool _isPlaying = false;

  String _formatDuration(int? seconds) {
    if (seconds == null) return '0:00';
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

  Future<void> _playMessage() async {
    final audioUrl = widget.message['audio_url'] as String?;
    if (audioUrl == null) return;

    setState(() => _isPlaying = true);

    // Open audio URL in browser/player
    final uri = Uri.parse(audioUrl);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }

    widget.onPlayed?.call();
    setState(() => _isPlaying = false);
  }

  @override
  Widget build(BuildContext context) {
    final isPlayed = widget.message['is_played'] == true;
    final senderType = widget.message['sender_type'] as String?;
    final recipientType = widget.message['recipient_type'] as String?;
    final duration = widget.message['duration_seconds'] as int?;
    final sender = widget.message['sender'] as Map<String, dynamic>?;
    final senderName = sender?['full_name'] ?? (senderType == 'admin' ? 'Dispatch' : 'Unknown');

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.grey[900],
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isPlayed ? Colors.grey[800]! : Colors.yellow.withValues(alpha: 0.5),
          width: isPlayed ? 1 : 2,
        ),
      ),
      child: Row(
        children: [
          // Play Button
          GestureDetector(
            onTap: _playMessage,
            child: Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: Colors.yellow,
                borderRadius: BorderRadius.circular(24),
              ),
              child: Icon(
                _isPlaying ? Icons.pause : Icons.play_arrow,
                color: Colors.black,
                size: 28,
              ),
            ),
          ),
          const SizedBox(width: 16),

          // Message Info
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
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(width: 8),
                    if (recipientType == 'broadcast' || recipientType == 'all_drivers')
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: Colors.yellow.withValues(alpha: 0.2),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: const Text(
                          'BROADCAST',
                          style: TextStyle(
                            color: Colors.yellow,
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
                const SizedBox(height: 4),
                Row(
                  children: [
                    Icon(Icons.access_time, size: 14, color: Colors.grey[500]),
                    const SizedBox(width: 4),
                    Text(
                      _formatDuration(duration),
                      style: TextStyle(
                        color: Colors.grey[400],
                        fontSize: 14,
                      ),
                    ),
                    const SizedBox(width: 16),
                    Text(
                      _formatTime(widget.message['created_at'] as String?),
                      style: TextStyle(
                        color: Colors.grey[500],
                        fontSize: 12,
                      ),
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
