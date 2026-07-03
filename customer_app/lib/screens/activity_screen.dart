import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../theme/app_theme.dart';
import '../services/supabase_service.dart';
import '../widgets/shimmer_loading.dart';
import 'search_screen.dart';

enum TripStatus { completed, cancelled, ongoing }

class TripHistory {
  final String id;
  final String pickup;
  final String dropoff;
  final DateTime date;
  final TripStatus status;
  final String driverName;
  final String vehicleNumber;
  final int duration;
  final double distance;

  TripHistory({
    required this.id,
    required this.pickup,
    required this.dropoff,
    required this.date,
    required this.status,
    required this.driverName,
    required this.vehicleNumber,
    required this.duration,
    required this.distance,
  });
}

class ActivityScreen extends StatefulWidget {
  const ActivityScreen({super.key});

  @override
  State<ActivityScreen> createState() => _ActivityScreenState();
}

class _ActivityScreenState extends State<ActivityScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  String _selectedDateFilter = 'All Time';
  bool _isLoading = true;
  List<TripHistory> _trips = [];
  RealtimeChannel? _ridesChannel;

  final List<String> _dateFilters = ['All Time', 'Today', 'This Week', 'This Month'];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _loadTrips();
    _subscribeToRides();
  }

  void _subscribeToRides() {
    final userId = SupabaseService.userId;
    if (userId == null || userId.isEmpty) return;

    _ridesChannel = Supabase.instance.client
        .channel('customer_rides_$userId')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'rides',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'customer_id',
            value: userId,
          ),
          callback: (payload) {
            debugPrint('Activity realtime update: ${payload.eventType}');
            _loadTrips();
          },
        )
        .subscribe();
  }

  Future<void> _loadTrips() async {
    setState(() => _isLoading = true);
    try {
      final rides = await SupabaseService.getRideHistory(SupabaseService.userId);
      _trips = rides.map((ride) {
        final driver = ride['driver'];
        final driverProfile = driver?['profile'];
        final vehicle = driver?['vehicle'];
        final status = ride['status'] as String? ?? 'completed';
        return TripHistory(
          id: ride['id'] ?? '',
          pickup: ride['pickup_name'] ?? 'Unknown',
          dropoff: ride['dropoff_name'] ?? 'Unknown',
          date: (DateTime.tryParse(ride['created_at'] ?? '') ?? DateTime.now()).toLocal(),
          status: status == 'cancelled' ? TripStatus.cancelled : TripStatus.completed,
          driverName: driverProfile?['full_name'] ?? 'Driver',
          vehicleNumber: vehicle?['plate_no'] ?? '-',
          duration: ride['duration_minutes'] ?? 0,
          distance: (ride['distance_km'] ?? 0).toDouble(),
        );
      }).toList();
    } catch (e) {
      debugPrint('Error loading trips: $e');
    }
    setState(() => _isLoading = false);
  }

  @override
  void dispose() {
    _ridesChannel?.unsubscribe();
    _tabController.dispose();
    super.dispose();
  }

  List<TripHistory> _getFilteredTrips(int tabIndex) {
    List<TripHistory> filtered = _trips;

    // Apply date filter
    final now = DateTime.now();
    switch (_selectedDateFilter) {
      case 'Today':
        filtered = filtered.where((t) =>
          t.date.year == now.year && t.date.month == now.month && t.date.day == now.day
        ).toList();
        break;
      case 'This Week':
        final weekStart = now.subtract(Duration(days: now.weekday - 1));
        filtered = filtered.where((t) => t.date.isAfter(weekStart.subtract(const Duration(days: 1)))).toList();
        break;
      case 'This Month':
        filtered = filtered.where((t) => t.date.year == now.year && t.date.month == now.month).toList();
        break;
    }

    // Apply status filter
    switch (tabIndex) {
      case 1:
        return filtered.where((t) => t.status == TripStatus.completed).toList();
      case 2:
        return filtered.where((t) => t.status == TripStatus.cancelled).toList();
      default:
        return filtered;
    }
  }

  @override
  Widget build(BuildContext context) {
    final topPadding = MediaQuery.of(context).padding.top;
    return Scaffold(
      backgroundColor: context.bgColor,
      body: NestedScrollView(
        physics: const BouncingScrollPhysics(),
        headerSliverBuilder: (context, innerBoxIsScrolled) {
          return [
            SliverToBoxAdapter(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(height: topPadding),
                  _buildHeader(context),
                  _buildTabs(context),
                ],
              ),
            ),
          ];
        },
        body: _isLoading
            ? const ShimmerList(itemCount: 5)
            : TabBarView(
                controller: _tabController,
                children: [
                  RefreshIndicator(
                    onRefresh: _loadTrips,
                    color: AppColors.yellow,
                    child: _buildTripList(_getFilteredTrips(0)),
                  ),
                  RefreshIndicator(
                    onRefresh: _loadTrips,
                    color: AppColors.yellow,
                    child: _buildTripList(_getFilteredTrips(1)),
                  ),
                  RefreshIndicator(
                    onRefresh: _loadTrips,
                    color: AppColors.yellow,
                    child: _buildTripList(_getFilteredTrips(2)),
                  ),
                ],
              ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            'Activity',
            style: TextStyle(
              color: context.textColor,
              fontSize: 28,
              fontWeight: FontWeight.w800,
            ),
          ),
          GestureDetector(
            onTap: () {
              HapticFeedback.lightImpact();
              _showFilterSheet();
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: _selectedDateFilter != 'All Time' ? AppColors.yellow.withValues(alpha: 0.15) : context.surfaceColor,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: _selectedDateFilter != 'All Time' ? AppColors.yellow : context.borderColor),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.filter_list, color: AppColors.yellow, size: 16),
                  const SizedBox(width: 6),
                  Text(
                    _selectedDateFilter != 'All Time' ? _selectedDateFilter : 'Filter',
                    style: TextStyle(color: _selectedDateFilter != 'All Time' ? AppColors.yellow : context.textColor, fontSize: 13, fontWeight: FontWeight.w500),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTabs(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(20, 8, 20, 16),
      decoration: BoxDecoration(
        color: context.surfaceColor,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.borderColor),
      ),
      child: TabBar(
        controller: _tabController,
        indicator: BoxDecoration(
          color: AppColors.yellow,
          borderRadius: BorderRadius.circular(12),
        ),
        indicatorSize: TabBarIndicatorSize.tab,
        indicatorPadding: const EdgeInsets.all(4),
        labelColor: Colors.black,
        unselectedLabelColor: context.mutedColor,
        labelStyle: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
        unselectedLabelStyle: TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
        dividerColor: Colors.transparent,
        tabs: [
          Tab(text: 'All (${_trips.length})'),
          Tab(text: 'Completed (${_trips.where((t) => t.status == TripStatus.completed).length})'),
          Tab(text: 'Cancelled (${_trips.where((t) => t.status == TripStatus.cancelled).length})'),
        ],
      ),
    );
  }

  Widget _buildTripList(List<TripHistory> trips) {
    if (trips.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                color: context.surfaceColor,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Icon(Icons.history, color: context.mutedColor, size: 40),
            ),
            const SizedBox(height: 16),
            Text(
              'No trips yet',
              style: TextStyle(color: context.textColor, fontSize: 18, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            Text(
              'Your trip history will appear here',
              style: TextStyle(color: context.mutedColor, fontSize: 14),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      itemCount: trips.length,
      itemBuilder: (context, index) => _buildTripCard(trips[index]),
    );
  }

  Widget _buildTripCard(TripHistory trip) {
    final isCompleted = trip.status == TripStatus.completed;
    final statusColor = isCompleted ? AppColors.success : AppColors.error;
    final statusText = isCompleted ? 'Completed' : 'Cancelled';

    return GestureDetector(
      onTap: () {
        HapticFeedback.lightImpact();
        _showTripDetails(trip);
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: context.surfaceColor,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: context.borderColor),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  _formatDate(trip.date),
                  style: TextStyle(color: context.mutedColor, fontSize: 12),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        isCompleted ? Icons.check_circle : Icons.cancel,
                        color: statusColor,
                        size: 12,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        statusText,
                        style: TextStyle(color: statusColor, fontSize: 11, fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Column(
                  children: [
                    Container(
                      width: 10,
                      height: 10,
                      decoration: BoxDecoration(
                        color: AppColors.success,
                        shape: BoxShape.circle,
                        border: Border.all(color: AppColors.success.withValues(alpha: 0.3), width: 3),
                      ),
                    ),
                    Container(
                      width: 2,
                      height: 30,
                      color: context.borderColor,
                    ),
                    Container(
                      width: 10,
                      height: 10,
                      decoration: BoxDecoration(
                        color: AppColors.error,
                        shape: BoxShape.circle,
                        border: Border.all(color: AppColors.error.withValues(alpha: 0.3), width: 3),
                      ),
                    ),
                  ],
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        trip.pickup,
                        style: TextStyle(
                          color: context.textColor,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 20),
                      Text(
                        trip.dropoff,
                        style: TextStyle(
                          color: context.textColor,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
              ],
            ),
            if (isCompleted) ...[
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: context.isDark ? context.isDark ? AppColors.bgDark : const Color(0xFFF5F5F5) : const Color(0xFFF5F5F5),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    _buildTripStat(Icons.access_time, '${trip.duration} min'),
                    Container(width: 1, height: 24, color: context.borderColor),
                    _buildTripStat(Icons.route, '${trip.distance} km'),
                    Container(width: 1, height: 24, color: context.borderColor),
                    _buildTripStat(Icons.directions_car, trip.vehicleNumber),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildTripStat(IconData icon, String value) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, color: context.mutedColor, size: 14),
        const SizedBox(width: 6),
        Text(value, style: TextStyle(color: context.textColor, fontSize: 12, fontWeight: FontWeight.w500)),
      ],
    );
  }

  String _formatDate(DateTime date) {
    final now = DateTime.now();
    final diff = now.difference(date);

    if (diff.inHours < 24) {
      if (diff.inHours < 1) {
        return '${diff.inMinutes} minutes ago';
      }
      return '${diff.inHours} hours ago';
    } else if (diff.inDays == 1) {
      return 'Yesterday';
    } else if (diff.inDays < 7) {
      return '${diff.inDays} days ago';
    } else {
      final months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return '${date.day} ${months[date.month - 1]} ${date.year}';
    }
  }

  void _showFilterSheet() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: context.surfaceColor,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: context.borderColor,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 20),
            Text(
              'Filter by Date',
              style: TextStyle(
                color: context.textColor,
                fontSize: 20,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 16),
            ...List.generate(_dateFilters.length, (index) {
              final filter = _dateFilters[index];
              final isSelected = _selectedDateFilter == filter;
              return GestureDetector(
                onTap: () {
                  HapticFeedback.lightImpact();
                  setState(() => _selectedDateFilter = filter);
                  Navigator.pop(ctx);
                },
                child: Container(
                  width: double.infinity,
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                  decoration: BoxDecoration(
                    color: isSelected ? AppColors.yellow.withValues(alpha: 0.15) : (context.isDark ? context.isDark ? AppColors.bgDark : const Color(0xFFF5F5F5) : const Color(0xFFF5F5F5)),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: isSelected ? AppColors.yellow : context.borderColor,
                      width: isSelected ? 1.5 : 1,
                    ),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        _getFilterIcon(filter),
                        color: isSelected ? AppColors.yellow : context.mutedColor,
                        size: 20,
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          filter,
                          style: TextStyle(
                            color: isSelected ? AppColors.yellow : context.textColor,
                            fontSize: 15,
                            fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
                          ),
                        ),
                      ),
                      if (isSelected)
                        Icon(Icons.check_circle, color: AppColors.yellow, size: 20),
                    ],
                  ),
                ),
              );
            }),
            SizedBox(height: MediaQuery.of(context).padding.bottom + 8),
          ],
        ),
      ),
    );
  }

  IconData _getFilterIcon(String filter) {
    switch (filter) {
      case 'Today':
        return Icons.today;
      case 'This Week':
        return Icons.date_range;
      case 'This Month':
        return Icons.calendar_month;
      default:
        return Icons.all_inclusive;
    }
  }

  void _showTripDetails(TripHistory trip) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (context) => Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: context.surfaceColor,
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: context.borderColor,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 24),
            Row(
              children: [
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    color: AppColors.yellow,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Icon(Icons.person, color: Colors.black, size: 28),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        trip.driverName,
                        style: TextStyle(
                          color: context.textColor,
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        trip.vehicleNumber,
                        style: TextStyle(color: context.mutedColor, fontSize: 14),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: trip.status == TripStatus.completed
                        ? AppColors.success.withValues(alpha: 0.15)
                        : AppColors.error.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    trip.status == TripStatus.completed ? 'Completed' : 'Cancelled',
                    style: TextStyle(
                      color: trip.status == TripStatus.completed ? AppColors.success : AppColors.error,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: context.isDark ? context.isDark ? AppColors.bgDark : const Color(0xFFF5F5F5) : const Color(0xFFF5F5F5),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                children: [
                  _buildDetailRow(Icons.my_location, 'Pickup', trip.pickup, AppColors.success),
                  const SizedBox(height: 16),
                  _buildDetailRow(Icons.location_on, 'Dropoff', trip.dropoff, AppColors.error),
                ],
              ),
            ),
            if (trip.status == TripStatus.completed) ...[
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(child: _buildStatCard(Icons.access_time, '${trip.duration} min', 'Duration')),
                  const SizedBox(width: 12),
                  Expanded(child: _buildStatCard(Icons.route, '${trip.distance} km', 'Distance')),
                ],
              ),
            ],
            const SizedBox(height: 24),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _exportTripReceipt(trip),
                    icon: Icon(Icons.receipt_long, size: 18),
                    label: Text('Export'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.yellow,
                      side: BorderSide(color: AppColors.yellow),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: () {
                      Navigator.pop(context);
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (context) => SearchScreen(initialDestination: trip.dropoff),
                        ),
                      );
                    },
                    icon: Icon(Icons.replay, size: 18),
                    label: Text('Book Again'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.yellow,
                      foregroundColor: Colors.black,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                  ),
                ),
              ],
            ),
            SizedBox(height: MediaQuery.of(context).padding.bottom + 8),
          ],
        ),
      ),
    );
  }

  Widget _buildDetailRow(IconData icon, String label, String value, Color color) {
    return Row(
      children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.15),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(icon, color: color, size: 18),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: TextStyle(color: context.mutedColor, fontSize: 11)),
              const SizedBox(height: 2),
              Text(
                value,
                style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w600),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildStatCard(IconData icon, String value, String label) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.isDark ? context.isDark ? AppColors.bgDark : const Color(0xFFF5F5F5) : const Color(0xFFF5F5F5),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        children: [
          Icon(icon, color: AppColors.yellow, size: 22),
          const SizedBox(height: 8),
          Text(value, style: TextStyle(color: context.textColor, fontSize: 16, fontWeight: FontWeight.w700)),
          const SizedBox(height: 2),
          Text(label, style: TextStyle(color: context.mutedColor, fontSize: 11)),
        ],
      ),
    );
  }

  void _exportTripReceipt(TripHistory trip) {
    Navigator.pop(context);

    final months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    final dateStr = '${trip.date.day} ${months[trip.date.month - 1]} ${trip.date.year}';
    final timeStr = '${trip.date.hour.toString().padLeft(2, '0')}:${trip.date.minute.toString().padLeft(2, '0')}';

    final receipt = '''
━━━━━━━━━━━━━━━━━━━━━━━━━━━
       MYRIDE TRIP RECEIPT
━━━━━━━━━━━━━━━━━━━━━━━━━━━

Trip ID: ${trip.id.substring(0, 8).toUpperCase()}
Date: $dateStr
Time: $timeStr
Status: ${trip.status == TripStatus.completed ? 'Completed' : 'Cancelled'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
         TRIP DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━

📍 Pickup:
   ${trip.pickup}

📍 Dropoff:
   ${trip.dropoff}

⏱️ Duration: ${trip.duration} minutes
📏 Distance: ${trip.distance} km

━━━━━━━━━━━━━━━━━━━━━━━━━━━
        DRIVER DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━

Driver: ${trip.driverName}
Vehicle: ${trip.vehicleNumber}

━━━━━━━━━━━━━━━━━━━━━━━━━━━

This is a complimentary ride provided
by your organization through MyRide.

Thank you for riding with us!

━━━━━━━━━━━━━━━━━━━━━━━━━━━
''';

    Share.share(receipt, subject: 'MyRide Trip Receipt - ${trip.id.substring(0, 8).toUpperCase()}');
  }
}
