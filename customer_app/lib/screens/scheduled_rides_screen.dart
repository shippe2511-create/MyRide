import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import '../services/supabase_service.dart';
import '../theme/app_theme.dart';
import '../widgets/glass_container.dart';
import '../widgets/primary_button.dart';
import '../widgets/app_snackbar.dart';

class ScheduledRidesScreen extends StatefulWidget {
  final String? customerId;

  const ScheduledRidesScreen({super.key, this.customerId});

  @override
  State<ScheduledRidesScreen> createState() => _ScheduledRidesScreenState();
}

class _ScheduledRidesScreenState extends State<ScheduledRidesScreen> {
  List<Map<String, dynamic>> _scheduledRides = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadScheduledRides();
  }

  Future<void> _loadScheduledRides() async {
    setState(() => _isLoading = true);
    try {
      final rides = await SupabaseService.getScheduledRides(widget.customerId);
      setState(() {
        _scheduledRides = rides;
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _cancelRide(String rideId) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.isDark ? const Color(0xFF1C1C1E) : Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text('Cancel Ride?', style: TextStyle(color: context.textColor)),
        content: Text(
          'Are you sure you want to cancel this scheduled ride?',
          style: TextStyle(color: context.mutedColor),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('No', style: TextStyle(color: context.mutedColor)),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Yes, Cancel', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      final success = await SupabaseService.cancelScheduledRide(rideId);
      if (success) {
        HapticFeedback.mediumImpact();
        _loadScheduledRides();
        if (mounted) {
          AppSnackbar.info(context, 'Ride cancelled');
        }
      }
    }
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
          'Scheduled Rides',
          style: TextStyle(color: context.textColor, fontWeight: FontWeight.w700),
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: AppColors.yellow))
          : _scheduledRides.isEmpty
              ? _buildEmptyState()
              : RefreshIndicator(
                  onRefresh: _loadScheduledRides,
                  color: AppColors.yellow,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: _scheduledRides.length,
                    itemBuilder: (context, index) => _buildRideCard(_scheduledRides[index], isDark),
                  ),
                ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.schedule, size: 64, color: context.mutedColor),
          const SizedBox(height: 16),
          Text(
            'No scheduled rides',
            style: TextStyle(color: context.textColor, fontSize: 18, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 8),
          Text(
            'Schedule a ride in advance for convenience',
            style: TextStyle(color: context.mutedColor, fontSize: 14),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  Widget _buildRideCard(Map<String, dynamic> ride, bool isDark) {
    final scheduledTime = DateTime.tryParse(ride['scheduled_time'] ?? '');
    final pickupName = ride['pickup_name'] ?? 'Unknown';
    final dropoffName = ride['dropoff_name'] ?? 'Unknown';
    final status = ride['status'] as String? ?? 'scheduled';

    final isUpcoming = scheduledTime != null && scheduledTime.isAfter(DateTime.now());
    final timeUntil = scheduledTime != null ? scheduledTime.difference(DateTime.now()) : null;

    String timeLabel = '';
    if (timeUntil != null) {
      if (timeUntil.inDays > 0) {
        timeLabel = 'in ${timeUntil.inDays} day${timeUntil.inDays > 1 ? 's' : ''}';
      } else if (timeUntil.inHours > 0) {
        timeLabel = 'in ${timeUntil.inHours} hour${timeUntil.inHours > 1 ? 's' : ''}';
      } else if (timeUntil.inMinutes > 0) {
        timeLabel = 'in ${timeUntil.inMinutes} min';
      } else {
        timeLabel = 'starting soon';
      }
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
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: AppColors.yellow.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Icon(Icons.schedule, color: AppColors.yellow, size: 20),
                    ),
                    const SizedBox(width: 12),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          scheduledTime != null
                              ? DateFormat('EEE, MMM d').format(scheduledTime)
                              : 'Unknown date',
                          style: TextStyle(color: context.textColor, fontSize: 15, fontWeight: FontWeight.w700),
                        ),
                        Text(
                          scheduledTime != null ? DateFormat('h:mm a').format(scheduledTime) : '',
                          style: TextStyle(color: AppColors.yellow, fontSize: 13, fontWeight: FontWeight.w600),
                        ),
                      ],
                    ),
                  ],
                ),
                if (isUpcoming)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: AppColors.yellow.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      timeLabel,
                      style: TextStyle(color: AppColors.yellow, fontSize: 12, fontWeight: FontWeight.w600),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 16),
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
                        style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w500),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 12),
                      Text(
                        dropoffName,
                        style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w500),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
              ],
            ),
            if (status == 'scheduled' || status == 'pending') ...[
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: () => _cancelRide(ride['id']),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.red,
                    side: const BorderSide(color: Colors.red),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                  child: const Text('Cancel Ride', style: TextStyle(fontWeight: FontWeight.w600)),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class ScheduleRideBottomSheet extends StatefulWidget {
  final String pickupName;
  final String dropoffName;
  final double pickupLat;
  final double pickupLng;
  final double dropoffLat;
  final double dropoffLng;
  final String? customerId;

  const ScheduleRideBottomSheet({
    super.key,
    required this.pickupName,
    required this.dropoffName,
    required this.pickupLat,
    required this.pickupLng,
    required this.dropoffLat,
    required this.dropoffLng,
    this.customerId,
  });

  @override
  State<ScheduleRideBottomSheet> createState() => _ScheduleRideBottomSheetState();
}

class _ScheduleRideBottomSheetState extends State<ScheduleRideBottomSheet> {
  DateTime _selectedDate = DateTime.now().add(const Duration(hours: 1));
  TimeOfDay _selectedTime = TimeOfDay.fromDateTime(DateTime.now().add(const Duration(hours: 1)));
  bool _isLoading = false;

  Future<void> _selectDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 30)),
      builder: (context, child) => Theme(
        data: Theme.of(context).copyWith(
          colorScheme: ColorScheme.dark(
            primary: AppColors.yellow,
            onPrimary: AppColors.bgDark,
            surface: const Color(0xFF1C1C1E),
            onSurface: Colors.white,
          ),
        ),
        child: child!,
      ),
    );
    if (picked != null) {
      setState(() => _selectedDate = DateTime(
        picked.year,
        picked.month,
        picked.day,
        _selectedTime.hour,
        _selectedTime.minute,
      ));
    }
  }

  Future<void> _selectTime() async {
    final picked = await showTimePicker(
      context: context,
      initialTime: _selectedTime,
      builder: (context, child) => Theme(
        data: Theme.of(context).copyWith(
          colorScheme: ColorScheme.dark(
            primary: AppColors.yellow,
            onPrimary: AppColors.bgDark,
            surface: const Color(0xFF1C1C1E),
            onSurface: Colors.white,
          ),
        ),
        child: child!,
      ),
    );
    if (picked != null) {
      setState(() {
        _selectedTime = picked;
        _selectedDate = DateTime(
          _selectedDate.year,
          _selectedDate.month,
          _selectedDate.day,
          picked.hour,
          picked.minute,
        );
      });
    }
  }

  Future<void> _scheduleRide() async {
    if (_selectedDate.isBefore(DateTime.now().add(const Duration(minutes: 15)))) {
      AppSnackbar.error(context, 'Please select a time at least 15 minutes from now');
      return;
    }

    setState(() => _isLoading = true);

    final result = await SupabaseService.createScheduledRide(
      pickupName: widget.pickupName,
      dropoffName: widget.dropoffName,
      pickupLat: widget.pickupLat,
      pickupLng: widget.pickupLng,
      dropoffLat: widget.dropoffLat,
      dropoffLng: widget.dropoffLng,
      scheduledTime: _selectedDate,
      customerId: widget.customerId,
    );

    setState(() => _isLoading = false);

    if (result != null && mounted) {
      HapticFeedback.mediumImpact();
      Navigator.pop(context, true);
      AppSnackbar.info(context, 'Ride scheduled for ${DateFormat('MMM d, h:mm a').format(_selectedDate)}');
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = context.isDark;

    return Container(
      padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(context).viewInsets.bottom + 20),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1C1C1E) : Colors.white,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
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
                color: context.mutedColor.withValues(alpha: 0.3),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 20),
          Text(
            'Schedule Ride',
            style: TextStyle(color: context.textColor, fontSize: 22, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          Text(
            'Choose when you want to be picked up',
            style: TextStyle(color: context.mutedColor, fontSize: 14),
          ),
          const SizedBox(height: 24),
          Row(
            children: [
              Expanded(
                child: GestureDetector(
                  onTap: _selectDate,
                  child: Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: isDark ? Colors.white.withValues(alpha: 0.05) : Colors.black.withValues(alpha: 0.05),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppColors.yellow.withValues(alpha: 0.3)),
                    ),
                    child: Row(
                      children: [
                        Icon(Icons.calendar_today, color: AppColors.yellow, size: 20),
                        const SizedBox(width: 12),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Date', style: TextStyle(color: context.mutedColor, fontSize: 11)),
                            Text(
                              DateFormat('EEE, MMM d').format(_selectedDate),
                              style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w600),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: GestureDetector(
                  onTap: _selectTime,
                  child: Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: isDark ? Colors.white.withValues(alpha: 0.05) : Colors.black.withValues(alpha: 0.05),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppColors.yellow.withValues(alpha: 0.3)),
                    ),
                    child: Row(
                      children: [
                        Icon(Icons.access_time, color: AppColors.yellow, size: 20),
                        const SizedBox(width: 12),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Time', style: TextStyle(color: context.mutedColor, fontSize: 11)),
                            Text(
                              _selectedTime.format(context),
                              style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w600),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: isDark ? Colors.white.withValues(alpha: 0.03) : Colors.black.withValues(alpha: 0.03),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                Icon(Icons.circle, size: 10, color: AppColors.yellow),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    widget.pickupName,
                    style: TextStyle(color: context.textColor, fontSize: 13),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: isDark ? Colors.white.withValues(alpha: 0.03) : Colors.black.withValues(alpha: 0.03),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                Icon(Icons.location_on, size: 14, color: Colors.red),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    widget.dropoffName,
                    style: TextStyle(color: context.textColor, fontSize: 13),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          PrimaryButton(
            text: _isLoading ? 'Scheduling...' : 'Schedule Ride',
            onPressed: _isLoading ? null : _scheduleRide,
          ),
        ],
      ),
    );
  }
}
