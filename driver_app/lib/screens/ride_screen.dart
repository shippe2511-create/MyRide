import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:geolocator/geolocator.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/ride_request.dart';
import '../providers/driver_state.dart';
import '../theme/app_theme.dart';
import '../services/supabase_service.dart';
import '../services/notification_service.dart';
import 'chat_screen.dart';

const String _darkMapStyle = '''
[
  {"elementType": "geometry", "stylers": [{"color": "#212121"}]},
  {"elementType": "labels.icon", "stylers": [{"visibility": "off"}]},
  {"elementType": "labels.text.fill", "stylers": [{"color": "#757575"}]},
  {"elementType": "labels.text.stroke", "stylers": [{"color": "#212121"}]},
  {"featureType": "administrative", "elementType": "geometry", "stylers": [{"color": "#757575"}]},
  {"featureType": "poi", "elementType": "labels.text.fill", "stylers": [{"color": "#757575"}]},
  {"featureType": "poi.park", "elementType": "geometry", "stylers": [{"color": "#181818"}]},
  {"featureType": "road", "elementType": "geometry.fill", "stylers": [{"color": "#2c2c2c"}]},
  {"featureType": "road", "elementType": "labels.text.fill", "stylers": [{"color": "#8a8a8a"}]},
  {"featureType": "road.arterial", "elementType": "geometry", "stylers": [{"color": "#373737"}]},
  {"featureType": "road.highway", "elementType": "geometry", "stylers": [{"color": "#3c3c3c"}]},
  {"featureType": "road.local", "elementType": "labels.text.fill", "stylers": [{"color": "#616161"}]},
  {"featureType": "transit", "elementType": "labels.text.fill", "stylers": [{"color": "#757575"}]},
  {"featureType": "water", "elementType": "geometry", "stylers": [{"color": "#000000"}]},
  {"featureType": "water", "elementType": "labels.text.fill", "stylers": [{"color": "#3d3d3d"}]}
]
''';

class RideScreen extends StatefulWidget {
  const RideScreen({super.key});

  @override
  State<RideScreen> createState() => _RideScreenState();
}

class _RideScreenState extends State<RideScreen> with TickerProviderStateMixin {
  GoogleMapController? _mapController;
  late AnimationController _pulseController;
  late AnimationController _routeAnimController;
  late Animation<double> _pulseAnimation;

  Timer? _timer;
  Timer? _etaTimer;
  Timer? _destinationChangeTimer;
  int _elapsedSeconds = 0;
  int _etaSeconds = 0;
  bool _isShowingDestinationChange = false;
  double _driverLat = 4.2050;
  double _driverLng = 73.5380;
  double _prevDriverLat = 4.2050;
  double _prevDriverLng = 73.5380;
  List<LatLng> _routePoints = [];
  int _currentRouteIndex = 0;
  bool _isQueueExpanded = false;
  bool _isPanelExpanded = true;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    )..repeat(reverse: true);

    _routeAnimController = AnimationController(
      duration: const Duration(milliseconds: 500),
      vsync: this,
    );

    _pulseAnimation = Tween<double>(begin: 1.0, end: 1.15).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );

    _startDriverSimulation();
    _startDestinationChangePolling();

    // Subscribe to chat notifications
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final driverState = Provider.of<DriverState>(context, listen: false);
      final rideId = driverState.currentRide?.id;
      if (rideId != null && driverState.driverId.isNotEmpty) {
        NotificationService.subscribeToChatMessages(rideId, driverState.driverId);
      }
    });
  }

  @override
  void dispose() {
    _pulseController.dispose();
    _routeAnimController.dispose();
    _timer?.cancel();
    _etaTimer?.cancel();
    _destinationChangeTimer?.cancel();
    _mapController?.dispose();
    super.dispose();
  }

  void _startDestinationChangePolling() {
    _destinationChangeTimer = Timer.periodic(const Duration(seconds: 3), (timer) async {
      if (!mounted || _isShowingDestinationChange) return;

      final state = context.read<DriverState>();
      final ride = state.currentRide;
      if (ride == null) return;

      final pending = await SupabaseService.getPendingDestinationChange(ride.id);
      if (pending != null && pending['destination_change_status'] == 'pending') {
        final newDestination = pending['pending_dropoff_name'] as String? ?? 'New Location';
        _showDestinationChangeApproval(ride.id, newDestination);
      }
    });
  }

  void _showDestinationChangeApproval(String rideId, String newDestination) {
    if (_isShowingDestinationChange) return;
    _isShowingDestinationChange = true;

    HapticFeedback.heavyImpact();

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => Dialog(
        backgroundColor: context.cardColor,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 70,
                height: 70,
                decoration: BoxDecoration(
                  color: AppColors.yellow.withValues(alpha: 0.15),
                  shape: BoxShape.circle,
                ),
                child: Icon(Icons.edit_location_alt, color: AppColors.yellow, size: 36),
              ),
              const SizedBox(height: 20),
              Text('Destination Change', style: TextStyle(color: context.textColor, fontSize: 18, fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              Text('Customer wants to change destination', textAlign: TextAlign.center, style: TextStyle(color: context.mutedColor, fontSize: 14)),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: context.isDark ? context.bgColor : Colors.grey.shade100,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    Icon(Icons.location_on, color: AppColors.yellow, size: 24),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('New Destination', style: TextStyle(color: context.mutedColor, fontSize: 11)),
                          Text(newDestination, style: TextStyle(color: context.textColor, fontSize: 15, fontWeight: FontWeight.w600)),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              Row(
                children: [
                  Expanded(
                    child: SizedBox(
                      height: 50,
                      child: OutlinedButton(
                        onPressed: () async {
                          Navigator.pop(ctx);
                          _isShowingDestinationChange = false;
                          await SupabaseService.rejectDestinationChange(rideId);
                          if (mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text('Destination change declined'), backgroundColor: Colors.orange),
                            );
                          }
                        },
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.red,
                          side: BorderSide(color: Colors.red),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                        child: Text('Decline', style: TextStyle(fontWeight: FontWeight.w600)),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: SizedBox(
                      height: 50,
                      child: ElevatedButton(
                        onPressed: () async {
                          Navigator.pop(ctx);
                          _isShowingDestinationChange = false;
                          final success = await SupabaseService.approveDestinationChange(rideId);
                          if (mounted) {
                            if (success) {
                              // Refresh ride data
                              context.read<DriverState>().refreshCurrentRide();
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(content: Text('Destination updated'), backgroundColor: Colors.green),
                              );
                            }
                          }
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.yellow,
                          foregroundColor: Colors.black,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                        child: Text('Accept', style: TextStyle(fontWeight: FontWeight.w700)),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    ).then((_) {
      _isShowingDestinationChange = false;
    });
  }

  Future<void> _initDriverLocation() async {
    try {
      bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) return;

      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
        if (permission == LocationPermission.denied) return;
      }

      if (permission == LocationPermission.deniedForever) return;

      final position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
        timeLimit: const Duration(seconds: 10),
      );

      if (mounted) {
        setState(() {
          _driverLat = position.latitude;
          _driverLng = position.longitude;
        });
      }
    } catch (e) {
      debugPrint('Could not get GPS location: $e');
    }
  }

  void _startDriverSimulation() {
    // First try to get real GPS location
    _initDriverLocation();

    _etaTimer = Timer.periodic(const Duration(seconds: 3), (timer) async {
      // Only use real GPS location - no simulation
      try {
        final position = await Geolocator.getCurrentPosition(
          desiredAccuracy: LocationAccuracy.best,
          timeLimit: const Duration(seconds: 10),
        );
        if (mounted) {
          setState(() {
            _prevDriverLat = _driverLat;
            _prevDriverLng = _driverLng;
            _driverLat = position.latitude;
            _driverLng = position.longitude;
            if (_etaSeconds > 0) _etaSeconds -= 3;
          });
          _mapController?.animateCamera(CameraUpdate.newLatLng(LatLng(_driverLat, _driverLng)));
          _sendLocationUpdate();
        }
      } catch (e) {
        // GPS failed - just update ETA, don't simulate movement
        debugPrint('GPS error: $e');
        if (mounted && _etaSeconds > 0) {
          setState(() {
            _etaSeconds -= 3;
          });
        }
      }
    });
  }

  Future<void> _sendLocationUpdate() async {
    try {
      final driverState = Provider.of<DriverState>(context, listen: false);
      final driverId = driverState.driverId;
      if (driverId.isEmpty) return;

      // Calculate heading based on actual GPS movement
      double heading = 0;
      if (_prevDriverLat != _driverLat || _prevDriverLng != _driverLng) {
        heading = math.atan2(
          _driverLng - _prevDriverLng,
          _driverLat - _prevDriverLat,
        ) * 180 / math.pi;
      }

      // Calculate actual speed based on GPS distance
      final distanceMeters = Geolocator.distanceBetween(
        _prevDriverLat, _prevDriverLng, _driverLat, _driverLng);
      final speed = (distanceMeters / 3) * 3.6; // m/s to km/h (3 second interval)

      await SupabaseService.updateLocation(
        driverId,
        _driverLat,
        _driverLng,
        heading: heading,
        speed: speed,
      );
    } catch (e) {
      // Silently fail - don't interrupt the ride
      debugPrint('Location update failed: $e');
    }
  }

  void _generateRoute(RideRequest ride) {
    final startLat = ride.status == RideStatus.inProgress ? ride.pickupLat : _driverLat;
    final startLng = ride.status == RideStatus.inProgress ? ride.pickupLng : _driverLng;
    final endLat = ride.status == RideStatus.inProgress ? ride.dropoffLat : ride.pickupLat;
    final endLng = ride.status == RideStatus.inProgress ? ride.dropoffLng : ride.pickupLng;

    _routePoints = _generateCurvedRoute(
      LatLng(startLat, startLng),
      LatLng(endLat, endLng),
    );
    _currentRouteIndex = 0;
    _etaSeconds = ride.estimatedDuration * 60;
  }

  List<LatLng> _generateCurvedRoute(LatLng start, LatLng end) {
    final points = <LatLng>[];
    const steps = 20;

    for (int i = 0; i <= steps; i++) {
      final t = i / steps;
      final lat = start.latitude + (end.latitude - start.latitude) * t;
      final lng = start.longitude + (end.longitude - start.longitude) * t;
      final curve = math.sin(t * math.pi) * 0.002;
      points.add(LatLng(lat + curve, lng));
    }
    return points;
  }

  Set<Marker> _buildMarkers(RideRequest ride, DriverState state) {
    return {
      Marker(
        markerId: const MarkerId('driver'),
        position: LatLng(_driverLat, _driverLng),
        icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueYellow),
        infoWindow: const InfoWindow(title: 'You'),
      ),
      Marker(
        markerId: const MarkerId('pickup'),
        position: LatLng(ride.pickupLat, ride.pickupLng),
        icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueGreen),
        infoWindow: InfoWindow(title: 'Pickup', snippet: ride.pickupLocation),
      ),
      Marker(
        markerId: const MarkerId('dropoff'),
        position: LatLng(ride.dropoffLat, ride.dropoffLng),
        icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueRed),
        infoWindow: InfoWindow(title: 'Drop-off', snippet: ride.dropoffLocation),
      ),
      ...state.queuedRequests.asMap().entries.map((entry) {
        final idx = entry.key;
        final req = entry.value;
        return Marker(
          markerId: MarkerId('queue_$idx'),
          position: LatLng(req.pickupLat, req.pickupLng),
          icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueOrange),
          infoWindow: InfoWindow(title: 'Queue #${idx + 1}', snippet: req.customerName),
        );
      }),
    };
  }

  Set<Polyline> _buildPolylines() {
    if (_routePoints.isEmpty) return {};
    return {
      Polyline(
        polylineId: const PolylineId('route_bg'),
        points: _routePoints,
        color: Colors.white24,
        width: 6,
      ),
      Polyline(
        polylineId: const PolylineId('route'),
        points: _routePoints.take(_currentRouteIndex + 1).toList(),
        color: AppColors.yellow,
        width: 5,
      ),
    };
  }

  void _startTimer() {
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (mounted) setState(() => _elapsedSeconds++);
    });
  }

  void _stopTimer() => _timer?.cancel();

  String get _formattedTime {
    final minutes = _elapsedSeconds ~/ 60;
    final seconds = _elapsedSeconds % 60;
    return '${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
  }

  String get _formattedEta {
    final minutes = _etaSeconds ~/ 60;
    return '$minutes min';
  }

  void _fitBounds(RideRequest ride) {
    if (_mapController == null) return;
    try {
      final pickupLat = ride.pickupLat != 0 ? ride.pickupLat : 4.1755;
      final pickupLng = ride.pickupLng != 0 ? ride.pickupLng : 73.5093;
      final dropoffLat = ride.dropoffLat != 0 ? ride.dropoffLat : pickupLat + 0.01;
      final dropoffLng = ride.dropoffLng != 0 ? ride.dropoffLng : pickupLng + 0.01;
      final driverLat = (_driverLat > 1 && _driverLat < 90) ? _driverLat : pickupLat;
      final driverLng = (_driverLng > 1 && _driverLng < 180) ? _driverLng : pickupLng;

      final bounds = LatLngBounds(
        southwest: LatLng(
          [pickupLat, dropoffLat, driverLat].reduce(math.min),
          [pickupLng, dropoffLng, driverLng].reduce(math.min),
        ),
        northeast: LatLng(
          [pickupLat, dropoffLat, driverLat].reduce(math.max),
          [pickupLng, dropoffLng, driverLng].reduce(math.max),
        ),
      );
      _mapController!.animateCamera(CameraUpdate.newLatLngBounds(bounds, 80));
    } catch (e) {
      _mapController!.animateCamera(CameraUpdate.newLatLngZoom(
        LatLng(ride.pickupLat, ride.pickupLng), 15,
      ));
    }
  }

  Future<void> _openNavigation(double lat, double lng) async {
    HapticFeedback.mediumImpact();
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: context.cardColor,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: context.borderColor,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 20),
            Text(
              'Open in Navigation',
              style: TextStyle(color: context.textColor, fontSize: 18, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 20),
            Row(
              children: [
                Expanded(
                  child: _buildNavOption(
                    icon: Icons.map,
                    label: 'Google Maps',
                    color: const Color(0xFF4285F4),
                    onTap: () async {
                      Navigator.pop(ctx);
                      final uri = Uri.parse('https://www.google.com/maps/dir/?api=1&destination=$lat,$lng&travelmode=driving');
                      if (await canLaunchUrl(uri)) {
                        await launchUrl(uri, mode: LaunchMode.externalApplication);
                      }
                    },
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _buildNavOption(
                    icon: Icons.navigation,
                    label: 'Waze',
                    color: const Color(0xFF33CCFF),
                    onTap: () async {
                      Navigator.pop(ctx);
                      final uri = Uri.parse('https://waze.com/ul?ll=$lat,$lng&navigate=yes');
                      if (await canLaunchUrl(uri)) {
                        await launchUrl(uri, mode: LaunchMode.externalApplication);
                      }
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: Text('Cancel', style: TextStyle(color: context.mutedColor)),
            ),
            SizedBox(height: MediaQuery.of(ctx).padding.bottom),
          ],
        ),
      ),
    );
  }

  Widget _buildNavOption({
    required IconData icon,
    required String label,
    required Color color,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: () {
        HapticFeedback.lightImpact();
        onTap();
      },
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 20),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: color.withValues(alpha: 0.3)),
        ),
        child: Column(
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                color: color,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(icon, color: Colors.white, size: 28),
            ),
            const SizedBox(height: 10),
            Text(
              label,
              style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w600),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _makeCall(String phone) async {
    final uri = Uri.parse('tel:$phone');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }

  void _openChat(String customerName, {String? customerPhone, String? rideId}) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => ChatScreen(
          customerName: customerName,
          customerPhone: customerPhone ?? '',
          rideId: rideId,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<DriverState>(
      builder: (context, state, _) {
        final ride = state.currentRide;

        if (ride == null) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted && Navigator.canPop(context)) {
              Navigator.pop(context);
            } else if (mounted) {
              Navigator.pushReplacementNamed(context, '/home');
            }
          });
          return const Scaffold(backgroundColor: Colors.black);
        }

        if (_routePoints.isEmpty) {
          WidgetsBinding.instance.addPostFrameCallback((_) => _generateRoute(ride));
        }

        return Scaffold(
          backgroundColor: context.bgColor,
          body: Stack(
            children: [
              // Full screen Google Map
              Positioned.fill(
                child: GoogleMap(
                  initialCameraPosition: CameraPosition(
                    target: LatLng(ride.pickupLat, ride.pickupLng),
                    zoom: 14,
                  ),
                  onMapCreated: (controller) {
                    _mapController = controller;
                    Future.delayed(const Duration(milliseconds: 500), () => _fitBounds(ride));
                  },
                  markers: _buildMarkers(ride, state),
                  polylines: _buildPolylines(),
                  myLocationEnabled: true,
                  myLocationButtonEnabled: false,
                  zoomControlsEnabled: false,
                  mapToolbarEnabled: false,
                  compassEnabled: false,
                  style: context.isDark ? _darkMapStyle : null,
                ),
              ),

              // Top overlay
              Positioned(
                top: MediaQuery.of(context).padding.top + 10,
                left: 16,
                right: 16,
                child: Row(
                  children: [
                    _buildMapButton(Icons.arrow_back, () => Navigator.pop(context)),
                    const SizedBox(width: 12),
                    Expanded(child: _buildStatusChip(ride.status)),
                    const SizedBox(width: 12),
                    _buildMapButton(Icons.my_location, () => _fitBounds(ride)),
                  ],
                ),
              ),

              // ETA Badge
              Positioned(
                top: MediaQuery.of(context).padding.top + 70,
                left: 0,
                right: 0,
                child: Center(
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.8),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: AppColors.yellow, width: 1.5),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.schedule, color: AppColors.yellow, size: 18),
                        const SizedBox(width: 8),
                        Text(
                          ride.status == RideStatus.inProgress ? _formattedTime : 'ETA $_formattedEta',
                          style: const TextStyle(
                            color: AppColors.yellow,
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                            fontFeatures: [FontFeature.tabularFigures()],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),

              // Quick action buttons row
              Positioned(
                top: MediaQuery.of(context).padding.top + 115,
                left: 16,
                right: 16,
                child: Row(
                  children: [
                    // Navigation button
                    if (ride.status == RideStatus.accepted || ride.status == RideStatus.inProgress)
                      GestureDetector(
                        onTap: () => _openNavigation(
                          ride.status == RideStatus.inProgress ? ride.dropoffLat : ride.pickupLat,
                          ride.status == RideStatus.inProgress ? ride.dropoffLng : ride.pickupLng,
                        ),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          decoration: BoxDecoration(
                            color: AppColors.success,
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: const Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.navigation, color: Colors.white, size: 16),
                              SizedBox(width: 6),
                              Text('Navigate', style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600)),
                            ],
                          ),
                        ),
                      ),

                    // SOS Button
                    const SizedBox(width: 8),
                    GestureDetector(
                      onTap: () {
                        HapticFeedback.heavyImpact();
                        Navigator.pushNamed(context, '/sos');
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        decoration: BoxDecoration(
                          color: AppColors.error,
                          borderRadius: BorderRadius.circular(20),
                          boxShadow: [
                            BoxShadow(
                              color: AppColors.error.withValues(alpha: 0.4),
                              blurRadius: 8,
                            ),
                          ],
                        ),
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.warning_rounded, color: Colors.white, size: 16),
                            SizedBox(width: 6),
                            Text('SOS', style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700)),
                          ],
                        ),
                      ),
                    ),

                    const Spacer(),

                    // Seats indicator
                    if (state.hasAvailableSeats)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                        margin: const EdgeInsets.only(right: 8),
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.7),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: AppColors.success.withValues(alpha: 0.5)),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.event_seat, color: AppColors.success, size: 14),
                            const SizedBox(width: 4),
                            Text(
                              '${state.availableSeats}',
                              style: const TextStyle(
                                color: AppColors.success,
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                      ),

                    // New ride button
                    if (state.incomingRequests.isNotEmpty && state.hasAvailableSeats)
                      GestureDetector(
                        onTap: () => _showNewRequestSheet(state, state.incomingRequests.first),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          decoration: BoxDecoration(
                            color: AppColors.yellow,
                            borderRadius: BorderRadius.circular(20),
                            boxShadow: [
                              BoxShadow(
                                color: AppColors.yellow.withValues(alpha: 0.4),
                                blurRadius: 10,
                              ),
                            ],
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(
                                width: 18,
                                height: 18,
                                decoration: BoxDecoration(
                                  color: Colors.black.withValues(alpha: 0.2),
                                  shape: BoxShape.circle,
                                ),
                                child: Center(
                                  child: Text(
                                    '${state.incomingRequests.length}',
                                    style: const TextStyle(
                                      color: Colors.black,
                                      fontSize: 10,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 6),
                              const Text(
                                'New',
                                style: TextStyle(
                                  color: Colors.black,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
              ),

              // Toggle Bottom Panel
              AnimatedPositioned(
                duration: const Duration(milliseconds: 300),
                curve: Curves.easeOutCubic,
                left: 0,
                right: 0,
                bottom: 0,
                height: _isPanelExpanded
                    ? MediaQuery.of(context).size.height * 0.56
                    : 140 + MediaQuery.of(context).padding.bottom,
                child: Container(
                  decoration: BoxDecoration(
                    color: context.cardColor,
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.3),
                        blurRadius: 20,
                        offset: const Offset(0, -5),
                      ),
                    ],
                  ),
                  child: Column(
                    children: [
                      // Tap Handle to toggle
                      GestureDetector(
                        onTap: () {
                          HapticFeedback.lightImpact();
                          setState(() => _isPanelExpanded = !_isPanelExpanded);
                        },
                        child: Container(
                          width: double.infinity,
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          color: Colors.transparent,
                          child: Column(
                            children: [
                              Container(
                                width: 50,
                                height: 5,
                                decoration: BoxDecoration(
                                  color: Colors.white38,
                                  borderRadius: BorderRadius.circular(3),
                                ),
                              ),
                              const SizedBox(height: 6),
                              Icon(
                                _isPanelExpanded ? Icons.keyboard_arrow_down : Icons.keyboard_arrow_up,
                                color: Colors.white38,
                                size: 20,
                              ),
                            ],
                          ),
                        ),
                      ),

                      // Content
                      Expanded(
                        child: SingleChildScrollView(
                          padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.of(context).padding.bottom + 16),
                          child: Column(
                            children: [
                              // Show full content when expanded
                              if (_isPanelExpanded) ...[
                                _buildCustomerCard(ride, state),
                                const SizedBox(height: 16),
                                _buildRouteCard(ride),
                                if (state.queuedRequests.isNotEmpty) ...[
                                  const SizedBox(height: 16),
                                  _buildQueueCard(state),
                                ],
                                const SizedBox(height: 16),
                                // Cancel button (show when waiting for customer and panel expanded)
                                if (ride.status == RideStatus.arrivedAtPickup) ...[
                                  GestureDetector(
                                    onTap: () => _showCancelOptions(state, ride),
                                    child: Container(
                                      width: double.infinity,
                                      padding: const EdgeInsets.symmetric(vertical: 12),
                                      decoration: BoxDecoration(
                                        color: AppColors.error.withValues(alpha: 0.1),
                                        borderRadius: BorderRadius.circular(12),
                                        border: Border.all(color: AppColors.error.withValues(alpha: 0.3)),
                                      ),
                                      child: const Row(
                                        mainAxisAlignment: MainAxisAlignment.center,
                                        children: [
                                          Icon(Icons.cancel_outlined, color: AppColors.error, size: 20),
                                          SizedBox(width: 8),
                                          Text('Cancel Ride', style: TextStyle(color: AppColors.error, fontSize: 14, fontWeight: FontWeight.w600)),
                                        ],
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: 12),
                                ],
                              ],

                              // Always show swipe action
                              _buildSwipeAction(state, ride),
                            ],
                          ),
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
    );
  }

  Widget _buildMapButton(IconData icon, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.7),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.white24),
        ),
        child: Icon(icon, color: Colors.white, size: 20),
      ),
    );
  }

  Widget _buildStatusChip(RideStatus status) {
    Color color;
    String text;
    IconData icon;

    switch (status) {
      case RideStatus.accepted:
        color = AppColors.warning;
        text = 'HEADING TO PICKUP';
        icon = Icons.directions_car;
        break;
      case RideStatus.arrivedAtPickup:
        color = AppColors.yellow;
        text = 'WAITING FOR CUSTOMER';
        icon = Icons.person_pin_circle;
        break;
      case RideStatus.inProgress:
        color = AppColors.success;
        text = 'TRIP IN PROGRESS';
        icon = Icons.navigation;
        break;
      default:
        color = Colors.grey;
        text = 'ACTIVE';
        icon = Icons.circle;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(25),
        boxShadow: [BoxShadow(color: color.withValues(alpha: 0.4), blurRadius: 10)],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: Colors.black, size: 16),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              text,
              style: const TextStyle(color: Colors.black, fontSize: 11, fontWeight: FontWeight.w700),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCustomerCard(RideRequest ride, DriverState state) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.bgColor,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.yellow.withValues(alpha: 0.3)),
      ),
      child: Column(
        children: [
          Row(
            children: [
              // Customer photo
              Stack(
                children: [
                  Container(
                    width: 60,
                    height: 60,
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [AppColors.yellow, AppColors.yellow.withValues(alpha: 0.7)],
                      ),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: const Icon(Icons.person, color: Colors.black, size: 32),
                  ),
                  Positioned(
                    bottom: -2,
                    right: -2,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: AppColors.success,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.star, color: Colors.white, size: 10),
                          SizedBox(width: 2),
                          Text('4.8', style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      ride.customerName,
                      style: TextStyle(color: context.textColor, fontSize: 18, fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Icon(Icons.phone, color: context.mutedColor, size: 14),
                        const SizedBox(width: 4),
                        Text(ride.customerPhone, style: TextStyle(color: context.mutedColor, fontSize: 13)),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Icon(Icons.history, color: context.mutedColor, size: 14),
                        const SizedBox(width: 4),
                        Text('12 trips together', style: TextStyle(color: context.mutedColor, fontSize: 12)),
                      ],
                    ),
                  ],
                ),
              ),
              // Action buttons
              Column(
                children: [
                  _buildActionButton(Icons.chat, Colors.blue, () => _openChat(ride.customerName, customerPhone: ride.customerPhone, rideId: ride.id)),
                  const SizedBox(height: 8),
                  _buildActionButton(Icons.call, AppColors.success, () => _makeCall(ride.customerPhone)),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildActionButton(IconData icon, Color color, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Icon(icon, color: Colors.white, size: 22),
      ),
    );
  }

  Widget _buildRouteCard(RideRequest ride) {
    final isPickup = ride.status == RideStatus.accepted || ride.status == RideStatus.arrivedAtPickup;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.bgColor,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          _buildLocationRow(
            icon: Icons.radio_button_checked,
            color: AppColors.success,
            title: 'PICKUP',
            location: ride.pickupLocation,
            isActive: isPickup,
          ),
          Padding(
            padding: const EdgeInsets.only(left: 10),
            child: Row(
              children: [
                Column(
                  children: List.generate(3, (i) => Container(
                    width: 2,
                    height: 6,
                    margin: const EdgeInsets.symmetric(vertical: 2),
                    color: context.borderColor,
                  )),
                ),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: context.cardColor,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    '${ride.estimatedDistance} km • ${ride.estimatedDuration} min',
                    style: TextStyle(color: context.mutedColor, fontSize: 11),
                  ),
                ),
              ],
            ),
          ),
          _buildLocationRow(
            icon: Icons.location_on,
            color: AppColors.error,
            title: 'DROP-OFF',
            location: ride.dropoffLocation,
            isActive: !isPickup,
          ),
        ],
      ),
    );
  }

  Widget _buildLocationRow({
    required IconData icon,
    required Color color,
    required String title,
    required String location,
    required bool isActive,
  }) {
    return Row(
      children: [
        Container(
          width: 24,
          height: 24,
          decoration: BoxDecoration(
            color: isActive ? color : color.withValues(alpha: 0.3),
            shape: BoxShape.circle,
          ),
          child: Icon(icon, color: Colors.white, size: 14),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: TextStyle(
                  color: isActive ? color : context.mutedColor,
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 1,
                ),
              ),
              Text(
                location,
                style: TextStyle(
                  color: isActive ? context.textColor : context.mutedColor,
                  fontSize: 14,
                  fontWeight: isActive ? FontWeight.w600 : FontWeight.normal,
                ),
              ),
            ],
          ),
        ),
        if (isActive)
          GestureDetector(
            onTap: () {
              final ride = context.read<DriverState>().currentRide!;
              _openNavigation(
                title == 'PICKUP' ? ride.pickupLat : ride.dropoffLat,
                title == 'PICKUP' ? ride.pickupLng : ride.dropoffLng,
              );
            },
            child: Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: AppColors.yellow,
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(Icons.navigation, color: Colors.black, size: 20),
            ),
          ),
      ],
    );
  }

  Widget _buildQueueCard(DriverState state) {
    return Container(
      decoration: BoxDecoration(
        color: context.bgColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.orange.withValues(alpha: 0.3)),
      ),
      child: Column(
        children: [
          GestureDetector(
            onTap: () => setState(() => _isQueueExpanded = !_isQueueExpanded),
            child: Container(
              padding: const EdgeInsets.all(14),
              child: Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: Colors.orange.withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(Icons.people, color: Colors.orange, size: 20),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'QUEUED PASSENGERS',
                          style: TextStyle(color: Colors.orange, fontSize: 11, fontWeight: FontWeight.w700),
                        ),
                        Text(
                          '${state.queuedRequests.length} waiting • ${state.availableSeats} seats left',
                          style: TextStyle(color: context.mutedColor, fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                  Icon(
                    _isQueueExpanded ? Icons.expand_less : Icons.expand_more,
                    color: Colors.orange,
                  ),
                ],
              ),
            ),
          ),
          if (_isQueueExpanded) ...[
            const Divider(height: 1, color: Colors.white10),
            ...state.queuedRequests.asMap().entries.map((entry) {
              final idx = entry.key;
              final req = entry.value;
              return Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  border: Border(bottom: BorderSide(color: Colors.white10)),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 28,
                      height: 28,
                      decoration: BoxDecoration(
                        color: Colors.orange,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Center(
                        child: Text(
                          '${idx + 1}',
                          style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(req.customerName, style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w500)),
                          Text('${req.pickupLocation} → ${req.dropoffLocation}', style: TextStyle(color: context.mutedColor, fontSize: 11)),
                        ],
                      ),
                    ),
                    GestureDetector(
                      onTap: () => state.removeFromQueue(req.id),
                      child: Container(
                        width: 32,
                        height: 32,
                        decoration: BoxDecoration(
                          color: AppColors.error.withValues(alpha: 0.2),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Icon(Icons.close, color: AppColors.error, size: 18),
                      ),
                    ),
                  ],
                ),
              );
            }),
          ],
        ],
      ),
    );
  }

  Widget _buildSwipeAction(DriverState state, RideRequest ride) {
    String actionText;
    Color actionColor;
    IconData actionIcon;
    VoidCallback onAction;

    switch (ride.status) {
      case RideStatus.accepted:
        actionText = 'SWIPE TO ARRIVE';
        actionColor = AppColors.warning;
        actionIcon = Icons.location_on;
        onAction = () => state.arrivedAtPickup();
        break;
      case RideStatus.arrivedAtPickup:
        actionText = 'SWIPE TO START';
        actionColor = AppColors.yellow;
        actionIcon = Icons.play_arrow;
        onAction = () {
          state.startTrip();
          _startTimer();
          _generateRoute(ride);
        };
        break;
      case RideStatus.inProgress:
        actionText = 'SWIPE TO COMPLETE';
        actionColor = AppColors.success;
        actionIcon = Icons.check_circle;
        onAction = () {
          _stopTimer();
          _showCompletionDialog(state);
        };
        break;
      default:
        return const SizedBox.shrink();
    }

    return _SwipeButton(
      text: actionText,
      color: actionColor,
      icon: actionIcon,
      onSwipeComplete: () {
        HapticFeedback.heavyImpact();
        onAction();
      },
    );
  }

  void _showCancelOptions(DriverState state, RideRequest ride) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Container(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(ctx).size.height * 0.75,
        ),
        padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(ctx).padding.bottom + 20),
        decoration: BoxDecoration(
          color: context.cardColor,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: context.borderColor,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 20),
              Text(
                'Cancel Ride',
                style: TextStyle(color: context.textColor, fontSize: 18, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 8),
              Text(
                'Please select a reason for cancellation',
                style: TextStyle(color: context.mutedColor, fontSize: 14),
              ),
              const SizedBox(height: 20),
              _buildCancelOption(ctx, state, ride, Icons.person_off, 'Customer No Show', 'Customer did not arrive at pickup location'),
              _buildCancelOption(ctx, state, ride, Icons.cancel, 'Customer Requested', 'Customer asked to cancel the ride'),
              _buildCancelOption(ctx, state, ride, Icons.wrong_location, 'Wrong Address', 'Pickup location is incorrect'),
              _buildCancelOption(ctx, state, ride, Icons.timer_off, 'Long Wait Time', 'Customer taking too long'),
              _buildOtherReasonOption(ctx, state, ride),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: TextButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: Text('Go Back', style: TextStyle(color: context.mutedColor, fontSize: 15)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildOtherReasonOption(BuildContext ctx, DriverState state, RideRequest ride) {
    return GestureDetector(
      onTap: () {
        Navigator.pop(ctx);
        _showOtherReasonDialog(state, ride);
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: context.bgColor,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: context.borderColor),
        ),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: AppColors.error.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Icons.more_horiz, color: AppColors.error, size: 22),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Other Reason', style: TextStyle(color: context.textColor, fontSize: 15, fontWeight: FontWeight.w600)),
                  Text('Enter your cancellation reason', style: TextStyle(color: context.mutedColor, fontSize: 12)),
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: context.mutedColor, size: 22),
          ],
        ),
      ),
    );
  }

  void _showOtherReasonDialog(DriverState state, RideRequest ride) {
    final controller = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.cardColor,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text('Other Reason', style: TextStyle(color: context.textColor)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Please enter your reason for cancellation',
              style: TextStyle(color: context.mutedColor, fontSize: 14),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: controller,
              maxLines: 3,
              style: TextStyle(color: context.textColor),
              decoration: InputDecoration(
                hintText: 'Enter reason...',
                hintStyle: TextStyle(color: context.mutedColor),
                filled: true,
                fillColor: context.bgColor,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: context.borderColor),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: context.borderColor),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: AppColors.yellow),
                ),
              ),
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
              final reason = controller.text.trim();
              if (reason.isNotEmpty) {
                Navigator.pop(ctx);
                _confirmCancellation(state, ride, 'Other: $reason');
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.error,
              foregroundColor: Colors.white,
            ),
            child: const Text('Submit'),
          ),
        ],
      ),
    );
  }

  Widget _buildCancelOption(BuildContext ctx, DriverState state, RideRequest ride, IconData icon, String title, String subtitle) {
    return GestureDetector(
      onTap: () {
        Navigator.pop(ctx);
        _confirmCancellation(state, ride, title);
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: context.bgColor,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: context.borderColor),
        ),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: AppColors.error.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, color: AppColors.error, size: 22),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: TextStyle(color: context.textColor, fontSize: 15, fontWeight: FontWeight.w600)),
                  Text(subtitle, style: TextStyle(color: context.mutedColor, fontSize: 12)),
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: context.mutedColor, size: 22),
          ],
        ),
      ),
    );
  }

  void _confirmCancellation(DriverState state, RideRequest ride, String reason) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.cardColor,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text('Confirm Cancellation', style: TextStyle(color: context.textColor)),
        content: Text(
          'Are you sure you want to cancel this ride?\n\nReason: $reason',
          style: TextStyle(color: context.mutedColor),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text('No, Go Back', style: TextStyle(color: context.mutedColor)),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(ctx);
              state.cancelRide(ride, reason);
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text('Ride cancelled: $reason'),
                  backgroundColor: AppColors.error,
                  behavior: SnackBarBehavior.floating,
                ),
              );
              Navigator.pop(context);
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.error,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            child: const Text('Yes, Cancel'),
          ),
        ],
      ),
    );
  }

  void _showNewRequestSheet(DriverState state, RideRequest request) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(ctx).padding.bottom + 20),
        decoration: BoxDecoration(
          color: context.cardColor,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Container(
                  width: 50,
                  height: 50,
                  decoration: BoxDecoration(
                    color: AppColors.yellow,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: const Icon(Icons.person, color: Colors.black, size: 28),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(request.customerName, style: TextStyle(color: context.textColor, fontSize: 18, fontWeight: FontWeight.w700)),
                      Text('${request.pickupLocation} → ${request.dropoffLocation}', style: TextStyle(color: context.mutedColor, fontSize: 13)),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () {
                  state.addToQueue(request);
                  Navigator.pop(ctx);
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('${request.customerName} added to queue'),
                      backgroundColor: AppColors.success,
                      behavior: SnackBarBehavior.floating,
                    ),
                  );
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.yellow,
                  foregroundColor: Colors.black,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                child: const Text('Add to Queue', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showCompletionDialog(DriverState state) {
    // Complete the trip and go straight to home with a toast
    state.completeTrip();

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            const Icon(Icons.check_circle, color: Colors.white),
            const SizedBox(width: 12),
            Text('Trip Completed ✓  Duration: $_formattedTime'),
          ],
        ),
        backgroundColor: AppColors.success,
        duration: const Duration(seconds: 3),
      ),
    );

    Navigator.of(context).pushNamedAndRemoveUntil('/home', (route) => false);
  }
}

// Swipe Button Widget
class _SwipeButton extends StatefulWidget {
  final String text;
  final Color color;
  final IconData icon;
  final VoidCallback onSwipeComplete;

  const _SwipeButton({
    required this.text,
    required this.color,
    required this.icon,
    required this.onSwipeComplete,
  });

  @override
  State<_SwipeButton> createState() => _SwipeButtonState();
}

class _SwipeButtonState extends State<_SwipeButton> with TickerProviderStateMixin {
  double _dragPosition = 0;
  bool _isDragging = false;
  late AnimationController _resetController;
  late AnimationController _pulseController;
  late AnimationController _arrowController;
  late Animation<double> _pulseAnimation;
  late Animation<double> _arrowAnimation;
  double _startDragPosition = 0;
  String? _lastText;

  @override
  void initState() {
    super.initState();
    _resetController = AnimationController(
      duration: const Duration(milliseconds: 300),
      vsync: this,
    );
    _pulseController = AnimationController(
      duration: const Duration(milliseconds: 800),
      vsync: this,
    )..repeat(reverse: true);
    _pulseAnimation = Tween<double>(begin: 0.95, end: 1.15).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );
    _arrowController = AnimationController(
      duration: const Duration(milliseconds: 1000),
      vsync: this,
    )..repeat();
    _arrowAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _arrowController, curve: Curves.easeInOut),
    );
    _lastText = widget.text;
  }

  @override
  void didUpdateWidget(covariant _SwipeButton oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Reset button when text changes (new action)
    if (oldWidget.text != widget.text) {
      _dragPosition = 0;
      _lastText = widget.text;
    }
  }

  @override
  void dispose() {
    _resetController.dispose();
    _pulseController.dispose();
    _arrowController.dispose();
    super.dispose();
  }

  void _animateReset() {
    _startDragPosition = _dragPosition;
    _resetController.forward(from: 0).then((_) {
      if (mounted) {
        setState(() => _dragPosition = 0);
      }
    });
    _resetController.addListener(_onResetAnimation);
  }

  void _onResetAnimation() {
    if (mounted) {
      setState(() {
        _dragPosition = _startDragPosition * (1 - _resetController.value);
      });
    }
  }

  void _animateComplete(double maxDrag) {
    // Animate to end then trigger callback
    setState(() => _dragPosition = maxDrag);
    HapticFeedback.heavyImpact();

    // Brief delay to show completion, then callback triggers state change which rebuilds with new text
    Future.delayed(const Duration(milliseconds: 200), () {
      if (mounted) {
        widget.onSwipeComplete();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final screenWidth = MediaQuery.of(context).size.width;
    const buttonSize = 60.0;
    const padding = 4.0;
    final maxDrag = screenWidth - 40 - buttonSize - (padding * 2);
    final progress = maxDrag > 0 ? (_dragPosition / maxDrag).clamp(0.0, 1.0) : 0.0;

    return Container(
      height: 68,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            widget.color.withValues(alpha: 0.15),
            widget.color.withValues(alpha: 0.25),
          ],
        ),
        borderRadius: BorderRadius.circular(34),
        border: Border.all(
          color: widget.color.withValues(alpha: _isDragging ? 0.8 : 0.4),
          width: _isDragging ? 2 : 1.5,
        ),
        boxShadow: _isDragging
            ? [
                BoxShadow(
                  color: widget.color.withValues(alpha: 0.3),
                  blurRadius: 15,
                ),
              ]
            : null,
      ),
      child: Stack(
        children: [
          // Progress fill
          Container(
            width: _dragPosition + buttonSize + padding * 2,
            height: 68,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  widget.color.withValues(alpha: 0.3),
                  widget.color.withValues(alpha: 0.5),
                ],
              ),
              borderRadius: BorderRadius.circular(34),
            ),
          ),

          // Animated arrows
          if (!_isDragging && progress < 0.5)
            AnimatedBuilder(
              animation: _arrowAnimation,
              builder: (context, child) {
                return Positioned(
                  left: buttonSize + padding * 2 + 10 + (_arrowAnimation.value * 20),
                  top: 0,
                  bottom: 0,
                  child: Center(
                    child: Opacity(
                      opacity: (1 - _arrowAnimation.value) * 0.8,
                      child: Row(
                        children: [
                          Icon(Icons.chevron_right, color: widget.color, size: 24),
                          Icon(Icons.chevron_right, color: widget.color.withValues(alpha: 0.6), size: 24),
                          Icon(Icons.chevron_right, color: widget.color.withValues(alpha: 0.3), size: 24),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),

          // Center text
          Center(
            child: Padding(
              padding: const EdgeInsets.only(left: buttonSize + 20),
              child: Opacity(
                opacity: 1 - progress * 0.7,
                child: Text(
                  widget.text,
                  style: TextStyle(
                    color: widget.color,
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.0,
                  ),
                ),
              ),
            ),
          ),

          // Draggable button with pulse animation
          Positioned(
            left: _dragPosition + padding,
            top: padding,
            child: AnimatedBuilder(
              animation: _pulseAnimation,
              builder: (context, child) {
                final scale = _isDragging ? 1.0 : _pulseAnimation.value;
                final glowIntensity = _isDragging ? 0.5 : (0.3 + (_pulseAnimation.value - 0.95) * 2);
                return Transform.scale(
                  scale: scale,
                  child: GestureDetector(
                    onHorizontalDragStart: (_) {
                      _resetController.removeListener(_onResetAnimation);
                      setState(() => _isDragging = true);
                      HapticFeedback.selectionClick();
                    },
                    onHorizontalDragUpdate: (details) {
                      setState(() {
                        _dragPosition = (_dragPosition + details.delta.dx).clamp(0.0, maxDrag);
                      });
                    },
                    onHorizontalDragEnd: (details) {
                      setState(() => _isDragging = false);

                      if (_dragPosition >= maxDrag * 0.7) {
                        HapticFeedback.mediumImpact();
                        _animateComplete(maxDrag);
                      } else {
                        HapticFeedback.lightImpact();
                        _animateReset();
                      }
                    },
                    child: Container(
                      width: buttonSize,
                      height: buttonSize,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [
                            widget.color,
                            widget.color.withValues(alpha: 0.85),
                          ],
                        ),
                        borderRadius: BorderRadius.circular(buttonSize / 2),
                        boxShadow: [
                          BoxShadow(
                            color: widget.color.withValues(alpha: glowIntensity.clamp(0.3, 0.8)),
                            blurRadius: _isDragging ? 24 : (8 + (_pulseAnimation.value - 0.95) * 40),
                            spreadRadius: _isDragging ? 4 : ((_pulseAnimation.value - 0.95) * 10),
                          ),
                        ],
                      ),
                      child: Icon(
                        progress > 0.5 ? Icons.double_arrow : widget.icon,
                        color: Colors.black,
                        size: 28,
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

// Chat Sheet
class _ChatSheet extends StatefulWidget {
  final String customerName;
  final String? customerPhone;
  const _ChatSheet({required this.customerName, this.customerPhone});

  @override
  State<_ChatSheet> createState() => _ChatSheetState();
}

class _ChatSheetState extends State<_ChatSheet> with SingleTickerProviderStateMixin {
  final TextEditingController _controller = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  bool _isTyping = false;
  bool _customerTyping = false;
  bool _isRecording = false;
  int _recordingSeconds = 0;
  Timer? _recordingTimer;

  final List<Map<String, dynamic>> _messages = [
    {'text': 'Hi, I\'m on my way!', 'isMe': true, 'time': DateTime.now().subtract(const Duration(minutes: 5)), 'status': 'read'},
    {'text': 'Okay, I\'ll be waiting at the entrance', 'isMe': false, 'time': DateTime.now().subtract(const Duration(minutes: 4))},
  ];

  final List<Map<String, dynamic>> _quickReplies = [
    {'icon': Icons.navigation, 'text': 'On my way!', 'color': AppColors.success},
    {'icon': Icons.location_on, 'text': 'I\'ve arrived', 'color': AppColors.yellow},
    {'icon': Icons.access_time, 'text': '5 mins away', 'color': AppColors.info},
    {'icon': Icons.local_parking, 'text': 'Parked outside', 'color': AppColors.warning},
  ];

  @override
  void initState() {
    super.initState();
    _controller.addListener(() {
      final hasText = _controller.text.isNotEmpty;
      if (hasText != _isTyping) setState(() => _isTyping = hasText);
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    _scrollController.dispose();
    _recordingTimer?.cancel();
    super.dispose();
  }

  void _toggleRecording() {
    HapticFeedback.mediumImpact();
    if (_isRecording) {
      _stopRecording();
    } else {
      _startRecording();
    }
  }

  void _startRecording() {
    setState(() {
      _isRecording = true;
      _recordingSeconds = 0;
    });
    _recordingTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (mounted) {
        setState(() => _recordingSeconds++);
      }
    });
  }

  void _stopRecording() {
    _recordingTimer?.cancel();
    final duration = _recordingSeconds;
    setState(() {
      _isRecording = false;
      _recordingSeconds = 0;
      if (duration >= 1) {
        _messages.add({
          'text': '🎤 Voice message (0:${duration.toString().padLeft(2, '0')})',
          'isMe': true,
          'time': DateTime.now(),
          'status': 'sending',
        });
      }
    });
    if (duration >= 1) {
      _scrollToBottom();
      Future.delayed(const Duration(milliseconds: 400), () {
        if (mounted) _updateLastMessageStatus('sent');
      });
      Future.delayed(const Duration(milliseconds: 800), () {
        if (mounted) _updateLastMessageStatus('delivered');
      });
    }
  }

  void _cancelRecording() {
    HapticFeedback.mediumImpact();
    _recordingTimer?.cancel();
    setState(() {
      _isRecording = false;
      _recordingSeconds = 0;
    });
  }

  String _formatRecordingTime(int seconds) {
    final mins = seconds ~/ 60;
    final secs = seconds % 60;
    return '$mins:${secs.toString().padLeft(2, '0')}';
  }

  void _sendMessage(String text) {
    if (text.trim().isEmpty) return;
    setState(() {
      _messages.add({
        'text': text.trim(),
        'isMe': true,
        'time': DateTime.now(),
        'status': 'sending',
      });
    });
    _controller.clear();
    _scrollToBottom();

    // Simulate status updates
    Future.delayed(const Duration(milliseconds: 400), () {
      if (mounted) _updateLastMessageStatus('sent');
    });
    Future.delayed(const Duration(milliseconds: 800), () {
      if (mounted) _updateLastMessageStatus('delivered');
    });

    // Simulate customer typing
    Future.delayed(const Duration(seconds: 2), () {
      if (mounted) {
        setState(() => _customerTyping = true);
        _scrollToBottom();
      }
    });

    // Simulate customer response
    Future.delayed(const Duration(seconds: 4), () {
      if (mounted) {
        setState(() {
          _customerTyping = false;
          _updateLastMessageStatus('read');
          _messages.add({
            'text': 'Thanks for the update! See you soon 👍',
            'isMe': false,
            'time': DateTime.now(),
          });
        });
        _scrollToBottom();
      }
    });
  }

  void _updateLastMessageStatus(String status) {
    final lastIndex = _messages.lastIndexWhere((m) => m['isMe'] == true);
    if (lastIndex != -1) {
      setState(() => _messages[lastIndex]['status'] = status);
    }
  }

  void _scrollToBottom() {
    Future.delayed(const Duration(milliseconds: 100), () {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          0,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  String _formatTime(DateTime time) {
    final hour = time.hour.toString().padLeft(2, '0');
    final minute = time.minute.toString().padLeft(2, '0');
    return '$hour:$minute';
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;

    return Padding(
      padding: EdgeInsets.only(bottom: bottomInset),
      child: Container(
        height: MediaQuery.of(context).size.height * 0.75,
        decoration: BoxDecoration(
          color: context.cardColor,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: Column(
          children: [
            // Handle
            Center(
              child: Container(
                margin: const EdgeInsets.only(top: 12),
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: context.borderColor,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),

            // Header
            Container(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  Stack(
                    children: [
                      Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          color: AppColors.yellow,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Icon(Icons.person, color: Colors.black, size: 24),
                      ),
                      Positioned(
                        right: 0,
                        bottom: 0,
                        child: Container(
                          width: 12,
                          height: 12,
                          decoration: BoxDecoration(
                            color: AppColors.success,
                            shape: BoxShape.circle,
                            border: Border.all(color: context.cardColor, width: 2),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(widget.customerName, style: TextStyle(color: context.textColor, fontSize: 16, fontWeight: FontWeight.w700)),
                        Text('Online now', style: TextStyle(color: AppColors.success, fontSize: 12)),
                      ],
                    ),
                  ),
                  GestureDetector(
                    onTap: () async {
                      HapticFeedback.mediumImpact();
                      if (widget.customerPhone != null) {
                        final uri = Uri.parse('tel:${widget.customerPhone}');
                        if (await canLaunchUrl(uri)) await launchUrl(uri);
                      }
                    },
                    child: Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(color: AppColors.success.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(10)),
                      child: const Icon(Icons.phone, color: AppColors.success, size: 20),
                    ),
                  ),
                  const SizedBox(width: 8),
                  GestureDetector(
                    onTap: () => Navigator.pop(context),
                    child: Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(color: context.bgColor, borderRadius: BorderRadius.circular(10)),
                      child: Icon(Icons.close, color: context.mutedColor, size: 20),
                    ),
                  ),
                ],
              ),
            ),

            // Messages
            Expanded(
              child: ListView.builder(
                controller: _scrollController,
                reverse: true,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                itemCount: _messages.length + (_customerTyping ? 1 : 0),
                itemBuilder: (ctx, i) {
                  if (_customerTyping && i == 0) return _buildTypingIndicator();
                  final msgIndex = _customerTyping ? i - 1 : i;
                  final msg = _messages[_messages.length - 1 - msgIndex];
                  final isMe = msg['isMe'] as bool;
                  final time = msg['time'] as DateTime;
                  final status = msg['status'] as String?;

                  return Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      mainAxisAlignment: isMe ? MainAxisAlignment.end : MainAxisAlignment.start,
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        if (!isMe) ...[
                          Container(
                            width: 26,
                            height: 26,
                            decoration: BoxDecoration(color: AppColors.yellow, borderRadius: BorderRadius.circular(7)),
                            child: const Icon(Icons.person, color: Colors.black, size: 14),
                          ),
                          const SizedBox(width: 6),
                        ],
                        Flexible(
                          child: Column(
                            crossAxisAlignment: isMe ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.65),
                                decoration: BoxDecoration(
                                  color: isMe ? AppColors.success : context.bgColor,
                                  borderRadius: BorderRadius.only(
                                    topLeft: const Radius.circular(16),
                                    topRight: const Radius.circular(16),
                                    bottomLeft: Radius.circular(isMe ? 16 : 4),
                                    bottomRight: Radius.circular(isMe ? 4 : 16),
                                  ),
                                ),
                                child: Text(msg['text'], style: TextStyle(color: isMe ? Colors.white : context.textColor, fontSize: 14)),
                              ),
                              const SizedBox(height: 2),
                              Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text(_formatTime(time), style: TextStyle(color: context.mutedColor, fontSize: 10)),
                                  if (isMe && status != null) ...[const SizedBox(width: 3), _buildStatusIcon(status)],
                                ],
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),

            // Quick replies
            if (bottomInset == 0)
              SizedBox(
                height: 40,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  children: _quickReplies.map((reply) => Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: GestureDetector(
                      onTap: () { HapticFeedback.lightImpact(); _sendMessage(reply['text']); },
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: (reply['color'] as Color).withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(reply['icon'] as IconData, color: reply['color'] as Color, size: 14),
                            const SizedBox(width: 4),
                            Text(reply['text'], style: TextStyle(color: context.textColor, fontSize: 11, fontWeight: FontWeight.w500)),
                          ],
                        ),
                      ),
                    ),
                  )).toList(),
                ),
              ),

            // Input bar
            Container(
              padding: EdgeInsets.fromLTRB(10, 10, 10, bottomInset > 0 ? 10 : MediaQuery.of(context).padding.bottom + 10),
              decoration: BoxDecoration(color: context.bgColor),
              child: _isRecording
                ? Row(
                    children: [
                      GestureDetector(
                        onTap: _cancelRecording,
                        child: Container(
                          width: 38,
                          height: 38,
                          decoration: BoxDecoration(color: AppColors.error.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(10)),
                          child: const Icon(Icons.delete, color: AppColors.error, size: 20),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Container(
                          height: 38,
                          padding: const EdgeInsets.symmetric(horizontal: 14),
                          decoration: BoxDecoration(color: context.cardColor, borderRadius: BorderRadius.circular(19)),
                          child: Row(
                            children: [
                              Container(
                                width: 10,
                                height: 10,
                                decoration: const BoxDecoration(color: AppColors.error, shape: BoxShape.circle),
                              ),
                              const SizedBox(width: 10),
                              Text('Recording ${_formatRecordingTime(_recordingSeconds)}', style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w500)),
                              const Spacer(),
                              ...List.generate(5, (i) => Container(
                                width: 3,
                                height: 8 + (i % 3) * 6.0,
                                margin: const EdgeInsets.symmetric(horizontal: 2),
                                decoration: BoxDecoration(color: AppColors.error, borderRadius: BorderRadius.circular(2)),
                              )),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      GestureDetector(
                        onTap: _toggleRecording,
                        child: Container(
                          width: 42,
                          height: 42,
                          decoration: BoxDecoration(color: AppColors.success, borderRadius: BorderRadius.circular(21)),
                          child: const Icon(Icons.send, color: Colors.white, size: 20),
                        ),
                      ),
                    ],
                  )
                : Row(
                    children: [
                      GestureDetector(
                        onTap: () { HapticFeedback.lightImpact(); _showAttachmentOptions(); },
                        child: Container(
                          width: 38,
                          height: 38,
                          decoration: BoxDecoration(color: context.cardColor, borderRadius: BorderRadius.circular(10)),
                          child: Icon(Icons.add, color: context.textColor, size: 20),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Container(
                          height: 38,
                          decoration: BoxDecoration(color: context.cardColor, borderRadius: BorderRadius.circular(19)),
                          child: TextField(
                            controller: _controller,
                            style: TextStyle(color: context.textColor, fontSize: 14),
                            decoration: InputDecoration(
                              hintText: 'Type a message...',
                              hintStyle: TextStyle(color: context.mutedColor, fontSize: 14),
                              border: InputBorder.none,
                              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                            ),
                            onSubmitted: _sendMessage,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      GestureDetector(
                        onTap: () {
                          HapticFeedback.mediumImpact();
                          if (_isTyping) {
                            _sendMessage(_controller.text);
                          } else {
                            _toggleRecording();
                          }
                        },
                        child: Container(
                          width: 42,
                          height: 42,
                          decoration: BoxDecoration(color: AppColors.success, borderRadius: BorderRadius.circular(21)),
                          child: Icon(_isTyping ? Icons.send : Icons.mic, color: Colors.white, size: 20),
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

  void _showAttachmentOptions() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: context.cardColor,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(width: 40, height: 4, decoration: BoxDecoration(color: context.borderColor, borderRadius: BorderRadius.circular(2))),
            const SizedBox(height: 20),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                _buildAttachOption(Icons.location_on, 'Location', AppColors.error, () { Navigator.pop(ctx); _sendLocation(); }),
                _buildAttachOption(Icons.camera_alt, 'Camera', AppColors.info, () { Navigator.pop(ctx); }),
                _buildAttachOption(Icons.photo, 'Photo', AppColors.success, () { Navigator.pop(ctx); }),
              ],
            ),
            SizedBox(height: MediaQuery.of(ctx).padding.bottom + 16),
          ],
        ),
      ),
    );
  }

  Widget _buildAttachOption(IconData icon, String label, Color color, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(color: color.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(16)),
            child: Icon(icon, color: color, size: 26),
          ),
          const SizedBox(height: 6),
          Text(label, style: TextStyle(color: context.textColor, fontSize: 12)),
        ],
      ),
    );
  }

  void _sendLocation() {
    setState(() {
      _messages.add({
        'text': '📍 Shared location',
        'isMe': true,
        'time': DateTime.now(),
        'status': 'sent',
      });
    });
    _scrollToBottom();
  }

  
  Widget _buildTypingIndicator() {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(
              color: AppColors.yellow,
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Icon(Icons.person, color: Colors.black, size: 16),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: context.bgColor,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: context.borderColor),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: List.generate(3, (i) => Container(
                margin: EdgeInsets.only(right: i < 2 ? 4 : 0),
                width: 6,
                height: 6,
                decoration: BoxDecoration(
                  color: context.mutedColor.withValues(alpha: 0.5),
                  shape: BoxShape.circle,
                ),
              )),
            ),
          ),
          const SizedBox(width: 8),
          Text('typing...', style: TextStyle(color: context.mutedColor, fontSize: 11, fontStyle: FontStyle.italic)),
        ],
      ),
    );
  }

  Widget _buildStatusIcon(String status) {
    switch (status) {
      case 'sending':
        return SizedBox(
          width: 10,
          height: 10,
          child: CircularProgressIndicator(strokeWidth: 1.5, color: context.mutedColor),
        );
      case 'sent':
        return Icon(Icons.check, color: context.mutedColor, size: 12);
      case 'delivered':
        return Icon(Icons.done_all, color: context.mutedColor, size: 12);
      case 'read':
        return const Icon(Icons.done_all, color: AppColors.info, size: 12);
      default:
        return const SizedBox.shrink();
    }
  }
}
