import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../services/supabase_service.dart';
import '../providers/driver_state.dart';
import '../theme/app_theme.dart';
import '../widgets/app_snackbar.dart';
import 'bus_trip_screen.dart';

class MyBusScheduleScreen extends StatefulWidget {
  const MyBusScheduleScreen({super.key});

  @override
  State<MyBusScheduleScreen> createState() => _MyBusScheduleScreenState();
}

class _MyBusScheduleScreenState extends State<MyBusScheduleScreen> {
  List<Map<String, dynamic>> _assignments = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadSchedule();
  }

  Future<void> _loadSchedule() async {
    setState(() => _isLoading = true);
    try {
      final driverState = context.read<DriverState>();
      final assignments = await SupabaseService.getMyBusSchedule(driverState.driverId ?? '');
      setState(() {
        _assignments = assignments;
        _isLoading = false;
      });
    } catch (e) {
      debugPrint('Error loading schedule: $e');
      setState(() => _isLoading = false);
    }
  }

  Future<void> _startTrip(Map<String, dynamic> assignment) async {
    HapticFeedback.mediumImpact();

    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.cardColor,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text('Start Bus Trip?', style: TextStyle(color: context.textColor, fontWeight: FontWeight.w700)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              assignment['route']?['route_name'] ?? 'Unknown Route',
              style: TextStyle(color: context.textColor, fontSize: 18, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            Text(
              'Departure: ${_formatTime(assignment['departure_time'])}',
              style: TextStyle(color: context.mutedColor),
            ),
            const SizedBox(height: 16),
            Text(
              'You will enter bus mode and won\'t receive on-demand ride requests until the trip is completed.',
              style: TextStyle(color: context.mutedColor, fontSize: 14),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('Cancel', style: TextStyle(color: context.mutedColor)),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.yellow,
              foregroundColor: AppColors.darkBg,
            ),
            child: const Text('Start Trip'),
          ),
        ],
      ),
    );

    if (confirm != true) return;

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
    return Scaffold(
      backgroundColor: context.bgColor,
      appBar: AppBar(
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
        title: Text(
          'My Bus Schedule',
          style: TextStyle(color: context.textColor, fontWeight: FontWeight.w800, fontSize: 20),
        ),
        centerTitle: true,
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
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: AppColors.yellow))
          : _assignments.isEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.directions_bus_outlined, size: 64, color: context.mutedColor),
                      const SizedBox(height: 16),
                      Text(
                        'No scheduled trips',
                        style: TextStyle(color: context.mutedColor, fontSize: 18),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Check back later for assignments',
                        style: TextStyle(color: context.mutedColor, fontSize: 14),
                      ),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _loadSchedule,
                  color: AppColors.yellow,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: _assignments.length,
                    itemBuilder: (context, index) {
                      final assignment = _assignments[index];
                      final route = assignment['route'] as Map<String, dynamic>?;
                      final vehicle = assignment['vehicle'] as Map<String, dynamic>?;
                      final status = assignment['status'] as String?;
                      final isScheduled = status == 'scheduled';

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
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                        decoration: BoxDecoration(
                                          color: _getTransportColor(route?['transport_type']).withValues(alpha: 0.2),
                                          borderRadius: BorderRadius.circular(8),
                                        ),
                                        child: Text(
                                          _getTransportLabel(route?['transport_type']),
                                          style: TextStyle(
                                            color: _getTransportColor(route?['transport_type']),
                                            fontSize: 11,
                                            fontWeight: FontWeight.w700,
                                          ),
                                        ),
                                      ),
                                      const Spacer(),
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                        decoration: BoxDecoration(
                                          color: _getStatusColor(status).withValues(alpha: 0.2),
                                          borderRadius: BorderRadius.circular(8),
                                        ),
                                        child: Text(
                                          (status ?? 'unknown').toUpperCase().replaceAll('_', ' '),
                                          style: TextStyle(
                                            color: _getStatusColor(status),
                                            fontSize: 11,
                                            fontWeight: FontWeight.w700,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 12),
                                  Text(
                                    route?['route_name'] ?? 'Unknown Route',
                                    style: TextStyle(
                                      color: context.textColor,
                                      fontSize: 18,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    '${route?['route_code'] ?? ''} • ${route?['direction'] ?? ''}',
                                    style: TextStyle(color: context.mutedColor, fontSize: 14),
                                  ),
                                  const SizedBox(height: 16),
                                  Row(
                                    children: [
                                      _buildInfoChip(
                                        context,
                                        Icons.calendar_today_rounded,
                                        _formatDate(assignment['service_date']),
                                      ),
                                      const SizedBox(width: 12),
                                      _buildInfoChip(
                                        context,
                                        Icons.access_time_rounded,
                                        _formatTime(assignment['departure_time']),
                                      ),
                                    ],
                                  ),
                                  if (vehicle != null) ...[
                                    const SizedBox(height: 8),
                                    _buildInfoChip(
                                      context,
                                      Icons.directions_bus_rounded,
                                      '${vehicle['name']} (${vehicle['plate_no']})',
                                    ),
                                  ],
                                ],
                              ),
                            ),
                            if (isScheduled)
                              Container(
                                width: double.infinity,
                                decoration: BoxDecoration(
                                  border: Border(top: BorderSide(color: context.borderColor)),
                                ),
                                child: TextButton(
                                  onPressed: () => _startTrip(assignment),
                                  style: TextButton.styleFrom(
                                    padding: const EdgeInsets.symmetric(vertical: 14),
                                    shape: const RoundedRectangleBorder(
                                      borderRadius: BorderRadius.only(
                                        bottomLeft: Radius.circular(16),
                                        bottomRight: Radius.circular(16),
                                      ),
                                    ),
                                  ),
                                  child: Row(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Icon(Icons.play_arrow_rounded, color: AppColors.yellow),
                                      const SizedBox(width: 8),
                                      Text(
                                        'Start Trip',
                                        style: TextStyle(
                                          color: AppColors.yellow,
                                          fontWeight: FontWeight.w700,
                                          fontSize: 16,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                          ],
                        ),
                      );
                    },
                  ),
                ),
    );
  }

  Widget _buildInfoChip(BuildContext context, IconData icon, String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: context.bgColor,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: context.mutedColor),
          const SizedBox(width: 6),
          Text(
            text,
            style: TextStyle(color: context.textColor, fontSize: 13, fontWeight: FontWeight.w500),
          ),
        ],
      ),
    );
  }
}
