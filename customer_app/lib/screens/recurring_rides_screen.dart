import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../services/supabase_service.dart';
import '../widgets/shimmer_loading.dart';
import '../widgets/app_snackbar.dart';

class RecurringRidesScreen extends StatefulWidget {
  const RecurringRidesScreen({super.key});

  @override
  State<RecurringRidesScreen> createState() => _RecurringRidesScreenState();
}

class _RecurringRidesScreenState extends State<RecurringRidesScreen> {
  List<Map<String, dynamic>> _recurringRides = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadRecurringRides();
  }

  Future<void> _loadRecurringRides() async {
    setState(() => _isLoading = true);
    final rides = await SupabaseService.getRecurringRides();
    setState(() {
      _recurringRides = rides;
      _isLoading = false;
    });
  }

  String _formatDays(List<dynamic> days) {
    if (days.length == 7) return 'Every day';
    if (days.length == 5 &&
        days.contains('Mon') && days.contains('Tue') &&
        days.contains('Wed') && days.contains('Thu') &&
        days.contains('Fri')) {
      return 'Weekdays';
    }
    if (days.length == 2 && days.contains('Sat') && days.contains('Sun')) {
      return 'Weekends';
    }
    return days.join(', ');
  }

  String _formatTime(String time) {
    final parts = time.split(':');
    if (parts.length < 2) return time;
    final hour = int.tryParse(parts[0]) ?? 0;
    final minute = parts[1];
    return '${hour.toString().padLeft(2, '0')}:$minute';
  }

  Future<void> _toggleRide(String id, bool currentActive) async {
    final success = await SupabaseService.toggleRecurringRide(id, !currentActive);
    if (success) {
      _loadRecurringRides();
    }
  }

  Future<void> _deleteRide(String id) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.surfaceColor,
        title: Text('Delete Schedule', style: TextStyle(color: context.textColor)),
        content: Text('Are you sure you want to delete this recurring ride?',
            style: TextStyle(color: context.textColor.withValues(alpha: 0.7))),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('Cancel', style: TextStyle(color: context.textColor.withValues(alpha: 0.7))),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );

    if (confirm == true) {
      final success = await SupabaseService.deleteRecurringRide(id);
      if (success) {
        _loadRecurringRides();
        if (mounted) {
          AppSnackbar.success(context, 'Schedule deleted');
        }
      }
    }
  }

  void _showAddDialog() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => AddRecurringRideSheet(
        onSaved: () {
          Navigator.pop(ctx);
          _loadRecurringRides();
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.bgColor,
      appBar: AppBar(
        backgroundColor: context.bgColor,
        elevation: 0,
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: context.textColor),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text('Recurring Rides', style: TextStyle(color: context.textColor, fontWeight: FontWeight.w700)),
        actions: [
          IconButton(
            icon: Icon(Icons.add, color: AppColors.yellow),
            onPressed: _showAddDialog,
          ),
        ],
      ),
      body: _isLoading
          ? const ShimmerList(itemCount: 4)
          : _recurringRides.isEmpty
              ? _buildEmptyState()
              : RefreshIndicator(
                  onRefresh: _loadRecurringRides,
                  color: AppColors.yellow,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: _recurringRides.length,
                    itemBuilder: (ctx, i) => _buildRideCard(_recurringRides[i]),
                  ),
                ),
      floatingActionButton: _recurringRides.isEmpty
          ? null
          : FloatingActionButton(
              onPressed: _showAddDialog,
              backgroundColor: AppColors.yellow,
              child: const Icon(Icons.add, color: AppColors.bgDark),
            ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.repeat, size: 64, color: context.textColor.withValues(alpha: 0.3)),
          const SizedBox(height: 16),
          Text(
            'No Recurring Rides',
            style: TextStyle(color: context.textColor, fontSize: 18, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 8),
          Text(
            'Set up your daily commute',
            style: TextStyle(color: context.textColor.withValues(alpha: 0.6)),
          ),
          const SizedBox(height: 24),
          ElevatedButton.icon(
            onPressed: _showAddDialog,
            icon: const Icon(Icons.add),
            label: const Text('Add Schedule'),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.yellow,
              foregroundColor: AppColors.bgDark,
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRideCard(Map<String, dynamic> ride) {
    final isActive = ride['is_active'] ?? true;
    final days = List<String>.from(ride['days_of_week'] ?? []);
    final time = ride['schedule_time'] ?? '08:00';

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: context.surfaceColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isActive ? AppColors.yellow.withValues(alpha: 0.3) : context.borderColor,
        ),
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
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: isActive ? AppColors.yellow.withValues(alpha: 0.1) : context.borderColor.withValues(alpha: 0.3),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Icon(
                        Icons.schedule,
                        color: isActive ? AppColors.yellow : context.textColor.withValues(alpha: 0.4),
                        size: 24,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            _formatTime(time),
                            style: TextStyle(
                              color: isActive ? context.textColor : context.textColor.withValues(alpha: 0.5),
                              fontSize: 18,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          Text(
                            _formatDays(days),
                            style: TextStyle(
                              color: isActive ? AppColors.yellow : context.textColor.withValues(alpha: 0.4),
                              fontSize: 13,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Switch(
                      value: isActive,
                      onChanged: (_) => _toggleRide(ride['id'], isActive),
                      activeColor: AppColors.yellow,
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Icon(Icons.circle, size: 8, color: AppColors.yellow),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        ride['pickup_name'] ?? 'Pickup',
                        style: TextStyle(
                          color: isActive ? context.textColor : context.textColor.withValues(alpha: 0.5),
                          fontSize: 14,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
                Padding(
                  padding: const EdgeInsets.only(left: 3),
                  child: Container(width: 2, height: 12, color: context.borderColor),
                ),
                Row(
                  children: [
                    Icon(Icons.location_on, size: 12, color: Colors.red),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        ride['dropoff_name'] ?? 'Dropoff',
                        style: TextStyle(
                          color: isActive ? context.textColor : context.textColor.withValues(alpha: 0.5),
                          fontSize: 14,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          Container(
            decoration: BoxDecoration(
              border: Border(top: BorderSide(color: context.borderColor)),
            ),
            child: Row(
              children: [
                Expanded(
                  child: TextButton.icon(
                    onPressed: () => _deleteRide(ride['id']),
                    icon: const Icon(Icons.delete_outline, size: 18, color: Colors.red),
                    label: const Text('Delete', style: TextStyle(color: Colors.red)),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class AddRecurringRideSheet extends StatefulWidget {
  final VoidCallback onSaved;

  const AddRecurringRideSheet({super.key, required this.onSaved});

  @override
  State<AddRecurringRideSheet> createState() => _AddRecurringRideSheetState();
}

class _AddRecurringRideSheetState extends State<AddRecurringRideSheet> {
  final _pickupController = TextEditingController();
  final _dropoffController = TextEditingController();
  TimeOfDay _selectedTime = const TimeOfDay(hour: 8, minute: 0);
  Set<String> _selectedDays = {'Mon', 'Tue', 'Wed', 'Thu', 'Fri'};
  bool _isSaving = false;

  double _pickupLat = 4.1755;
  double _pickupLng = 73.5093;
  double _dropoffLat = 4.1918;
  double _dropoffLng = 73.5290;

  final _days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  Future<void> _selectTime() async {
    final picked = await showTimePicker(
      context: context,
      initialTime: _selectedTime,
      builder: (context, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: ColorScheme.dark(
              primary: AppColors.yellow,
              surface: context.surfaceColor,
            ),
          ),
          child: child!,
        );
      },
    );
    if (picked != null) {
      setState(() => _selectedTime = picked);
    }
  }

  Future<void> _save() async {
    if (_pickupController.text.isEmpty || _dropoffController.text.isEmpty) {
      AppSnackbar.warning(context, 'Please enter pickup and dropoff locations');
      return;
    }

    if (_selectedDays.isEmpty) {
      AppSnackbar.warning(context, 'Please select at least one day');
      return;
    }

    setState(() => _isSaving = true);

    final timeStr = '${_selectedTime.hour.toString().padLeft(2, '0')}:${_selectedTime.minute.toString().padLeft(2, '0')}:00';

    final result = await SupabaseService.createRecurringRide(
      pickupName: _pickupController.text,
      pickupLat: _pickupLat,
      pickupLng: _pickupLng,
      dropoffName: _dropoffController.text,
      dropoffLat: _dropoffLat,
      dropoffLng: _dropoffLng,
      scheduleTime: timeStr,
      daysOfWeek: _selectedDays.toList(),
    );

    setState(() => _isSaving = false);

    if (result != null) {
      widget.onSaved();
    } else {
      if (mounted) {
        AppSnackbar.error(context, 'Failed to create schedule');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.only(
        left: 24,
        right: 24,
        top: 24,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      decoration: BoxDecoration(
        color: context.surfaceColor,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
      ),
      child: SingleChildScrollView(
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
            const SizedBox(height: 24),
            Text(
              'New Recurring Ride',
              style: TextStyle(color: context.textColor, fontSize: 20, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 24),

            Text('Pickup', style: TextStyle(color: context.textColor.withValues(alpha: 0.6), fontSize: 13)),
            const SizedBox(height: 8),
            TextField(
              controller: _pickupController,
              style: TextStyle(color: context.textColor),
              decoration: InputDecoration(
                hintText: 'Enter pickup location',
                hintStyle: TextStyle(color: context.textColor.withValues(alpha: 0.4)),
                prefixIcon: Icon(Icons.circle, size: 10, color: AppColors.yellow),
                filled: true,
                fillColor: context.bgColor,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
            const SizedBox(height: 16),

            Text('Dropoff', style: TextStyle(color: context.textColor.withValues(alpha: 0.6), fontSize: 13)),
            const SizedBox(height: 8),
            TextField(
              controller: _dropoffController,
              style: TextStyle(color: context.textColor),
              decoration: InputDecoration(
                hintText: 'Enter dropoff location',
                hintStyle: TextStyle(color: context.textColor.withValues(alpha: 0.4)),
                prefixIcon: const Icon(Icons.location_on, size: 16, color: Colors.red),
                filled: true,
                fillColor: context.bgColor,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
            const SizedBox(height: 24),

            Text('Time', style: TextStyle(color: context.textColor.withValues(alpha: 0.6), fontSize: 13)),
            const SizedBox(height: 8),
            GestureDetector(
              onTap: _selectTime,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                decoration: BoxDecoration(
                  color: context.bgColor,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    Icon(Icons.schedule, color: AppColors.yellow),
                    const SizedBox(width: 12),
                    Text(
                      '${_selectedTime.hour.toString().padLeft(2, '0')}:${_selectedTime.minute.toString().padLeft(2, '0')}',
                      style: TextStyle(color: context.textColor, fontSize: 16, fontWeight: FontWeight.w600),
                    ),
                    const Spacer(),
                    Icon(Icons.chevron_right, color: context.textColor.withValues(alpha: 0.4)),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),

            Text('Days', style: TextStyle(color: context.textColor.withValues(alpha: 0.6), fontSize: 13)),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: _days.map((day) {
                final isSelected = _selectedDays.contains(day);
                return GestureDetector(
                  onTap: () {
                    setState(() {
                      if (isSelected) {
                        _selectedDays.remove(day);
                      } else {
                        _selectedDays.add(day);
                      }
                    });
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    decoration: BoxDecoration(
                      color: isSelected ? AppColors.yellow : context.bgColor,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      day,
                      style: TextStyle(
                        color: isSelected ? AppColors.bgDark : context.textColor,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
            const SizedBox(height: 32),

            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _isSaving ? null : _save,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.yellow,
                  foregroundColor: AppColors.bgDark,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                child: _isSaving
                    ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Save Schedule', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
