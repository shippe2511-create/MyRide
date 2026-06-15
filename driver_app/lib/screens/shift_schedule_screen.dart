import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../theme/app_theme.dart';
import '../services/supabase_service.dart';

class ShiftScheduleScreen extends StatefulWidget {
  const ShiftScheduleScreen({super.key});

  @override
  State<ShiftScheduleScreen> createState() => _ShiftScheduleScreenState();
}

class _ShiftScheduleScreenState extends State<ShiftScheduleScreen> {
  int _selectedDay = DateTime.now().weekday - 1;
  bool _isLoading = true;

  final List<String> _weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  List<Map<String, dynamic>> _weekSchedule = [
    {'shifts': []}, {'shifts': []}, {'shifts': []}, {'shifts': []},
    {'shifts': []}, {'shifts': []}, {'shifts': []},
  ];

  @override
  void initState() {
    super.initState();
    _loadShifts();
  }

  Future<void> _loadShifts() async {
    setState(() => _isLoading = true);
    try {
      final driverId = SupabaseService.visibleUserId;
      if (driverId == null) {
        setState(() => _isLoading = false);
        return;
      }

      final now = DateTime.now();
      final weekStart = now.subtract(Duration(days: now.weekday - 1));
      final weekEnd = weekStart.add(const Duration(days: 7));

      final shifts = await SupabaseService.getDriverShifts(
        driverId,
        weekStart,
        weekEnd,
      );

      final newSchedule = List.generate(7, (_) => <String, dynamic>{'shifts': <Map<String, dynamic>>[]});

      for (final shift in shifts) {
        final shiftDate = DateTime.tryParse(shift['shift_date'] ?? '');
        if (shiftDate == null) continue;

        final dayIndex = shiftDate.weekday - 1;
        if (dayIndex < 0 || dayIndex > 6) continue;

        String status = shift['status'] ?? 'scheduled';
        if (status == 'scheduled') {
          if (shiftDate.isBefore(DateTime(now.year, now.month, now.day))) {
            status = 'completed';
          } else if (shiftDate.year == now.year && shiftDate.month == now.month && shiftDate.day == now.day) {
            status = 'current';
          } else {
            status = 'upcoming';
          }
        }

        (newSchedule[dayIndex]['shifts'] as List).add({
          'start': shift['start_time']?.toString().substring(0, 5) ?? '00:00',
          'end': shift['end_time']?.toString().substring(0, 5) ?? '00:00',
          'type': _capitalizeFirst(shift['shift_type'] ?? 'shift'),
          'status': status,
        });
      }

      setState(() {
        _weekSchedule = newSchedule;
        _isLoading = false;
      });
    } catch (e) {
      debugPrint('Error loading shifts: $e');
      setState(() => _isLoading = false);
    }
  }

  String _capitalizeFirst(String s) {
    if (s.isEmpty) return s;
    return s[0].toUpperCase() + s.substring(1);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.bgColor,
      appBar: AppBar(
        backgroundColor: context.bgColor,
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: context.textColor),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text('Shift Schedule', style: TextStyle(color: context.textColor)),
        actions: [
          IconButton(
            icon: Icon(Icons.calendar_month, color: context.textColor),
            onPressed: () => _showMonthView(context),
          ),
        ],
      ),
      body: _isLoading
          ? Center(child: CircularProgressIndicator(color: AppColors.yellow))
          : RefreshIndicator(
              onRefresh: _loadShifts,
              color: AppColors.yellow,
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                child: Column(
                  children: [
                    _buildWeekSummary(context),
                    _buildDaySelector(context),
                    _buildDaySchedule(context),
                  ],
                ),
              ),
            ),
    );
  }

  Widget _buildWeekSummary(BuildContext context) {
    int totalHours = 0;
    int completedShifts = 0;
    int upcomingShifts = 0;

    for (var day in _weekSchedule) {
      for (var shift in day['shifts'] as List) {
        final start = int.parse((shift['start'] as String).split(':')[0]);
        final end = int.parse((shift['end'] as String).split(':')[0]);
        totalHours += (end - start);

        if (shift['status'] == 'completed') completedShifts++;
        if (shift['status'] == 'upcoming' || shift['status'] == 'current') upcomingShifts++;
      }
    }

    return Container(
      margin: const EdgeInsets.all(20),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            AppColors.yellow.withValues(alpha: 0.15),
            AppColors.yellow.withValues(alpha: 0.05),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.yellow.withValues(alpha: 0.3)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _buildSummaryItem(context, '$totalHours', 'Hours', Icons.access_time),
          Container(width: 1, height: 40, color: context.borderColor),
          _buildSummaryItem(context, '$completedShifts', 'Completed', Icons.check_circle_outline),
          Container(width: 1, height: 40, color: context.borderColor),
          _buildSummaryItem(context, '$upcomingShifts', 'Upcoming', Icons.schedule),
        ],
      ),
    );
  }

  Widget _buildSummaryItem(BuildContext context, String value, String label, IconData icon) {
    return Column(
      children: [
        Icon(icon, color: AppColors.yellow, size: 24),
        const SizedBox(height: 8),
        Text(
          value,
          style: TextStyle(
            color: context.textColor,
            fontSize: 24,
            fontWeight: FontWeight.w700,
          ),
        ),
        Text(
          label,
          style: TextStyle(
            color: context.mutedColor,
            fontSize: 12,
          ),
        ),
      ],
    );
  }

  Widget _buildDaySelector(BuildContext context) {
    final today = DateTime.now();
    final startOfWeek = today.subtract(Duration(days: today.weekday - 1));

    return Container(
      height: 80,
      margin: const EdgeInsets.symmetric(horizontal: 16),
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        itemCount: 7,
        itemBuilder: (context, index) {
          final date = startOfWeek.add(Duration(days: index));
          final isSelected = index == _selectedDay;
          final isToday = index == today.weekday - 1;
          final hasShift = (_weekSchedule[index]['shifts'] as List).isNotEmpty;

          return GestureDetector(
            onTap: () {
              HapticFeedback.selectionClick();
              setState(() => _selectedDay = index);
            },
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              width: 52,
              margin: const EdgeInsets.symmetric(horizontal: 4),
              decoration: BoxDecoration(
                color: isSelected
                    ? AppColors.yellow
                    : isToday
                        ? AppColors.yellow.withValues(alpha: 0.15)
                        : context.cardColor,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: isSelected
                      ? AppColors.yellow
                      : isToday
                          ? AppColors.yellow.withValues(alpha: 0.5)
                          : context.borderColor,
                ),
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    _weekDays[index],
                    style: TextStyle(
                      color: isSelected ? Colors.black : context.mutedColor,
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${date.day}',
                    style: TextStyle(
                      color: isSelected ? Colors.black : context.textColor,
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Container(
                    width: 6,
                    height: 6,
                    decoration: BoxDecoration(
                      color: hasShift
                          ? isSelected
                              ? Colors.black
                              : AppColors.success
                          : Colors.transparent,
                      shape: BoxShape.circle,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildDaySchedule(BuildContext context) {
    final shifts = _weekSchedule[_selectedDay]['shifts'] as List;
    final today = DateTime.now();
    final startOfWeek = today.subtract(Duration(days: today.weekday - 1));
    final selectedDate = startOfWeek.add(Duration(days: _selectedDay));

    if (shifts.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                color: context.cardColor,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Icon(Icons.beach_access, color: context.mutedColor, size: 40),
            ),
            const SizedBox(height: 16),
            Text(
              'Day Off',
              style: TextStyle(
                color: context.textColor,
                fontSize: 20,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'No shifts scheduled',
              style: TextStyle(
                color: context.mutedColor,
                fontSize: 14,
              ),
            ),
          ],
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _formatDate(selectedDate),
            style: TextStyle(
              color: context.mutedColor,
              fontSize: 14,
            ),
          ),
          const SizedBox(height: 16),
          ...shifts.map((shift) => _buildShiftCard(context, shift as Map<String, dynamic>)),
        ],
      ),
    );
  }

  Widget _buildShiftCard(BuildContext context, Map<String, dynamic> shift) {
    final status = shift['status'] as String;
    final isCurrent = status == 'current';
    final isCompleted = status == 'completed';

    Color statusColor;
    String statusText;

    if (isCurrent) {
      statusColor = AppColors.success;
      statusText = 'In Progress';
    } else if (isCompleted) {
      statusColor = context.mutedColor;
      statusText = 'Completed';
    } else {
      statusColor = AppColors.yellow;
      statusText = 'Upcoming';
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: context.cardColor,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: isCurrent ? AppColors.success : context.borderColor,
          width: isCurrent ? 2 : 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  statusText,
                  style: TextStyle(
                    color: statusColor,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: context.bgColor,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  shift['type'] as String,
                  style: TextStyle(
                    color: context.textColor,
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              _buildTimeBlock(context, shift['start'] as String, 'Start'),
              Expanded(
                child: Column(
                  children: [
                    Icon(Icons.arrow_forward, color: context.mutedColor, size: 20),
                    const SizedBox(height: 4),
                    Text(
                      '8 hours',
                      style: TextStyle(
                        color: context.mutedColor,
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
              ),
              _buildTimeBlock(context, shift['end'] as String, 'End'),
            ],
          ),
          if (isCurrent) ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.success.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  Icon(Icons.access_time, color: AppColors.success, size: 18),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Shift ends in 6 hours 30 minutes',
                      style: TextStyle(
                        color: AppColors.success,
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildTimeBlock(BuildContext context, String time, String label) {
    return Column(
      children: [
        Text(
          label,
          style: TextStyle(
            color: context.mutedColor,
            fontSize: 11,
          ),
        ),
        const SizedBox(height: 4),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            color: context.bgColor,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: context.borderColor),
          ),
          child: Text(
            time,
            style: TextStyle(
              color: context.textColor,
              fontSize: 20,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ],
    );
  }

  String _formatDate(DateTime date) {
    final months = ['January', 'February', 'March', 'April', 'May', 'June',
                   'July', 'August', 'September', 'October', 'November', 'December'];
    final days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    return '${days[date.weekday - 1]}, ${months[date.month - 1]} ${date.day}';
  }

  void _showMonthView(BuildContext context) {
    HapticFeedback.lightImpact();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: const Text('Monthly view coming soon'),
        backgroundColor: AppColors.yellow,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    );
  }
}
