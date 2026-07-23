import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../theme/app_theme.dart';

class BusLiveTrackingScreen extends StatefulWidget {
  final String routeId;
  final String routeName;
  final String transportType;

  const BusLiveTrackingScreen({
    super.key,
    required this.routeId,
    required this.routeName,
    required this.transportType,
  });

  @override
  State<BusLiveTrackingScreen> createState() => _BusLiveTrackingScreenState();
}

class _BusLiveTrackingScreenState extends State<BusLiveTrackingScreen> with TickerProviderStateMixin {
  GoogleMapController? _mapController;
  final _supabase = Supabase.instance.client;

  List<Map<String, dynamic>> _stops = [];
  List<Map<String, dynamic>> _activeBuses = [];
  Map<String, dynamic>? _selectedBus;
  Set<Marker> _markers = {};
  Set<Polyline> _polylines = {};

  bool _isLoading = true;
  int? _selectedStopIndex;

  RealtimeChannel? _busLocationChannel;
  Timer? _refreshTimer;
  late AnimationController _pulseController;

  String? _darkMapStyle;
  String? _lightMapStyle;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    )..repeat();
    _loadMapStyles();
    _loadData();
    _setupRealtimeSubscription();
    _refreshTimer = Timer.periodic(const Duration(seconds: 10), (_) => _loadActiveBuses());
  }

  @override
  void dispose() {
    _busLocationChannel?.unsubscribe();
    _refreshTimer?.cancel();
    _pulseController.dispose();
    _mapController?.dispose();
    super.dispose();
  }

  Future<void> _loadMapStyles() async {
    try {
      _darkMapStyle = await rootBundle.loadString('assets/map_style_dark.json');
      _lightMapStyle = await rootBundle.loadString('assets/map_style_light.json');
    } catch (e) {
      debugPrint('Map styles not found, using default');
    }
  }

  void _setupRealtimeSubscription() {
    _busLocationChannel = _supabase
        .channel('bus_tracking_${widget.routeId}')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'bus_location_tracking',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'route_id',
            value: widget.routeId,
          ),
          callback: (payload) {
            debugPrint('Bus location update: ${payload.eventType}');
            _loadActiveBuses();
          },
        )
        .subscribe();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    await Future.wait([
      _loadStops(),
      _loadActiveBuses(),
    ]);
    _updateMapElements();
    setState(() => _isLoading = false);
  }

  Future<void> _loadStops() async {
    try {
      final response = await _supabase
          .from('route_stops')
          .select('*')
          .eq('route_id', widget.routeId)
          .order('stop_order');

      setState(() {
        _stops = List<Map<String, dynamic>>.from(response);
      });
    } catch (e) {
      debugPrint('Error loading stops: $e');
    }
  }

  Future<void> _loadActiveBuses() async {
    try {
      final response = await _supabase
          .from('bus_location_tracking')
          .select('*, drivers:driver_id(full_name, phone), vehicle_types:vehicle_id(plate_no, display_name)')
          .eq('route_id', widget.routeId)
          .eq('status', 'active')
          .order('last_updated_at', ascending: false);

      setState(() {
        _activeBuses = List<Map<String, dynamic>>.from(response);
        if (_selectedBus != null) {
          _selectedBus = _activeBuses.firstWhere(
            (b) => b['id'] == _selectedBus!['id'],
            orElse: () => _activeBuses.isNotEmpty ? _activeBuses.first : {},
          );
        }
      });
      _updateMapElements();
    } catch (e) {
      debugPrint('Error loading active buses: $e');
    }
  }

  void _updateMapElements() {
    Set<Marker> markers = {};
    Set<Polyline> polylines = {};
    List<LatLng> routePoints = [];

    // Add stop markers
    for (int i = 0; i < _stops.length; i++) {
      final stop = _stops[i];
      final lat = double.tryParse(stop['latitude']?.toString() ?? '');
      final lng = double.tryParse(stop['longitude']?.toString() ?? '');

      if (lat != null && lng != null) {
        final position = LatLng(lat, lng);
        routePoints.add(position);

        final isFirst = i == 0;
        final isLast = i == _stops.length - 1;
        final isSelected = _selectedStopIndex == i;

        markers.add(Marker(
          markerId: MarkerId('stop_$i'),
          position: position,
          icon: BitmapDescriptor.defaultMarkerWithHue(
            isFirst ? BitmapDescriptor.hueGreen :
            isLast ? BitmapDescriptor.hueRed :
            isSelected ? BitmapDescriptor.hueAzure :
            BitmapDescriptor.hueOrange,
          ),
          infoWindow: InfoWindow(
            title: stop['stop_name'] ?? 'Stop ${i + 1}',
            snippet: isFirst ? 'Start' : isLast ? 'End' : 'Stop ${i + 1}',
          ),
          onTap: () => _onStopTapped(i),
        ));
      }
    }

    // Add bus markers
    for (final bus in _activeBuses) {
      final lat = double.tryParse(bus['latitude']?.toString() ?? '');
      final lng = double.tryParse(bus['longitude']?.toString() ?? '');

      if (lat != null && lng != null) {
        final position = LatLng(lat, lng);
        final isSelected = _selectedBus?['id'] == bus['id'];
        final vehicleInfo = bus['vehicle_types'];
        final plateNo = vehicleInfo?['plate_no'] ?? 'Bus';

        markers.add(Marker(
          markerId: MarkerId('bus_${bus['id']}'),
          position: position,
          icon: BitmapDescriptor.defaultMarkerWithHue(
            isSelected ? BitmapDescriptor.hueViolet : BitmapDescriptor.hueCyan,
          ),
          infoWindow: InfoWindow(
            title: plateNo,
            snippet: 'Passengers: ${bus['passengers_on_board'] ?? 0}/${bus['vehicle_capacity'] ?? '-'}',
          ),
          zIndex: 100.0,
          onTap: () => _onBusTapped(bus),
        ));
      }
    }

    // Draw route polyline
    if (routePoints.length >= 2) {
      polylines.add(Polyline(
        polylineId: const PolylineId('route'),
        points: routePoints,
        color: AppColors.yellow.withValues(alpha: 0.8),
        width: 4,
        patterns: [PatternItem.dash(20), PatternItem.gap(10)],
      ));
    }

    setState(() {
      _markers = markers;
      _polylines = polylines;
    });
  }

  void _onStopTapped(int index) {
    setState(() {
      _selectedStopIndex = _selectedStopIndex == index ? null : index;
    });
    _updateMapElements();

    if (_selectedStopIndex != null) {
      final stop = _stops[index];
      final lat = double.tryParse(stop['latitude']?.toString() ?? '');
      final lng = double.tryParse(stop['longitude']?.toString() ?? '');
      if (lat != null && lng != null) {
        _mapController?.animateCamera(CameraUpdate.newLatLngZoom(LatLng(lat, lng), 16));
      }
    }
  }

  void _onBusTapped(Map<String, dynamic> bus) {
    setState(() {
      _selectedBus = _selectedBus?['id'] == bus['id'] ? null : bus;
    });
    _updateMapElements();

    if (_selectedBus != null) {
      final lat = double.tryParse(bus['latitude']?.toString() ?? '');
      final lng = double.tryParse(bus['longitude']?.toString() ?? '');
      if (lat != null && lng != null) {
        _mapController?.animateCamera(CameraUpdate.newLatLngZoom(LatLng(lat, lng), 17));
      }
    }
  }

  void _fitAllMarkers() {
    if (_markers.isEmpty) return;

    double minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    for (final marker in _markers) {
      final lat = marker.position.latitude;
      final lng = marker.position.longitude;
      minLat = math.min(minLat, lat);
      maxLat = math.max(maxLat, lat);
      minLng = math.min(minLng, lng);
      maxLng = math.max(maxLng, lng);
    }

    _mapController?.animateCamera(CameraUpdate.newLatLngBounds(
      LatLngBounds(
        southwest: LatLng(minLat - 0.005, minLng - 0.005),
        northeast: LatLng(maxLat + 0.005, maxLng + 0.005),
      ),
      50,
    ));
  }

  String _getEtaToStop(int stopIndex) {
    if (_activeBuses.isEmpty) return '--';
    final bus = _selectedBus ?? _activeBuses.first;
    final currentStopIndex = bus['current_stop_index'] ?? 0;

    if (stopIndex <= currentStopIndex) return 'Passed';

    final stopsAway = stopIndex - currentStopIndex;
    final avgMinutesPerStop = 3;
    final eta = stopsAway * avgMinutesPerStop;

    if (eta < 1) return '< 1 min';
    if (eta == 1) return '1 min';
    return '$eta mins';
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: context.surfaceColor,
      body: Stack(
        children: [
          // Map
          GoogleMap(
            initialCameraPosition: const CameraPosition(
              target: LatLng(4.1755, 73.5093),
              zoom: 14,
            ),
            onMapCreated: (controller) {
              _mapController = controller;
              if (isDark && _darkMapStyle != null) {
                controller.setMapStyle(_darkMapStyle);
              } else if (!isDark && _lightMapStyle != null) {
                controller.setMapStyle(_lightMapStyle);
              }
              Future.delayed(const Duration(milliseconds: 500), _fitAllMarkers);
            },
            markers: _markers,
            polylines: _polylines,
            myLocationEnabled: true,
            myLocationButtonEnabled: false,
            zoomControlsEnabled: false,
            mapToolbarEnabled: false,
          ),

          // Loading overlay
          if (_isLoading)
            Container(
              color: context.surfaceColor.withValues(alpha: 0.8),
              child: const Center(child: CircularProgressIndicator()),
            ),

          // Top header
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  // Header card
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: context.cardColor,
                      borderRadius: BorderRadius.circular(16),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.1),
                          blurRadius: 10,
                        ),
                      ],
                    ),
                    child: Row(
                      children: [
                        GestureDetector(
                          onTap: () => Navigator.pop(context),
                          child: Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: context.surfaceColor,
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Icon(Icons.arrow_back, color: context.textColor, size: 20),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                widget.routeName,
                                style: TextStyle(
                                  color: context.textColor,
                                  fontSize: 16,
                                  fontWeight: FontWeight.w700,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              const SizedBox(height: 2),
                              Row(
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: _activeBuses.isNotEmpty
                                          ? AppColors.success.withValues(alpha: 0.15)
                                          : Colors.orange.withValues(alpha: 0.15),
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Icon(
                                          Icons.directions_bus,
                                          size: 12,
                                          color: _activeBuses.isNotEmpty ? AppColors.success : Colors.orange,
                                        ),
                                        const SizedBox(width: 4),
                                        Text(
                                          _activeBuses.isNotEmpty
                                              ? '${_activeBuses.length} active'
                                              : 'No buses',
                                          style: TextStyle(
                                            color: _activeBuses.isNotEmpty ? AppColors.success : Colors.orange,
                                            fontSize: 11,
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Text(
                                    '${_stops.length} stops',
                                    style: TextStyle(color: context.mutedColor, fontSize: 12),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          onPressed: _fitAllMarkers,
                          icon: Icon(Icons.fit_screen, color: context.textColor),
                          tooltip: 'Fit all markers',
                        ),
                        IconButton(
                          onPressed: _loadData,
                          icon: Icon(Icons.refresh, color: context.textColor),
                          tooltip: 'Refresh',
                        ),
                      ],
                    ),
                  ),

                  // Active bus cards
                  if (_activeBuses.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    SizedBox(
                      height: 80,
                      child: ListView.builder(
                        scrollDirection: Axis.horizontal,
                        itemCount: _activeBuses.length,
                        itemBuilder: (context, index) {
                          final bus = _activeBuses[index];
                          final isSelected = _selectedBus?['id'] == bus['id'];
                          final vehicleInfo = bus['vehicle_types'];
                          final isFull = bus['is_full'] == true;

                          return GestureDetector(
                            onTap: () => _onBusTapped(bus),
                            child: AnimatedContainer(
                              duration: const Duration(milliseconds: 200),
                              margin: EdgeInsets.only(right: index < _activeBuses.length - 1 ? 10 : 0),
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: isSelected
                                    ? AppColors.yellow.withValues(alpha: 0.15)
                                    : context.cardColor,
                                borderRadius: BorderRadius.circular(14),
                                border: isSelected
                                    ? Border.all(color: AppColors.yellow, width: 2)
                                    : null,
                                boxShadow: [
                                  BoxShadow(
                                    color: Colors.black.withValues(alpha: 0.08),
                                    blurRadius: 8,
                                  ),
                                ],
                              ),
                              child: Row(
                                children: [
                                  Container(
                                    width: 44,
                                    height: 44,
                                    decoration: BoxDecoration(
                                      color: isFull
                                          ? Colors.red.withValues(alpha: 0.15)
                                          : AppColors.yellow.withValues(alpha: 0.15),
                                      borderRadius: BorderRadius.circular(10),
                                    ),
                                    child: Stack(
                                      alignment: Alignment.center,
                                      children: [
                                        Icon(
                                          Icons.directions_bus,
                                          color: isFull ? Colors.red : AppColors.yellow,
                                          size: 24,
                                        ),
                                        if (isSelected)
                                          AnimatedBuilder(
                                            animation: _pulseController,
                                            builder: (context, child) {
                                              return Container(
                                                width: 44 + (_pulseController.value * 10),
                                                height: 44 + (_pulseController.value * 10),
                                                decoration: BoxDecoration(
                                                  border: Border.all(
                                                    color: AppColors.yellow.withValues(
                                                      alpha: 1 - _pulseController.value,
                                                    ),
                                                    width: 2,
                                                  ),
                                                  borderRadius: BorderRadius.circular(12),
                                                ),
                                              );
                                            },
                                          ),
                                      ],
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Text(
                                        vehicleInfo?['plate_no'] ?? 'Bus',
                                        style: TextStyle(
                                          color: context.textColor,
                                          fontSize: 14,
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                      const SizedBox(height: 2),
                                      Row(
                                        children: [
                                          Icon(Icons.people, size: 12, color: context.mutedColor),
                                          const SizedBox(width: 4),
                                          Text(
                                            '${bus['passengers_on_board'] ?? 0}/${bus['vehicle_capacity'] ?? '-'}',
                                            style: TextStyle(
                                              color: isFull ? Colors.red : context.mutedColor,
                                              fontSize: 12,
                                              fontWeight: isFull ? FontWeight.w600 : FontWeight.normal,
                                            ),
                                          ),
                                          if (isFull) ...[
                                            const SizedBox(width: 6),
                                            Container(
                                              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                                              decoration: BoxDecoration(
                                                color: Colors.red,
                                                borderRadius: BorderRadius.circular(3),
                                              ),
                                              child: const Text(
                                                'FULL',
                                                style: TextStyle(color: Colors.white, fontSize: 8, fontWeight: FontWeight.bold),
                                              ),
                                            ),
                                          ],
                                        ],
                                      ),
                                      if (bus['current_stop_name'] != null)
                                        Text(
                                          'At: ${bus['current_stop_name']}',
                                          style: TextStyle(color: AppColors.yellow, fontSize: 10),
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),

          // Bottom stops list
          DraggableScrollableSheet(
            initialChildSize: 0.35,
            minChildSize: 0.1,
            maxChildSize: 0.7,
            builder: (context, scrollController) {
              return Container(
                decoration: BoxDecoration(
                  color: context.cardColor,
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.15),
                      blurRadius: 20,
                      offset: const Offset(0, -5),
                    ),
                  ],
                ),
                child: Column(
                  children: [
                    // Handle
                    Container(
                      margin: const EdgeInsets.only(top: 12, bottom: 8),
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(
                        color: context.mutedColor.withValues(alpha: 0.3),
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                    // Title
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      child: Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: AppColors.yellow.withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Icon(Icons.route, color: AppColors.yellow, size: 18),
                          ),
                          const SizedBox(width: 12),
                          Text(
                            'Stops',
                            style: TextStyle(
                              color: context.textColor,
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const Spacer(),
                          if (_activeBuses.isNotEmpty)
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(
                                color: AppColors.success.withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Container(
                                    width: 6,
                                    height: 6,
                                    decoration: const BoxDecoration(
                                      color: AppColors.success,
                                      shape: BoxShape.circle,
                                    ),
                                  ),
                                  const SizedBox(width: 6),
                                  Text(
                                    'Live',
                                    style: TextStyle(
                                      color: AppColors.success,
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    // Stops list
                    Expanded(
                      child: ListView.builder(
                        controller: scrollController,
                        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
                        itemCount: _stops.length,
                        itemBuilder: (context, index) {
                          final stop = _stops[index];
                          final isFirst = index == 0;
                          final isLast = index == _stops.length - 1;
                          final isSelected = _selectedStopIndex == index;

                          // Check if bus is at or past this stop
                          bool busAtStop = false;
                          bool busPassed = false;
                          if (_activeBuses.isNotEmpty) {
                            final bus = _selectedBus ?? _activeBuses.first;
                            final currentStopIndex = bus['current_stop_index'] ?? 0;
                            busAtStop = currentStopIndex == index;
                            busPassed = currentStopIndex > index;
                          }

                          return GestureDetector(
                            onTap: () => _onStopTapped(index),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                // Timeline indicator
                                SizedBox(
                                  width: 30,
                                  child: Column(
                                    children: [
                                      Container(
                                        width: 24,
                                        height: 24,
                                        decoration: BoxDecoration(
                                          color: busAtStop
                                              ? AppColors.yellow
                                              : busPassed
                                                  ? AppColors.success
                                                  : isFirst
                                                      ? AppColors.success
                                                      : isLast
                                                          ? Colors.red
                                                          : isSelected
                                                              ? AppColors.yellow
                                                              : context.mutedColor.withValues(alpha: 0.3),
                                          shape: BoxShape.circle,
                                          border: busAtStop ? Border.all(color: AppColors.yellow, width: 3) : null,
                                          boxShadow: busAtStop ? [
                                            BoxShadow(
                                              color: AppColors.yellow.withValues(alpha: 0.4),
                                              blurRadius: 8,
                                              spreadRadius: 2,
                                            ),
                                          ] : null,
                                        ),
                                        child: Center(
                                          child: busAtStop
                                              ? Icon(Icons.directions_bus, size: 14, color: Colors.white)
                                              : busPassed
                                                  ? Icon(Icons.check, size: 14, color: Colors.white)
                                                  : Text(
                                                      '${index + 1}',
                                                      style: TextStyle(
                                                        color: isFirst || isLast || isSelected
                                                            ? Colors.white
                                                            : context.textColor,
                                                        fontSize: 11,
                                                        fontWeight: FontWeight.bold,
                                                      ),
                                                    ),
                                        ),
                                      ),
                                      if (!isLast)
                                        Container(
                                          width: 2,
                                          height: 40,
                                          decoration: BoxDecoration(
                                            color: busPassed
                                                ? AppColors.success
                                                : context.mutedColor.withValues(alpha: 0.2),
                                            borderRadius: BorderRadius.circular(1),
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                                const SizedBox(width: 12),
                                // Stop info
                                Expanded(
                                  child: Container(
                                    margin: const EdgeInsets.only(bottom: 16),
                                    padding: const EdgeInsets.all(14),
                                    decoration: BoxDecoration(
                                      color: isSelected || busAtStop
                                          ? AppColors.yellow.withValues(alpha: 0.1)
                                          : context.surfaceColor,
                                      borderRadius: BorderRadius.circular(14),
                                      border: busAtStop
                                          ? Border.all(color: AppColors.yellow.withValues(alpha: 0.5), width: 1.5)
                                          : null,
                                    ),
                                    child: Row(
                                      children: [
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment: CrossAxisAlignment.start,
                                            children: [
                                              Row(
                                                children: [
                                                  Expanded(
                                                    child: Text(
                                                      stop['stop_name'] ?? 'Stop ${index + 1}',
                                                      style: TextStyle(
                                                        color: context.textColor,
                                                        fontSize: 14,
                                                        fontWeight: FontWeight.w600,
                                                      ),
                                                    ),
                                                  ),
                                                  if (busAtStop)
                                                    Container(
                                                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                                      decoration: BoxDecoration(
                                                        color: AppColors.yellow,
                                                        borderRadius: BorderRadius.circular(4),
                                                      ),
                                                      child: const Text(
                                                        'BUS HERE',
                                                        style: TextStyle(
                                                          color: Colors.black,
                                                          fontSize: 9,
                                                          fontWeight: FontWeight.bold,
                                                        ),
                                                      ),
                                                    ),
                                                ],
                                              ),
                                              const SizedBox(height: 4),
                                              Row(
                                                children: [
                                                  if (stop['is_pickup'] == true)
                                                    _buildStopBadge('Pickup', AppColors.success),
                                                  if (stop['is_dropoff'] == true)
                                                    _buildStopBadge('Dropoff', Colors.orange),
                                                  const Spacer(),
                                                  if (_activeBuses.isNotEmpty && !busPassed && !busAtStop)
                                                    Row(
                                                      children: [
                                                        Icon(Icons.schedule, size: 12, color: context.mutedColor),
                                                        const SizedBox(width: 4),
                                                        Text(
                                                          _getEtaToStop(index),
                                                          style: TextStyle(
                                                            color: AppColors.yellow,
                                                            fontSize: 12,
                                                            fontWeight: FontWeight.w600,
                                                          ),
                                                        ),
                                                      ],
                                                    ),
                                                  if (busPassed)
                                                    Row(
                                                      children: [
                                                        Icon(Icons.check_circle, size: 12, color: AppColors.success),
                                                        const SizedBox(width: 4),
                                                        Text(
                                                          'Passed',
                                                          style: TextStyle(
                                                            color: AppColors.success,
                                                            fontSize: 12,
                                                          ),
                                                        ),
                                                      ],
                                                    ),
                                                ],
                                              ),
                                            ],
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
                  ],
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildStopBadge(String label, Color color) {
    return Container(
      margin: const EdgeInsets.only(right: 6),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        label,
        style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w600),
      ),
    );
  }
}
