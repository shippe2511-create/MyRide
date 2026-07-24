import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../theme/app_theme.dart';

const String _darkMapStyle = '''
[
  {"elementType": "geometry", "stylers": [{"color": "#212121"}]},
  {"elementType": "labels.icon", "stylers": [{"visibility": "off"}]},
  {"elementType": "labels.text.fill", "stylers": [{"color": "#757575"}]},
  {"elementType": "labels.text.stroke", "stylers": [{"color": "#212121"}]},
  {"featureType": "road", "elementType": "geometry.fill", "stylers": [{"color": "#2c2c2c"}]},
  {"featureType": "road.arterial", "elementType": "geometry", "stylers": [{"color": "#373737"}]},
  {"featureType": "road.highway", "elementType": "geometry", "stylers": [{"color": "#3c3c3c"}]},
  {"featureType": "water", "elementType": "geometry", "stylers": [{"color": "#000000"}]}
]
''';

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
  Set<Circle> _circles = {};
  List<LatLng> _routePoints = []; // Straight lines between consecutive stops

  bool _isLoading = true;
  int? _selectedStopIndex;
  MapType _mapType = MapType.normal;
  bool _trafficEnabled = false;

  RealtimeChannel? _busLocationChannel;
  Timer? _refreshTimer;
  late AnimationController _pulseController;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    )..repeat();
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
      // Build route - uses custom polyline if available, else straight lines
      await _buildRouteFromStops();
    } catch (e) {
      debugPrint('Error loading stops: $e');
    }
  }

  Future<void> _buildRouteFromStops() async {
    if (_stops.length < 2) {
      _updateMapElements();
      return;
    }

    // Try to load custom route polyline from database
    try {
      final routeData = await _supabase
          .from('transport_routes')
          .select('route_polyline')
          .eq('id', widget.routeId)
          .single();

      final polylineStr = routeData['route_polyline'] as String?;
      if (polylineStr != null && polylineStr.isNotEmpty) {
        // Parse stored polyline: "lat1,lng1;lat2,lng2;..."
        final points = polylineStr.split(';').map((point) {
          final coords = point.split(',');
          if (coords.length == 2) {
            final lat = double.tryParse(coords[0]);
            final lng = double.tryParse(coords[1]);
            if (lat != null && lng != null) {
              return LatLng(lat, lng);
            }
          }
          return null;
        }).whereType<LatLng>().toList();

        if (points.length >= 2) {
          setState(() {
            _routePoints = points;
          });
          _updateMapElements();
          return;
        }
      }
    } catch (e) {
      debugPrint('No custom polyline: $e');
    }

    // Fallback: straight lines between stops
    List<LatLng> routePoints = [];
    for (final stop in _stops) {
      final lat = double.tryParse(stop['latitude']?.toString() ?? '');
      final lng = double.tryParse(stop['longitude']?.toString() ?? '');
      if (lat != null && lng != null) {
        routePoints.add(LatLng(lat, lng));
      }
    }

    setState(() {
      _routePoints = routePoints;
    });
    _updateMapElements();
  }

  Future<void> _loadActiveBuses() async {
    try {
      final response = await _supabase
          .from('bus_location_tracking')
          .select('*, driver:drivers!driver_id(profile:profiles(full_name, phone))')
          .eq('route_id', widget.routeId)
          .eq('status', 'in_progress')
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
    Set<Circle> circles = {};

    // Determine current stop index from active bus (if any)
    int currentStopIndex = -1;
    if (_activeBuses.isNotEmpty) {
      final bus = _selectedBus ?? _activeBuses.first;
      currentStopIndex = bus['current_stop_index'] as int? ?? -1;
    }

    // Add stop circles
    for (int i = 0; i < _stops.length; i++) {
      final stop = _stops[i];
      final lat = double.tryParse(stop['latitude']?.toString() ?? '');
      final lng = double.tryParse(stop['longitude']?.toString() ?? '');

      if (lat != null && lng != null) {
        final position = LatLng(lat, lng);

        final isFirst = i == 0;
        final isLast = i == _stops.length - 1;
        final isCompleted = currentStopIndex > i;
        final isCurrent = currentStopIndex == i;
        final isSelected = _selectedStopIndex == i;

        // Use circles for stops
        circles.add(Circle(
          circleId: CircleId('stop_$i'),
          center: position,
          radius: isSelected || isCurrent ? 25 : 18,
          fillColor: isCompleted
              ? Colors.green.withValues(alpha: 0.9)
              : isCurrent
                  ? Colors.blue.withValues(alpha: 0.9)
                  : isFirst
                      ? Colors.green.withValues(alpha: 0.7)
                      : isLast
                          ? Colors.red.withValues(alpha: 0.7)
                          : AppColors.yellow.withValues(alpha: 0.8),
          strokeColor: isSelected ? Colors.white : Colors.black54,
          strokeWidth: isSelected ? 3 : 2,
          consumeTapEvents: true,
          onTap: () => _onStopTapped(i),
        ));

        // Add number label as marker
        markers.add(Marker(
          markerId: MarkerId('stop_label_$i'),
          position: position,
          icon: BitmapDescriptor.defaultMarker,
          alpha: 0.01, // Nearly invisible, just for tap handling
          infoWindow: InfoWindow(
            title: stop['stop_name'] ?? 'Stop ${i + 1}',
            snippet: isCompleted ? 'Completed' : isCurrent ? 'Current Stop' : isFirst ? 'Start' : isLast ? 'End' : 'Stop ${i + 1}',
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
        final plateNo = bus['vehicle_number'] ?? vehicleInfo?['plate_no'] ?? 'Bus';

        markers.add(Marker(
          markerId: MarkerId('bus_${bus['id']}'),
          position: position,
          icon: BitmapDescriptor.defaultMarkerWithHue(
            isSelected ? BitmapDescriptor.hueViolet : BitmapDescriptor.hueCyan,
          ),
          infoWindow: InfoWindow(
            title: plateNo,
            snippet: '${bus['passengers_on_board'] ?? 0}/${bus['vehicle_capacity'] ?? '-'} passengers',
          ),
          zIndex: 100.0,
          onTap: () => _onBusTapped(bus),
        ));
      }
    }

    // Draw route polyline - follows roads via Directions API
    if (_routePoints.length >= 2) {
      polylines.add(Polyline(
        polylineId: const PolylineId('bus_route_line'),
        points: _routePoints,
        color: AppColors.yellow.withValues(alpha: 0.9),
        width: 5,
      ));
    }

    setState(() {
      _markers = markers;
      _polylines = polylines;
      _circles = circles;
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

  Widget _buildMapControlButton({
    required IconData icon,
    required bool isActive,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 48,
        height: 48,
        decoration: BoxDecoration(
          color: isActive ? AppColors.yellow : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Icon(
          icon,
          color: isActive ? Colors.black : Colors.white70,
          size: 22,
        ),
      ),
    );
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
              if (isDark && _mapType == MapType.normal) {
                controller.setMapStyle(_darkMapStyle);
              }
              Future.delayed(const Duration(milliseconds: 500), _fitAllMarkers);
            },
            style: _mapType == MapType.normal && isDark ? _darkMapStyle : null,
            markers: _markers,
            polylines: _polylines,
            circles: _circles,
            mapType: _mapType,
            trafficEnabled: _trafficEnabled,
            myLocationEnabled: true,
            myLocationButtonEnabled: false,
            zoomControlsEnabled: false,
            mapToolbarEnabled: false,
          ),

          // Map controls (bottom right) - 3 buttons in dark card
          Positioned(
            right: 16,
            bottom: MediaQuery.of(context).size.height * 0.35 + 16,
            child: Container(
              decoration: BoxDecoration(
                color: const Color(0xFF1C1C1E),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                children: [
                  // Fit all / Center map (yellow when active)
                  _buildMapControlButton(
                    icon: Icons.map_outlined,
                    isActive: true,
                    onTap: _fitAllMarkers,
                  ),
                  Container(height: 1, width: 32, color: Colors.white12),
                  // Traffic toggle
                  _buildMapControlButton(
                    icon: Icons.traffic_outlined,
                    isActive: _trafficEnabled,
                    onTap: () {
                      setState(() {
                        _trafficEnabled = !_trafficEnabled;
                      });
                    },
                  ),
                  Container(height: 1, width: 32, color: Colors.white12),
                  // Map type: normal → satellite → terrain
                  _buildMapControlButton(
                    icon: _mapType == MapType.satellite
                        ? Icons.satellite_alt
                        : _mapType == MapType.terrain
                            ? Icons.terrain
                            : Icons.layers_outlined,
                    isActive: _mapType != MapType.normal,
                    onTap: () {
                      setState(() {
                        if (_mapType == MapType.normal) {
                          _mapType = MapType.satellite;
                        } else if (_mapType == MapType.satellite) {
                          _mapType = MapType.terrain;
                        } else {
                          _mapType = MapType.normal;
                        }
                      });
                    },
                  ),
                ],
              ),
            ),
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
                                        bus['vehicle_number'] ?? vehicleInfo?['plate_no'] ?? 'Bus',
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
            initialChildSize: 0.32,
            minChildSize: 0.12,
            maxChildSize: 0.75,
            snap: true,
            snapSizes: const [0.12, 0.32, 0.75],
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
                    // Drag handle - larger tap area
                    GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      child: Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        child: Center(
                          child: Container(
                            width: 48,
                            height: 5,
                            decoration: BoxDecoration(
                              color: context.mutedColor.withValues(alpha: 0.4),
                              borderRadius: BorderRadius.circular(3),
                            ),
                          ),
                        ),
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
