import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class SwipeActionCard extends StatefulWidget {
  final Widget child;
  final VoidCallback? onDelete;
  final VoidCallback? onEdit;
  final Color deleteColor;
  final Color editColor;
  final double actionWidth;

  const SwipeActionCard({
    super.key,
    required this.child,
    this.onDelete,
    this.onEdit,
    this.deleteColor = Colors.red,
    this.editColor = Colors.blue,
    this.actionWidth = 80,
  });

  @override
  State<SwipeActionCard> createState() => _SwipeActionCardState();
}

class _SwipeActionCardState extends State<SwipeActionCard>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  double _dragExtent = 0;
  bool _isDeleting = false;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 200),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _handleDragUpdate(DragUpdateDetails details) {
    setState(() {
      _dragExtent += details.delta.dx;
      // Only allow left swipe (negative values)
      _dragExtent = _dragExtent.clamp(-widget.actionWidth * 2, 0);
    });

    if (_dragExtent.abs() > widget.actionWidth * 0.5) {
      HapticFeedback.selectionClick();
    }
  }

  void _handleDragEnd(DragEndDetails details) {
    if (_dragExtent.abs() > widget.actionWidth) {
      // Snap to show actions
      setState(() {
        _dragExtent = -widget.actionWidth;
      });
    } else {
      // Snap back
      setState(() {
        _dragExtent = 0;
      });
    }
  }

  void _resetPosition() {
    setState(() {
      _dragExtent = 0;
    });
  }

  void _handleDelete() async {
    HapticFeedback.mediumImpact();
    setState(() => _isDeleting = true);

    // Animate out
    await Future.delayed(const Duration(milliseconds: 200));
    widget.onDelete?.call();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      height: _isDeleting ? 0 : null,
      child: Stack(
        children: [
          // Action buttons (revealed on swipe)
          Positioned.fill(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                if (widget.onEdit != null)
                  GestureDetector(
                    onTap: () {
                      HapticFeedback.lightImpact();
                      _resetPosition();
                      widget.onEdit?.call();
                    },
                    child: Container(
                      width: widget.actionWidth,
                      color: widget.editColor,
                      child: const Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.edit, color: Colors.white),
                          SizedBox(height: 4),
                          Text(
                            'Edit',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                if (widget.onDelete != null)
                  GestureDetector(
                    onTap: _handleDelete,
                    child: Container(
                      width: widget.actionWidth,
                      color: widget.deleteColor,
                      child: const Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.delete, color: Colors.white),
                          SizedBox(height: 4),
                          Text(
                            'Delete',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),

          // Main content
          GestureDetector(
            onHorizontalDragUpdate: _handleDragUpdate,
            onHorizontalDragEnd: _handleDragEnd,
            onTap: _dragExtent != 0 ? _resetPosition : null,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 100),
              transform: Matrix4.translationValues(_dragExtent, 0, 0),
              decoration: BoxDecoration(
                color: isDark ? const Color(0xFF1A1A1A) : Colors.white,
              ),
              child: widget.child,
            ),
          ),
        ],
      ),
    );
  }
}

class SwipeToCancelCard extends StatefulWidget {
  final Widget child;
  final VoidCallback onCancel;
  final String cancelText;

  const SwipeToCancelCard({
    super.key,
    required this.child,
    required this.onCancel,
    this.cancelText = 'Cancel',
  });

  @override
  State<SwipeToCancelCard> createState() => _SwipeToCancelCardState();
}

class _SwipeToCancelCardState extends State<SwipeToCancelCard> {
  double _dragExtent = 0;
  bool _isCancelling = false;

  double get _maxDrag => MediaQuery.of(context).size.width * 0.4;
  double get _progress => (_dragExtent.abs() / _maxDrag).clamp(0, 1);

  void _handleDragUpdate(DragUpdateDetails details) {
    setState(() {
      _dragExtent += details.delta.dx;
      _dragExtent = _dragExtent.clamp(-_maxDrag, 0);
    });

    if (_progress > 0.7 && !_isCancelling) {
      HapticFeedback.mediumImpact();
    }
  }

  void _handleDragEnd(DragEndDetails details) {
    if (_progress >= 0.7) {
      HapticFeedback.heavyImpact();
      setState(() => _isCancelling = true);
      widget.onCancel();
    } else {
      setState(() => _dragExtent = 0);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        // Cancel indicator
        Positioned.fill(
          child: Container(
            color: Colors.red.withValues(alpha: _progress * 0.8),
            alignment: Alignment.centerRight,
            padding: const EdgeInsets.only(right: 30),
            child: AnimatedOpacity(
              duration: const Duration(milliseconds: 100),
              opacity: _progress,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    _progress >= 0.7 ? Icons.close : Icons.swipe_left,
                    color: Colors.white,
                    size: 28,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    _progress >= 0.7 ? 'Release to ${widget.cancelText}' : 'Swipe to ${widget.cancelText}',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),

        // Main content
        GestureDetector(
          onHorizontalDragUpdate: _handleDragUpdate,
          onHorizontalDragEnd: _handleDragEnd,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 100),
            transform: Matrix4.translationValues(_dragExtent, 0, 0),
            child: widget.child,
          ),
        ),
      ],
    );
  }
}
