import 'dart:async';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../services/supabase_service.dart';
import '../theme/app_theme.dart';

class SchedulesScreen extends StatefulWidget {
  const SchedulesScreen({super.key});

  @override
  State<SchedulesScreen> createState() => _SchedulesScreenState();
}

class _SchedulesScreenState extends State<SchedulesScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  List<Map<String, dynamic>> _routes = [];
  List<Map<String, dynamic>> _schedules = [];
  bool _isLoading = true;
  RealtimeChannel? _routesChannel;
  RealtimeChannel? _schedulesChannel;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this); // All + 3 types
    _loadData();
    _setupRealtimeSubscriptions();
  }

  void _setupRealtimeSubscriptions() {
    final supabase = Supabase.instance.client;

    // Listen for transport_routes changes
    _routesChannel = supabase
        .channel('schedules_screen_routes')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'transport_routes',
          callback: (payload) {
            debugPrint('Routes changed: ${payload.eventType}');
            _loadData(showLoading: false);
          },
        )
        .subscribe();

    // Listen for route_schedules changes
    _schedulesChannel = supabase
        .channel('schedules_screen_schedules')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'route_schedules',
          callback: (payload) {
            debugPrint('Schedules changed: ${payload.eventType}');
            _loadData(showLoading: false);
          },
        )
        .subscribe();
  }

  Future<void> _loadData({bool showLoading = true}) async {
    if (showLoading) setState(() => _isLoading = true);
    try {
      final types = await SupabaseService.getTransportTypes();
      final routes = await SupabaseService.getRoutes();
      final schedules = await SupabaseService.getSchedules();

      if (mounted) {
        setState(() {
          _routes = routes;
          _schedules = schedules;
          _isLoading = false;
        });
      }
    } catch (e) {
      debugPrint('Error loading schedules: $e');
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  void dispose() {
    _routesChannel?.unsubscribe();
    _schedulesChannel?.unsubscribe();
    if (!_isLoading) _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.bgColor,
      appBar: AppBar(
        backgroundColor: context.bgColor,
        elevation: 0,
        title: Text('Transport Schedules', style: TextStyle(fontWeight: FontWeight.w700)),
        actions: [
          IconButton(
            icon: Icon(Icons.refresh),
            onPressed: _loadData,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFFFFD60A)))
          : Column(
              children: [
                // Transport Type Cards - Same design as home
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: SizedBox(
                    height: 120,
                    child: Row(
                      children: [
                        _buildTypeCard('internal_bus', 'Internal Bus', Icons.directions_bus_rounded, const Color(0xFFFFD60A)),
                        _buildTypeCard('mtcc_bus', 'MTCC Bus', Icons.airport_shuttle_rounded, const Color(0xFF4DA6FF)),
                        _buildTypeCard('ferry', 'Ferry', Icons.directions_boat_rounded, const Color(0xFF00CED1)),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // Content
                Expanded(
                  child: TabBarView(
                    controller: _tabController,
                    children: [
                      _buildRoutesList(null),
                      _buildRoutesList('internal_bus'),
                      _buildRoutesList('mtcc_bus'),
                      _buildRoutesList('ferry'),
                    ],
                  ),
                ),
              ],
            ),
    );
  }

  Widget _buildTypeCard(String type, String name, IconData icon, Color color) {
    final isSelected = _tabController.index == (type == 'internal_bus' ? 1 : type == 'mtcc_bus' ? 2 : 3);

    return Expanded(
      child: GestureDetector(
        onTap: () {
          final index = type == 'internal_bus' ? 1 : type == 'mtcc_bus' ? 2 : 3;
          _tabController.animateTo(index);
          setState(() {});
        },
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 4),
          padding: const EdgeInsets.fromLTRB(8, 14, 8, 12),
          decoration: BoxDecoration(
            color: isSelected ? color.withValues(alpha: 0.15) : context.surfaceColor,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: isSelected ? color : color.withValues(alpha: 0.3),
              width: isSelected ? 2 : 1,
            ),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(icon, color: color, size: 26),
              ),
              const SizedBox(height: 10),
              Text(
                name,
                style: TextStyle(
                  color: color,
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
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.schedule, size: 64, color: context.textColor.withValues(alpha: 0.3)),
          const SizedBox(height: 16),
          Text('No schedules available', style: TextStyle(color: context.textColor.withValues(alpha: 0.6))),
        ],
      ),
    );
  }

  Widget _buildRoutesList(String? transportType) {
    final filteredRoutes = transportType == null
        ? _routes
        : _routes.where((r) => r['transport_type'] == transportType).toList();

    if (filteredRoutes.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.route, size: 48, color: context.textColor.withValues(alpha: 0.3)),
            const SizedBox(height: 12),
            Text('No routes available', style: TextStyle(color: context.textColor.withValues(alpha: 0.6))),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadData,
      color: const Color(0xFFFFD60A),
      child: ListView.builder(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: filteredRoutes.length,
        itemBuilder: (context, index) => _buildRouteCard(filteredRoutes[index]),
      ),
    );
  }

  Widget _buildRouteCard(Map<String, dynamic> route) {
    final type = route['transport_type'] ?? 'internal_bus';
    final color = _getTypeColor(type);
    final routeSchedules = _schedules.where((s) => s['route_id'] == route['id']).toList();
    final stops = (route['stops'] as List?)?.cast<Map<String, dynamic>>() ?? [];
    stops.sort((a, b) => (a['stop_order'] ?? 0).compareTo(b['stop_order'] ?? 0));

    final firstStop = stops.isNotEmpty ? stops.first['stop_name'] : '';
    final lastStop = stops.isNotEmpty ? stops.last['stop_name'] : '';

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: context.surfaceColor,
        borderRadius: BorderRadius.circular(16),
        border: Border(left: BorderSide(color: color, width: 4)),
      ),
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          tilePadding: const EdgeInsets.all(16),
          childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          leading: Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(_getTypeIcon(type), color: color, size: 24),
          ),
          title: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            route['route_name'] ?? 'Route',
                            style: TextStyle(
                              color: context.textColor,
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        if (route['route_code'] != null && route['route_code'].toString().isNotEmpty) ...[
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: color.withValues(alpha: 0.2),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              route['route_code'],
                              style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w600),
                            ),
                          ),
                        ],
                      ],
                    ),
                    if (firstStop.isNotEmpty && lastStop.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Icon(Icons.trip_origin, size: 12, color: Color(0xFF34C759)),
                          const SizedBox(width: 4),
                          Flexible(
                            child: Text(
                              firstStop,
                              style: TextStyle(color: context.textColor.withValues(alpha: 0.6), fontSize: 12),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Icon(Icons.arrow_forward, size: 12, color: context.mutedColor),
                          const SizedBox(width: 8),
                          Icon(Icons.location_on, size: 12, color: Color(0xFFFF453A)),
                          const SizedBox(width: 4),
                          Flexible(
                            child: Text(
                              lastStop,
                              style: TextStyle(color: context.textColor.withValues(alpha: 0.6), fontSize: 12),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
          subtitle: Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Row(
              children: [
                if (route['duration_minutes'] != null)
                  _buildInfoChip(Icons.timer, '${route['duration_minutes']} min'),
                if (stops.isNotEmpty) ...[
                  const SizedBox(width: 12),
                  _buildInfoChip(Icons.location_on_outlined, '${stops.length} stops'),
                ],
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: context.isDark ? const Color(0xFF242426) : const Color(0xFFE8E8E8),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    '${routeSchedules.length} departures',
                    style: TextStyle(color: context.textColor.withValues(alpha: 0.6), fontSize: 11),
                  ),
                ),
              ],
            ),
          ),
          iconColor: context.mutedColor,
          collapsedIconColor: context.mutedColor,
          children: [
            if (routeSchedules.isEmpty)
              Padding(
                padding: const EdgeInsets.all(16),
                child: Text('No schedules available', style: TextStyle(color: context.textColor.withValues(alpha: 0.5))),
              )
            else
              _buildScheduleGrid(routeSchedules, color),
          ],
        ),
      ),
    );
  }

  Color _getTypeColor(String type) {
    switch (type) {
      case 'internal_bus':
        return const Color(0xFFFFD60A);
      case 'mtcc_bus':
        return const Color(0xFF34C759);
      case 'ferry':
        return const Color(0xFF0A84FF);
      default:
        return const Color(0xFFFFD60A);
    }
  }

  Widget _buildScheduleGrid(List<Map<String, dynamic>> schedules, Color color) {
    // Group schedules by days and filter out past times
    final today = DateTime.now();
    final now = TimeOfDay.now();
    final dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    final dayName = dayNames[today.weekday % 7];

    final todaySchedules = schedules.where((s) {
      final days = (s['days_of_week'] as List?)?.cast<String>() ?? [];
      if (!days.contains(dayName)) return false;

      // Filter out past times
      final timeStr = s['departure_time']?.toString() ?? '';
      if (timeStr.isEmpty) return false;
      final parts = timeStr.split(':');
      final hour = int.tryParse(parts[0]) ?? 0;
      final minute = int.tryParse(parts[1]) ?? 0;

      if (hour < now.hour) return false;
      if (hour == now.hour && minute <= now.minute) return false;

      return true;
    }).toList()
      ..sort((a, b) => (a['departure_time'] ?? '').compareTo(b['departure_time'] ?? ''));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                "Today's Departures",
                style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        if (todaySchedules.isEmpty)
          Text('No upcoming departures', style: TextStyle(color: context.textColor.withValues(alpha: 0.5), fontSize: 13))
        else
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: todaySchedules.asMap().entries.map((entry) {
              final index = entry.key;
              final s = entry.value;
              final time = s['departure_time']?.toString().substring(0, 5) ?? '--:--';
              final isNext = index == 0; // First one is the next departure

              return Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: isNext ? color.withValues(alpha: 0.2) : (context.isDark ? const Color(0xFF242426) : const Color(0xFFE8E8E8)),
                  borderRadius: BorderRadius.circular(10),
                  border: isNext ? Border.all(color: color, width: 2) : null,
                ),
                child: Column(
                  children: [
                    Text(
                      time,
                      style: TextStyle(
                        color: context.textColor,
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    if (isNext)
                      Text(
                        'NEXT',
                        style: TextStyle(color: color, fontSize: 9, fontWeight: FontWeight.w700),
                      ),
                  ],
                ),
              );
            }).toList(),
          ),
        const SizedBox(height: 16),

        // Days of week info
        Row(
          children: [
            Icon(Icons.info_outline, size: 14, color: context.textColor.withValues(alpha: 0.4)),
            const SizedBox(width: 6),
            Text(
              'Schedule days: ',
              style: TextStyle(color: context.textColor.withValues(alpha: 0.4), fontSize: 11),
            ),
            ...['M', 'T', 'W', 'T', 'F', 'S', 'S'].asMap().entries.map((e) {
              final dayKey = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][e.key];
              final hasSchedule = schedules.any((s) {
                final days = (s['days_of_week'] as List?)?.cast<String>() ?? [];
                return days.contains(dayKey);
              });
              return Container(
                margin: const EdgeInsets.only(left: 4),
                width: 20,
                height: 20,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: hasSchedule ? color.withValues(alpha: 0.2) : Colors.transparent,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  e.value,
                  style: TextStyle(
                    color: hasSchedule ? color : context.textColor.withValues(alpha: 0.3),
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              );
            }),
          ],
        ),
      ],
    );
  }

  Widget _buildInfoChip(IconData icon, String text) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: context.textColor.withValues(alpha: 0.5)),
        const SizedBox(width: 4),
        Text(text, style: TextStyle(color: context.textColor.withValues(alpha: 0.6), fontSize: 12)),
      ],
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

  Color _hexToColor(String hex) {
    hex = hex.replaceAll('#', '');
    if (hex.length == 6) hex = 'FF$hex';
    return Color(int.parse(hex, radix: 16));
  }
}
