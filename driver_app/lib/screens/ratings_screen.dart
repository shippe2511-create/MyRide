import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/driver_state.dart';
import '../theme/app_theme.dart';
import '../services/supabase_service.dart';
import '../widgets/shimmer_loading.dart';

class RatingsScreen extends StatefulWidget {
  const RatingsScreen({super.key});

  @override
  State<RatingsScreen> createState() => _RatingsScreenState();
}

class _RatingsScreenState extends State<RatingsScreen> {
  bool _isLoading = true;
  List<Map<String, dynamic>> _recentFeedback = [];
  Map<int, int> _ratingBreakdown = {5: 0, 4: 0, 3: 0, 2: 0, 1: 0};
  int _totalRatings = 0;

  @override
  void initState() {
    super.initState();
    _loadRatings();
  }

  Future<void> _loadRatings() async {
    setState(() => _isLoading = true);
    try {
      final driverId = SupabaseService.driverId;
      if (driverId == null) {
        setState(() => _isLoading = false);
        return;
      }

      final ratings = await SupabaseService.getDriverRatings(driverId);

      // Calculate breakdown
      final breakdown = {5: 0, 4: 0, 3: 0, 2: 0, 1: 0};
      for (final rating in ratings) {
        final stars = (rating['rating'] as num?)?.toInt() ?? 5;
        breakdown[stars] = (breakdown[stars] ?? 0) + 1;
      }

      setState(() {
        _ratingBreakdown = breakdown;
        _totalRatings = ratings.length;
        _recentFeedback = ratings.take(10).toList();
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.bgColor,
      body: _isLoading
          ? const ShimmerList(itemCount: 5)
          : RefreshIndicator(
              onRefresh: _loadRatings,
              color: AppColors.yellow,
              child: Consumer<DriverState>(
                builder: (context, state, _) {
                  return CustomScrollView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    slivers: [
                      SliverAppBar(
                        backgroundColor: context.bgColor,
                        floating: true,
                        snap: true,
                        leading: IconButton(
                          icon: Icon(Icons.arrow_back, color: context.textColor),
                          onPressed: () => Navigator.pop(context),
                        ),
                        title: Text('Ratings & Feedback', style: TextStyle(color: context.textColor)),
                      ),
                      SliverPadding(
                        padding: const EdgeInsets.all(20),
                        sliver: SliverList(
                          delegate: SliverChildListDelegate([
                            _buildOverallRating(context, state),
                            const SizedBox(height: 20),
                            _buildRatingBreakdown(context),
                            const SizedBox(height: 20),
                            _buildRecentFeedback(context),
                          ]),
                        ),
                      ),
                    ],
                  );
                },
              ),
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
              Icon(Icons.star_rounded, color: AppColors.yellow, size: 48),
              const SizedBox(width: 12),
              Text(
                state.rating.toStringAsFixed(1),
                style: TextStyle(
                  color: context.textColor,
                  fontSize: 48,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            '$_totalRatings total ratings',
            style: TextStyle(
              color: context.mutedColor,
              fontSize: 14,
            ),
          ),
          if (state.rating >= 4.8) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: AppColors.success.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.workspace_premium, color: AppColors.success, size: 16),
                  const SizedBox(width: 6),
                  Text(
                    'Top rated driver!',
                    style: TextStyle(
                      color: AppColors.success,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildRatingBreakdown(BuildContext context) {
    final breakdown = [5, 4, 3, 2, 1].map((stars) {
      final count = _ratingBreakdown[stars] ?? 0;
      final percent = _totalRatings > 0 ? count / _totalRatings : 0.0;
      return {'stars': stars, 'count': count, 'percent': percent};
    }).toList();

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
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: (item['percent'] as double),
                      backgroundColor: context.borderColor,
                      valueColor: AlwaysStoppedAnimation(AppColors.yellow),
                      minHeight: 8,
                    ),
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
    if (_recentFeedback.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: context.cardColor,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: context.borderColor),
        ),
        child: Column(
          children: [
            Icon(Icons.rate_review_outlined, color: context.mutedColor, size: 48),
            const SizedBox(height: 12),
            Text(
              'No feedback yet',
              style: TextStyle(color: context.mutedColor, fontSize: 14),
            ),
          ],
        ),
      );
    }

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
        ..._recentFeedback.map((item) {
          final customerName = item['from_user']?['full_name'] ?? 'Customer';
          final rating = (item['rating'] as num?)?.toInt() ?? 5;
          final comment = item['comment'] as String?;
          final createdAt = DateTime.tryParse(item['created_at'] ?? '')?.toLocal();
          final timeAgo = createdAt != null ? _formatTimeAgo(createdAt) : '';

          return Container(
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
                          customerName.substring(0, 1).toUpperCase(),
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
                            customerName,
                            style: TextStyle(
                              color: context.textColor,
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          Row(
                            children: [
                              ...List.generate(5, (i) => Icon(
                                i < rating ? Icons.star_rounded : Icons.star_outline_rounded,
                                color: AppColors.yellow,
                                size: 14,
                              )),
                              const SizedBox(width: 8),
                              Text(
                                timeAgo,
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
                if (comment != null && comment.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Text(
                    comment,
                    style: TextStyle(
                      color: context.textColor,
                      fontSize: 13,
                      height: 1.4,
                    ),
                  ),
                ],
              ],
            ),
          );
        }),
      ],
    );
  }

  String _formatTimeAgo(DateTime time) {
    final now = DateTime.now();
    final diff = now.difference(time);
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays == 1) return 'Yesterday';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return '${time.day}/${time.month}';
  }
}
