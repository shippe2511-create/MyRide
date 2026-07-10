import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/supabase_service.dart';
import '../theme/app_theme.dart';

class ReactionPicker extends StatefulWidget {
  final String contentType;
  final String contentId;
  final Widget child;

  const ReactionPicker({
    super.key,
    required this.contentType,
    required this.contentId,
    required this.child,
  });

  @override
  State<ReactionPicker> createState() => _ReactionPickerState();
}

class _ReactionPickerState extends State<ReactionPicker> {
  Map<String, int> _reactionCounts = {};
  String? _userReaction;
  bool _showPicker = false;

  static const _reactions = ['thumbs_up', 'heart', 'thumbs_down', 'laugh'];
  static const _emojis = ['👍', '❤️', '👎', '😂'];

  @override
  void initState() {
    super.initState();
    _loadReactions();
  }

  Future<void> _loadReactions() async {
    final counts = await SupabaseService.getReactionCounts(widget.contentType, widget.contentId);
    final userReaction = await SupabaseService.getUserReaction(widget.contentType, widget.contentId);
    if (mounted) {
      setState(() {
        _reactionCounts = counts;
        _userReaction = userReaction;
      });
    }
  }

  Future<void> _handleReaction(String reaction) async {
    HapticFeedback.lightImpact();

    if (_userReaction == reaction) {
      setState(() {
        _reactionCounts[reaction] = (_reactionCounts[reaction] ?? 1) - 1;
        _userReaction = null;
        _showPicker = false;
      });
      await SupabaseService.removeReaction(widget.contentType, widget.contentId);
    } else {
      setState(() {
        if (_userReaction != null) {
          _reactionCounts[_userReaction!] = (_reactionCounts[_userReaction!] ?? 1) - 1;
        }
        _reactionCounts[reaction] = (_reactionCounts[reaction] ?? 0) + 1;
        _userReaction = reaction;
        _showPicker = false;
      });
      await SupabaseService.setReaction(widget.contentType, widget.contentId, reaction);
    }
  }

  @override
  Widget build(BuildContext context) {
    final totalReactions = _reactionCounts.values.fold(0, (a, b) => a + b);
    final topReaction = _getTopReaction();

    return GestureDetector(
      onLongPress: () {
        HapticFeedback.mediumImpact();
        setState(() => _showPicker = true);
      },
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          // The card content
          widget.child,
          // Reaction area inside card bottom
          Container(
            margin: const EdgeInsets.only(right: 12),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: context.surfaceColor,
              borderRadius: const BorderRadius.vertical(bottom: Radius.circular(16)),
              border: Border(
                left: BorderSide(color: context.borderColor),
                right: BorderSide(color: context.borderColor),
                bottom: BorderSide(color: context.borderColor),
              ),
            ),
            child: _showPicker
                ? _buildPicker()
                : _buildReactionBadge(totalReactions, topReaction),
          ),
        ],
      ),
    );
  }

  Widget _buildPicker() {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(_reactions.length, (index) {
        final isSelected = _userReaction == _reactions[index];

        return GestureDetector(
          onTap: () => _handleReaction(_reactions[index]),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 150),
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(
              color: isSelected ? AppColors.yellow.withValues(alpha: 0.2) : Colors.transparent,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              _emojis[index],
              style: const TextStyle(fontSize: 22),
            ),
          ),
        );
      }),
    );
  }

  Widget _buildReactionBadge(int totalReactions, String? topReaction) {
    if (totalReactions == 0 && _userReaction == null) {
      return GestureDetector(
        onTap: () {
          HapticFeedback.lightImpact();
          setState(() => _showPicker = true);
        },
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.add_reaction_outlined, size: 16, color: context.mutedColor),
            const SizedBox(width: 4),
            Text(
              'React',
              style: TextStyle(color: context.mutedColor, fontSize: 12),
            ),
          ],
        ),
      );
    }

    return GestureDetector(
      onTap: () {
        HapticFeedback.lightImpact();
        setState(() => _showPicker = true);
      },
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            _getReactionEmoji(topReaction ?? _userReaction ?? 'thumbs_up'),
            style: const TextStyle(fontSize: 16),
          ),
          if (totalReactions > 0) ...[
            const SizedBox(width: 4),
            Text(
              '$totalReactions',
              style: TextStyle(
                color: context.mutedColor,
                fontSize: 12,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ],
      ),
    );
  }

  String? _getTopReaction() {
    String? top;
    int maxCount = 0;
    _reactionCounts.forEach((reaction, count) {
      if (count > maxCount) {
        maxCount = count;
        top = reaction;
      }
    });
    return top;
  }

  String _getReactionEmoji(String reaction) {
    switch (reaction) {
      case 'thumbs_up':
        return '👍';
      case 'heart':
        return '❤️';
      case 'thumbs_down':
        return '👎';
      case 'laugh':
        return '😂';
      default:
        return '👍';
    }
  }
}
