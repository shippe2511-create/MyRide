import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class QuickReplies extends StatelessWidget {
  final Function(String) onReplySelected;
  final bool isPickupPhase;

  const QuickReplies({
    super.key,
    required this.onReplySelected,
    this.isPickupPhase = true,
  });

  static const List<String> pickupReplies = [
    "I'm on my way!",
    "I'll be there in 5 minutes",
    "I've arrived at the pickup point",
    "Please come outside",
    "I'm in a white car",
    "Please share your exact location",
  ];

  static const List<String> tripReplies = [
    "We'll arrive in 5 minutes",
    "There's some traffic ahead",
    "Taking an alternate route",
    "Almost there!",
    "Thank you for riding with us",
  ];

  @override
  Widget build(BuildContext context) {
    final replies = isPickupPhase ? pickupReplies : tripReplies;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      height: 44,
      margin: const EdgeInsets.only(bottom: 8),
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: replies.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          return GestureDetector(
            onTap: () {
              HapticFeedback.lightImpact();
              onReplySelected(replies[index]);
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              decoration: BoxDecoration(
                color: isDark
                    ? Colors.white.withValues(alpha: 0.1)
                    : const Color(0xFFF5F5F5),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: isDark
                      ? Colors.white.withValues(alpha: 0.2)
                      : Colors.grey.shade300,
                ),
              ),
              alignment: Alignment.center,
              child: Text(
                replies[index],
                style: TextStyle(
                  fontSize: 14,
                  color: isDark ? Colors.white : Colors.black87,
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class QuickReplyButton extends StatelessWidget {
  final String text;
  final VoidCallback onTap;

  const QuickReplyButton({
    super.key,
    required this.text,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () {
          HapticFeedback.lightImpact();
          onTap();
        },
        borderRadius: BorderRadius.circular(20),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          decoration: BoxDecoration(
            color: isDark
                ? Colors.white.withValues(alpha: 0.1)
                : const Color(0xFFF5F5F5),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: isDark
                  ? Colors.white.withValues(alpha: 0.2)
                  : Colors.grey.shade300,
            ),
          ),
          child: Text(
            text,
            style: TextStyle(
              fontSize: 14,
              color: isDark ? Colors.white : Colors.black87,
            ),
          ),
        ),
      ),
    );
  }
}
