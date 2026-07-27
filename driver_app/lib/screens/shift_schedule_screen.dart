import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../theme/app_theme.dart';
import '../services/supabase_service.dart';
import '../services/realtime_service.dart';
import '../utils/timezone_utils.dart';
import '../widgets/shimmer_loading.dart';

class ShiftScheduleScreen extends StatefulWidget {
  const ShiftScheduleScreen({super.key});

  @override
  State<ShiftScheduleScreen> createState() => _ShiftScheduleScreenState();
}

class _ShiftScheduleScreenState extends State<ShiftScheduleScreen> {
  int _selectedDay = DateTime.now().weekday - 1;
  int _weekOffset = 0; // 0 = current week, 1 = next week, -1 = previous week
  bool _isLoading = true;
  StreamSubscription<Map<String, dynamic>>? _shiftsSubscription;
  Timer? _countdownTimer;

  final List<String> _weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  List<Map<String, dynamic>> _weekSchedule = [
    {'shifts': []}, {'shifts': []}, {'shifts': []}, {'shifts': []},
    {'shifts': []}, {'shifts': []}, {'shifts': []},
  ];

  @override
  void initState() {
    super.initState();
    _loadShifts();
    _subscribeToShifts();
    // Update countdown every minute
    _countdownTimer = Timer.periodic(const Duration(minutes: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _countdownTimer?.cancel();
    _shiftsSubscription?.cancel();
    final driverId = SupabaseService.visibleUserId;
    if (driverId != null) {
      RealtimeService().unsubscribeFromShifts(driverId);
    }
    super.dispose();
  }

  void _subscribeToShifts() {
    final driverId = SupabaseService.visibleUserId;
    if (driverId == null) return;

    _shiftsSubscription = RealtimeService().subscribeToShifts(driverId).listen((data) {
      debugPrint('Shifts realtime update: ${data['event']}');
      // Reload shifts when there's any change
      _loadShifts();
    });
  }

  Future<void> _loadShifts() async {
    setState(() {
      _isLoading = true;
      // Clear the schedule immediately to prevent showing old data
      _weekSchedule = List.generate(7, (_) => <String, dynamic>{'shifts': <Map<String, dynamic>>[]});
    });
    try {
      final driverId = SupabaseService.visibleUserId;
      if (driverId == null) {
        setState(() => _isLoading = false);
        return;
      }

      final now = DateTime.now();
      final baseWeekStart = now.subtract(Duration(days: now.weekday - 1));
      final weekStart = baseWeekStart.add(Duration(days: _weekOffset * 7));
      final weekEnd = weekStart.add(const Duration(days: 7));

      debugPrint('Loading shifts for week: ${weekStart.toIso8601String()} to ${weekEnd.toIso8601String()}');

      final shifts = await SupabaseService.getDriverShifts(
        driverId,
        weekStart,
        weekEnd,
      );

      debugPrint('Got ${shifts.length} shifts from database');

      final newSchedule = List.generate(7, (_) => <String, dynamic>{'shifts': <Map<String, dynamic>>[]});
      final seenIds = <String>{};  // Track seen shift IDs to prevent duplicates

      for (final shift in shifts) {
        // Skip if we've already processed this shift ID
        final shiftId = shift['id']?.toString() ?? '';
        if (shiftId.isEmpty || seenIds.contains(shiftId)) {
          debugPrint('Skipping duplicate shift: $shiftId');
          continue;
        }
        seenIds.add(shiftId);
        final shiftDate = MaldivesTimezone.parse(shift['shift_date'] ?? '');
        if (shiftDate == null) continue;

        final dayIndex = shiftDate.weekday - 1;
        if (dayIndex < 0 || dayIndex > 6) continue;

        String status = shift['status'] ?? 'scheduled';
        if (status == 'scheduled') {
          final today = DateTime(now.year, now.month, now.day);
          final shiftDay = DateTime(shiftDate.year, shiftDate.month, shiftDate.day);

          if (shiftDay.isBefore(today)) {
            status = 'completed';
          } else if (shiftDay.isAtSameMomentAs(today)) {
            // Check if current time is within shift hours
            final startParts = (shift['start_time']?.toString() ?? '00:00:00').split(':');
            final endParts = (shift['end_time']?.toString() ?? '23:59:59').split(':');
            final startHour = int.tryParse(startParts[0]) ?? 0;
            final startMin = int.tryParse(startParts.length > 1 ? startParts[1] : '0') ?? 0;
            final endHour = int.tryParse(endParts[0]) ?? 23;
            final endMin = int.tryParse(endParts.length > 1 ? endParts[1] : '59') ?? 59;

            final shiftStart = DateTime(now.year, now.month, now.day, startHour, startMin);
            final shiftEnd = DateTime(now.year, now.month, now.day, endHour, endMin);

            if (now.isBefore(shiftStart)) {
              status = 'upcoming';
            } else if (now.isAfter(shiftEnd)) {
              status = 'completed';
            } else {
              status = 'current';
            }
          } else {
            status = 'upcoming';
          }
        }

        debugPrint('Adding shift: date=${shift['shift_date']}, dayIndex=$dayIndex, type=${shift['shift_type']}');
        (newSchedule[dayIndex]['shifts'] as List).add({
          'id': shift['id'],
          'start': shift['start_time']?.toString().substring(0, 5) ?? '00:00',
          'end': shift['end_time']?.toString().substring(0, 5) ?? '00:00',
          'type': _capitalizeFirst(shift['shift_type'] ?? 'shift'),
          'status': status,
          'attendance_status': shift['attendance_status'] ?? 'pending',
          'absence_reason': shift['absence_reason'],
          'shift_date': shift['shift_date'],
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
    // Handle snake_case like "full_day" -> "Full Day"
    return s.split('_').map((word) =>
      word.isEmpty ? '' : word[0].toUpperCase() + word.substring(1)
    ).join(' ');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.bgColor,
      body: _isLoading
          ? const ShimmerList(itemCount: 4)
          : RefreshIndicator(
              onRefresh: _loadShifts,
              color: AppColors.yellow,
              child: CustomScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                slivers: [
                  SliverAppBar(
                    backgroundColor: context.bgColor,
                    floating: true,
                    snap: true,
                    leading: IconButton(
                      icon: Icon(Icons.arrow_back, color: context.textColor),
                      onPressed: () => Navigator.pop(context),
                    ),
                    title: Text('Shift Schedule', style: TextStyle(color: context.textColor)),
                    actions: [
                      IconButton(
                        icon: Icon(Icons.calendar_today_rounded, color: AppColors.yellow),
                        onPressed: () => _showMonthView(context),
                      ),
                    ],
                  ),
                  SliverList(
                    delegate: SliverChildListDelegate([
                      _buildWeekSummary(context),
                      _buildDaySelector(context),
                      _buildDaySchedule(context),
                    ]),
                  ),
                ],
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
    final baseWeekStart = today.subtract(Duration(days: today.weekday - 1));
    final startOfWeek = baseWeekStart.add(Duration(days: _weekOffset * 7));
    final isCurrentWeek = _weekOffset == 0;

    return Column(
      children: [
        // Week navigation
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              IconButton(
                onPressed: () {
                  HapticFeedback.selectionClick();
                  setState(() {
                    _weekOffset--;
                    _selectedDay = 0;
                  });
                  _loadShifts();
                },
                icon: Icon(Icons.chevron_left, color: context.textColor),
                style: IconButton.styleFrom(
                  backgroundColor: context.cardColor,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
              ),
              GestureDetector(
                onTap: isCurrentWeek ? null : () {
                  HapticFeedback.selectionClick();
                  setState(() {
                    _weekOffset = 0;
                    _selectedDay = today.weekday - 1;
                  });
                  _loadShifts();
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  decoration: BoxDecoration(
                    color: isCurrentWeek ? AppColors.yellow.withValues(alpha: 0.15) : context.cardColor,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                      color: isCurrentWeek ? AppColors.yellow.withValues(alpha: 0.5) : context.borderColor,
                    ),
                  ),
                  child: Text(
                    _getWeekRangeText(startOfWeek),
                    style: TextStyle(
                      color: isCurrentWeek ? AppColors.yellow : context.textColor,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
              IconButton(
                onPressed: () {
                  HapticFeedback.selectionClick();
                  setState(() {
                    _weekOffset++;
                    _selectedDay = 0;
                  });
                  _loadShifts();
                },
                icon: Icon(Icons.chevron_right, color: context.textColor),
                style: IconButton.styleFrom(
                  backgroundColor: context.cardColor,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
              ),
            ],
          ),
        ),
        // Day selector
        Container(
          height: 80,
          margin: const EdgeInsets.symmetric(horizontal: 16),
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            itemCount: 7,
            itemBuilder: (context, index) {
              final date = startOfWeek.add(Duration(days: index));
              final isSelected = index == _selectedDay;
              final isTodayDate = isCurrentWeek && index == today.weekday - 1;
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
                        : isTodayDate
                            ? AppColors.yellow.withValues(alpha: 0.15)
                            : context.cardColor,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: isSelected
                          ? AppColors.yellow
                          : isTodayDate
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
        ),
      ],
    );
  }

  String _getWeekRangeText(DateTime startOfWeek) {
    final endOfWeek = startOfWeek.add(const Duration(days: 6));
    final months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    if (startOfWeek.month == endOfWeek.month) {
      return '${months[startOfWeek.month - 1]} ${startOfWeek.day} - ${endOfWeek.day}';
    } else {
      return '${months[startOfWeek.month - 1]} ${startOfWeek.day} - ${months[endOfWeek.month - 1]} ${endOfWeek.day}';
    }
  }

  Widget _buildDaySchedule(BuildContext context) {
    final shifts = _weekSchedule[_selectedDay]['shifts'] as List;
    final today = DateTime.now();
    final baseWeekStart = today.subtract(Duration(days: today.weekday - 1));
    final startOfWeek = baseWeekStart.add(Duration(days: _weekOffset * 7));
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
    final attendanceStatus = shift['attendance_status'] as String? ?? 'pending';
    final absenceReason = shift['absence_reason'] as String?;
    final shiftDate = shift['shift_date'] as String?;
    final shiftType = shift['type'] as String;
    final startTime = shift['start'] as String;
    final endTime = shift['end'] as String;

    final today = DateTime.now();
    final todayStr = '${today.year}-${today.month.toString().padLeft(2, '0')}-${today.day.toString().padLeft(2, '0')}';
    final canMarkAttendance = shiftDate == todayStr && attendanceStatus == 'pending';

    Color accentColor;
    IconData statusIcon;
    String statusText;

    if (attendanceStatus == 'absent') {
      accentColor = AppColors.error;
      statusIcon = Icons.cancel_rounded;
      statusText = 'Absent';
    } else if (attendanceStatus == 'present') {
      accentColor = AppColors.success;
      statusIcon = Icons.check_circle_rounded;
      statusText = 'Present';
    } else if (isCurrent) {
      accentColor = AppColors.success;
      statusIcon = Icons.play_circle_rounded;
      statusText = 'Active';
    } else if (isCompleted) {
      accentColor = context.mutedColor;
      statusIcon = Icons.task_alt_rounded;
      statusText = 'Done';
    } else {
      accentColor = AppColors.yellow;
      statusIcon = Icons.schedule_rounded;
      statusText = 'Scheduled';
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            accentColor.withValues(alpha: 0.12),
            accentColor.withValues(alpha: 0.04),
          ],
        ),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: accentColor.withValues(alpha: 0.3),
          width: 1.5,
        ),
        boxShadow: [
          BoxShadow(
            color: accentColor.withValues(alpha: 0.1),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(24),
        child: Column(
          children: [
            // Main content
            Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  // Top row with status and shift type
                  Row(
                    children: [
                      // Status pill with icon
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: accentColor.withValues(alpha: 0.2),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(statusIcon, color: accentColor, size: 14),
                            const SizedBox(width: 6),
                            Text(
                              statusText,
                              style: TextStyle(
                                color: accentColor,
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 0.3,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const Spacer(),
                      // Shift type badge
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                        decoration: BoxDecoration(
                          color: context.cardColor,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: context.borderColor),
                        ),
                        child: Text(
                          shiftType,
                          style: TextStyle(
                            color: context.textColor,
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 24),

                  // Time display - modern layout
                  Row(
                    children: [
                      // Start time
                      Expanded(
                        child: _buildModernTimeBlock(context, startTime, 'Start', accentColor),
                      ),
                      // Duration indicator
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        child: Column(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                color: context.cardColor,
                                shape: BoxShape.circle,
                                border: Border.all(color: context.borderColor),
                              ),
                              child: Icon(
                                Icons.arrow_forward_rounded,
                                color: accentColor,
                                size: 18,
                              ),
                            ),
                            const SizedBox(height: 6),
                            Text(
                              _calculateDuration(startTime, endTime),
                              style: TextStyle(
                                color: context.mutedColor,
                                fontSize: 11,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ],
                        ),
                      ),
                      // End time
                      Expanded(
                        child: _buildModernTimeBlock(context, endTime, 'End', accentColor),
                      ),
                    ],
                  ),

                  // Time remaining for current shift
                  if (isCurrent && attendanceStatus == 'pending') ...[
                    const SizedBox(height: 20),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      decoration: BoxDecoration(
                        color: AppColors.success.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.timer_outlined, color: AppColors.success, size: 18),
                          const SizedBox(width: 10),
                          Text(
                            _calculateTimeRemaining(endTime),
                            style: TextStyle(
                              color: AppColors.success,
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],

                  // Absence reason
                  if (attendanceStatus == 'absent' && absenceReason != null && absenceReason.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: AppColors.error.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Row(
                        children: [
                          Icon(Icons.info_outline_rounded, color: AppColors.error, size: 18),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              absenceReason,
                              style: TextStyle(
                                color: AppColors.error,
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
            ),

            // Attendance action bar
            if (canMarkAttendance)
              Container(
                decoration: BoxDecoration(
                  color: context.cardColor.withValues(alpha: 0.5),
                  border: Border(
                    top: BorderSide(color: context.borderColor.withValues(alpha: 0.5)),
                  ),
                ),
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    Expanded(
                      child: GestureDetector(
                        onTap: () => _markAttendance(shift['id'] as String, 'present'),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              colors: [AppColors.success, AppColors.success.withValues(alpha: 0.8)],
                            ),
                            borderRadius: BorderRadius.circular(14),
                            boxShadow: [
                              BoxShadow(
                                color: AppColors.success.withValues(alpha: 0.4),
                                blurRadius: 12,
                                offset: const Offset(0, 4),
                              ),
                            ],
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const Icon(Icons.check_circle_rounded, color: Colors.white, size: 20),
                              const SizedBox(width: 8),
                              const Text(
                                'Present',
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 15,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: GestureDetector(
                        onTap: () => _showAbsentDialog(shift['id'] as String),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          decoration: BoxDecoration(
                            color: Colors.transparent,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: AppColors.error, width: 1.5),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.cancel_rounded, color: AppColors.error, size: 20),
                              const SizedBox(width: 8),
                              Text(
                                'Absent',
                                style: TextStyle(
                                  color: AppColors.error,
                                  fontSize: 15,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildModernTimeBlock(BuildContext context, String time, String label, Color accentColor) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 12),
      decoration: BoxDecoration(
        color: context.cardColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.borderColor),
      ),
      child: Column(
        children: [
          Text(
            label,
            style: TextStyle(
              color: context.mutedColor,
              fontSize: 11,
              fontWeight: FontWeight.w500,
              letterSpacing: 0.5,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            time,
            style: TextStyle(
              color: context.textColor,
              fontSize: 26,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.5,
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _markAttendance(String shiftId, String status, {String? reason}) async {
    HapticFeedback.mediumImpact();

    final success = await SupabaseService.markShiftAttendance(
      shiftId: shiftId,
      status: status,
      reason: reason,
    );

    if (success) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(status == 'present' ? 'Marked as Present' : 'Marked as Absent'),
          backgroundColor: status == 'present' ? AppColors.success : AppColors.error,
        ),
      );
      _loadShifts();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text('Failed to mark attendance'),
          backgroundColor: AppColors.error,
        ),
      );
    }
  }

  void _showAbsentDialog(String shiftId) {
    final reasonController = TextEditingController();

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.cardColor,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text('Mark as Absent', style: TextStyle(color: context.textColor)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Please provide a reason for your absence:',
              style: TextStyle(color: context.mutedColor, fontSize: 14),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: reasonController,
              maxLines: 3,
              decoration: InputDecoration(
                hintText: 'e.g., Sick leave, Family emergency...',
                hintStyle: TextStyle(color: context.mutedColor),
                filled: true,
                fillColor: context.bgColor,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
              ),
              style: TextStyle(color: context.textColor),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text('Cancel', style: TextStyle(color: context.mutedColor)),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(ctx);
              _markAttendance(shiftId, 'absent', reason: reasonController.text.trim());
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.error,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            child: const Text('Confirm Absent'),
          ),
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

  String _calculateDuration(String startTime, String endTime) {
    try {
      final startParts = startTime.split(':');
      final endParts = endTime.split(':');
      final startHour = int.parse(startParts[0]);
      final startMin = int.parse(startParts[1]);
      final endHour = int.parse(endParts[0]);
      final endMin = int.parse(endParts[1]);

      var totalMinutes = (endHour * 60 + endMin) - (startHour * 60 + startMin);
      if (totalMinutes < 0) totalMinutes += 24 * 60;

      final hours = totalMinutes ~/ 60;
      final mins = totalMinutes % 60;

      if (mins == 0) return '$hours hours';
      return '$hours h ${mins}m';
    } catch (e) {
      return '8 hours';
    }
  }

  String _calculateTimeRemaining(String endTime) {
    try {
      final now = DateTime.now();
      final endParts = endTime.split(':');
      final endHour = int.parse(endParts[0]);
      final endMin = int.parse(endParts[1]);

      var endDateTime = DateTime(now.year, now.month, now.day, endHour, endMin);
      if (endDateTime.isBefore(now)) {
        endDateTime = endDateTime.add(const Duration(days: 1));
      }

      final diff = endDateTime.difference(now);
      final hours = diff.inHours;
      final mins = diff.inMinutes % 60;

      if (hours == 0) return 'Shift ends in $mins minutes';
      if (mins == 0) return 'Shift ends in $hours hours';
      return 'Shift ends in $hours hours $mins minutes';
    } catch (e) {
      return 'Shift in progress';
    }
  }

  void _showMonthView(BuildContext context) {
    HapticFeedback.lightImpact();
    final now = DateTime.now();
    final firstDayOfMonth = DateTime(now.year, now.month, 1);
    final daysInMonth = DateTime(now.year, now.month + 1, 0).day;
    final startWeekday = firstDayOfMonth.weekday;

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Container(
        height: MediaQuery.of(context).size.height * 0.7,
        decoration: BoxDecoration(
          color: context.cardColor,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: Column(
          children: [
            const SizedBox(height: 12),
            Container(width: 40, height: 4, decoration: BoxDecoration(color: context.borderColor, borderRadius: BorderRadius.circular(2))),
            Padding(
              padding: const EdgeInsets.all(20),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    '${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][now.month - 1]} ${now.year}',
                    style: TextStyle(color: context.textColor, fontSize: 20, fontWeight: FontWeight.w700),
                  ),
                  IconButton(
                    onPressed: () => Navigator.pop(ctx),
                    icon: Icon(Icons.close, color: context.textColor),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => SizedBox(
                  width: 40,
                  child: Center(child: Text(d, style: TextStyle(color: context.mutedColor, fontSize: 12, fontWeight: FontWeight.w600))),
                )).toList(),
              ),
            ),
            const SizedBox(height: 8),
            Expanded(
              child: GridView.builder(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 7, childAspectRatio: 1),
                itemCount: 42,
                itemBuilder: (context, index) {
                  final dayOffset = index - (startWeekday - 1);
                  if (dayOffset < 1 || dayOffset > daysInMonth) {
                    return const SizedBox();
                  }
                  final isToday = dayOffset == now.day;
                  // Check if any day in _weekSchedule has shifts for this day
                  final dayIndex = DateTime(now.year, now.month, dayOffset).weekday - 1;
                  final hasShift = dayIndex >= 0 && dayIndex < 7 &&
                      (_weekSchedule[dayIndex]['shifts'] as List).isNotEmpty;
                  return Container(
                    margin: const EdgeInsets.all(2),
                    decoration: BoxDecoration(
                      color: isToday ? AppColors.yellow : (hasShift ? AppColors.yellow.withValues(alpha: 0.2) : Colors.transparent),
                      borderRadius: BorderRadius.circular(8),
                      border: isToday ? null : Border.all(color: context.borderColor.withValues(alpha: 0.3)),
                    ),
                    child: Center(
                      child: Text(
                        '$dayOffset',
                        style: TextStyle(
                          color: isToday ? Colors.black : context.textColor,
                          fontWeight: isToday || hasShift ? FontWeight.w700 : FontWeight.normal,
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(20),
              child: Row(
                children: [
                  Container(width: 12, height: 12, decoration: BoxDecoration(color: AppColors.yellow, borderRadius: BorderRadius.circular(3))),
                  const SizedBox(width: 8),
                  Text('Today', style: TextStyle(color: context.textColor, fontSize: 13)),
                  const SizedBox(width: 20),
                  Container(width: 12, height: 12, decoration: BoxDecoration(color: AppColors.yellow.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(3))),
                  const SizedBox(width: 8),
                  Text('Scheduled shift', style: TextStyle(color: context.textColor, fontSize: 13)),
                ],
              ),
            ),
            SizedBox(height: MediaQuery.of(ctx).padding.bottom),
          ],
        ),
      ),
    );
  }
}
