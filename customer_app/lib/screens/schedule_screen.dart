import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:add_2_calendar/add_2_calendar.dart';
import '../providers/app_state.dart';
import '../theme/app_theme.dart';
import '../services/notification_service.dart';
import '../services/supabase_service.dart';

class ScheduleScreen extends StatefulWidget {
  final String? initialTransportType;

  const ScheduleScreen({super.key, this.initialTransportType});

  @override
  State<ScheduleScreen> createState() => _ScheduleScreenState();
}

class _ScheduleScreenState extends State<ScheduleScreen> with TickerProviderStateMixin {
  String _selectedType = 'Internal';
  String _selectedRoute = '';
  bool _showReminders = false;
  bool _showAllTypes = false; // True when View All is clicked

  List<Map<String, dynamic>> _transportTypes = [];
  List<Map<String, dynamic>> _routes = [];
  List<Map<String, dynamic>> _schedules = [];
  bool _isLoading = true;
  bool _hidePastTimes = false;
  Set<String> _favoriteRoutes = {};

  late AnimationController _fabController;
  late Animation<double> _fabAnimation;

  @override
  void initState() {
    super.initState();
    _fabController = AnimationController(
      duration: const Duration(milliseconds: 300),
      vsync: this,
    );
    _fabAnimation = CurvedAnimation(parent: _fabController, curve: Curves.easeOut);
    _loadData();
  }

  @override
  void dispose() {
    _fabController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final types = await SupabaseService.getTransportTypes();
      final routes = await SupabaseService.getRoutes();
      final schedules = await SupabaseService.getSchedules();

      if (mounted) {
        debugPrint('Loaded ${routes.length} routes, ${schedules.length} schedules');
        // Sort transport types: Internal first, then MTCC, then Ferry
        final sortOrder = {'internal_bus': 0, 'mtcc_bus': 1, 'ferry': 2};
        types.sort((a, b) {
          final orderA = sortOrder[a['name']] ?? 99;
          final orderB = sortOrder[b['name']] ?? 99;
          return orderA.compareTo(orderB);
        });
        setState(() {
          _transportTypes = types;
          _routes = routes;
          _schedules = schedules;
          _isLoading = false;

          // Use initial transport type if provided, otherwise show all
          if (widget.initialTransportType != null && _transportTypes.isNotEmpty) {
            // Specific type selected - hide tabs
            _selectedType = widget.initialTransportType!;
            _showAllTypes = false;
          } else if (_transportTypes.isNotEmpty) {
            // View All - show tabs
            _selectedType = _transportTypes.first['name'] ?? 'Internal';
            _showAllTypes = true;
          }
          final filteredRoutes = _getFilteredRoutes();
          if (filteredRoutes.isNotEmpty) {
            _selectedRoute = filteredRoutes.first['id'] ?? '';
          }
        });
        _fabController.forward();
      }
    } catch (e) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  List<Map<String, dynamic>> _getFilteredRoutes() {
    // Map display name to transport_type
    String transportType;
    switch (_selectedType) {
      case 'Internal':
      case 'Internal Bus':
        transportType = 'internal_bus';
        break;
      case 'MTCC':
      case 'MTCC Bus':
        transportType = 'mtcc_bus';
        break;
      case 'Ferry':
        transportType = 'ferry';
        break;
      default:
        transportType = _selectedType;
    }
    return _routes.where((r) => r['transport_type'] == transportType).toList();
  }

  List<Map<String, dynamic>> _getSchedulesForRoute(String routeId) {
    final now = TimeOfDay.now();

    return _schedules.where((s) {
      if (s['route_id'] != routeId) return false;

      // Filter out past times
      final timeStr = s['departure_time']?.toString() ?? '';
      if (timeStr.isEmpty) return false;

      final parts = timeStr.split(':');
      final hour = int.tryParse(parts[0]) ?? 0;
      final minute = int.tryParse(parts[1]) ?? 0;

      // Only show upcoming times
      if (hour < now.hour) return false;
      if (hour == now.hour && minute <= now.minute) return false;

      return true;
    }).toList()
      ..sort((a, b) => (a['departure_time'] ?? '').compareTo(b['departure_time'] ?? ''));
  }

  List<Map<String, dynamic>> _getTodaySchedulesForRoute(String routeId) {
    final today = DateTime.now();
    final dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    final dayName = dayNames[today.weekday % 7];

    return _schedules.where((s) {
      if (s['route_id'] != routeId) return false;
      final days = (s['days_of_week'] as List?)?.cast<String>() ?? [];
      return days.contains(dayName);
    }).toList()
      ..sort((a, b) => (a['departure_time'] ?? '').compareTo(b['departure_time'] ?? ''));
  }

  String _getDisplayName(String type) {
    switch (type) {
      case 'internal_bus':
        return 'Internal Bus';
      case 'mtcc_bus':
        return 'MTCC Bus';
      case 'ferry':
        return 'Ferry';
      default:
        return type;
    }
  }

  String _formatStops(dynamic stops) {
    if (stops == null) return '';
    if (stops is String) return stops;
    if (stops is List) {
      // Handle simple string array (from database text[])
      if (stops.isNotEmpty && stops.first is String) {
        return (stops as List).cast<String>().join(' → ');
      }
      // Handle map array with stop_order (legacy format)
      final sortedStops = List<Map<String, dynamic>>.from(stops);
      sortedStops.sort((a, b) => (a['stop_order'] ?? 0).compareTo(b['stop_order'] ?? 0));
      final stopNames = sortedStops.map((s) => s['stop_name'] ?? '').where((n) => n.isNotEmpty).toList();
      return stopNames.join(' → ');
    }
    return stops.toString();
  }

  String _getStopsPreview(String stopsStr) {
    final stops = stopsStr.split(' → ');
    if (stops.length <= 2) return stopsStr;
    return '${stops.first} → ... → ${stops.last}';
  }

  int _getStopCount(String stopsStr) {
    if (stopsStr.isEmpty) return 0;
    return stopsStr.split(' → ').length;
  }

  Map<String, dynamic>? _getRouteById(String routeId) {
    try {
      return _routes.firstWhere((r) => r['id'] == routeId);
    } catch (e) {
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = context.isDark;
    final appState = Provider.of<AppState>(context);
    final reminders = appState.reminders;

    if (_isLoading) {
      return Scaffold(
        backgroundColor: context.bgColor,
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const CircularProgressIndicator(color: AppColors.yellow),
              const SizedBox(height: 16),
              Text('Loading schedules...', style: TextStyle(color: context.mutedColor)),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: context.bgColor,
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () async {
            HapticFeedback.mediumImpact();
            await _loadData();
          },
          color: AppColors.yellow,
          backgroundColor: context.surfaceColor,
          child: CustomScrollView(
            slivers: [
              // Header
              SliverToBoxAdapter(child: _buildHeader(isDark, reminders.length)),

              // Reminders Section (collapsible)
              if (reminders.isNotEmpty)
                SliverToBoxAdapter(child: _buildRemindersSection(isDark, reminders)),

              // Transport Mode Tabs - only show when View All
              if (_showAllTypes)
                SliverToBoxAdapter(child: _buildModeTabs(isDark)),

              // Selected Type Header - show when specific type selected
              if (!_showAllTypes)
                SliverToBoxAdapter(child: _buildSelectedTypeHeader(isDark)),

            // Route Direction Tabs
            SliverToBoxAdapter(child: _buildDirectionTabs(isDark)),

            // Next Departure Card
            SliverToBoxAdapter(child: _buildNextDepartureCard(isDark)),

            // Schedule List
            _buildScheduleListSliver(isDark),

            // Bottom padding
            const SliverToBoxAdapter(child: SizedBox(height: 100)),
          ],
          ),
        ),
      ),
    );
  }

  Widget _buildFilterControls(bool isDark) {
    final upcomingCount = _getUpcomingCount();
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      child: Row(
        children: [
          GestureDetector(
            onTap: () {
              HapticFeedback.selectionClick();
              setState(() => _hidePastTimes = !_hidePastTimes);
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: _hidePastTimes
                    ? AppColors.yellow.withValues(alpha: 0.15)
                    : (isDark ? Colors.white : Colors.black).withValues(alpha: 0.05),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: _hidePastTimes
                      ? AppColors.yellow.withValues(alpha: 0.3)
                      : Colors.transparent,
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    _hidePastTimes ? Icons.visibility_off : Icons.visibility,
                    size: 14,
                    color: _hidePastTimes ? AppColors.yellow : context.mutedColor,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    _hidePastTimes ? 'Upcoming only' : 'Show all',
                    style: TextStyle(
                      color: _hidePastTimes ? AppColors.yellow : context.mutedColor,
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const Spacer(),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: AppColors.success.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              '$upcomingCount remaining',
              style: TextStyle(
                color: AppColors.success,
                fontSize: 11,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }

  int _getUpcomingCount() {
    final now = TimeOfDay.now();
    int count = 0;
    for (final route in _getFilteredRoutes()) {
      final routeSchedules = _schedules.where((s) => s['route_id'] == route['id']).toList();
      for (final schedule in routeSchedules) {
        final time = schedule['departure_time']?.toString().substring(0, 5) ?? '00:00';
        final parts = time.split(':');
        final hour = int.tryParse(parts[0]) ?? 0;
        final minute = int.tryParse(parts[1]) ?? 0;
        if (hour > now.hour || (hour == now.hour && minute >= now.minute)) {
          count++;
        }
      }
    }
    return count;
  }

  Widget _buildHeader(bool isDark, int reminderCount) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: Row(
        children: [
          GestureDetector(
            onTap: () => Navigator.pop(context),
            child: Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(Icons.arrow_back_ios_new, color: context.textColor, size: 18),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Staff Transport',
                  style: TextStyle(
                    color: context.textColor,
                    fontSize: 24,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.5,
                  ),
                ),
                Text(
                  _getDateString(),
                  style: TextStyle(color: context.mutedColor, fontSize: 13),
                ),
              ],
            ),
          ),
          Row(
            children: [
              if (reminderCount > 0)
                GestureDetector(
                  onTap: () => setState(() => _showReminders = !_showReminders),
                  child: Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: _showReminders ? AppColors.yellow : AppColors.yellow.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Stack(
                      children: [
                        Center(
                          child: Icon(
                            Icons.notifications_active,
                            color: _showReminders ? AppColors.bgDark : AppColors.yellow,
                            size: 22,
                          ),
                        ),
                        Positioned(
                          top: 8,
                          right: 8,
                          child: Container(
                            width: 16,
                            height: 16,
                            decoration: BoxDecoration(
                              color: AppColors.error,
                              shape: BoxShape.circle,
                              border: Border.all(color: context.bgColor, width: 2),
                            ),
                            child: Center(
                              child: Text(
                                '$reminderCount',
                                style: TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w700),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              const SizedBox(width: 8),
              GestureDetector(
                onTap: _loadData,
                child: Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.05),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.1)),
                  ),
                  child: Icon(Icons.refresh, color: context.textColor, size: 20),
                ),
              ),
              const SizedBox(width: 8),
              GestureDetector(
                onTap: () => _showRouteMap(isDark),
                child: Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.05),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.1)),
                  ),
                  child: Icon(Icons.map_outlined, color: context.textColor, size: 20),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  String _getDateString() {
    final now = DateTime.now();
    final days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    final months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${days[now.weekday % 7]}, ${months[now.month - 1]} ${now.day}';
  }

  Widget _buildRemindersSection(bool isDark, List<Map<String, dynamic>> reminders) {
    return AnimatedCrossFade(
      firstChild: const SizedBox.shrink(),
      secondChild: Container(
        margin: const EdgeInsets.fromLTRB(16, 16, 16, 0),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [AppColors.yellow.withValues(alpha: 0.15), AppColors.yellow.withValues(alpha: 0.05)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: AppColors.yellow.withValues(alpha: 0.3)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: AppColors.yellow.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(Icons.alarm, color: AppColors.yellow, size: 18),
                ),
                const SizedBox(width: 12),
                Text(
                  'Your Reminders',
                  style: TextStyle(
                    color: context.textColor,
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const Spacer(),
                GestureDetector(
                  onTap: () => setState(() => _showReminders = false),
                  child: Icon(Icons.close, color: context.mutedColor, size: 20),
                ),
              ],
            ),
            const SizedBox(height: 12),
            ...reminders.take(3).map((r) => _buildReminderItem(r, isDark)),
            if (reminders.length > 3)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  '+${reminders.length - 3} more reminders',
                  style: TextStyle(color: context.mutedColor, fontSize: 12),
                ),
              ),
          ],
        ),
      ),
      crossFadeState: _showReminders ? CrossFadeState.showSecond : CrossFadeState.showFirst,
      duration: const Duration(milliseconds: 300),
    );
  }

  Widget _buildReminderItem(Map<String, dynamic> reminder, bool isDark) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: (isDark ? Colors.black : Colors.white).withValues(alpha: 0.3),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Container(
            width: 50,
            padding: const EdgeInsets.symmetric(vertical: 6),
            decoration: BoxDecoration(
              color: AppColors.yellow,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Column(
              children: [
                Text(
                  reminder['time'] ?? '',
                  style: TextStyle(
                    color: context.isDark ? AppColors.bgDark : const Color(0xFFF5F5F5),
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                Text(
                  reminder['period'] ?? '',
                  style: TextStyle(
                    color: context.isDark ? AppColors.bgDark : const Color(0xFFF5F5F5).withValues(alpha: 0.7),
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  reminder['route'] ?? '',
                  style: TextStyle(color: context.textColor, fontSize: 13, fontWeight: FontWeight.w600),
                ),
                Text(
                  '${reminder['reminderMinutes']} min before',
                  style: TextStyle(color: context.mutedColor, fontSize: 11),
                ),
              ],
            ),
          ),
          GestureDetector(
            onTap: () {
              final appState = Provider.of<AppState>(context, listen: false);
              appState.removeReminder(reminder);
              HapticFeedback.lightImpact();
            },
            child: Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: AppColors.error.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(Icons.delete_outline, color: AppColors.error, size: 18),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSelectedTypeHeader(bool isDark) {
    final color = _getTypeColor(_selectedType);

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [color.withValues(alpha: 0.2), color.withValues(alpha: 0.05)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: color.withValues(alpha: 0.3)),
        ),
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(_getTypeIcon(_selectedType), color: color, size: 26),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _getDisplayName(_selectedType),
                    style: TextStyle(
                      color: context.textColor,
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Text(
                    '${_getFilteredRoutes().length} routes available',
                    style: TextStyle(color: context.mutedColor, fontSize: 13),
                  ),
                ],
              ),
            ),
            GestureDetector(
              onTap: () {
                Navigator.pop(context);
              },
              child: Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(Icons.close, color: context.mutedColor, size: 20),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Color _getTypeColor(String type) {
    switch (type) {
      case 'internal_bus':
        return AppColors.yellow;
      case 'mtcc_bus':
        return const Color(0xFF4DA6FF);
      case 'ferry':
        return const Color(0xFF00CED1);
      default:
        return AppColors.yellow;
    }
  }

  Color _getTypeIconColor(String type) {
    switch (type) {
      case 'internal_bus':
        return AppColors.yellow;
      case 'mtcc_bus':
        return const Color(0xFF4DA6FF);
      case 'ferry':
        return const Color(0xFF00CED1);
      default:
        return AppColors.yellow;
    }
  }

  Widget _buildModeTabs(bool isDark) {
    if (_transportTypes.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
      child: SizedBox(
        height: 120,
        child: Row(
          children: _transportTypes.map((type) {
            final isActive = _selectedType == type['name'];
            final icon = _getTypeIcon(type['name']);
            // Use color from database if available
            final colorHex = type['color'] as String? ?? '#FFD60A';
            final typeColor = Color(int.parse(colorHex.replaceFirst('#', '0xFF')));
            final iconColor = typeColor;
            return Expanded(
              child: GestureDetector(
                onTap: () {
                  HapticFeedback.lightImpact();
                  setState(() {
                    _selectedType = type['name'];
                    final filteredRoutes = _getFilteredRoutes();
                    if (filteredRoutes.isNotEmpty) {
                      _selectedRoute = filteredRoutes.first['id'] ?? '';
                    } else {
                      _selectedRoute = '';
                    }
                  });
                },
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 250),
                  curve: Curves.easeOutCubic,
                  margin: const EdgeInsets.symmetric(horizontal: 4),
                  padding: const EdgeInsets.fromLTRB(8, 14, 8, 12),
                  decoration: BoxDecoration(
                    color: context.surfaceColor,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: typeColor.withValues(alpha: isActive ? 0.8 : 0.3),
                      width: 1.5,
                    ),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Container(
                        width: 52,
                        height: 52,
                        decoration: BoxDecoration(
                          color: typeColor.withValues(alpha: 0.2),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Icon(
                          icon,
                          color: typeColor,
                          size: 28,
                        ),
                      ),
                      const SizedBox(height: 10),
                      Text(
                        _getDisplayName(type['name'] ?? ''),
                        style: TextStyle(
                          color: typeColor,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }

  Widget _buildDirectionTabs(bool isDark) {
    final filteredRoutes = _getFilteredRoutes();
    if (filteredRoutes.isEmpty) return const SizedBox(height: 16);

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      height: 44,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        itemCount: filteredRoutes.length,
        itemBuilder: (context, index) {
          final route = filteredRoutes[index];
          final isActive = _selectedRoute == route['id'];
          String label = route['route_name'] ?? '';
          if (label.length > 18) {
            label = 'To ${route['to_location']?.toString().split(' ').first ?? ''}';
          }

          final isFavorite = _favoriteRoutes.contains(route['id']);
          return Padding(
            padding: EdgeInsets.only(right: index < filteredRoutes.length - 1 ? 8 : 0),
            child: GestureDetector(
              onTap: () {
                HapticFeedback.selectionClick();
                setState(() => _selectedRoute = route['id']);
              },
              onLongPress: () {
                HapticFeedback.mediumImpact();
                setState(() {
                  if (isFavorite) {
                    _favoriteRoutes.remove(route['id']);
                  } else {
                    _favoriteRoutes.add(route['id']);
                  }
                });
              },
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                decoration: BoxDecoration(
                  color: isActive ? AppColors.yellow : (isDark ? Colors.white : Colors.black).withValues(alpha: 0.05),
                  borderRadius: BorderRadius.circular(22),
                  border: isActive ? null : Border.all(color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.1)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (isFavorite) ...[
                      Icon(
                        Icons.star,
                        size: 14,
                        color: isActive ? AppColors.bgDark : AppColors.yellow,
                      ),
                      const SizedBox(width: 4),
                    ],
                    Text(
                      label,
                      style: TextStyle(
                        color: isActive ? AppColors.bgDark : context.textColor,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildNextDepartureCard(bool isDark) {
    final route = _getRouteById(_selectedRoute);
    if (route == null) return const SizedBox.shrink();

    final schedules = _getSchedulesForRoute(_selectedRoute);
    final now = TimeOfDay.now();

    final nextSchedule = schedules.where((s) {
      final time = s['departure_time']?.toString().substring(0, 5) ?? '--:--';
      final parts = time.split(':');
      final hour = int.tryParse(parts[0]) ?? 0;
      final minute = int.tryParse(parts[1]) ?? 0;
      return hour > now.hour || (hour == now.hour && minute >= now.minute);
    }).firstOrNull;

    if (nextSchedule == null) return const SizedBox.shrink();

    final time = nextSchedule['departure_time']?.toString().substring(0, 5) ?? '--:--';
    final parts = time.split(':');
    final hour = int.tryParse(parts[0]) ?? 0;
    final minute = int.tryParse(parts[1]) ?? 0;
    final displayHour = hour.toString().padLeft(2, '0');
    final displayMinute = minute.toString().padLeft(2, '0');

    // Calculate minutes until departure
    final nowMinutes = now.hour * 60 + now.minute;
    final departureMinutes = hour * 60 + minute;
    final minutesUntil = departureMinutes - nowMinutes;

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [AppColors.yellow, Color(0xFFF5C400)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(color: AppColors.yellow.withValues(alpha: 0.4), blurRadius: 20, offset: const Offset(0, 8)),
        ],
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            width: 8,
                            height: 8,
                            decoration: BoxDecoration(
                              color: AppColors.success,
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Text(
                            'NEXT DEPARTURE',
                            style: TextStyle(
                              color: context.isDark ? AppColors.bgDark : const Color(0xFFF5F5F5),
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.5,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  '$displayHour:$displayMinute',
                  style: TextStyle(
                    color: context.isDark ? AppColors.bgDark : const Color(0xFFF5F5F5),
                    fontSize: 28,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -1,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  route['route_name'] ?? '',
                  style: TextStyle(
                    color: context.isDark ? AppColors.bgDark : const Color(0xFFF5F5F5).withValues(alpha: 0.8),
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Icon(_getTypeIcon(_selectedType), color: context.isDark ? AppColors.bgDark : const Color(0xFFF5F5F5), size: 32),
              ),
              const SizedBox(height: 12),
              Text(
                minutesUntil <= 60 ? 'in $minutesUntil min' : 'in ${(minutesUntil / 60).floor()}h ${minutesUntil % 60}m',
                style: TextStyle(
                  color: context.isDark ? AppColors.bgDark : const Color(0xFFF5F5F5).withValues(alpha: 0.8),
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildScheduleListSliver(bool isDark) {
    final route = _getRouteById(_selectedRoute);
    if (route == null) {
      return SliverFillRemaining(
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.route, size: 48, color: Colors.white.withValues(alpha: 0.3)),
              const SizedBox(height: 12),
              Text('No routes available', style: TextStyle(color: Colors.white.withValues(alpha: 0.6))),
            ],
          ),
        ),
      );
    }

    final schedules = _getSchedulesForRoute(_selectedRoute);
    if (schedules.isEmpty) {
      return SliverFillRemaining(
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.schedule, size: 48, color: Colors.white.withValues(alpha: 0.3)),
              const SizedBox(height: 12),
              Text('No departures today', style: TextStyle(color: Colors.white.withValues(alpha: 0.6))),
            ],
          ),
        ),
      );
    }

    // Skip first schedule as it's shown in Next Departure card
    var remainingSchedules = schedules.length > 1 ? schedules.sublist(1) : <Map<String, dynamic>>[];

    // Filter past times if enabled
    if (_hidePastTimes) {
      final now = TimeOfDay.now();
      remainingSchedules = remainingSchedules.where((schedule) {
        final time = schedule['departure_time']?.toString().substring(0, 5) ?? '00:00';
        final parts = time.split(':');
        final hour = int.tryParse(parts[0]) ?? 0;
        final minute = int.tryParse(parts[1]) ?? 0;
        return hour > now.hour || (hour == now.hour && minute >= now.minute);
      }).toList();
    }

    if (remainingSchedules.isEmpty) {
      return SliverToBoxAdapter(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 24, 16, 0),
          child: Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.04),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.08),
              ),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: AppColors.yellow.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(Icons.nightlight_round, color: AppColors.yellow, size: 24),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Last ride for today',
                        style: TextStyle(
                          color: context.textColor,
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'No more departures after this. See you tomorrow!',
                        style: TextStyle(
                          color: context.mutedColor,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return SliverPadding(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
      sliver: SliverList(
        delegate: SliverChildBuilderDelegate(
          (context, index) {
            final schedule = remainingSchedules[index];
            return _buildScheduleItem(schedule, route, isDark, index);
          },
          childCount: remainingSchedules.length,
        ),
      ),
    );
  }

  Widget _buildScheduleItem(Map<String, dynamic> schedule, Map<String, dynamic> route, bool isDark, int index) {
    final time = schedule['departure_time']?.toString().substring(0, 5) ?? '--:--';
    final timeParts = time.split(':');
    final hour = int.tryParse(timeParts[0]) ?? 0;
    final minute = int.tryParse(timeParts[1]) ?? 0;
    final displayTime = '${hour.toString().padLeft(2, '0')}:${minute.toString().padLeft(2, '0')}';

    final now = TimeOfDay.now();
    final isPast = hour < now.hour || (hour == now.hour && minute < now.minute);

    final stopsStr = _formatStops(route['stops']);
    final stopCount = _getStopCount(stopsStr);
    final duration = route['duration_minutes'] ?? (stopCount > 0 ? (stopCount - 1) * 2 : 0);

    final trip = {
      'time': displayTime,
      'hour': hour,
      'minute': minute,
      'route': route['route_name'] ?? '',
      'duration': '$duration min',
      'type': _selectedType,
      'stops': stopsStr,
    };

    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.0, end: 1.0),
      duration: Duration(milliseconds: 300 + (index * 50)),
      curve: Curves.easeOutCubic,
      builder: (context, value, child) {
        return Transform.translate(
          offset: Offset(0, 20 * (1 - value)),
          child: Opacity(opacity: value, child: child),
        );
      },
      child: GestureDetector(
        onTap: () => _showTripDetails(trip, isDark),
        child: Container(
          margin: const EdgeInsets.only(bottom: 12),
          decoration: BoxDecoration(
            color: isPast
                ? (isDark ? Colors.white : Colors.black).withValues(alpha: 0.02)
                : (isDark ? Colors.white : Colors.black).withValues(alpha: 0.04),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: (isDark ? Colors.white : Colors.black).withValues(alpha: isPast ? 0.05 : 0.08),
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Container(
                  width: 70,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  decoration: BoxDecoration(
                    color: isPast ? context.bgColor.withValues(alpha: 0.5) : context.bgColor,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Center(
                    child: Text(
                      displayTime,
                      style: TextStyle(
                        color: isPast ? context.mutedColor : context.textColor,
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        trip['route']!,
                        style: TextStyle(
                          color: isPast ? context.mutedColor : context.textColor,
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      if (!isPast) ...[
                        const SizedBox(height: 4),
                        Builder(builder: (_) {
                          final now = TimeOfDay.now();
                          final tripHour = trip['hour'] as int;
                          final tripMinute = trip['minute'] as int;
                          final nowMinutes = now.hour * 60 + now.minute;
                          final tripMinutes = tripHour * 60 + tripMinute;
                          final diff = tripMinutes - nowMinutes;

                          if (diff <= 0) return const SizedBox.shrink();

                          final isUrgent = diff <= 10;
                          final text = diff < 60 ? 'in $diff min' : 'in ${diff ~/ 60}h ${diff % 60}m';

                          return Text(
                            text,
                            style: TextStyle(
                              color: isUrgent ? AppColors.yellow : context.mutedColor,
                              fontSize: 12,
                              fontWeight: isUrgent ? FontWeight.w600 : FontWeight.w500,
                            ),
                          );
                        }),
                      ],
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.05),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(
                    Icons.chevron_right,
                    color: isPast ? context.mutedColor.withValues(alpha: 0.5) : context.mutedColor,
                    size: 20,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _showTripDetails(Map<String, dynamic> trip, bool isDark) {
    final tripStr = trip.map((k, v) => MapEntry(k, v.toString()));
    HapticFeedback.mediumImpact();

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) {
        return Container(
          padding: EdgeInsets.fromLTRB(20, 16, 20, MediaQuery.of(ctx).viewInsets.bottom + 30),
          decoration: BoxDecoration(
            color: context.surfaceColor,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.18),
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
              const SizedBox(height: 24),
              Row(
                children: [
                  Container(
                    width: 60,
                    height: 60,
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [AppColors.yellow, Color(0xFFF5C400)],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      borderRadius: BorderRadius.circular(18),
                    ),
                    child: Icon(_getTypeIcon(_selectedType), color: context.isDark ? AppColors.bgDark : const Color(0xFFF5F5F5), size: 30),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          tripStr['route']!,
                          style: TextStyle(color: context.textColor, fontSize: 18, fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          tripStr['time']!,
                          style: TextStyle(color: AppColors.yellow, fontSize: 15, fontWeight: FontWeight.w600),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              if (tripStr['stops']?.isNotEmpty == true) ...[
                const SizedBox(height: 20),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.05),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(Icons.route, color: AppColors.yellow, size: 16),
                          const SizedBox(width: 8),
                          Text('Route Stops', style: TextStyle(color: context.mutedColor, fontSize: 13, fontWeight: FontWeight.w600)),
                        ],
                      ),
                      const SizedBox(height: 12),
                      _buildStopsVisualization(tripStr['stops']!, isDark, trip['hour'] as int, trip['minute'] as int),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 20),
              Row(
                children: [
                  Expanded(
                    child: SizedBox(
                      height: 54,
                      child: ElevatedButton.icon(
                        onPressed: () => _setReminder(ctx, trip),
                        icon: Icon(Icons.alarm_add, size: 20),
                        label: Text('Remind', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.08),
                          foregroundColor: context.textColor,
                          elevation: 0,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: SizedBox(
                      height: 54,
                      child: ElevatedButton.icon(
                        onPressed: () => _addToCalendar(ctx, trip),
                        icon: Icon(Icons.calendar_today, size: 18),
                        label: Text('Calendar', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.yellow,
                          foregroundColor: AppColors.bgDark,
                          elevation: 0,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildStopsVisualization(String stopsStr, bool isDark, int departureHour, int departureMinute) {
    final stops = stopsStr.contains(' · ')
        ? stopsStr.split(' · ')
        : stopsStr.contains(' → ')
            ? stopsStr.split(' → ')
            : [stopsStr];

    return Column(
      children: stops.asMap().entries.map((entry) {
        final index = entry.key;
        final stop = entry.value;
        final isFirst = index == 0;
        final isLast = index == stops.length - 1;
        final minutesFromStart = index * 2;

        // Calculate arrival time
        final totalMinutes = departureHour * 60 + departureMinute + minutesFromStart;
        final arrivalHour = (totalMinutes ~/ 60) % 24;
        final arrivalMinute = totalMinutes % 60;
        final arrivalTime = '${arrivalHour.toString().padLeft(2, '0')}:${arrivalMinute.toString().padLeft(2, '0')}';

        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Column(
              children: [
                Container(
                  width: 12,
                  height: 12,
                  decoration: BoxDecoration(
                    color: isFirst ? AppColors.success : (isLast ? AppColors.error : context.mutedColor),
                    shape: BoxShape.circle,
                  ),
                ),
                if (!isLast)
                  Container(
                    width: 2,
                    height: 28,
                    color: context.mutedColor.withValues(alpha: 0.3),
                  ),
              ],
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Padding(
                padding: EdgeInsets.only(bottom: isLast ? 0 : 20),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        stop,
                        style: TextStyle(
                          color: (isFirst || isLast) ? context.textColor : context.mutedColor,
                          fontSize: 14,
                          fontWeight: (isFirst || isLast) ? FontWeight.w600 : FontWeight.w500,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        );
      }).toList(),
    );
  }

  void _setReminder(BuildContext ctx, Map<String, dynamic> trip) {
    Navigator.pop(ctx);
    _showReminderTimeDialog(trip);
  }

  void _showReminderTimeDialog(Map<String, dynamic> trip) {
    final isDark = context.isDark;
    int selectedMinutes = 10;

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setSheetState) => Container(
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
                    color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.18),
                    borderRadius: BorderRadius.circular(99),
                  ),
                ),
              ),
              const SizedBox(height: 24),
              Text(
                'Set Reminder',
                style: TextStyle(color: context.textColor, fontSize: 20, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 8),
              Text(
                'Get notified before ${trip['time']} departure',
                style: TextStyle(color: context.mutedColor, fontSize: 14),
              ),
              const SizedBox(height: 24),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [5, 10, 15, 30, 60].map((mins) {
                  final isSelected = selectedMinutes == mins;
                  final label = mins < 60 ? '$mins min' : '1 hour';
                  return GestureDetector(
                    onTap: () {
                      HapticFeedback.selectionClick();
                      setSheetState(() => selectedMinutes = mins);
                    },
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                      decoration: BoxDecoration(
                        color: isSelected ? AppColors.yellow : (isDark ? Colors.white : Colors.black).withValues(alpha: 0.05),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                          color: isSelected ? AppColors.yellow : (isDark ? Colors.white : Colors.black).withValues(alpha: 0.1),
                          width: 1.5,
                        ),
                      ),
                      child: Text(
                        label,
                        style: TextStyle(
                          color: isSelected ? AppColors.bgDark : context.textColor,
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
              const SizedBox(height: 28),
              SizedBox(
                width: double.infinity,
                height: 54,
                child: ElevatedButton(
                  onPressed: () {
                    Navigator.pop(ctx);
                    _confirmReminder(trip, selectedMinutes);
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.yellow,
                    foregroundColor: AppColors.bgDark,
                    elevation: 0,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  ),
                  child: Text('Set Reminder', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                ),
              ),
              SizedBox(height: MediaQuery.of(ctx).viewPadding.bottom + 10),
            ],
          ),
        ),
      ),
    );
  }

  void _confirmReminder(Map<String, dynamic> trip, int minutesBefore) {
    final hour = trip['hour'] as int? ?? 0;
    final minute = trip['minute'] as int? ?? 0;

    final now = DateTime.now();
    var scheduledTime = DateTime(now.year, now.month, now.day, hour, minute);

    if (scheduledTime.isBefore(now)) {
      scheduledTime = scheduledTime.add(const Duration(days: 1));
    }

    final appState = Provider.of<AppState>(context, listen: false);
    appState.addReminder({
      'route': trip['route'],
      'time': trip['time'],
      'stops': trip['stops'],
      'datetime': scheduledTime,
      'reminderMinutes': minutesBefore,
    });

    NotificationService().scheduleRideReminder(
      id: scheduledTime.millisecondsSinceEpoch ~/ 1000,
      route: trip['route']!,
      time: trip['time']!,
      scheduledTime: scheduledTime,
      minutesBefore: minutesBefore,
    );

    setState(() => _showReminders = true);

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            Icon(Icons.check_circle, color: context.isDark ? AppColors.bgDark : const Color(0xFFF5F5F5), size: 20),
            const SizedBox(width: 10),
            const Expanded(child: Text('Reminder set successfully!')),
          ],
        ),
        backgroundColor: AppColors.yellow,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }

  void _addToCalendar(BuildContext ctx, Map<String, dynamic> trip) {
    HapticFeedback.mediumImpact();
    Navigator.pop(ctx);

    final hour = trip['hour'] as int? ?? 0;
    final minute = trip['minute'] as int? ?? 0;

    final now = DateTime.now();
    var startTime = DateTime(now.year, now.month, now.day, hour, minute);

    if (startTime.isBefore(now)) {
      startTime = startTime.add(const Duration(days: 1));
    }

    final event = Event(
      title: '🚌 ${trip['route']}',
      description: 'Stops: ${trip['stops']}',
      location: trip['stops']!.split(' · ').first,
      startDate: startTime,
      endDate: startTime.add(const Duration(minutes: 30)),
    );

    Add2Calendar.addEvent2Cal(event);

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            Icon(Icons.calendar_today, color: Colors.black, size: 18),
            const SizedBox(width: 10),
            const Expanded(child: Text('Added to calendar')),
          ],
        ),
        backgroundColor: AppColors.yellow,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }

  void _showRouteMap(bool isDark) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Container(
        height: MediaQuery.of(context).size.height * 0.7,
        decoration: BoxDecoration(
          color: context.surfaceColor,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: Column(
          children: [
            const SizedBox(height: 12),
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(99),
              ),
            ),
            const SizedBox(height: 20),
            Text('Route Map', style: TextStyle(color: context.textColor, fontSize: 20, fontWeight: FontWeight.w700)),
            const Expanded(
              child: Center(
                child: Text('Map view coming soon', style: TextStyle(color: Colors.white54)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  IconData _getTypeIcon(String? type) {
    switch (type) {
      case 'internal_bus':
        return Icons.directions_bus_rounded;
      case 'mtcc_bus':
        return Icons.airport_shuttle_rounded;
      case 'ferry':
        return Icons.directions_boat_rounded;
      default:
        return Icons.directions_bus_rounded;
    }
  }
}
