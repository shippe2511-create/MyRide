import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../services/supabase_service.dart';
import '../theme/app_theme.dart';

class DriverStatsScreen extends StatefulWidget {
  final String driverId;

  const DriverStatsScreen({super.key, required this.driverId});

  @override
  State<DriverStatsScreen> createState() => _DriverStatsScreenState();
}

class _DriverStatsScreenState extends State<DriverStatsScreen> {
  Map<String, dynamic> _stats = {};
  List<Map<String, dynamic>> _recentRides = [];
  bool _isLoading = true;
  String _period = 'today';

  @override
  void initState() {
    super.initState();
    _loadStats();
  }

  Future<void> _loadStats() async {
    setState(() => _isLoading = true);
    try {
      final stats = await SupabaseService.getDriverStats(widget.driverId, _period);
      final rides = await SupabaseService.getCompletedRidesForDriver(widget.driverId, _period);
      setState(() {
        _stats = stats;
        _recentRides = rides;
        _isLoading = false;
      });
    } catch (e) {
      debugPrint('Error loading stats: $e');
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bgColor = isDark ? const Color(0xFF0A0A0C) : const Color(0xFFF5F5F7);
    final textColor = isDark ? Colors.white : Colors.black;
    final mutedColor = isDark ? Colors.white60 : Colors.black54;

    return Scaffold(
      backgroundColor: bgColor,
      appBar: AppBar(
        backgroundColor: bgColor,
        elevation: 0,
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: textColor),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text(
          'My Stats',
          style: TextStyle(color: textColor, fontWeight: FontWeight.w700),
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: AppColors.yellow))
          : RefreshIndicator(
              onRefresh: _loadStats,
              color: AppColors.yellow,
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildPeriodSelector(isDark, textColor),
                    const SizedBox(height: 20),
                    _buildStatsCard(isDark, textColor, mutedColor),
                    const SizedBox(height: 20),
                    _buildStatsGrid(isDark, textColor, mutedColor),
                    const SizedBox(height: 24),
                    Text(
                      'Recent Rides',
                      style: TextStyle(color: textColor, fontSize: 18, fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 12),
                    ..._recentRides.map((ride) => _buildRideItem(ride, isDark, textColor, mutedColor)),
                    if (_recentRides.isEmpty)
                      Center(
                        child: Padding(
                          padding: const EdgeInsets.all(32),
                          child: Column(
                            children: [
                              Icon(Icons.directions_car_outlined, size: 48, color: mutedColor),
                              const SizedBox(height: 12),
                              Text('No rides in this period', style: TextStyle(color: mutedColor)),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
    );
  }

  Widget _buildPeriodSelector(bool isDark, Color textColor) {
    final periods = [
      {'key': 'today', 'label': 'Today'},
      {'key': 'week', 'label': 'This Week'},
      {'key': 'month', 'label': 'This Month'},
    ];

    return Row(
      children: periods.map((p) {
        final isSelected = _period == p['key'];
        return Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: GestureDetector(
              onTap: () {
                setState(() => _period = p['key']!);
                _loadStats();
              },
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 12),
                decoration: BoxDecoration(
                  color: isSelected ? AppColors.yellow : (isDark ? Colors.white.withValues(alpha: 0.05) : Colors.black.withValues(alpha: 0.05)),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Center(
                  child: Text(
                    p['label']!,
                    style: TextStyle(
                      color: isSelected ? AppColors.darkBg : textColor,
                      fontWeight: FontWeight.w600,
                      fontSize: 13,
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _buildStatsCard(bool isDark, Color textColor, Color mutedColor) {
    final totalRides = _stats['total_rides'] ?? 0;
    final totalDistance = _stats['total_distance'] ?? 0.0;
    final totalDuration = _stats['total_duration'] ?? 0;

    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [AppColors.yellow, Color(0xFFFFE066)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: AppColors.yellow.withValues(alpha: 0.3),
            blurRadius: 20,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _period == 'today' ? 'Today\'s Summary' : _period == 'week' ? 'This Week' : 'This Month',
            style: TextStyle(color: AppColors.darkBg.withValues(alpha: 0.7), fontSize: 14, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 8),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '$totalRides',
                style: const TextStyle(color: AppColors.darkBg, fontSize: 48, fontWeight: FontWeight.w800),
              ),
              const SizedBox(width: 8),
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Text(
                  'rides completed',
                  style: TextStyle(color: AppColors.darkBg.withValues(alpha: 0.7), fontSize: 16),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              _buildMiniStat(Icons.route, '${totalDistance.toStringAsFixed(1)} km', 'Distance'),
              const SizedBox(width: 24),
              _buildMiniStat(Icons.schedule, '$totalDuration min', 'Duration'),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildMiniStat(IconData icon, String value, String label) {
    return Row(
      children: [
        Icon(icon, size: 18, color: AppColors.darkBg.withValues(alpha: 0.7)),
        const SizedBox(width: 6),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(value, style: const TextStyle(color: AppColors.darkBg, fontSize: 14, fontWeight: FontWeight.w700)),
            Text(label, style: TextStyle(color: AppColors.darkBg.withValues(alpha: 0.6), fontSize: 11)),
          ],
        ),
      ],
    );
  }

  Widget _buildStatsGrid(bool isDark, Color textColor, Color mutedColor) {
    final avgRating = _stats['avg_rating'] ?? 5.0;
    final completionRate = _stats['completion_rate'] ?? 100;

    return Row(
      children: [
        Expanded(child: _buildStatCard('Avg Rating', avgRating.toStringAsFixed(1), Icons.star, Colors.amber, isDark, textColor)),
        const SizedBox(width: 12),
        Expanded(child: _buildStatCard('Completion', '$completionRate%', Icons.check_circle, Colors.green, isDark, textColor)),
      ],
    );
  }

  Widget _buildStatCard(String label, String value, IconData icon, Color iconColor, bool isDark, Color textColor) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? Colors.white.withValues(alpha: 0.05) : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: isDark ? Colors.white.withValues(alpha: 0.1) : Colors.black.withValues(alpha: 0.05)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: iconColor, size: 24),
          const SizedBox(height: 12),
          Text(value, style: TextStyle(color: textColor, fontSize: 24, fontWeight: FontWeight.w800)),
          Text(label, style: TextStyle(color: textColor.withValues(alpha: 0.6), fontSize: 12)),
        ],
      ),
    );
  }

  Widget _buildRideItem(Map<String, dynamic> ride, bool isDark, Color textColor, Color mutedColor) {
    final createdAt = DateTime.tryParse(ride['created_at'] ?? '');
    final pickupName = ride['pickup_name'] ?? 'Unknown';
    final dropoffName = ride['dropoff_name'] ?? 'Unknown';
    final distance = ride['distance_km'] ?? 0.0;
    final duration = ride['duration_minutes'] ?? 0;
    final customer = ride['customer'] as Map<String, dynamic>?;
    final customerName = customer?['full_name'] ?? 'Customer';

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? Colors.white.withValues(alpha: 0.05) : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: isDark ? Colors.white.withValues(alpha: 0.1) : Colors.black.withValues(alpha: 0.05)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                createdAt != null ? DateFormat('MMM d · h:mm a').format(createdAt) : '',
                style: TextStyle(color: mutedColor, fontSize: 12),
              ),
              Row(
                children: [
                  Icon(Icons.route, size: 14, color: mutedColor),
                  const SizedBox(width: 4),
                  Text('${distance.toStringAsFixed(1)} km', style: TextStyle(color: mutedColor, fontSize: 12)),
                  const SizedBox(width: 12),
                  Icon(Icons.schedule, size: 14, color: mutedColor),
                  const SizedBox(width: 4),
                  Text('$duration min', style: TextStyle(color: mutedColor, fontSize: 12)),
                ],
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Icon(Icons.circle, size: 8, color: AppColors.yellow),
              const SizedBox(width: 8),
              Expanded(
                child: Text(pickupName, style: TextStyle(color: textColor, fontSize: 13), maxLines: 1, overflow: TextOverflow.ellipsis),
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.only(left: 3),
            child: Container(width: 2, height: 16, color: mutedColor.withValues(alpha: 0.3)),
          ),
          Row(
            children: [
              Icon(Icons.location_on, size: 12, color: Colors.red),
              const SizedBox(width: 6),
              Expanded(
                child: Text(dropoffName, style: TextStyle(color: textColor, fontSize: 13), maxLines: 1, overflow: TextOverflow.ellipsis),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text('Customer: $customerName', style: TextStyle(color: mutedColor, fontSize: 12)),
        ],
      ),
    );
  }
}
