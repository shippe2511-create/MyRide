import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../providers/driver_state.dart';
import '../theme/app_theme.dart';
import '../models/ride_request.dart';
import '../services/realtime_service.dart';
import '../utils/timezone_utils.dart';

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  TripStatus? _statusFilter;
  DateTimeRange? _dateRange;
  StreamSubscription<Map<String, dynamic>>? _ridesSubscription;

  @override
  void initState() {
    super.initState();
    _loadTripsFromDatabase();
    _subscribeToCompletedRides();
  }

  Future<void> _loadTripsFromDatabase() async {
    final driverState = Provider.of<DriverState>(context, listen: false);
    await driverState.loadCompletedTrips();
  }

  @override
  void dispose() {
    _ridesSubscription?.cancel();
    final driverState = Provider.of<DriverState>(context, listen: false);
    if (driverState.driverId.isNotEmpty) {
      RealtimeService().unsubscribeFromCompletedRides(driverState.driverId);
    }
    super.dispose();
  }

  void _subscribeToCompletedRides() {
    final driverState = Provider.of<DriverState>(context, listen: false);
    final driverId = driverState.driverId;
    if (driverId.isEmpty) return;

    _ridesSubscription = RealtimeService().subscribeToCompletedRides(driverId).listen((data) {
      debugPrint('History realtime update: ${data['event']}');
      // Reload completed trips from database
      _loadCompletedTrips();
    });
  }

  Future<void> _loadCompletedTrips() async {
    if (!mounted) return;

    try {
      final driverState = Provider.of<DriverState>(context, listen: false);
      await driverState.loadCompletedTrips();
      debugPrint('History updated via realtime');
    } catch (e) {
      debugPrint('Error loading completed trips: $e');
    }
  }

  List<CompletedTrip> _filterTrips(List<CompletedTrip> trips) {
    return trips.where((trip) {
      if (_statusFilter != null && trip.status != _statusFilter) {
        return false;
      }
      if (_dateRange != null) {
        if (trip.tripDate.isBefore(_dateRange!.start) ||
            trip.tripDate.isAfter(_dateRange!.end.add(const Duration(days: 1)))) {
          return false;
        }
      }
      return true;
    }).toList();
  }

  void _showFilterSheet() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (context) => _FilterSheet(
        currentStatus: _statusFilter,
        currentDateRange: _dateRange,
        onApply: (status, dateRange) {
          setState(() {
            _statusFilter = status;
            _dateRange = dateRange;
          });
        },
      ),
    );
  }

  void _clearFilters() {
    setState(() {
      _statusFilter = null;
      _dateRange = null;
    });
  }

  bool get _hasFilters => _dateRange != null;

  @override
  Widget build(BuildContext context) {
    final topPadding = MediaQuery.of(context).padding.top;
    return Scaffold(
      backgroundColor: context.bgColor,
      extendBody: true,
      body: Consumer<DriverState>(
        builder: (context, state, _) {
          final allTrips = state.completedTrips;
          final filteredTrips = _filterTrips(allTrips);
          final filteredCompleted = filteredTrips.where((t) => t.status == TripStatus.completed).length;
          final filteredCancelled = filteredTrips.where((t) => t.status == TripStatus.cancelled).length;

          return CustomScrollView(
            physics: const BouncingScrollPhysics(),
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
                          _FilterButton(
                            hasFilters: _hasFilters,
                            onTap: _showFilterSheet,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    // Status tabs
                    Padding(
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
                            _buildStatusTab(
                              context,
                              label: 'All',
                              count: filteredTrips.length,
                              isSelected: _statusFilter == null,
                              onTap: () => setState(() => _statusFilter = null),
                            ),
                            _buildStatusTab(
                              context,
                              label: 'Completed',
                              count: filteredCompleted,
                              isSelected: _statusFilter == TripStatus.completed,
                              onTap: () => setState(() => _statusFilter = TripStatus.completed),
                            ),
                            _buildStatusTab(
                              context,
                              label: 'Cancelled',
                              count: filteredCancelled,
                              isSelected: _statusFilter == TripStatus.cancelled,
                              onTap: () => setState(() => _statusFilter = TripStatus.cancelled),
                            ),
                          ],
                        ),
                      ),
                    ),
                    if (_dateRange != null) ...[
                      const SizedBox(height: 12),
                      _buildActiveFilters(),
                    ],
                  ],
                ),
              ),
              if (state.completedTrips.isEmpty)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: _buildEmptyState(context),
                )
              else if (filteredTrips.isEmpty)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: _buildNoResultsState(context),
                )
              else
                SliverPadding(
                  padding: const EdgeInsets.all(16),
                  sliver: SliverList(
                    delegate: SliverChildBuilderDelegate(
                      (context, index) {
                        final trip = filteredTrips[index];
                        return _buildTripCard(context, trip);
                      },
                      childCount: filteredTrips.length,
                    ),
                  ),
                ),
              SliverToBoxAdapter(
                child: SizedBox(height: MediaQuery.of(context).padding.bottom + 100),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildStatusTab(
    BuildContext context, {
    required String label,
    required int count,
    required bool isSelected,
    required VoidCallback onTap,
  }) {
    return Expanded(
      child: GestureDetector(
        onTap: () {
          HapticFeedback.selectionClick();
          onTap();
        },
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

  Widget _buildActiveFilters() {
    final dateFormat = DateFormat('MMM d');
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          if (_dateRange != null)
            _FilterChip(
              label: '${dateFormat.format(_dateRange!.start)} - ${dateFormat.format(_dateRange!.end)}',
              onRemove: () => setState(() => _dateRange = null),
            ),
        ],
      ),
    );
  }

  Widget _buildEmptyState(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 100,
            height: 100,
            decoration: BoxDecoration(
              color: context.cardColor,
              borderRadius: BorderRadius.circular(24),
            ),
            child: Icon(
              Icons.history,
              size: 48,
              color: context.mutedColor,
            ),
          ),
          const SizedBox(height: 24),
          Text(
            'No Trips Yet',
            style: TextStyle(
              color: context.textColor,
              fontSize: 22,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Complete your first trip to see it here',
            style: TextStyle(
              color: context.mutedColor,
              fontSize: 15,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildNoResultsState(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 100,
            height: 100,
            decoration: BoxDecoration(
              color: context.cardColor,
              borderRadius: BorderRadius.circular(24),
            ),
            child: Icon(
              Icons.filter_list_off,
              size: 48,
              color: context.mutedColor,
            ),
          ),
          const SizedBox(height: 24),
          Text(
            'No Matching Trips',
            style: TextStyle(
              color: context.textColor,
              fontSize: 22,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Try adjusting your filters',
            style: TextStyle(
              color: context.mutedColor,
              fontSize: 15,
            ),
          ),
          const SizedBox(height: 20),
          TextButton(
            onPressed: _clearFilters,
            child: Text(
              'Clear Filters',
              style: TextStyle(
                color: AppColors.yellow,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTripCard(BuildContext context, CompletedTrip trip) {
    final dateFormat = DateFormat('MMM d, yyyy');
    final timeFormat = DateFormat('h:mm a');

    IconData statusIcon;
    Color statusColor;
    Color bgColor;

    switch (trip.status) {
      case TripStatus.completed:
        statusIcon = Icons.check_circle;
        statusColor = AppColors.success;
        bgColor = AppColors.success.withValues(alpha: 0.15);
        break;
      case TripStatus.cancelled:
        statusIcon = Icons.cancel;
        statusColor = AppColors.error;
        bgColor = AppColors.error.withValues(alpha: 0.15);
        break;
      case TripStatus.rejected:
        statusIcon = Icons.block;
        statusColor = AppColors.warning;
        bgColor = AppColors.warning.withValues(alpha: 0.15);
        break;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: context.cardColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.borderColor),
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: bgColor,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(
                    statusIcon,
                    color: statusColor,
                    size: 26,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        trip.customerName,
                        style: TextStyle(
                          color: context.textColor,
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${dateFormat.format(trip.tripDate)} at ${timeFormat.format(trip.tripDate)}',
                        style: TextStyle(
                          color: context.mutedColor,
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ),
                ),
                if (trip.status != TripStatus.completed)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: statusColor.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      trip.status == TripStatus.cancelled ? 'Cancelled' : 'Rejected',
                      style: TextStyle(
                        color: statusColor,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  )
                else if (trip.rating > 0)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.warning.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.star,
                          color: AppColors.warning,
                          size: 16,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          '${trip.rating}',
                          style: const TextStyle(
                            color: AppColors.warning,
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),

          Divider(color: context.borderColor, height: 1),

          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Column(
                  children: [
                    Icon(
                      Icons.radio_button_checked,
                      color: AppColors.success,
                      size: 18,
                    ),
                    Container(
                      width: 2,
                      height: 20,
                      color: context.borderColor,
                    ),
                    Icon(
                      Icons.location_on,
                      color: AppColors.error,
                      size: 18,
                    ),
                  ],
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        trip.pickupLocation,
                        style: TextStyle(
                          color: context.textColor,
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const SizedBox(height: 16),
                      Text(
                        trip.dropoffLocation,
                        style: TextStyle(
                          color: context.textColor,
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          if (trip.cancellationReason != null && trip.cancellationReason!.isNotEmpty)
            Container(
              margin: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.error.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppColors.error.withValues(alpha: 0.2)),
              ),
              child: Row(
                children: [
                  Icon(Icons.info_outline, color: AppColors.error, size: 18),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Reason',
                          style: TextStyle(
                            color: context.mutedColor,
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        Text(
                          trip.cancellationReason!,
                          style: TextStyle(
                            color: context.textColor,
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: context.bgColor,
              borderRadius: const BorderRadius.vertical(
                bottom: Radius.circular(16),
              ),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _buildStat(
                  context,
                  Icons.timer_outlined,
                  '${trip.durationMinutes} min',
                ),
                Container(width: 1, height: 24, color: context.borderColor),
                _buildStat(
                  context,
                  Icons.straighten,
                  '${trip.distanceKm} km',
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStat(BuildContext context, IconData icon, String value) {
    return Row(
      children: [
        Icon(icon, color: context.mutedColor, size: 18),
        const SizedBox(width: 6),
        Text(
          value,
          style: TextStyle(
            color: context.textColor,
            fontSize: 14,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }
}

class _FilterButton extends StatelessWidget {
  final bool hasFilters;
  final VoidCallback onTap;

  const _FilterButton({required this.hasFilters, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: hasFilters ? AppColors.yellow : context.cardColor,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.all(10),
          child: Icon(
            Icons.filter_list,
            color: hasFilters ? Colors.black : context.textColor,
            size: 22,
          ),
        ),
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  final String label;
  final VoidCallback onRemove;

  const _FilterChip({required this.label, required this.onRemove});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.yellow.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.yellow.withValues(alpha: 0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: TextStyle(
              color: AppColors.yellow,
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(width: 6),
          GestureDetector(
            onTap: onRemove,
            child: Icon(
              Icons.close,
              size: 16,
              color: AppColors.yellow,
            ),
          ),
        ],
      ),
    );
  }
}

class _FilterSheet extends StatefulWidget {
  final TripStatus? currentStatus;
  final DateTimeRange? currentDateRange;
  final void Function(TripStatus?, DateTimeRange?) onApply;

  const _FilterSheet({
    required this.currentStatus,
    required this.currentDateRange,
    required this.onApply,
  });

  @override
  State<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends State<_FilterSheet> {
  String _selectedPreset = 'all';
  DateTimeRange? _customRange;

  @override
  void initState() {
    super.initState();
    _customRange = widget.currentDateRange;
    // Determine which preset matches the current date range
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
    final today = DateTime(now.year, now.month, now.day);
    final picked = await showDateRangePicker(
      context: context,
      firstDate: today.subtract(const Duration(days: 365)),
      lastDate: today,
      initialDateRange: _customRange ?? DateTimeRange(
        start: today.subtract(const Duration(days: 7)),
        end: today,
      ),
      useRootNavigator: true,
    );
    if (picked != null) {
      setState(() {
        _customRange = picked;
        _selectedPreset = 'custom';
      });
      widget.onApply(null, picked);
      if (mounted) Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: context.cardColor,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: SingleChildScrollView(
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
            _buildDateOption(context, 'custom', 'Custom Range', Icons.edit_calendar),

            SizedBox(height: MediaQuery.of(context).padding.bottom + 20),
          ],
        ),
      ),
    );
  }

  Widget _buildDateOption(BuildContext context, String preset, String label, IconData icon) {
    final isSelected = _selectedPreset == preset;
    final dateFormat = DateFormat('MMM d, yyyy');

    return GestureDetector(
      onTap: () async {
        HapticFeedback.selectionClick();

        if (preset == 'custom') {
          // Show date range picker for custom
          await _selectCustomRange();
        } else {
          setState(() => _selectedPreset = preset);
          widget.onApply(null, _getDateRangeForPreset(preset));
          Navigator.pop(context);
        }
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
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: TextStyle(
                      color: isSelected ? AppColors.yellow : context.textColor,
                      fontSize: 16,
                      fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
                    ),
                  ),
                  if (preset == 'custom' && _customRange != null && isSelected)
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
            if (preset == 'custom')
              Icon(Icons.chevron_right, color: isSelected ? AppColors.yellow : context.mutedColor, size: 22)
            else if (isSelected)
              Icon(Icons.check, color: AppColors.yellow, size: 22),
          ],
        ),
      ),
    );
  }
}
