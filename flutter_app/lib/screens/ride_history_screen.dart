import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../services/supabase_service.dart';
import '../theme/app_theme.dart';
import '../widgets/glass_container.dart';

class RideHistoryScreen extends StatefulWidget {
  final String? customerId;

  const RideHistoryScreen({super.key, this.customerId});

  @override
  State<RideHistoryScreen> createState() => _RideHistoryScreenState();
}

class _RideHistoryScreenState extends State<RideHistoryScreen> {
  List<Map<String, dynamic>> _rides = [];
  bool _isLoading = true;
  String _filter = 'all';

  @override
  void initState() {
    super.initState();
    _loadRides();
  }

  Future<void> _loadRides() async {
    setState(() => _isLoading = true);
    try {
      final rides = await SupabaseService.getRideHistory(widget.customerId);
      setState(() {
        _rides = rides;
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
    }
  }

  List<Map<String, dynamic>> get _filteredRides {
    if (_filter == 'all') return _rides;
    return _rides.where((r) => r['status'] == _filter).toList();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = context.isDark;

    return Scaffold(
      backgroundColor: context.bgColor,
      appBar: AppBar(
        backgroundColor: context.bgColor,
        elevation: 0,
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: context.textColor),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text(
          'Ride History',
          style: TextStyle(color: context.textColor, fontWeight: FontWeight.w700),
        ),
      ),
      body: Column(
        children: [
          _buildFilterChips(isDark),
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator(color: AppColors.yellow))
                : _filteredRides.isEmpty
                    ? _buildEmptyState()
                    : RefreshIndicator(
                        onRefresh: _loadRides,
                        color: AppColors.yellow,
                        child: ListView.builder(
                          padding: const EdgeInsets.all(16),
                          itemCount: _filteredRides.length,
                          itemBuilder: (context, index) => _buildRideCard(_filteredRides[index], isDark),
                        ),
                      ),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterChips(bool isDark) {
    final filters = [
      {'key': 'all', 'label': 'All'},
      {'key': 'completed', 'label': 'Completed'},
      {'key': 'cancelled', 'label': 'Cancelled'},
    ];

    return Container(
      height: 50,
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: ListView(
        scrollDirection: Axis.horizontal,
        children: filters.map((f) {
          final isSelected = _filter == f['key'];
          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: FilterChip(
              selected: isSelected,
              label: Text(f['label']!),
              labelStyle: TextStyle(
                color: isSelected ? AppColors.bgDark : context.textColor,
                fontWeight: FontWeight.w600,
              ),
              backgroundColor: isDark ? Colors.white.withValues(alpha: 0.05) : Colors.black.withValues(alpha: 0.05),
              selectedColor: AppColors.yellow,
              checkmarkColor: AppColors.bgDark,
              onSelected: (_) => setState(() => _filter = f['key']!),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.directions_car_outlined, size: 64, color: context.mutedColor),
          const SizedBox(height: 16),
          Text(
            'No rides yet',
            style: TextStyle(color: context.textColor, fontSize: 18, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 8),
          Text(
            'Your ride history will appear here',
            style: TextStyle(color: context.mutedColor, fontSize: 14),
          ),
        ],
      ),
    );
  }

  Widget _buildRideCard(Map<String, dynamic> ride, bool isDark) {
    final status = ride['status'] as String? ?? 'unknown';
    final createdAt = DateTime.tryParse(ride['created_at'] ?? '');
    final pickupName = ride['pickup_name'] ?? 'Unknown';
    final dropoffName = ride['dropoff_name'] ?? 'Unknown';
    final driver = ride['driver'] as Map<String, dynamic>?;
    final driverProfile = driver?['profile'] as Map<String, dynamic>?;
    final driverName = driverProfile?['full_name'] ?? 'Unknown Driver';
    final rating = ride['rating'] as int?;

    Color statusColor;
    IconData statusIcon;
    switch (status) {
      case 'completed':
        statusColor = Colors.green;
        statusIcon = Icons.check_circle;
        break;
      case 'cancelled':
        statusColor = Colors.red;
        statusIcon = Icons.cancel;
        break;
      default:
        statusColor = AppColors.yellow;
        statusIcon = Icons.pending;
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: GlassContainer(
        borderRadius: BorderRadius.circular(16),
        padding: const EdgeInsets.all(16),
        backgroundColor: isDark ? const Color(0xB8141416) : const Color(0xE8FFFFFF),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  createdAt != null ? DateFormat('MMM d, yyyy · h:mm a').format(createdAt) : 'Unknown date',
                  style: TextStyle(color: context.mutedColor, fontSize: 12),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(statusIcon, size: 14, color: statusColor),
                      const SizedBox(width: 4),
                      Text(
                        status.toUpperCase(),
                        style: TextStyle(color: statusColor, fontSize: 10, fontWeight: FontWeight.w700),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Column(
                  children: [
                    Icon(Icons.circle, size: 10, color: AppColors.yellow),
                    Container(width: 2, height: 24, color: context.mutedColor.withValues(alpha: 0.3)),
                    Icon(Icons.location_on, size: 14, color: Colors.red),
                  ],
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        pickupName,
                        style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w600),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 12),
                      Text(
                        dropoffName,
                        style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w600),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
              ],
            ),
            if (status == 'completed') ...[
              const SizedBox(height: 12),
              Divider(color: context.mutedColor.withValues(alpha: 0.2)),
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      CircleAvatar(
                        radius: 16,
                        backgroundColor: AppColors.yellow.withValues(alpha: 0.2),
                        child: Text(
                          driverName.isNotEmpty ? driverName[0].toUpperCase() : 'D',
                          style: TextStyle(color: AppColors.yellow, fontWeight: FontWeight.w700),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        driverName,
                        style: TextStyle(color: context.textColor, fontSize: 13, fontWeight: FontWeight.w500),
                      ),
                    ],
                  ),
                  if (rating != null)
                    Row(
                      children: [
                        Icon(Icons.star, size: 16, color: AppColors.yellow),
                        const SizedBox(width: 4),
                        Text(
                          rating.toString(),
                          style: TextStyle(color: context.textColor, fontSize: 13, fontWeight: FontWeight.w600),
                        ),
                      ],
                    ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}
