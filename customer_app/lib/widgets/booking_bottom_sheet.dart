import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class BookingBottomSheet extends StatefulWidget {
  final String? pickupAddress;
  final String? dropoffAddress;
  final VoidCallback? onPickupTap;
  final VoidCallback? onDropoffTap;
  final VoidCallback? onConfirm;
  final bool isLoading;
  final Widget? additionalContent;

  const BookingBottomSheet({
    super.key,
    this.pickupAddress,
    this.dropoffAddress,
    this.onPickupTap,
    this.onDropoffTap,
    this.onConfirm,
    this.isLoading = false,
    this.additionalContent,
  });

  @override
  State<BookingBottomSheet> createState() => _BookingBottomSheetState();
}

class _BookingBottomSheetState extends State<BookingBottomSheet> {
  final DraggableScrollableController _controller = DraggableScrollableController();
  double _currentExtent = 0.35;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bottomPadding = MediaQuery.of(context).viewPadding.bottom;

    return DraggableScrollableSheet(
      controller: _controller,
      initialChildSize: 0.35,
      minChildSize: 0.2,
      maxChildSize: 0.85,
      snap: true,
      snapSizes: const [0.2, 0.35, 0.6, 0.85],
      builder: (context, scrollController) {
        return Container(
          decoration: BoxDecoration(
            color: isDark ? const Color(0xFF1A1A1A) : Colors.white,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.15),
                blurRadius: 20,
                offset: const Offset(0, -5),
              ),
            ],
          ),
          child: ListView(
            controller: scrollController,
            padding: EdgeInsets.only(bottom: bottomPadding + 20),
            children: [
              // Handle
              Center(
                child: Container(
                  margin: const EdgeInsets.only(top: 12, bottom: 8),
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: isDark ? Colors.white24 : Colors.black12,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),

              // Title
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Text(
                  'Where to?',
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w700,
                    color: isDark ? Colors.white : Colors.black,
                  ),
                ),
              ),

              const SizedBox(height: 16),

              // Location inputs
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Container(
                  decoration: BoxDecoration(
                    color: isDark ? Colors.white.withValues(alpha: 0.05) : const Color(0xFFF5F5F5),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: isDark ? Colors.white.withValues(alpha: 0.1) : Colors.grey.shade200,
                    ),
                  ),
                  child: Column(
                    children: [
                      // Pickup
                      _LocationTile(
                        icon: Icons.circle,
                        iconColor: const Color(0xFFFFD60A),
                        iconSize: 12,
                        hint: 'Pickup location',
                        address: widget.pickupAddress,
                        onTap: widget.onPickupTap,
                        isDark: isDark,
                      ),

                      Divider(
                        height: 1,
                        indent: 52,
                        color: isDark ? Colors.white12 : Colors.grey.shade200,
                      ),

                      // Dropoff
                      _LocationTile(
                        icon: Icons.location_on,
                        iconColor: Colors.red,
                        hint: 'Where are you going?',
                        address: widget.dropoffAddress,
                        onTap: widget.onDropoffTap,
                        isDark: isDark,
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 20),

              // Additional content (like saved places, recent rides)
              if (widget.additionalContent != null) widget.additionalContent!,

              // Quick suggestions
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Saved Places',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        color: isDark ? Colors.white : Colors.black,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        _QuickPlaceChip(
                          icon: Icons.home,
                          label: 'Home',
                          onTap: () {
                            HapticFeedback.lightImpact();
                          },
                          isDark: isDark,
                        ),
                        const SizedBox(width: 10),
                        _QuickPlaceChip(
                          icon: Icons.work,
                          label: 'Work',
                          onTap: () {
                            HapticFeedback.lightImpact();
                          },
                          isDark: isDark,
                        ),
                        const SizedBox(width: 10),
                        _QuickPlaceChip(
                          icon: Icons.add,
                          label: 'Add',
                          onTap: () {
                            HapticFeedback.lightImpact();
                          },
                          isDark: isDark,
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 24),

              // Confirm button
              if (widget.pickupAddress != null && widget.dropoffAddress != null)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: _ConfirmButton(
                    onTap: widget.onConfirm,
                    isLoading: widget.isLoading,
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

class _LocationTile extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final double iconSize;
  final String hint;
  final String? address;
  final VoidCallback? onTap;
  final bool isDark;

  const _LocationTile({
    required this.icon,
    required this.iconColor,
    this.iconSize = 20,
    required this.hint,
    this.address,
    this.onTap,
    required this.isDark,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () {
        HapticFeedback.selectionClick();
        onTap?.call();
      },
      borderRadius: BorderRadius.circular(16),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: iconColor.withValues(alpha: 0.15),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, color: iconColor, size: iconSize),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                address ?? hint,
                style: TextStyle(
                  fontSize: 15,
                  color: address != null
                      ? (isDark ? Colors.white : Colors.black)
                      : (isDark ? Colors.white54 : Colors.black45),
                  fontWeight: address != null ? FontWeight.w500 : FontWeight.normal,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            if (address != null)
              Icon(
                Icons.close,
                size: 18,
                color: isDark ? Colors.white38 : Colors.black38,
              ),
          ],
        ),
      ),
    );
  }
}

class _QuickPlaceChip extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool isDark;

  const _QuickPlaceChip({
    required this.icon,
    required this.label,
    required this.onTap,
    required this.isDark,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: isDark ? Colors.white.withValues(alpha: 0.08) : const Color(0xFFF0F0F0),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: isDark ? Colors.white12 : Colors.grey.shade300,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 18, color: isDark ? Colors.white70 : Colors.black54),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w500,
                color: isDark ? Colors.white : Colors.black87,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ConfirmButton extends StatelessWidget {
  final VoidCallback? onTap;
  final bool isLoading;

  const _ConfirmButton({this.onTap, this.isLoading = false});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: isLoading ? null : () {
        HapticFeedback.mediumImpact();
        onTap?.call();
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        height: 56,
        decoration: BoxDecoration(
          color: const Color(0xFFFFD60A),
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: const Color(0xFFFFD60A).withValues(alpha: 0.4),
              blurRadius: 16,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Center(
          child: isLoading
              ? const SizedBox(
                  width: 24,
                  height: 24,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.5,
                    valueColor: AlwaysStoppedAnimation(Colors.black),
                  ),
                )
              : const Text(
                  'Confirm Ride',
                  style: TextStyle(
                    color: Colors.black,
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                ),
        ),
      ),
    );
  }
}
