import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../services/supabase_service.dart';
import '../services/realtime_service.dart';
import '../theme/app_theme.dart';
import '../widgets/glass_container.dart';
import '../utils/timezone_utils.dart';

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
  DateTimeRange? _dateFilter;
  StreamSubscription<Map<String, dynamic>>? _ridesSubscription;
  final _realtimeService = RealtimeService();

  @override
  void initState() {
    super.initState();
    _loadRides();
    _subscribeToRides();
  }

  @override
  void dispose() {
    _ridesSubscription?.cancel();
    final customerId = widget.customerId ?? SupabaseService.userId;
    if (customerId != null) {
      _realtimeService.unsubscribe('customer_rides_$customerId');
    }
    super.dispose();
  }

  void _subscribeToRides() {
    final customerId = widget.customerId ?? SupabaseService.userId;
    if (customerId == null) return;

    _ridesSubscription = _realtimeService
        .subscribeToCustomerRides(customerId)
        .listen((event) {
      // Refresh the list when any ride changes (completed or cancelled)
      final newRecord = event['newRecord'] as Map<String, dynamic>?;
      final status = newRecord?['status'] as String?;
      if (status == 'completed' || status == 'cancelled') {
        _loadRides();
      }
    });
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
      debugPrint('Error loading ride history: $e');
      setState(() => _isLoading = false);
    }
  }

  List<Map<String, dynamic>> get _filteredRides {
    var filtered = _rides;

    // Filter by status
    if (_filter != 'all') {
      filtered = filtered.where((r) => r['status'] == _filter).toList();
    }

    // Filter by date range
    if (_dateFilter != null) {
      filtered = filtered.where((r) {
        final createdAt = DateTime.tryParse(r['created_at'] ?? '');
        if (createdAt == null) return false;
        return createdAt.isAfter(_dateFilter!.start.subtract(const Duration(seconds: 1))) &&
               createdAt.isBefore(_dateFilter!.end.add(const Duration(days: 1)));
      }).toList();
    }

    return filtered;
  }

  @override
  Widget build(BuildContext context) {
    final isDark = context.isDark;
    final topPadding = MediaQuery.of(context).padding.top;
    final completedCount = _rides.where((r) => r['status'] == 'completed').length;
    final cancelledCount = _rides.where((r) => r['status'] == 'cancelled').length;

    return Scaffold(
      backgroundColor: context.bgColor,
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: AppColors.yellow))
          : RefreshIndicator(
              onRefresh: _loadRides,
              color: AppColors.yellow,
              child: CustomScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                slivers: [
                  SliverToBoxAdapter(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SizedBox(height: topPadding),
                        Padding(
                          padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
                          child: Row(
                            children: [
                              IconButton(
                                icon: Icon(Icons.arrow_back, color: context.textColor),
                                onPressed: () => Navigator.pop(context),
                                padding: EdgeInsets.zero,
                                constraints: const BoxConstraints(),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Text(
                                  'Activity',
                                  style: TextStyle(
                                    color: context.textColor,
                                    fontSize: 28,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                              ),
                              _buildFilterButton(context),
                            ],
                          ),
                        ),
                        const SizedBox(height: 12),
                        _buildStatusTabs(context, completedCount, cancelledCount),
                        const SizedBox(height: 8),
                      ],
                    ),
                  ),
                  if (_filteredRides.isEmpty)
                    SliverFillRemaining(
                      hasScrollBody: false,
                      child: _buildEmptyState(),
                    )
                  else
                    SliverPadding(
                      padding: const EdgeInsets.all(16),
                      sliver: SliverList(
                        delegate: SliverChildBuilderDelegate(
                          (context, index) => _buildRideCard(_filteredRides[index], isDark),
                          childCount: _filteredRides.length,
                        ),
                      ),
                    ),
                  SliverToBoxAdapter(
                    child: SizedBox(height: MediaQuery.of(context).padding.bottom + 20),
                  ),
                ],
              ),
            ),
    );
  }

  Widget _buildFilterButton(BuildContext context) {
    final hasDateFilter = _dateFilter != null;
    return Material(
      color: hasDateFilter ? AppColors.yellow.withValues(alpha: 0.15) : context.cardColor,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: () => _showFilterSheet(context),
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: hasDateFilter ? AppColors.yellow : Colors.transparent,
              width: hasDateFilter ? 1.5 : 0,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.tune, color: hasDateFilter ? AppColors.yellow : AppColors.yellow, size: 18),
              const SizedBox(width: 6),
              Text(
                hasDateFilter ? 'Filtered' : 'Filter',
                style: TextStyle(
                  color: hasDateFilter ? AppColors.yellow : context.textColor,
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showFilterSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => _DateFilterSheet(
        currentDateRange: _dateFilter,
        onApply: (dateRange) {
          setState(() => _dateFilter = dateRange);
        },
      ),
    );
  }

  Widget _buildStatusTabs(BuildContext context, int completedCount, int cancelledCount) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Container(
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(
          color: context.cardColor,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: context.borderColor),
        ),
        child: Row(
          children: [
            _buildStatusTab(context, 'all', 'All', _rides.length),
            _buildStatusTab(context, 'completed', 'Completed', completedCount),
            _buildStatusTab(context, 'cancelled', 'Cancelled', cancelledCount),
          ],
        ),
      ),
    );
  }

  Widget _buildStatusTab(BuildContext context, String key, String label, int count) {
    final isSelected = _filter == key;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _filter = key),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            color: isSelected ? AppColors.yellow : Colors.transparent,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Text(
            '$label ($count)',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: isSelected ? Colors.black : context.mutedColor,
              fontSize: 14,
              fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
            ),
          ),
        ),
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
    final createdAt = MaldivesTimezone.parse(ride['created_at']);
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

class _DateFilterSheet extends StatefulWidget {
  final DateTimeRange? currentDateRange;
  final void Function(DateTimeRange?) onApply;

  const _DateFilterSheet({required this.currentDateRange, required this.onApply});

  @override
  State<_DateFilterSheet> createState() => _DateFilterSheetState();
}

class _DateFilterSheetState extends State<_DateFilterSheet> {
  String _selectedPreset = 'all';
  DateTimeRange? _customRange;

  @override
  void initState() {
    super.initState();
    _customRange = widget.currentDateRange;
    if (widget.currentDateRange == null) {
      _selectedPreset = 'all';
    } else {
      final now = MaldivesTimezone.now();
      final today = DateTime(now.year, now.month, now.day);
      final start = widget.currentDateRange!.start;

      if (start == today) {
        _selectedPreset = 'today';
      } else if (start == today.subtract(Duration(days: today.weekday - 1))) {
        _selectedPreset = 'week';
      } else if (start == DateTime(now.year, now.month, 1)) {
        _selectedPreset = 'month';
      } else {
        _selectedPreset = 'custom';
      }
    }
  }

  DateTimeRange? _getDateRangeForPreset(String preset) {
    final now = MaldivesTimezone.now();
    final today = DateTime(now.year, now.month, now.day);

    switch (preset) {
      case 'today':
        return DateTimeRange(start: today, end: today.add(const Duration(days: 1)));
      case 'week':
        final weekStart = today.subtract(Duration(days: today.weekday - 1));
        return DateTimeRange(start: weekStart, end: today.add(const Duration(days: 1)));
      case 'month':
        final monthStart = DateTime(now.year, now.month, 1);
        return DateTimeRange(start: monthStart, end: today.add(const Duration(days: 1)));
      case 'custom':
        return _customRange;
      default:
        return null;
    }
  }

  Future<void> _selectCustomRange() async {
    final now = MaldivesTimezone.now();
    final picked = await showDateRangePicker(
      context: context,
      firstDate: now.subtract(const Duration(days: 365)),
      lastDate: now,
      initialDateRange: _customRange,
      builder: (context, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: ColorScheme.dark(
              primary: AppColors.yellow,
              onPrimary: Colors.black,
              surface: context.cardColor,
              onSurface: context.textColor,
            ),
          ),
          child: child!,
        );
      },
    );
    if (picked != null) {
      setState(() {
        _customRange = picked;
        _selectedPreset = 'custom';
      });
      widget.onApply(picked);
      if (mounted) Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    final dateFormat = DateFormat('MMM d, yyyy');

    return Container(
      decoration: BoxDecoration(
        color: context.cardColor,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 12),
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
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Text(
              'Filter by Date',
              style: TextStyle(
                color: context.textColor,
                fontSize: 20,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(height: 20),

          _buildDateOption(context, 'all', 'All Time', Icons.all_inclusive),
          _buildDateOption(context, 'today', 'Today', Icons.calendar_today),
          _buildDateOption(context, 'week', 'This Week', Icons.date_range),
          _buildDateOption(context, 'month', 'This Month', Icons.calendar_month),

          // Custom date range option
          GestureDetector(
            onTap: _selectCustomRange,
            child: Container(
              margin: const EdgeInsets.symmetric(horizontal: 20, vertical: 6),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
              decoration: BoxDecoration(
                color: _selectedPreset == 'custom' ? AppColors.yellow.withValues(alpha: 0.15) : context.bgColor,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: _selectedPreset == 'custom' ? AppColors.yellow : context.borderColor,
                  width: _selectedPreset == 'custom' ? 2 : 1,
                ),
              ),
              child: Row(
                children: [
                  Icon(Icons.edit_calendar, color: _selectedPreset == 'custom' ? AppColors.yellow : context.mutedColor, size: 22),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Custom Range',
                          style: TextStyle(
                            color: _selectedPreset == 'custom' ? AppColors.yellow : context.textColor,
                            fontSize: 16,
                            fontWeight: _selectedPreset == 'custom' ? FontWeight.w600 : FontWeight.w500,
                          ),
                        ),
                        if (_customRange != null && _selectedPreset == 'custom')
                          Text(
                            '${dateFormat.format(_customRange!.start)} - ${dateFormat.format(_customRange!.end)}',
                            style: TextStyle(
                              color: AppColors.yellow.withValues(alpha: 0.8),
                              fontSize: 12,
                            ),
                          ),
                      ],
                    ),
                  ),
                  Icon(Icons.chevron_right, color: _selectedPreset == 'custom' ? AppColors.yellow : context.mutedColor, size: 22),
                ],
              ),
            ),
          ),

          SizedBox(height: MediaQuery.of(context).padding.bottom + 20),
        ],
      ),
    );
  }

  Widget _buildDateOption(BuildContext context, String preset, String label, IconData icon) {
    final isSelected = _selectedPreset == preset;

    return GestureDetector(
      onTap: () {
        setState(() => _selectedPreset = preset);
        widget.onApply(_getDateRangeForPreset(preset));
        Navigator.pop(context);
      },
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 20, vertical: 6),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.yellow.withValues(alpha: 0.15) : context.bgColor,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: isSelected ? AppColors.yellow : context.borderColor,
            width: isSelected ? 2 : 1,
          ),
        ),
        child: Row(
          children: [
            Icon(icon, color: isSelected ? AppColors.yellow : context.mutedColor, size: 22),
            const SizedBox(width: 14),
            Expanded(
              child: Text(
                label,
                style: TextStyle(
                  color: isSelected ? AppColors.yellow : context.textColor,
                  fontSize: 16,
                  fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
                ),
              ),
            ),
            if (isSelected)
              Icon(Icons.check, color: AppColors.yellow, size: 22),
          ],
        ),
      ),
    );
  }
}
