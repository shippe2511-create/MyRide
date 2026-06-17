import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/driver_state.dart';
import '../theme/app_theme.dart';

class RatingsScreen extends StatelessWidget {
  const RatingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.bgColor,
      appBar: AppBar(
        backgroundColor: context.bgColor,
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: context.textColor),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text('Ratings & Feedback', style: TextStyle(color: context.textColor)),
      ),
      body: Consumer<DriverState>(
        builder: (context, state, _) {
          return SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(
              children: [
                // Overall rating card
                _buildOverallRating(context, state),
                const SizedBox(height: 20),

                // Rating breakdown
                _buildRatingBreakdown(context),
                const SizedBox(height: 20),

                // Recent feedback
                _buildRecentFeedback(context),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildOverallRating(BuildContext context, DriverState state) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            AppColors.yellow.withValues(alpha: 0.15),
            AppColors.yellow.withValues(alpha: 0.05),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.yellow.withValues(alpha: 0.3)),
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                state.rating.toStringAsFixed(1),
                style: TextStyle(
                  color: context.textColor,
                  fontSize: 56,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: List.generate(5, (i) {
                      return Icon(
                        i < state.rating.round() ? Icons.star_rounded : Icons.star_outline_rounded,
                        color: AppColors.yellow,
                        size: 24,
                      );
                    }),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${state.totalTrips} trips completed',
                    style: TextStyle(
                      color: context.mutedColor,
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: BoxDecoration(
              color: AppColors.success.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.trending_up, color: AppColors.success, size: 20),
                const SizedBox(width: 8),
                Text(
                  'Top rated driver this month!',
                  style: TextStyle(
                    color: AppColors.success,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRatingBreakdown(BuildContext context) {
    final breakdown = [
      {'stars': 5, 'count': 142, 'percent': 0.85},
      {'stars': 4, 'count': 18, 'percent': 0.11},
      {'stars': 3, 'count': 5, 'percent': 0.03},
      {'stars': 2, 'count': 1, 'percent': 0.006},
      {'stars': 1, 'count': 0, 'percent': 0.0},
    ];

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: context.cardColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Rating Breakdown',
            style: TextStyle(
              color: context.textColor,
              fontSize: 16,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 16),
          ...breakdown.map((item) => Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Row(
              children: [
                SizedBox(
                  width: 20,
                  child: Text(
                    '${item['stars']}',
                    style: TextStyle(
                      color: context.textColor,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                Icon(Icons.star_rounded, color: AppColors.yellow, size: 18),
                const SizedBox(width: 12),
                Expanded(
                  child: Stack(
                    children: [
                      Container(
                        height: 8,
                        decoration: BoxDecoration(
                          color: context.borderColor,
                          borderRadius: BorderRadius.circular(4),
                        ),
                      ),
                      FractionallySizedBox(
                        widthFactor: (item['percent'] as double),
                        child: Container(
                          height: 8,
                          decoration: BoxDecoration(
                            color: AppColors.yellow,
                            borderRadius: BorderRadius.circular(4),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                SizedBox(
                  width: 35,
                  child: Text(
                    '${item['count']}',
                    style: TextStyle(
                      color: context.mutedColor,
                      fontSize: 13,
                    ),
                    textAlign: TextAlign.right,
                  ),
                ),
              ],
            ),
          )),
        ],
      ),
    );
  }

  Widget _buildRecentFeedback(BuildContext context) {
    final feedback = [
      {'name': 'Ahmed Ali', 'rating': 5, 'comment': 'Very professional and punctual. Great service!', 'date': 'Today'},
      {'name': 'Fathimath H.', 'rating': 5, 'comment': 'Safe driving, very courteous.', 'date': 'Yesterday'},
      {'name': 'Mohamed I.', 'rating': 4, 'comment': 'Good trip, arrived on time.', 'date': '2 days ago'},
      {'name': 'Aishath M.', 'rating': 5, 'comment': 'Excellent service! Helped with luggage.', 'date': '3 days ago'},
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Recent Feedback',
          style: TextStyle(
            color: context.textColor,
            fontSize: 16,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 12),
        ...feedback.map((item) => Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: context.cardColor,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: context.borderColor),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: AppColors.yellow.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Center(
                      child: Text(
                        (item['name'] as String).substring(0, 1),
                        style: TextStyle(
                          color: AppColors.yellow,
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          item['name'] as String,
                          style: TextStyle(
                            color: context.textColor,
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        Row(
                          children: [
                            ...List.generate(item['rating'] as int, (_) =>
                              Icon(Icons.star_rounded, color: AppColors.yellow, size: 14),
                            ),
                            const SizedBox(width: 8),
                            Text(
                              item['date'] as String,
                              style: TextStyle(
                                color: context.mutedColor,
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
              if ((item['comment'] as String).isNotEmpty) ...[
                const SizedBox(height: 12),
                Text(
                  '"${item['comment']}"',
                  style: TextStyle(
                    color: context.textColor,
                    fontSize: 14,
                    fontStyle: FontStyle.italic,
                  ),
                ),
              ],
            ],
          ),
        )),
      ],
    );
  }
}
