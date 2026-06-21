import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../providers/driver_state.dart';
import '../theme/app_theme.dart';
import '../models/ride_request.dart';
import '../widgets/floating_nav_bar.dart';

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  TripStatus? _statusFilter;
  DateTimeRange? _dateRange;

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

  bool get _hasFilters => _statusFilter != null || _dateRange != null;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.bgColor,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      'Trip History',
                      style: TextStyle(
                        color: context.textColor,
                        fontSize: 24,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  if (_hasFilters)
                    TextButton(
                      onPressed: _clearFilters,
                      child: Text(
                        'Clear',
                        style: TextStyle(
                          color: AppColors.yellow,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  const SizedBox(width: 4),
                  _FilterButton(
                    hasFilters: _hasFilters,
                    onTap: _showFilterSheet,
                  ),
                ],
              ),
            ),
            if (_hasFilters) _buildActiveFilters(),
            Expanded(
              child: Consumer<DriverState>(
                builder: (context, state, _) {
                  final filteredTrips = _filterTrips(state.completedTrips);

                  if (state.completedTrips.isEmpty) {
                    return _buildEmptyState(context);
                  }

                  if (filteredTrips.isEmpty) {
                    return _buildNoResultsState(context);
                  }

                  return ListView.builder(
                    padding: EdgeInsets.fromLTRB(16, 16, 16, getNavBarHeight(context) + 16),
                    itemCount: filteredTrips.length,
                    itemBuilder: (context, index) {
                      final trip = filteredTrips[index];
                      return _buildTripCard(context, trip);
                    },
                  );
                },
              ),
            ),
          ],
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
          if (_statusFilter != null)
            _FilterChip(
              label: _statusFilter == TripStatus.completed
                  ? 'Completed'
                  : _statusFilter == TripStatus.cancelled
                      ? 'Cancelled'
                      : 'Rejected',
              onRemove: () => setState(() => _statusFilter = null),
            ),
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
  TripStatus? _status;
  DateTimeRange? _dateRange;

  @override
  void initState() {
    super.initState();
    _status = widget.currentStatus;
    _dateRange = widget.currentDateRange;
  }

  Future<void> _selectDateRange() async {
    final now = DateTime.now();
    final picked = await showDateRangePicker(
      context: context,
      firstDate: now.subtract(const Duration(days: 365)),
      lastDate: now,
      initialDateRange: _dateRange,
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
      setState(() => _dateRange = picked);
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
        children: [
          const SizedBox(height: 12),
          Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: context.borderColor,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(height: 20),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Row(
              children: [
                Text(
                  'Filter Trips',
                  style: TextStyle(
                    color: context.textColor,
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const Spacer(),
                TextButton(
                  onPressed: () {
                    setState(() {
                      _status = null;
                      _dateRange = null;
                    });
                  },
                  child: Text(
                    'Reset',
                    style: TextStyle(
                      color: context.mutedColor,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Status',
                  style: TextStyle(
                    color: context.mutedColor,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    _StatusOption(
                      label: 'Completed',
                      icon: Icons.check_circle,
                      color: AppColors.success,
                      isSelected: _status == TripStatus.completed,
                      onTap: () => setState(() => _status = _status == TripStatus.completed ? null : TripStatus.completed),
                    ),
                    const SizedBox(width: 8),
                    _StatusOption(
                      label: 'Cancelled',
                      icon: Icons.cancel,
                      color: AppColors.error,
                      isSelected: _status == TripStatus.cancelled,
                      onTap: () => setState(() => _status = _status == TripStatus.cancelled ? null : TripStatus.cancelled),
                    ),
                  ],
                ),
              ],
            ),
          ),

          const SizedBox(height: 20),

          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Date Range',
                  style: TextStyle(
                    color: context.mutedColor,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 12),
                GestureDetector(
                  onTap: _selectDateRange,
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                    decoration: BoxDecoration(
                      color: context.bgColor,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: context.borderColor),
                    ),
                    child: Row(
                      children: [
                        Icon(Icons.date_range, color: context.mutedColor, size: 20),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            _dateRange != null
                                ? '${dateFormat.format(_dateRange!.start)} - ${dateFormat.format(_dateRange!.end)}'
                                : 'Select date range',
                            style: TextStyle(
                              color: _dateRange != null ? context.textColor : context.mutedColor,
                              fontSize: 15,
                            ),
                          ),
                        ),
                        if (_dateRange != null)
                          GestureDetector(
                            onTap: () => setState(() => _dateRange = null),
                            child: Icon(Icons.close, color: context.mutedColor, size: 20),
                          ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 24),

          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
            child: SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () {
                  widget.onApply(_status, _dateRange);
                  Navigator.pop(context);
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.yellow,
                  foregroundColor: Colors.black,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                child: const Text(
                  'Apply Filters',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          ),
          SizedBox(height: MediaQuery.of(context).padding.bottom),
        ],
      ),
    );
  }
}

class _StatusOption extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color color;
  final bool isSelected;
  final VoidCallback onTap;

  const _StatusOption({
    required this.label,
    required this.icon,
    required this.color,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: () {
          HapticFeedback.selectionClick();
          onTap();
        },
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
          decoration: BoxDecoration(
            color: isSelected ? color.withValues(alpha: 0.15) : context.bgColor,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: isSelected ? color : context.borderColor,
              width: isSelected ? 2 : 1,
            ),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, color: color, size: 20),
              const SizedBox(width: 8),
              Text(
                label,
                style: TextStyle(
                  color: isSelected ? color : context.textColor,
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
}
