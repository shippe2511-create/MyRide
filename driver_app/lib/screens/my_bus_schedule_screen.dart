import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/supabase_service.dart';
import '../services/notification_service.dart';
import '../providers/driver_state.dart';
import '../theme/app_theme.dart';
import '../widgets/app_snackbar.dart';
import 'bus_trip_screen.dart';

class MyBusScheduleScreen extends StatefulWidget {
  const MyBusScheduleScreen({super.key});

  @override
  State<MyBusScheduleScreen> createState() => _MyBusScheduleScreenState();
}

class _MyBusScheduleScreenState extends State<MyBusScheduleScreen> with SingleTickerProviderStateMixin {
  List<Map<String, dynamic>> _assignments = [];
  bool _isLoading = true;
  bool _isStartingTrip = false;
  late TabController _tabController;
  Set<String> _remindersSet = {}; // Track which assignments have reminders

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _loadReminders();
    _loadSchedule();
  }

  Future<void> _loadReminders() async {
    final prefs = await SharedPreferences.getInstance();
    final reminders = prefs.getStringList('bus_trip_reminders') ?? [];
    setState(() => _remindersSet = reminders.toSet());
  }

  Future<void> _saveReminders() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList('bus_trip_reminders', _remindersSet.toList());
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadSchedule() async {
    setState(() => _isLoading = true);
    try {
      final driverState = context.read<DriverState>();
      final driverId = driverState.driverId;

      if (driverId.isEmpty) {
        debugPrint('MyBusSchedule: ERROR - driverId is empty!');
        setState(() => _isLoading = false);
        return;
      }

      final assignments = await SupabaseService.getMyBusSchedule(driverId);
      debugPrint('MyBusSchedule: Got ${assignments.length} assignments');
      setState(() {
        _assignments = assignments;
        _isLoading = false;
      });
    } catch (e) {
      debugPrint('Error loading schedule: $e');
      setState(() => _isLoading = false);
    }
  }

  List<Map<String, dynamic>> _filterAssignments(String filter) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final tomorrow = today.add(const Duration(days: 1));

    return _assignments.where((a) {
      final dateStr = a['service_date'] as String?;
      if (dateStr == null) return false;
      final date = DateTime.tryParse(dateStr);
      if (date == null) return false;
      final dateOnly = DateTime(date.year, date.month, date.day);

      switch (filter) {
        case 'today':
          return dateOnly == today;
        case 'tomorrow':
          return dateOnly == tomorrow;
        case 'upcoming':
          return dateOnly.isAfter(tomorrow);
        default:
          return true;
      }
    }).toList();
  }

  Future<void> _startTrip(Map<String, dynamic> assignment) async {
    HapticFeedback.mediumImpact();

    final route = assignment['route'] as Map<String, dynamic>?;
    final confirm = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Container(
        decoration: BoxDecoration(
          color: context.cardColor,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: context.mutedColor.withValues(alpha: 0.3),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 24),
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [AppColors.yellow, AppColors.yellow.withValues(alpha: 0.7)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(20),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.yellow.withValues(alpha: 0.3),
                    blurRadius: 20,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
              child: const Icon(Icons.directions_bus_rounded, size: 36, color: Colors.black),
            ),
            const SizedBox(height: 20),
            Text(
              'Start Bus Trip?',
              style: TextStyle(
                color: context.textColor,
                fontSize: 24,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              route?['route_name'] ?? 'Unknown Route',
              style: TextStyle(
                color: AppColors.yellow,
                fontSize: 18,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Departure: ${_formatTime(assignment['departure_time'])}',
              style: TextStyle(color: context.mutedColor, fontSize: 15),
            ),
            const SizedBox(height: 20),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: context.bgColor,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Row(
                children: [
                  Icon(Icons.info_outline_rounded, color: context.mutedColor, size: 20),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'You will enter bus mode and won\'t receive on-demand ride requests until the trip is completed.',
                      style: TextStyle(color: context.mutedColor, fontSize: 13, height: 1.4),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            Row(
              children: [
                Expanded(
                  child: TextButton(
                    onPressed: () => Navigator.pop(ctx, false),
                    style: TextButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                        side: BorderSide(color: context.borderColor),
                      ),
                    ),
                    child: Text(
                      'Cancel',
                      style: TextStyle(color: context.mutedColor, fontWeight: FontWeight.w600, fontSize: 16),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  flex: 2,
                  child: ElevatedButton(
                    onPressed: () => Navigator.pop(ctx, true),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.yellow,
                      foregroundColor: Colors.black,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      elevation: 0,
                    ),
                    child: const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.play_arrow_rounded, size: 22),
                        SizedBox(width: 8),
                        Text('Start Trip', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                      ],
                    ),
                  ),
                ),
              ],
            ),
            SizedBox(height: MediaQuery.of(ctx).padding.bottom + 8),
          ],
        ),
      ),
    );

    if (confirm != true) return;

    setState(() => _isStartingTrip = true);

    try {
      final trip = await SupabaseService.startBusTrip(assignment['id']);
      if (trip != null && mounted) {
        final driverState = context.read<DriverState>();
        driverState.enterBusMode(trip['id']);

        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (_) => BusTripScreen(
              tripId: trip['id'],
              assignment: assignment,
            ),
          ),
        );
      } else {
        if (mounted) AppSnackbar.error(context, 'Failed to start trip');
      }
    } catch (e) {
      debugPrint('Error starting trip: $e');
      if (mounted) AppSnackbar.error(context, 'Failed to start trip');
    } finally {
      if (mounted) setState(() => _isStartingTrip = false);
    }
  }

  Future<void> _resumeTrip(Map<String, dynamic> assignment) async {
    HapticFeedback.mediumImpact();
    setState(() => _isStartingTrip = true);

    try {
      // Get the existing trip for this assignment
      final trip = await SupabaseService.getBusTripByAssignment(assignment['id']);

      if (trip != null && mounted) {
        final driverState = context.read<DriverState>();
        driverState.enterBusMode(trip['id']);

        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => BusTripScreen(
              tripId: trip['id'],
              assignment: assignment,
            ),
          ),
        );
      } else {
        if (mounted) AppSnackbar.error(context, 'Could not find trip to resume');
      }
    } catch (e) {
      debugPrint('Error resuming trip: $e');
      if (mounted) AppSnackbar.error(context, 'Failed to resume trip');
    } finally {
      if (mounted) setState(() => _isStartingTrip = false);
    }
  }

  String _formatTime(String? time) {
    if (time == null) return '--:--';
    try {
      final parts = time.split(':');
      final hour = int.parse(parts[0]);
      final minute = parts[1];
      final period = hour >= 12 ? 'PM' : 'AM';
      final hour12 = hour == 0 ? 12 : (hour > 12 ? hour - 12 : hour);
      return '$hour12:$minute $period';
    } catch (e) {
      return time;
    }
  }

  String _formatDate(String? date) {
    if (date == null) return '';
    try {
      final d = DateTime.parse(date);
      final now = DateTime.now();
      final today = DateTime(now.year, now.month, now.day);
      final tomorrow = today.add(const Duration(days: 1));
      final dateOnly = DateTime(d.year, d.month, d.day);

      if (dateOnly == today) return 'Today';
      if (dateOnly == tomorrow) return 'Tomorrow';
      return DateFormat('EEE, MMM d').format(d);
    } catch (e) {
      return date;
    }
  }

  IconData _getTransportIcon(String? transportType) {
    switch (transportType) {
      case 'internal_bus': return Icons.directions_bus_rounded;
      case 'mtcc_bus': return Icons.airport_shuttle_rounded;
      case 'ferry': return Icons.directions_boat_rounded;
      default: return Icons.commute_rounded;
    }
  }

  Color _getTransportColor(String? transportType) {
    switch (transportType) {
      case 'internal_bus': return Colors.blue;
      case 'mtcc_bus': return Colors.orange;
      case 'ferry': return Colors.teal;
      default: return Colors.grey;
    }
  }

  String _getTransportLabel(String? transportType) {
    switch (transportType) {
      case 'internal_bus': return 'INTERNAL BUS';
      case 'mtcc_bus': return 'MTCC BUS';
      case 'ferry': return 'FERRY';
      default: return transportType?.toUpperCase() ?? 'TRANSPORT';
    }
  }

  Color _getStatusColor(String? status) {
    switch (status) {
      case 'scheduled': return Colors.blue;
      case 'in_progress': return Colors.orange;
      case 'completed': return Colors.green;
      case 'cancelled': return Colors.red;
      default: return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    final todayCount = _filterAssignments('today').length;
    final tomorrowCount = _filterAssignments('tomorrow').length;
    final upcomingCount = _filterAssignments('upcoming').length;

    return Scaffold(
      backgroundColor: context.bgColor,
      body: Stack(
        children: [
          CustomScrollView(
            slivers: [
              // Modern App Bar
              SliverAppBar(
                expandedHeight: 140,
                floating: false,
                pinned: true,
                backgroundColor: context.bgColor,
                elevation: 0,
                leading: IconButton(
                  icon: Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: context.cardColor,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(Icons.arrow_back, color: context.textColor, size: 20),
                  ),
                  onPressed: () => Navigator.pop(context),
                ),
                actions: [
                  IconButton(
                    icon: Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: context.cardColor,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Icon(Icons.refresh_rounded, color: context.textColor, size: 20),
                    ),
                    onPressed: _loadSchedule,
                  ),
                  const SizedBox(width: 8),
                ],
                flexibleSpace: FlexibleSpaceBar(
                  background: Container(
                    padding: const EdgeInsets.fromLTRB(20, 100, 20, 0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Container(
                              width: 48,
                              height: 48,
                              decoration: BoxDecoration(
                                gradient: LinearGradient(
                                  colors: [AppColors.yellow, AppColors.yellow.withValues(alpha: 0.7)],
                                  begin: Alignment.topLeft,
                                  end: Alignment.bottomRight,
                                ),
                                borderRadius: BorderRadius.circular(14),
                              ),
                              child: const Icon(Icons.schedule_rounded, size: 24, color: Colors.black),
                            ),
                            const SizedBox(width: 14),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'My Schedule',
                                  style: TextStyle(
                                    color: context.textColor,
                                    fontSize: 24,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                Text(
                                  '${_assignments.length} trips this week',
                                  style: TextStyle(color: context.mutedColor, fontSize: 14),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                bottom: PreferredSize(
                  preferredSize: const Size.fromHeight(52),
                  child: Container(
                    margin: const EdgeInsets.symmetric(horizontal: 16),
                    decoration: BoxDecoration(
                      color: context.cardColor,
                      borderRadius: BorderRadius.circular(14),
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
                      labelStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                      unselectedLabelStyle: const TextStyle(fontWeight: FontWeight.w500, fontSize: 13),
                      dividerColor: Colors.transparent,
                      tabs: [
                        Tab(text: 'Today ($todayCount)'),
                        Tab(text: 'Tomorrow ($tomorrowCount)'),
                        Tab(text: 'Upcoming ($upcomingCount)'),
                      ],
                    ),
                  ),
                ),
              ),

              // Content
              SliverFillRemaining(
                child: _isLoading
                    ? const Center(child: CircularProgressIndicator(color: AppColors.yellow))
                    : TabBarView(
                        controller: _tabController,
                        children: [
                          _buildTripList(_filterAssignments('today')),
                          _buildTripList(_filterAssignments('tomorrow')),
                          _buildTripList(_filterAssignments('upcoming')),
                        ],
                      ),
              ),
            ],
          ),

          // Loading overlay
          if (_isStartingTrip)
            Container(
              color: Colors.black54,
              child: const Center(
                child: CircularProgressIndicator(color: AppColors.yellow),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildTripList(List<Map<String, dynamic>> assignments) {
    if (assignments.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                color: context.cardColor,
                borderRadius: BorderRadius.circular(24),
              ),
              child: Icon(Icons.event_busy_rounded, size: 40, color: context.mutedColor),
            ),
            const SizedBox(height: 20),
            Text(
              'No trips scheduled',
              style: TextStyle(color: context.textColor, fontSize: 18, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            Text(
              'Check back later for assignments',
              style: TextStyle(color: context.mutedColor, fontSize: 14),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadSchedule,
      color: AppColors.yellow,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: assignments.length,
        itemBuilder: (context, index) => _buildTripCard(assignments[index]),
      ),
    );
  }

  Future<void> _showReminderDialog(Map<String, dynamic> assignment) async {
    final assignmentId = assignment['id'] as String;
    final route = assignment['route'] as Map<String, dynamic>?;
    final hasReminder = _remindersSet.contains(assignmentId);

    final result = await showModalBottomSheet<int?>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Container(
        decoration: BoxDecoration(
          color: context.cardColor,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        padding: EdgeInsets.only(
          left: 24,
          right: 24,
          top: 24,
          bottom: MediaQuery.of(ctx).padding.bottom + 24,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: context.mutedColor.withValues(alpha: 0.3),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 24),
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [Colors.purple, Colors.purple.withValues(alpha: 0.7)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(18),
              ),
              child: const Icon(Icons.alarm_rounded, size: 32, color: Colors.white),
            ),
            const SizedBox(height: 16),
            Text(
              hasReminder ? 'Reminder Set' : 'Set Reminder',
              style: TextStyle(
                color: context.textColor,
                fontSize: 22,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              route?['route_name'] ?? 'Trip',
              style: TextStyle(color: context.mutedColor, fontSize: 15),
            ),
            const SizedBox(height: 6),
            Text(
              'Departure: ${_formatTime(assignment['departure_time'])}',
              style: TextStyle(color: AppColors.yellow, fontSize: 14, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 24),

            if (hasReminder) ...[
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.green.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: Colors.green.withValues(alpha: 0.3)),
                ),
                child: Row(
                  children: [
                    Icon(Icons.check_circle_rounded, color: Colors.green, size: 24),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        'You have a reminder set for this trip',
                        style: TextStyle(color: Colors.green, fontSize: 14, fontWeight: FontWeight.w500),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: TextButton(
                  onPressed: () => Navigator.pop(ctx, -1), // -1 means remove
                  style: TextButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                      side: BorderSide(color: Colors.red.withValues(alpha: 0.5)),
                    ),
                  ),
                  child: const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.alarm_off_rounded, color: Colors.red, size: 20),
                      SizedBox(width: 8),
                      Text('Remove Reminder', style: TextStyle(color: Colors.red, fontWeight: FontWeight.w600, fontSize: 15)),
                    ],
                  ),
                ),
              ),
            ] else ...[
              Text(
                'Remind me before departure:',
                style: TextStyle(color: context.mutedColor, fontSize: 14),
              ),
              const SizedBox(height: 16),
              _buildReminderOption(ctx, 5, 'min'),
              const SizedBox(height: 10),
              _buildReminderOption(ctx, 10, 'min'),
              const SizedBox(height: 10),
              _buildReminderOption(ctx, 15, 'min'),
              const SizedBox(height: 10),
              _buildReminderOption(ctx, 30, 'min'),
            ],
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: TextButton(
                onPressed: () => Navigator.pop(ctx, null),
                child: Text('Cancel', style: TextStyle(color: context.mutedColor, fontSize: 15)),
              ),
            ),
          ],
        ),
      ),
    );

    if (result == null) return;

    HapticFeedback.mediumImpact();

    if (result == -1) {
      // Remove reminder
      setState(() => _remindersSet.remove(assignmentId));
      await _saveReminders();
      await NotificationService().cancelNotification(assignmentId.hashCode);
      if (mounted) AppSnackbar.success(context, 'Reminder removed');
    } else {
      // Set reminder
      final departureTime = assignment['departure_time'] as String?;
      final serviceDate = assignment['service_date'] as String?;

      if (departureTime != null && serviceDate != null) {
        final timeParts = departureTime.split(':');
        final dateParts = serviceDate.split('-');

        final departureDateTime = DateTime(
          int.parse(dateParts[0]),
          int.parse(dateParts[1]),
          int.parse(dateParts[2]),
          int.parse(timeParts[0]),
          int.parse(timeParts[1]),
        );

        final reminderTime = departureDateTime.subtract(Duration(minutes: result));

        if (reminderTime.isAfter(DateTime.now())) {
          await NotificationService().scheduleNotification(
            id: assignmentId.hashCode,
            title: 'Bus Trip Reminder',
            body: '${route?['route_name'] ?? 'Your bus trip'} departs in $result minutes',
            scheduledTime: reminderTime,
          );

          setState(() => _remindersSet.add(assignmentId));
          await _saveReminders();
          if (mounted) AppSnackbar.success(context, 'Reminder set for $result min before');
        } else {
          if (mounted) AppSnackbar.error(context, 'Departure time is too soon for this reminder');
        }
      }
    }
  }

  Widget _buildReminderOption(BuildContext ctx, int minutes, String unit) {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton(
        onPressed: () => Navigator.pop(ctx, minutes),
        style: ElevatedButton.styleFrom(
          backgroundColor: context.bgColor,
          foregroundColor: context.textColor,
          padding: const EdgeInsets.symmetric(vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
            side: BorderSide(color: context.borderColor),
          ),
          elevation: 0,
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.alarm_rounded, size: 20, color: Colors.purple),
            const SizedBox(width: 10),
            Text(
              '$minutes $unit before',
              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTripCard(Map<String, dynamic> assignment) {
    final route = assignment['route'] as Map<String, dynamic>?;
    final vehicle = assignment['vehicle'] as Map<String, dynamic>?;
    final status = assignment['status'] as String?;
    final isScheduled = status == 'scheduled';
    final transportType = route?['transport_type'] as String?;
    final transportColor = _getTransportColor(transportType);
    final assignmentId = assignment['id'] as String?;
    final hasReminder = assignmentId != null && _remindersSet.contains(assignmentId);

    // Check if departure is far enough in the future for reminders (at least 10 min)
    bool canSetReminder = false;
    final departureTime = assignment['departure_time'] as String?;
    final serviceDate = assignment['service_date'] as String?;
    if (departureTime != null && serviceDate != null && isScheduled) {
      try {
        final timeParts = departureTime.split(':');
        final dateParts = serviceDate.split('-');
        final departureDateTime = DateTime(
          int.parse(dateParts[0]),
          int.parse(dateParts[1]),
          int.parse(dateParts[2]),
          int.parse(timeParts[0]),
          int.parse(timeParts[1]),
        );
        // Can set reminder if departure is at least 5 minutes away
        canSetReminder = departureDateTime.isAfter(DateTime.now().add(const Duration(minutes: 5)));
      } catch (e) {
        canSetReminder = false;
      }
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: context.cardColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.borderColor),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          children: [
            // Header row: Icon, Route name, Status
            Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: transportColor.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(_getTransportIcon(transportType), color: transportColor, size: 20),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        route?['route_name'] ?? 'Unknown Route',
                        style: TextStyle(
                          color: context.textColor,
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${route?['route_code'] ?? ''} • ${route?['direction'] ?? ''}',
                        style: TextStyle(color: context.mutedColor, fontSize: 12),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: _getStatusColor(status).withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    (status ?? 'unknown').toUpperCase().replaceAll('_', ' '),
                    style: TextStyle(
                      color: _getStatusColor(status),
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 12),

            // Info row: Date, Time, Vehicle
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: context.bgColor,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Row(
                children: [
                  // Date
                  Icon(Icons.calendar_today_rounded, size: 14, color: context.mutedColor),
                  const SizedBox(width: 6),
                  Text(
                    _formatDate(assignment['service_date']),
                    style: TextStyle(color: context.textColor, fontSize: 13, fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(width: 16),
                  // Time
                  Icon(Icons.access_time_rounded, size: 14, color: context.mutedColor),
                  const SizedBox(width: 6),
                  Text(
                    _formatTime(assignment['departure_time']),
                    style: TextStyle(color: context.textColor, fontSize: 13, fontWeight: FontWeight.w600),
                  ),
                  const Spacer(),
                  // Vehicle
                  if (vehicle != null) ...[
                    Icon(Icons.directions_bus_rounded, size: 14, color: context.mutedColor),
                    const SizedBox(width: 6),
                    Text(
                      vehicle['vehicle_number'] ?? '',
                      style: TextStyle(color: context.textColor, fontSize: 13, fontWeight: FontWeight.w600),
                    ),
                    if (vehicle['capacity'] != null) ...[
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: context.cardColor,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Row(
                          children: [
                            Icon(Icons.people_rounded, size: 12, color: context.mutedColor),
                            const SizedBox(width: 3),
                            Text(
                              '${vehicle['capacity']}',
                              style: TextStyle(color: context.textColor, fontSize: 11, fontWeight: FontWeight.w600),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ],
              ),
            ),

            // Action buttons
            if (isScheduled) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  // Reminder Button - only show if can set reminder
                  if (canSetReminder || hasReminder)
                    GestureDetector(
                      onTap: canSetReminder || hasReminder ? () => _showReminderDialog(assignment) : null,
                      child: Container(
                        width: 44,
                        height: 44,
                        margin: const EdgeInsets.only(right: 10),
                        decoration: BoxDecoration(
                          color: hasReminder
                              ? Colors.purple.withValues(alpha: 0.15)
                              : context.bgColor,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: hasReminder ? Colors.purple : context.borderColor,
                          ),
                        ),
                        child: Icon(
                          hasReminder ? Icons.alarm_on_rounded : Icons.alarm_add_rounded,
                          color: hasReminder ? Colors.purple : context.mutedColor,
                          size: 20,
                        ),
                      ),
                    ),
                  // Start Trip Button
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () => _startTrip(assignment),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.yellow,
                        foregroundColor: Colors.black,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        elevation: 0,
                      ),
                      child: const Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.play_arrow_rounded, size: 20),
                          SizedBox(width: 6),
                          Text('Start Trip', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ] else if (status == 'in_progress') ...[
              const SizedBox(height: 12),
              // Resume Trip Button for in-progress trips
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () => _resumeTrip(assignment),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.orange,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    elevation: 0,
                  ),
                  child: const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.play_circle_rounded, size: 20),
                      SizedBox(width: 6),
                      Text('Resume Trip', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                    ],
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildDetailItem(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Column(
        children: [
          Icon(icon, size: 20, color: context.mutedColor),
          const SizedBox(height: 6),
          Text(
            label,
            style: TextStyle(color: context.mutedColor, fontSize: 11, fontWeight: FontWeight.w500),
          ),
          const SizedBox(height: 2),
          Text(
            value,
            style: TextStyle(color: context.textColor, fontSize: 15, fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}
