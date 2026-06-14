import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../theme/app_theme.dart';

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

  final List<String> _dateFilters = ['All Time', 'Today', 'This Week', 'This Month'];

  final List<TripHistory> _trips = [
    TripHistory(
      id: '1',
      pickup: 'Hulhumale Phase 2',
      dropoff: 'Velana International Airport',
      date: DateTime.now().subtract(const Duration(hours: 1)),
      status: TripStatus.completed,
      driverName: 'Ahmed Ali',
      vehicleNumber: 'P 2547',
      duration: 25,
      distance: 8.5,
    ),
    TripHistory(
      id: '2',
      pickup: 'Male City Center',
      dropoff: 'Hulhumale Ferry Terminal',
      date: DateTime.now().subtract(const Duration(hours: 4)),
      status: TripStatus.completed,
      driverName: 'Ibrahim Hassan',
      vehicleNumber: 'P 1234',
      duration: 18,
      distance: 5.2,
    ),
    TripHistory(
      id: '3',
      pickup: 'ADK Hospital',
      dropoff: 'Artificial Beach',
      date: DateTime.now().subtract(const Duration(hours: 6)),
      status: TripStatus.cancelled,
      driverName: 'Mohamed Rasheed',
      vehicleNumber: 'P 8899',
      duration: 0,
      distance: 0,
    ),
    TripHistory(
      id: '4',
      pickup: 'Hulhumale Central Park',
      dropoff: 'Tree Top Hospital',
      date: DateTime.now().subtract(const Duration(days: 1)),
      status: TripStatus.completed,
      driverName: 'Ali Waheed',
      vehicleNumber: 'P 5566',
      duration: 12,
      distance: 3.8,
    ),
    TripHistory(
      id: '5',
      pickup: 'Male Fish Market',
      dropoff: 'Hulhumale Phase 1',
      date: DateTime.now().subtract(const Duration(days: 2)),
      status: TripStatus.completed,
      driverName: 'Hassan Manik',
      vehicleNumber: 'P 7788',
      duration: 22,
      distance: 7.1,
    ),
  ];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
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
    return Scaffold(
      backgroundColor: context.bgColor,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildHeader(context),
            _buildTabs(context),
            Expanded(
              child: TabBarView(
                controller: _tabController,
                children: [
                  _buildTripList(_getFilteredTrips(0)),
                  _buildTripList(_getFilteredTrips(1)),
                  _buildTripList(_getFilteredTrips(2)),
                ],
              ),
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
                    onPressed: () => Navigator.pop(context),
                    icon: Icon(Icons.support_agent, size: 18),
                    label: Text('Support'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.textDark,
                      side: BorderSide(color: context.borderColor),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: () => Navigator.pop(context),
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
}
