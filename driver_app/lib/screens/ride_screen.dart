import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../config/app_config.dart';
import '../models/ride_request.dart';
import '../providers/driver_state.dart';
import '../theme/app_theme.dart';
import '../services/supabase_service.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../services/notification_service.dart';
import '../services/realtime_service.dart';
import '../utils/marker_animation.dart';
import '../widgets/app_snackbar.dart';
import '../widgets/ride_request_popup.dart';
import '../widgets/cached_avatar.dart';
import 'chat_screen.dart';
import '../services/app_settings_service.dart';

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
  // STATIC flags to prevent duplicates across multiple widget instances
  static bool _isShowingDestinationChange = false;
  static String? _lastPendingDestination;
  static Set<String> _acceptedDestinations = {};

  GoogleMapController? _mapController;
  late AnimationController _pulseController;
  late AnimationController _routeAnimController;
  late AnimationController _markerAnimController;

  Timer? _timer;
  Timer? _etaTimer;
  Timer? _destinationChangeTimer;
  StreamSubscription<Map<String, dynamic>>? _rideSubscription;
  int _elapsedSeconds = 0;
  int _etaSeconds = 0;
  bool _isSubscribed = false;
  late VehicleMarkerState _vehicleState;
  double _driverLat = 4.2050;
  double _driverLng = 73.5380;
  double _driverSpeed = 0;

  // Animation interpolation state
  LatLng _animStartPos = const LatLng(4.2050, 73.5380);
  LatLng _animEndPos = const LatLng(4.2050, 73.5380);
  double _animStartBearing = 0;
  double _animEndBearing = 0;
  List<LatLng> _routePoints = [];
  List<LatLng> _tripRoutePoints = []; // Full trip route: pickup → dropoff
  List<LatLng> _breadcrumbTrail = []; // Path already traveled
  // ignore: unused_field - route tracking state
  int _currentRouteIndex = 0;
  bool _isQueueExpanded = false;
  bool _isPanelExpanded = true;
  bool _isNavigatingAway = false;
  // ignore: unused_field - ride session tracking
  String? _currentRideId;
  bool _trafficEnabled = false;
  bool _is3DMode = false;
  bool _headingUpMode = false;
  MapType _mapType = MapType.normal;
  BitmapDescriptor? _carIcon;
  BitmapDescriptor? _pickupIcon;
  BitmapDescriptor? _dropoffIcon;
  // ignore: unused_field - parsed from route API
  String? _nextTurnInstruction;
  // ignore: unused_field - parsed from route API
  String? _nextTurnDistance;

  @override
  void initState() {
    super.initState();

    // Reset ALL static flags for new ride session
    _isShowingDestinationChange = false;
    _lastPendingDestination = null;
    _acceptedDestinations.clear();  // Clear so new requests can come through

    // Initialize vehicle state
    _vehicleState = VehicleMarkerState(currentPosition: const LatLng(4.2050, 73.5380));

    _pulseController = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    )..repeat(reverse: true);

    _routeAnimController = AnimationController(
      duration: const Duration(milliseconds: 500),
      vsync: this,
    );

    _markerAnimController = AnimationController(
      duration: const Duration(milliseconds: 1000),
      vsync: this,
    );

    _loadCarIcon();
    _loadPinIcons();
    _startDriverSimulation();
    _subscribeToRideUpdates();

    // Fetch initial route after ride is loaded
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final driverState = Provider.of<DriverState>(context, listen: false);
      final ride = driverState.currentRide;
      if (ride != null) {
        _generateRoute(ride);
      }
    });

    // Start polling after a short delay to ensure ride is loaded
    Future.delayed(const Duration(seconds: 2), () {
      if (mounted) _startDestinationChangePolling();
    });

    // Subscribe to chat notifications
    Future.delayed(const Duration(seconds: 1), () {
      if (!mounted) return;
      final driverState = Provider.of<DriverState>(context, listen: false);
      final rideId = driverState.currentRide?.id;
      final profileId = driverState.profileId;
      debugPrint('RideScreen: Subscribing to chat - rideId=$rideId, profileId=$profileId');
      if (rideId != null) {
        NotificationService.subscribeToChatMessages(rideId, profileId);
      }
    });
  }

  void _subscribeToRideUpdates() {
    if (_isSubscribed) return;  // Prevent duplicate subscriptions
    _isSubscribed = true;

    WidgetsBinding.instance.addPostFrameCallback((_) {
      final driverState = Provider.of<DriverState>(context, listen: false);
      final rideId = driverState.currentRide?.id;
      if (rideId == null) {
        debugPrint('SUBSCRIBE: No ride ID yet, will retry');
        // Retry after delay
        Future.delayed(const Duration(seconds: 2), () {
          if (mounted) {
            _isSubscribed = false;
            _subscribeToRideUpdates();
          }
        });
        return;
      }

      _currentRideId = rideId;
      debugPrint('SUBSCRIBE: Got ride ID $rideId, starting polling');

      // Start polling for destination changes
      _startDestinationChangePolling();

      _rideSubscription = RealtimeService().subscribeToRide(rideId).listen((data) {
        debugPrint('Ride realtime update: ${data['event']}');
        final newRecord = data['new'] as Map<String, dynamic>?;
        if (newRecord == null) return;

        final status = newRecord['status'] as String?;

        // Handle ride cancellation by customer
        if (status == 'cancelled') {
          if (mounted) {
            // Clear current ride from state
            final driverState = Provider.of<DriverState>(context, listen: false);
            driverState.clearCurrentRide();
            AppSnackbar.error(context, 'Ride cancelled', subtitle: 'Customer cancelled the ride');
            Navigator.of(context).pushNamedAndRemoveUntil('/home', (route) => false);
          }
          return;
        }

        // Don't handle destination changes from realtime - causes duplicates
        // Use polling only

        // Refresh ride data for other updates
        driverState.refreshCurrentRide();
      });
    });
  }

  Future<void> _loadCarIcon() async {
    _carIcon = await _createCarIcon();
    if (mounted) setState(() {});
  }

  Future<BitmapDescriptor> _createCarIcon() async {
    final data = await rootBundle.load('assets/images/pickup_truck.png');
    final codec = await ui.instantiateImageCodec(
      data.buffer.asUint8List(),
      targetWidth: 40,
    );
    final frame = await codec.getNextFrame();
    final bytes = await frame.image.toByteData(format: ui.ImageByteFormat.png);
    return BitmapDescriptor.bytes(bytes!.buffer.asUint8List());
  }

  Future<void> _loadPinIcons() async {
    _pickupIcon = await _createPinIcon('A', const Color(0xFF22C55E));
    _dropoffIcon = await _createPinIcon('B', AppColors.error);
    if (mounted) setState(() {});
  }

  Future<BitmapDescriptor> _createPinIcon(String label, Color color) async {
    final pictureRecorder = ui.PictureRecorder();
    final canvas = Canvas(pictureRecorder);
    const size = Size(40, 50);

    final pinPaint = Paint()
      ..color = color
      ..style = PaintingStyle.fill;

    final pinPath = Path();
    pinPath.addOval(Rect.fromCircle(center: Offset(size.width / 2, 15), radius: 14));
    pinPath.moveTo(size.width / 2 - 10, 22);
    pinPath.lineTo(size.width / 2, size.height - 5);
    pinPath.lineTo(size.width / 2 + 10, 22);
    pinPath.close();

    canvas.drawPath(pinPath, pinPaint);

    final whitePaint = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.fill;
    canvas.drawCircle(Offset(size.width / 2, 15), 9, whitePaint);

    final textPainter = TextPainter(
      text: TextSpan(
        text: label,
        style: TextStyle(
          color: color,
          fontSize: 12,
          fontWeight: FontWeight.w900,
        ),
      ),
      textDirection: TextDirection.ltr,
    );
    textPainter.layout();
    textPainter.paint(
      canvas,
      Offset(
        (size.width - textPainter.width) / 2,
        15 - textPainter.height / 2,
      ),
    );

    final picture = pictureRecorder.endRecording();
    final image = await picture.toImage(size.width.toInt(), size.height.toInt());
    final byteData = await image.toByteData(format: ui.ImageByteFormat.png);

    return BitmapDescriptor.bytes(byteData!.buffer.asUint8List());
  }

  void _animateDriverPosition(double newLat, double newLng) {
    final newPosition = LatLng(newLat, newLng);
    final distance = calculateDistance(_vehicleState.currentPosition, newPosition);
    if (distance < 1.0) return; // Skip tiny movements

    _vehicleState.updateTarget(newPosition);

    _animStartPos = _vehicleState.currentPosition;
    _animEndPos = _vehicleState.targetPosition;
    _animStartBearing = _vehicleState.currentBearing;
    _animEndBearing = _vehicleState.targetBearing;

    _markerAnimController.reset();
    _markerAnimController.removeListener(_onMarkerAnimationTick);
    _markerAnimController.addListener(_onMarkerAnimationTick);
    _markerAnimController.forward();
  }

  void _onMarkerAnimationTick() {
    if (!mounted) return;
    final t = _markerAnimController.value;
    setState(() {
      _vehicleState.currentPosition = lerpLatLng(_animStartPos, _animEndPos, t);
      _vehicleState.currentBearing = lerpAngle(_animStartBearing, _animEndBearing, t);
    });
  }

  /// Snaps GPS position to nearest point on the route polyline
  /// Returns the snapped position, or original if route is empty or too far
  LatLng _snapToRoute(double lat, double lng) {
    if (_routePoints.isEmpty) return LatLng(lat, lng);

    double minDistance = double.infinity;
    LatLng snappedPoint = LatLng(lat, lng);

    // Find nearest point on route
    for (int i = 0; i < _routePoints.length - 1; i++) {
      final p1 = _routePoints[i];
      final p2 = _routePoints[i + 1];

      // Project point onto line segment
      final projected = _projectPointOnSegment(lat, lng, p1, p2);
      final distance = Geolocator.distanceBetween(
        lat, lng, projected.latitude, projected.longitude);

      if (distance < minDistance) {
        minDistance = distance;
        snappedPoint = projected;
      }
    }

    // Only snap if within 30 meters of route (reasonable GPS error margin)
    if (minDistance <= 30) {
      return snappedPoint;
    }
    return LatLng(lat, lng);
  }

  /// Projects a point onto a line segment, returning the closest point on the segment
  LatLng _projectPointOnSegment(double lat, double lng, LatLng p1, LatLng p2) {
    final dx = p2.latitude - p1.latitude;
    final dy = p2.longitude - p1.longitude;

    if (dx == 0 && dy == 0) {
      return p1; // Segment is a point
    }

    // Calculate projection factor (0 = at p1, 1 = at p2)
    final t = ((lat - p1.latitude) * dx + (lng - p1.longitude) * dy) / (dx * dx + dy * dy);

    // Clamp to segment
    final tClamped = t.clamp(0.0, 1.0);

    return LatLng(
      p1.latitude + tClamped * dx,
      p1.longitude + tClamped * dy,
    );
  }

  void _addToBreadcrumb(double lat, double lng) {
    final point = LatLng(lat, lng);
    if (_breadcrumbTrail.isEmpty ||
        Geolocator.distanceBetween(
          _breadcrumbTrail.last.latitude, _breadcrumbTrail.last.longitude,
          lat, lng) > 10) {
      _breadcrumbTrail.add(point);
      // Keep only last 500 points
      if (_breadcrumbTrail.length > 500) {
        _breadcrumbTrail.removeAt(0);
      }
    }
  }

  @override
  void dispose() {
    _pulseController.dispose();
    _routeAnimController.dispose();
    _markerAnimController.dispose();
    _timer?.cancel();
    _etaTimer?.cancel();
    _destinationChangeTimer?.cancel();
    _rideSubscription?.cancel();
    _mapController?.dispose();

    // Unsubscribe from ride updates
    final driverState = Provider.of<DriverState>(context, listen: false);
    final rideId = driverState.currentRide?.id;
    if (rideId != null) {
      RealtimeService().unsubscribeFromRide(rideId);
    }

    super.dispose();
  }

  void _startDestinationChangePolling() {
    _destinationChangeTimer?.cancel();
    debugPrint('POLL: Starting destination change polling');
    _destinationChangeTimer = Timer.periodic(const Duration(seconds: 3), (timer) async {
      if (!mounted) return;
      if (_isShowingDestinationChange) {
        debugPrint('POLL: Dialog showing, skipping');
        return;
      }

      // Always get fresh ride ID from state (don't use cached)
      final driverState = context.read<DriverState>();
      final rideId = driverState.currentRide?.id;

      if (rideId == null) {
        debugPrint('POLL: No ride ID, skipping');
        return;
      }

      // Update cached ID
      _currentRideId = rideId;

      // Check if ride was cancelled
      await _checkRideStatus(rideId, driverState);

      await _checkPendingDestinationChange(rideId);
    });
  }

  Future<void> _checkRideStatus(String rideId, DriverState driverState) async {
    try {
      final ride = await SupabaseService.client
          .from('rides')
          .select('status')
          .eq('id', rideId)
          .maybeSingle();

      if (ride == null) return;

      final status = ride['status'] as String?;
      if (status == 'cancelled') {
        debugPrint('POLL: Ride was cancelled by customer');
        _destinationChangeTimer?.cancel();
        driverState.clearCurrentRide();
        if (mounted) {
          AppSnackbar.error(context, 'Ride cancelled', subtitle: 'Customer cancelled the ride');
          Navigator.of(context).pushNamedAndRemoveUntil('/home', (route) => false);
        }
      }
    } catch (e) {
      debugPrint('Error checking ride status: $e');
    }
  }

  Future<void> _checkPendingDestinationChange(String rideId) async {
    if (_isShowingDestinationChange) return;

    try {
      final pending = await SupabaseService.getPendingDestinationChange(rideId);
      final status = pending?['destination_change_status'] as String?;
      final pendingDest = pending?['pending_dropoff_name'] as String?;

      debugPrint('CHECK: status=$status, pendingDest=$pendingDest');

      if (status == 'pending' && pendingDest != null && pendingDest.isNotEmpty) {
        // Only skip if we're currently showing a dialog for this exact destination
        if (_lastPendingDestination == pendingDest && _isShowingDestinationChange) {
          debugPrint('CHECK: Already showing dialog for $pendingDest');
          return;
        }

        _lastPendingDestination = pendingDest;
        _showDestinationChangeApproval(rideId, pendingDest);
      } else if (status != 'pending') {
        // Clear tracking when no pending request
        _lastPendingDestination = null;
      }
    } catch (e) {
      debugPrint('CHECK error: $e');
    }
  }

  void _showDestinationChangeApproval(String rideId, String newDestination) {
    if (_isShowingDestinationChange) {
      debugPrint('DIALOG: Already showing, skipping');
      return;
    }
    _isShowingDestinationChange = true;
    _destinationChangeTimer?.cancel();
    debugPrint('DIALOG: Showing dialog for $newDestination');

    HapticFeedback.heavyImpact();

    showModalBottomSheet(
      context: context,
      isDismissible: false,
      enableDrag: false,
      backgroundColor: context.cardColor,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 60,
                height: 60,
                decoration: BoxDecoration(
                  color: AppColors.yellow.withValues(alpha: 0.15),
                  shape: BoxShape.circle,
                ),
                child: Icon(Icons.edit_location_alt, color: AppColors.yellow, size: 32),
              ),
              const SizedBox(height: 16),
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
              const SizedBox(height: 24),
              Row(
                children: [
                  Expanded(
                    child: SizedBox(
                      height: 56,
                      child: ElevatedButton(
                        onPressed: () {
                          debugPrint('DECLINE tapped');
                          Navigator.of(sheetContext, rootNavigator: true).pop();
                          _handleDecline(rideId);
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.red.shade700,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                        ),
                        child: const Text('Decline', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
                      ),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: SizedBox(
                      height: 56,
                      child: ElevatedButton(
                        onPressed: () {
                          debugPrint('ACCEPT tapped');
                          Navigator.of(sheetContext, rootNavigator: true).pop();
                          _handleAccept(rideId, newDestination);
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.yellow,
                          foregroundColor: Colors.black,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                        ),
                        child: const Text('Accept', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
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
      debugPrint('DIALOG: Sheet closed, resetting flag');
      _isShowingDestinationChange = false;
      // Restart polling after dialog closes
      if (mounted) {
        _startDestinationChangePolling();
      }
    });
  }

  Future<void> _handleAccept(String rideId, String newDestination) async {
    _lastPendingDestination = null;
    _acceptedDestinations.add(newDestination);  // Track accepted to prevent re-showing
    debugPrint('_handleAccept: Starting for $newDestination');

    try {
      // Use atomic RPC function
      final result = await Supabase.instance.client.rpc('approve_destination_change', params: {
        'p_ride_id': rideId,
      });

      debugPrint('_handleAccept: RPC result=$result');

      if (mounted) {
        AppSnackbar.success(context, 'Destination updated', subtitle: newDestination);

        // Wait for DB to propagate
        await Future.delayed(const Duration(seconds: 1));

        // Refresh ride data
        debugPrint('_handleAccept: Refreshing ride...');
        await context.read<DriverState>().refreshCurrentRide();

        final ride = context.read<DriverState>().currentRide;
        debugPrint('_handleAccept: After refresh dropoff=${ride?.dropoffLocation}');

        if (ride != null && mounted) {
          _generateRoute(ride);
          setState(() {});
        }
      }
    } catch (e) {
      debugPrint('_handleAccept error: $e');
      if (mounted) AppSnackbar.error(context, 'Failed to update');
    }
  }

  void _handleDecline(String rideId) async {
    _lastPendingDestination = null;
    debugPrint('_handleDecline: Starting');
    AppSnackbar.warning(context, 'Destination change declined');
    await SupabaseService.rejectDestinationChange(rideId);
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
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 10),
        ),
      );

      if (mounted) {
        setState(() {
          // Validate GPS coordinates are in Maldives
          if (_isValidLat(position.latitude) && _isValidLng(position.longitude)) {
            _driverLat = position.latitude;
            _driverLng = position.longitude;
          } else {
            // Use pickup location as fallback
            final ride = context.read<DriverState>().currentRide;
            if (ride != null) {
              _driverLat = _isValidLat(ride.pickupLat) ? ride.pickupLat - 0.002 : 4.2050;
              _driverLng = _isValidLng(ride.pickupLng) ? ride.pickupLng - 0.001 : 73.5380;
            }
          }
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
          locationSettings: const LocationSettings(
            accuracy: LocationAccuracy.best,
            timeLimit: Duration(seconds: 10),
          ),
        );
        if (mounted) {
          final ride = context.read<DriverState>().currentRide;
          final prevLat = _driverLat;
          final prevLng = _driverLng;

          // Validate GPS coordinates are in Maldives
          if (_isValidLat(position.latitude) && _isValidLng(position.longitude)) {
            _driverLat = position.latitude;
            _driverLng = position.longitude;

            // Calculate speed
            final distanceMeters = Geolocator.distanceBetween(
              prevLat, prevLng, _driverLat, _driverLng);
            _driverSpeed = (distanceMeters / 3) * 3.6; // m/s to km/h

            // Add to breadcrumb trail
            _addToBreadcrumb(_driverLat, _driverLng);

            // Smooth animation to new position (also calculates bearing)
            _animateDriverPosition(_driverLat, _driverLng);
          }

          // Animate camera to follow driver (with heading if enabled)
          if (_headingUpMode) {
            _mapController?.animateCamera(CameraUpdate.newCameraPosition(
              CameraPosition(
                target: LatLng(_driverLat, _driverLng),
                zoom: 17,
                bearing: _vehicleState.currentBearing,
                tilt: 45,
              ),
            ));
          } else {
            _mapController?.animateCamera(CameraUpdate.newLatLng(LatLng(_driverLat, _driverLng)));
          }

          _sendLocationUpdate();

          // Re-fetch route with updated driver position for realtime route updates
          if (ride != null) {
            final endLat = ride.status == RideStatus.inProgress ? ride.dropoffLat : ride.pickupLat;
            final endLng = ride.status == RideStatus.inProgress ? ride.dropoffLng : ride.pickupLng;
            _fetchRealRoute(LatLng(_driverLat, _driverLng), LatLng(endLat, endLng));
          }
        }
      } catch (e) {
        debugPrint('GPS error: $e');
      }
    });
  }

  Future<void> _sendLocationUpdate() async {
    try {
      final driverState = Provider.of<DriverState>(context, listen: false);
      final driverId = driverState.driverId;
      if (driverId.isEmpty) return;

      await SupabaseService.updateLocation(
        driverId,
        _driverLat,
        _driverLng,
        heading: _vehicleState.currentBearing,
        speed: _driverSpeed,
      );
    } catch (e) {
      // Silently fail - don't interrupt the ride
      debugPrint('Location update failed: $e');
    }
  }

  void _generateRoute(RideRequest ride) {
    _currentRouteIndex = 0;
    _etaSeconds = ride.estimatedDuration * 60;

    // Always fetch both routes for full visualization
    // Route 1: Current route (driver → pickup OR driver → dropoff based on status)
    final startLat = ride.status == RideStatus.inProgress ? _driverLat : _driverLat;
    final startLng = ride.status == RideStatus.inProgress ? _driverLng : _driverLng;
    final endLat = ride.status == RideStatus.inProgress ? ride.dropoffLat : ride.pickupLat;
    final endLng = ride.status == RideStatus.inProgress ? ride.dropoffLng : ride.pickupLng;
    _fetchRealRoute(LatLng(startLat, startLng), LatLng(endLat, endLng));

    // Route 2: Full trip route (pickup → dropoff) - always show this as preview
    _fetchTripRoute(LatLng(ride.pickupLat, ride.pickupLng), LatLng(ride.dropoffLat, ride.dropoffLng));
  }

  Future<void> _fetchRealRoute(LatLng start, LatLng end) async {
    try {
      final url = 'https://maps.googleapis.com/maps/api/directions/json'
          '?origin=${start.latitude},${start.longitude}'
          '&destination=${end.latitude},${end.longitude}'
          '&key=${AppConfig.googleMapsApiKey}';

      debugPrint('Fetching route: $url');
      final response = await http.get(Uri.parse(url));
      debugPrint('Route response status: ${response.statusCode}');

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        debugPrint('Route API status: ${data['status']}');

        if (data['status'] == 'OK' && data['routes'] != null && data['routes'].isNotEmpty) {
          final route = data['routes'][0];
          final polyline = route['overview_polyline']['points'];
          final points = _decodePolyline(polyline);

          final leg = route['legs'][0];
          final durationValue = leg['duration']['value'] as int?;
          final durationText = leg['duration']['text'] as String?;
          debugPrint('Route duration: $durationText ($durationValue seconds)');

          // Get turn-by-turn instructions
          final steps = leg['steps'] as List?;
          String? nextInstruction;
          String? nextDistance;
          if (steps != null && steps.isNotEmpty) {
            final firstStep = steps[0];
            nextInstruction = _stripHtmlTags(firstStep['html_instructions'] as String? ?? '');
            nextDistance = firstStep['distance']['text'] as String?;
          }

          if (mounted) {
            setState(() {
              _routePoints = points;
              _currentRouteIndex = points.length - 1;
              _nextTurnInstruction = nextInstruction;
              _nextTurnDistance = nextDistance;
              if (durationValue != null && durationValue > 0) {
                _etaSeconds = durationValue;
              }
            });
          }
        } else {
          debugPrint('Route API error: ${data['status']} - ${data['error_message']}');
        }
      }
    } catch (e) {
      debugPrint('Error fetching route: $e');
      if (mounted) {
        setState(() {
          _routePoints = [start, end];
          _currentRouteIndex = 1;
        });
      }
    }
  }

  Future<void> _fetchTripRoute(LatLng pickup, LatLng dropoff) async {
    try {
      final url = 'https://maps.googleapis.com/maps/api/directions/json'
          '?origin=${pickup.latitude},${pickup.longitude}'
          '&destination=${dropoff.latitude},${dropoff.longitude}'
          '&key=${AppConfig.googleMapsApiKey}';

      final response = await http.get(Uri.parse(url));
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        if (data['status'] == 'OK' && data['routes'] != null && data['routes'].isNotEmpty) {
          final route = data['routes'][0];
          final polyline = route['overview_polyline']['points'];
          final points = _decodePolyline(polyline);

          if (mounted) {
            setState(() {
              _tripRoutePoints = points;
            });
          }
        }
      }
    } catch (e) {
      debugPrint('Error fetching trip route: $e');
    }
  }

  List<LatLng> _decodePolyline(String encoded) {
    List<LatLng> points = [];
    int index = 0;
    int lat = 0;
    int lng = 0;

    while (index < encoded.length) {
      int shift = 0;
      int result = 0;
      int b;
      do {
        b = encoded.codeUnitAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      int dlat = (result & 1) != 0 ? ~(result >> 1) : (result >> 1);
      lat += dlat;

      shift = 0;
      result = 0;
      do {
        b = encoded.codeUnitAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      int dlng = (result & 1) != 0 ? ~(result >> 1) : (result >> 1);
      lng += dlng;

      points.add(LatLng(lat / 1e5, lng / 1e5));
    }
    return points;
  }

  String _stripHtmlTags(String html) {
    return html.replaceAll(RegExp(r'<[^>]*>'), ' ').replaceAll(RegExp(r'\s+'), ' ').trim();
  }

  Set<Marker> _buildMarkers(RideRequest ride, DriverState state) {
    // Snap driver position to route for smoother display
    final snappedPos = _snapToRoute(
      _vehicleState.currentPosition.latitude,
      _vehicleState.currentPosition.longitude,
    );

    return {
      Marker(
        markerId: const MarkerId('driver'),
        position: snappedPos,
        icon: _carIcon ?? BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueYellow),
        rotation: _vehicleState.markerRotation,
        anchor: const Offset(0.5, 0.5),
        flat: true,
        infoWindow: InfoWindow(
          title: 'You',
          snippet: _driverSpeed > 0 ? '${_driverSpeed.toStringAsFixed(0)} km/h' : null,
        ),
      ),
      Marker(
        markerId: const MarkerId('pickup'),
        position: LatLng(ride.pickupLat, ride.pickupLng),
        icon: _pickupIcon ?? BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueGreen),
        infoWindow: InfoWindow(title: 'Pickup', snippet: ride.pickupLocation),
      ),
      Marker(
        markerId: const MarkerId('dropoff'),
        position: LatLng(ride.dropoffLat, ride.dropoffLng),
        icon: _dropoffIcon ?? BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueRed),
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

  Set<Polyline> _buildPolylines(RideRequest? ride) {
    final polylines = <Polyline>{};
    final status = ride?.status;

    // Breadcrumb trail (path already traveled) - with round caps
    if (_breadcrumbTrail.length >= 2) {
      polylines.add(Polyline(
        polylineId: const PolylineId('breadcrumb'),
        points: _breadcrumbTrail,
        color: AppColors.yellow.withValues(alpha: 0.5),
        width: 6,
        startCap: Cap.roundCap,
        endCap: Cap.roundCap,
      ));
    }

    if (status == RideStatus.accepted) {
      // Heading to pickup: show driver→pickup (solid) + trip preview (dashed)
      if (_routePoints.isNotEmpty) {
        polylines.add(Polyline(
          polylineId: const PolylineId('route'),
          points: _routePoints,
          color: AppColors.yellow,
          width: 5,
        ));
      }
      if (_tripRoutePoints.isNotEmpty) {
        polylines.add(Polyline(
          polylineId: const PolylineId('trip_route'),
          points: _tripRoutePoints,
          color: AppColors.yellow.withValues(alpha: 0.4),
          width: 4,
          patterns: [PatternItem.dash(20), PatternItem.gap(10)],
        ));
      }
    } else if (status == RideStatus.arrivedAtPickup || status == RideStatus.inProgress) {
      // Arrived or in progress: only show trip route (pickup → dropoff)
      if (_tripRoutePoints.isNotEmpty) {
        polylines.add(Polyline(
          polylineId: const PolylineId('trip_route'),
          points: _tripRoutePoints,
          color: AppColors.yellow,
          width: 5,
        ));
      }
    }

    return polylines;
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

  bool _isValidLat(double lat) => lat >= 3.5 && lat <= 7.5;
  bool _isValidLng(double lng) => lng >= 72.0 && lng <= 74.0;

  void _fitBounds(RideRequest ride) {
    if (_mapController == null) return;
    try {
      final pickupLat = _isValidLat(ride.pickupLat) ? ride.pickupLat : 4.2286;
      final pickupLng = _isValidLng(ride.pickupLng) ? ride.pickupLng : 73.5400;
      final dropoffLat = _isValidLat(ride.dropoffLat) ? ride.dropoffLat : pickupLat + 0.01;
      final dropoffLng = _isValidLng(ride.dropoffLng) ? ride.dropoffLng : pickupLng + 0.01;
      final driverLat = _isValidLat(_driverLat) ? _driverLat : pickupLat;
      final driverLng = _isValidLng(_driverLng) ? _driverLng : pickupLng;

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
        const LatLng(4.2286, 73.5400), 14,
      ));
    }
  }

  Future<void> _openNavigation(double lat, double lng, {String? address}) async {
    HapticFeedback.mediumImpact();

    // Use address if available for better navigation, fallback to coordinates
    final destination = address != null && address.isNotEmpty
        ? Uri.encodeComponent(address)
        : '$lat,$lng';

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
              'Navigate to ${address ?? "Location"}',
              style: TextStyle(color: context.textColor, fontSize: 18, fontWeight: FontWeight.w700),
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
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
                      final uri = Uri.parse('https://www.google.com/maps/dir/?api=1&destination=$destination&travelmode=driving');
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
                const SizedBox(width: 12),
                Expanded(
                  child: _buildNavOption(
                    icon: Icons.apple,
                    label: 'Apple Maps',
                    color: const Color(0xFF333333),
                    onTap: () async {
                      Navigator.pop(ctx);
                      final uri = Uri.parse('https://maps.apple.com/?daddr=$lat,$lng&dirflg=d');
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
          if (!_isNavigatingAway) {
            _isNavigatingAway = true;
            _pulseController.stop();
            _routeAnimController.stop();
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (mounted && Navigator.canPop(context)) {
                Navigator.pop(context);
              } else if (mounted) {
                Navigator.pushReplacementNamed(context, '/home');
              }
            });
          }
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
                    target: LatLng(
                      _isValidLat(ride.pickupLat) ? ride.pickupLat : 4.2286,
                      _isValidLng(ride.pickupLng) ? ride.pickupLng : 73.5400,
                    ),
                    zoom: 16,
                    tilt: _is3DMode ? 45 : 0,
                  ),
                  onMapCreated: (controller) {
                    _mapController = controller;
                    Future.delayed(const Duration(milliseconds: 500), () => _fitBounds(ride));
                  },
                  markers: _buildMarkers(ride, state),
                  polylines: _buildPolylines(ride),
                  mapType: _mapType,
                  myLocationEnabled: false,
                  myLocationButtonEnabled: false,
                  zoomControlsEnabled: false,
                  mapToolbarEnabled: false,
                  compassEnabled: true,
                  trafficEnabled: _trafficEnabled,
                  buildingsEnabled: true,
                  style: _mapType == MapType.normal && context.isDark ? _darkMapStyle : null,
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
                    _buildMapButton(Icons.my_location, () {
                      _mapController?.animateCamera(CameraUpdate.newLatLngZoom(
                        LatLng(_driverLat, _driverLng), 17,
                      ));
                    }),
                  ],
                ),
              ),

              // Map controls (right side)
              Positioned(
                right: 16,
                top: MediaQuery.of(context).padding.top + 240,
                child: Column(
                  children: [
                    // Map type toggle (normal/satellite/terrain)
                    _buildMapControlButton(
                      _mapType == MapType.satellite ? Icons.satellite_alt :
                      _mapType == MapType.terrain ? Icons.terrain : Icons.map,
                      false,
                      () => setState(() {
                        if (_mapType == MapType.normal) {
                          _mapType = MapType.satellite;
                        } else if (_mapType == MapType.satellite) {
                          _mapType = MapType.terrain;
                        } else {
                          _mapType = MapType.normal;
                        }
                      }),
                      'Map Type',
                      alwaysYellow: true,
                    ),
                    const SizedBox(height: 8),
                    // Traffic toggle
                    _buildMapControlButton(
                      Icons.traffic,
                      _trafficEnabled,
                      () => setState(() => _trafficEnabled = !_trafficEnabled),
                      'Traffic',
                    ),
                    const SizedBox(height: 8),
                    // 3D mode toggle
                    _buildMapControlButton(
                      Icons.view_in_ar,
                      _is3DMode,
                      () {
                        setState(() => _is3DMode = !_is3DMode);
                        _mapController?.animateCamera(CameraUpdate.newCameraPosition(
                          CameraPosition(
                            target: LatLng(_driverLat, _driverLng),
                            zoom: 17,
                            tilt: _is3DMode ? 45 : 0,
                          ),
                        ));
                      },
                      '3D',
                    ),
                    const SizedBox(height: 8),
                    // Heading-up mode toggle
                    _buildMapControlButton(
                      Icons.navigation,
                      _headingUpMode,
                      () => setState(() => _headingUpMode = !_headingUpMode),
                      'Heading',
                    ),
                    const SizedBox(height: 8),
                    // Fit all markers
                    _buildMapControlButton(
                      Icons.zoom_out_map,
                      false,
                      () => _fitBounds(ride),
                      'Fit All',
                    ),
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
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    // Navigation button
                    if (ride.status == RideStatus.accepted || ride.status == RideStatus.inProgress)
                      GestureDetector(
                        onTap: () => _openNavigation(
                          ride.status == RideStatus.inProgress ? ride.dropoffLat : ride.pickupLat,
                          ride.status == RideStatus.inProgress ? ride.dropoffLng : ride.pickupLng,
                          address: ride.status == RideStatus.inProgress ? ride.dropoffAddress : ride.pickupAddress,
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

                    // SOS Button (only show if enabled)
                    if (AppSettingsService.sosEnabled) ...[
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
                    ],

                    // Radio/Push to Talk Button
                    const SizedBox(width: 8),
                    GestureDetector(
                      onTap: () {
                        HapticFeedback.lightImpact();
                        Navigator.pushNamed(context, '/push-to-talk');
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        decoration: BoxDecoration(
                          color: AppColors.yellow,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.mic, color: Colors.black, size: 16),
                            SizedBox(width: 6),
                            Text('PTT', style: TextStyle(color: Colors.black, fontSize: 12, fontWeight: FontWeight.w700)),
                          ],
                        ),
                      ),
                    ),

                    // Speed indicator (same row as PTT)
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.8),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: AppColors.yellow, width: 1.5),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.speed, color: AppColors.yellow, size: 16),
                          const SizedBox(width: 6),
                          Text(
                            '${_driverSpeed.toStringAsFixed(0)} km/h',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),

                    const Spacer(),
                  ],
                ),
              ),

              // Toggle Bottom Panel
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 300),
                  curve: Curves.easeOutCubic,
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
                  child: Padding(
                    padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewPadding.bottom + 16),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
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

                        // Content (when expanded)
                        if (_isPanelExpanded) ...[
                          Padding(
                            padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
                            child: Column(
                              children: [
                                _buildCustomerCard(ride, state),
                                const SizedBox(height: 12),
                                _buildRouteCard(ride),
                                if (state.queuedRequests.isNotEmpty) ...[
                                  const SizedBox(height: 12),
                                  _buildQueueCard(state),
                                ],
                                // Cancel button (show when waiting for customer)
                                if (ride.status == RideStatus.arrivedAtPickup) ...[
                                  const SizedBox(height: 12),
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
                                ],
                              ],
                            ),
                          ),
                        ],

                        // Swipe action always at bottom
                        Padding(
                          padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
                          child: _buildSwipeAction(state, ride),
                        ),
                      ],
                    ),
                  ),
                ),
              ),

              // Show new ride request popup while on active trip
              if (state.incomingRequests.isNotEmpty)
                Positioned.fill(
                  child: Container(
                    color: Colors.black.withValues(alpha: 0.7),
                    child: Center(
                      child: RideRequestPopup(
                        key: ValueKey(state.incomingRequests.first.id),
                        request: state.incomingRequests.first,
                        onAccept: () async {
                          final request = state.incomingRequests.first;
                          final result = await state.acceptRide(request);
                          if (result['success'] != true && mounted) {
                            AppSnackbar.warning(context, result['error'] ?? 'Ride was taken by another driver');
                          }
                        },
                        onDecline: () {
                          state.expireRide(state.incomingRequests.first);
                        },
                      ),
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

  Widget _buildMapControlButton(IconData icon, bool isActive, VoidCallback onTap, String label, {bool alwaysYellow = false}) {
    final showYellow = alwaysYellow || isActive;
    return GestureDetector(
      onTap: () {
        HapticFeedback.lightImpact();
        onTap();
      },
      child: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          color: showYellow ? AppColors.yellow : Colors.black.withValues(alpha: 0.7),
          borderRadius: BorderRadius.circular(12),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.2),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Icon(
          icon,
          color: showYellow ? Colors.black : Colors.white,
          size: 22,
        ),
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
    final displayName = ride.bookedForOther && ride.riderName != null
        ? ride.riderName!
        : ride.customerName;
    final displayPhone = ride.bookedForOther && ride.riderPhone != null
        ? ride.riderPhone!
        : ride.customerPhone;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.bgColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.yellow.withValues(alpha: 0.3)),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Stack(
                children: [
                  Container(
                    width: 60,
                    height: 60,
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [AppColors.yellow, AppColors.yellow.withValues(alpha: 0.7)],
                      ),
                      shape: BoxShape.circle,
                    ),
                    child: CachedAvatar(
                      imageUrl: ride.bookedForOther ? null : ride.customerPhoto,
                      radius: 30,
                      backgroundColor: AppColors.yellow,
                      fallbackIcon: Icons.person,
                      iconColor: Colors.black,
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
                      displayName,
                      style: TextStyle(color: context.textColor, fontSize: 18, fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Icon(Icons.phone, color: context.mutedColor, size: 14),
                        const SizedBox(width: 4),
                        Text(displayPhone, style: TextStyle(color: context.mutedColor, fontSize: 13)),
                      ],
                    ),
                    if (ride.bookedForOther) ...[
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Icon(Icons.person_outline, color: AppColors.yellow, size: 14),
                          const SizedBox(width: 4),
                          Text('Booked by ${ride.customerName}', style: TextStyle(color: AppColors.yellow, fontSize: 12)),
                        ],
                      ),
                    ] else if (ride.tripsTogether > 0) ...[
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Icon(Icons.history, color: context.mutedColor, size: 14),
                          const SizedBox(width: 4),
                          Text('${ride.tripsTogether} trip${ride.tripsTogether > 1 ? 's' : ''} together', style: TextStyle(color: context.mutedColor, fontSize: 12)),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
              Column(
                children: [
                  if (AppSettingsService.chatEnabled)
                    _buildActionButton(Icons.chat, Colors.blue, () => _openChat(displayName, customerPhone: displayPhone, rideId: ride.id)),
                  if (AppSettingsService.chatEnabled)
                    const SizedBox(height: 8),
                  _buildActionButton(Icons.call, AppColors.success, () => _makeCall(displayPhone)),
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
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: context.bgColor,
        borderRadius: BorderRadius.circular(14),
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
                address: title == 'PICKUP' ? ride.pickupAddress : ride.dropoffAddress,
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
                          '${state.queuedRequests.length} waiting',
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
    debugPrint('_buildSwipeAction: ride.status = ${ride.status}');
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
              AppSnackbar.error(context, 'Ride cancelled', subtitle: reason);
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

  Future<void> _showCompletionDialog(DriverState state) async {
    // Complete the trip and go straight to home with a toast
    final success = await state.completeTrip();

    if (!mounted) return;

    if (success) {
      // Skip banner - home screen already shows updated stats
      Navigator.of(context).pushNamedAndRemoveUntil('/home', (route) => false);
    } else {
      AppSnackbar.error(context, 'Failed to complete trip');
    }
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
  }

  @override
  void didUpdateWidget(covariant _SwipeButton oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Reset button when text changes (new action)
    if (oldWidget.text != widget.text) {
      _dragPosition = 0;
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

class _DestChangeDialog extends StatefulWidget {
  final String newDestination;
  final Future<void> Function() onAccept;
  final Future<void> Function() onDecline;

  const _DestChangeDialog({
    required this.newDestination,
    required this.onAccept,
    required this.onDecline,
  });

  @override
  State<_DestChangeDialog> createState() => _DestChangeDialogState();
}

class _DestChangeDialogState extends State<_DestChangeDialog> {
  bool _tapped = false;

  void _handleDecline() {
    if (_tapped) return;
    _tapped = true;
    widget.onDecline();
  }

  void _handleAccept() {
    if (_tapped) return;
    _tapped = true;
    widget.onAccept();
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: context.cardColor,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 60,
              height: 60,
              decoration: BoxDecoration(
                color: AppColors.yellow.withValues(alpha: 0.15),
                shape: BoxShape.circle,
              ),
              child: Icon(Icons.edit_location_alt, color: AppColors.yellow, size: 32),
            ),
            const SizedBox(height: 16),
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
                        Text(widget.newDestination, style: TextStyle(color: context.textColor, fontSize: 15, fontWeight: FontWeight.w600)),
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
                  child: ElevatedButton(
                    onPressed: _handleDecline,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.red.shade700,
                      foregroundColor: Colors.white,
                      minimumSize: const Size(double.infinity, 50),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: const Text('Decline', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton(
                    onPressed: _handleAccept,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.yellow,
                      foregroundColor: Colors.black,
                      minimumSize: const Size(double.infinity, 50),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: const Text('Accept', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
