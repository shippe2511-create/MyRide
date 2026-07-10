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
  OverlayEntry? _overlayEntry;

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

  void _showReactionPicker(BuildContext context, Offset position) {
    HapticFeedback.mediumImpact();
    _overlayEntry = OverlayEntry(
      builder: (context) => _ReactionOverlay(
        position: position,
        userReaction: _userReaction,
        onSelect: (reaction) {
          _handleReaction(reaction);
          _hideOverlay();
        },
        onDismiss: _hideOverlay,
      ),
    );
    Overlay.of(context).insert(_overlayEntry!);
    setState(() => _showPicker = true);
  }

  void _hideOverlay() {
    _overlayEntry?.remove();
    _overlayEntry = null;
    if (mounted) {
      setState(() => _showPicker = false);
    }
  }

  Future<void> _handleReaction(String reaction) async {
    HapticFeedback.lightImpact();

    if (_userReaction == reaction) {
      // Remove reaction if tapping same one
      setState(() {
        _reactionCounts[reaction] = (_reactionCounts[reaction] ?? 1) - 1;
        _userReaction = null;
      });
      await SupabaseService.removeReaction(widget.contentType, widget.contentId);
    } else {
      // Update reaction
      setState(() {
        if (_userReaction != null) {
          _reactionCounts[_userReaction!] = (_reactionCounts[_userReaction!] ?? 1) - 1;
        }
        _reactionCounts[reaction] = (_reactionCounts[reaction] ?? 0) + 1;
        _userReaction = reaction;
      });
      await SupabaseService.setReaction(widget.contentType, widget.contentId, reaction);
    }
  }

  @override
  void dispose() {
    _hideOverlay();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final totalReactions = _reactionCounts.values.fold(0, (a, b) => a + b);
    final topReaction = _getTopReaction();

    return GestureDetector(
      onLongPressStart: (details) {
        _showReactionPicker(context, details.globalPosition);
      },
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          widget.child,
          if (totalReactions > 0 || _userReaction != null)
            Padding(
              padding: const EdgeInsets.only(left: 12, right: 12, bottom: 8),
              child: GestureDetector(
                onTap: () {
                  final box = context.findRenderObject() as RenderBox;
                  final position = box.localToGlobal(Offset(box.size.width / 2, 0));
                  _showReactionPicker(context, position);
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: context.surfaceColor,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: context.borderColor),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        _getReactionEmoji(topReaction ?? _userReaction ?? 'thumbs_up'),
                        style: const TextStyle(fontSize: 14),
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
                ),
              ),
            ),
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

class _ReactionOverlay extends StatefulWidget {
  final Offset position;
  final String? userReaction;
  final Function(String) onSelect;
  final VoidCallback onDismiss;

  const _ReactionOverlay({
    required this.position,
    required this.userReaction,
    required this.onSelect,
    required this.onDismiss,
  });

  @override
  State<_ReactionOverlay> createState() => _ReactionOverlayState();
}

class _ReactionOverlayState extends State<_ReactionOverlay> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scaleAnimation;
  int? _hoveredIndex;

  static const _reactions = ['thumbs_up', 'heart', 'thumbs_down', 'laugh'];
  static const _emojis = ['👍', '❤️', '👎', '😂'];

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 200),
      vsync: this,
    );
    _scaleAnimation = CurvedAnimation(parent: _controller, curve: Curves.easeOutBack);
    _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final screenWidth = MediaQuery.of(context).size.width;
    final pickerWidth = 200.0;

    // Calculate position to keep picker on screen
    double left = widget.position.dx - pickerWidth / 2;
    if (left < 16) left = 16;
    if (left + pickerWidth > screenWidth - 16) left = screenWidth - pickerWidth - 16;

    return Stack(
      children: [
        // Dismiss layer
        Positioned.fill(
          child: GestureDetector(
            onTap: widget.onDismiss,
            behavior: HitTestBehavior.opaque,
            child: Container(color: Colors.transparent),
          ),
        ),
        // Reaction picker
        Positioned(
          left: left,
          top: widget.position.dy - 70,
          child: ScaleTransition(
            scale: _scaleAnimation,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.black,
                borderRadius: BorderRadius.circular(28),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.3),
                    blurRadius: 20,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: List.generate(_reactions.length, (index) {
                  final isSelected = widget.userReaction == _reactions[index];
                  final isHovered = _hoveredIndex == index;

                  return GestureDetector(
                    onTap: () => widget.onSelect(_reactions[index]),
                    onTapDown: (_) => setState(() => _hoveredIndex = index),
                    onTapUp: (_) => setState(() => _hoveredIndex = null),
                    onTapCancel: () => setState(() => _hoveredIndex = null),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 150),
                      padding: const EdgeInsets.all(8),
                      transform: Matrix4.identity()
                        ..scale(isHovered ? 1.3 : (isSelected ? 1.15 : 1.0)),
                      transformAlignment: Alignment.center,
                      child: Text(
                        _emojis[index],
                        style: TextStyle(
                          fontSize: 28,
                          shadows: isSelected ? [
                            Shadow(
                              color: AppColors.yellow.withValues(alpha: 0.5),
                              blurRadius: 10,
                            ),
                          ] : null,
                        ),
                      ),
                    ),
                  );
                }),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
