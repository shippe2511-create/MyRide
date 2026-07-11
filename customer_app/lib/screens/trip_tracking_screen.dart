import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import '../config/app_config.dart';
import '../providers/app_state.dart';
import '../theme/app_theme.dart';
import '../services/supabase_service.dart';
import '../services/notification_service.dart';
import '../services/realtime_service.dart';
import '../services/app_settings_service.dart';
import '../utils/marker_animation.dart';
import '../widgets/status_animation.dart';
import '../widgets/app_snackbar.dart';
import 'trip_complete_screen.dart';
import 'chat_screen.dart';

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

class TripTrackingScreen extends StatefulWidget {
  final Map<String, dynamic> tripData;

  const TripTrackingScreen({super.key, required this.tripData});

  @override
  State<TripTrackingScreen> createState() => _TripTrackingScreenState();
}

class _TripTrackingScreenState extends State<TripTrackingScreen> with TickerProviderStateMixin {
  GoogleMapController? _mapController;
  late AnimationController _markerAnimController;
  late VehicleMarkerState _vehicleState;

  late LatLng _driverLocation;
  late LatLng _pickupLocation;
  late LatLng _dropoffLocation;

  int _etaMinutes = 12;
  late String _dropoff;
  String _driverName = 'Driver';
  Timer? _statusPollingTimer;
  StreamSubscription<Map<String, dynamic>>? _driverLocationSubscription;
  StreamSubscription<Map<String, dynamic>>? _rideSubscription;
  bool _tripCompleted = false;
  String _rideStatus = 'accepted'; // accepted, arrived, in_progress, completed
  final _realtimeService = RealtimeService();
  String? _driverId;
  List<LatLng> _routePoints = [];
  String? _routeEta;
  String? _routeDistance;
  bool _trafficEnabled = false;
  MapType _mapType = MapType.normal;
  BitmapDescriptor? _carIcon;
  BitmapDescriptor? _pickupIcon;
  BitmapDescriptor? _dropoffIcon;
  String? _nextTurnInstruction;
  String? _nextTurnDistance;

  @override
  void initState() {
    super.initState();
    _markerAnimController = AnimationController(
      duration: const Duration(milliseconds: 1000),
      vsync: this,
    );

    debugPrint('TripTrackingScreen tripData: ${widget.tripData}');
    debugPrint('driverPhoto: ${widget.tripData['driverPhoto']}');
    debugPrint('plateNo: ${widget.tripData['plateNo']}');
    debugPrint('vehicleNumber: ${widget.tripData['vehicleNumber']}');

    _dropoff = widget.tripData['dropoff'] ?? 'Velana International Airport';
    _rideStatus = widget.tripData['status'] as String? ?? 'accepted';
    _driverName = widget.tripData['driverName'] as String? ?? 'Driver';

    // Initialize coordinates from tripData or use Maldives defaults
    final pLat = (widget.tripData['pickup_lat'] as num?)?.toDouble() ?? 4.1755;
    final pLng = (widget.tripData['pickup_lng'] as num?)?.toDouble() ?? 73.5093;
    final dLat = (widget.tripData['dropoff_lat'] as num?)?.toDouble() ?? 4.1755;
    final dLng = (widget.tripData['dropoff_lng'] as num?)?.toDouble() ?? 73.5093;

    _pickupLocation = _isValidMaldivesCoord(pLat, pLng)
        ? LatLng(pLat, pLng)
        : const LatLng(4.1755, 73.5093);
    _dropoffLocation = _isValidMaldivesCoord(dLat, dLng)
        ? LatLng(dLat, dLng)
        : const LatLng(4.1755, 73.5093);
    _driverLocation = LatLng(_pickupLocation.latitude + 0.005, _pickupLocation.longitude + 0.003);
    _vehicleState = VehicleMarkerState(currentPosition: _driverLocation);

    _loadCarIcon();
    _loadPinIcons();
    _startStatusPolling();
    _subscribeToDriverLocation();
    _subscribeToRideUpdates();
    _fetchRoute();

    // Subscribe to chat notifications
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final appState = Provider.of<AppState>(context, listen: false);
      final rideId = widget.tripData['rideId'] as String?;
      if (rideId != null && appState.profileId != null) {
        NotificationService.subscribeToChatMessages(rideId, appState.profileId!);
      }
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

  void _animateDriverPosition(LatLng newPosition) {
    // Check if moved enough to animate
    final distance = calculateDistance(_vehicleState.currentPosition, newPosition);
    if (distance < 1.0) return; // Skip tiny movements

    // Update target (calculates bearing if moved enough)
    _vehicleState.updateTarget(newPosition);

    // Store start state for interpolation
    final startPosition = _vehicleState.currentPosition;
    final startBearing = _vehicleState.currentBearing;
    final endPosition = _vehicleState.targetPosition;
    final endBearing = _vehicleState.targetBearing;

    _markerAnimController.reset();
    _markerAnimController.removeListener(_onAnimationTick);
    _markerAnimController.addListener(_onAnimationTick);

    // Store for listener closure
    _animStartPos = startPosition;
    _animEndPos = endPosition;
    _animStartBearing = startBearing;
    _animEndBearing = endBearing;

    _markerAnimController.forward();
  }

  LatLng _animStartPos = const LatLng(0, 0);
  LatLng _animEndPos = const LatLng(0, 0);
  double _animStartBearing = 0;
  double _animEndBearing = 0;

  void _onAnimationTick() {
    if (!mounted) return;
    final t = _markerAnimController.value;
    setState(() {
      _vehicleState.currentPosition = lerpLatLng(_animStartPos, _animEndPos, t);
      _vehicleState.currentBearing = lerpAngle(_animStartBearing, _animEndBearing, t);
    });
  }

  @override
  void dispose() {
    _markerAnimController.dispose();
    _driverLocationSubscription?.cancel();
    _rideSubscription?.cancel();
    _statusPollingTimer?.cancel();
    final rideId = widget.tripData['rideId'] as String?;
    if (rideId != null) {
      _realtimeService.unsubscribe('ride_$rideId');
    }
    if (_driverId != null) {
      _realtimeService.unsubscribe('driver_location_$_driverId');
    }
    super.dispose();
  }

  void _subscribeToRideUpdates() {
    final rideId = widget.tripData['rideId'] as String?;
    if (rideId == null) return;

    _rideSubscription = _realtimeService.subscribeToRide(rideId).listen((update) {
      if (!mounted || _tripCompleted) return;

      final status = update['status'] as String?;
      debugPrint('Trip realtime status: $status');

      if (status != null && status != _rideStatus) {
        setState(() => _rideStatus = status);
      }

      if (status == 'completed' && !_tripCompleted) {
        _statusPollingTimer?.cancel();
        _onTripCompleted();
      } else if (status == 'cancelled') {
        _statusPollingTimer?.cancel();
        AppSnackbar.error(context, 'Trip was cancelled');
        Navigator.popUntil(context, (route) => route.isFirst);
      }
    });
  }

  void _fitMapBounds() {
    if (_mapController == null) return;

    final bounds = LatLngBounds(
      southwest: LatLng(
        [_pickupLocation.latitude, _dropoffLocation.latitude, _driverLocation.latitude].reduce((a, b) => a < b ? a : b),
        [_pickupLocation.longitude, _dropoffLocation.longitude, _driverLocation.longitude].reduce((a, b) => a < b ? a : b),
      ),
      northeast: LatLng(
        [_pickupLocation.latitude, _dropoffLocation.latitude, _driverLocation.latitude].reduce((a, b) => a > b ? a : b),
        [_pickupLocation.longitude, _dropoffLocation.longitude, _driverLocation.longitude].reduce((a, b) => a > b ? a : b),
      ),
    );

    Future.delayed(const Duration(milliseconds: 300), () {
      _mapController?.animateCamera(CameraUpdate.newLatLngBounds(bounds, 80));
    });
  }

  void _subscribeToDriverLocation() async {
    // Try multiple sources for driver ID
    String? driverId = widget.tripData['driverId'] as String?;
    driverId ??= widget.tripData['driver_id'] as String?;
    driverId ??= widget.tripData['driver']?['id'] as String?;

    debugPrint('tripData keys: ${widget.tripData.keys}');
    debugPrint('Looking for driver ID, found: $driverId');

    // Fallback: fetch driver ID from ride if not passed
    if (driverId == null) {
      final rideId = widget.tripData['rideId'] as String?;
      if (rideId != null) {
        try {
          final ride = await SupabaseService.getRideById(rideId);
          if (ride != null) {
            driverId = ride['driver']?['id'] as String?;
            // Also update driver name if missing
            final driverProfile = ride['driver']?['profile'] as Map<String, dynamic>?;
            if (driverProfile != null && mounted) {
              setState(() {
                _driverName = driverProfile['full_name'] as String? ?? _driverName;
              });
            }
          }
        } catch (e) {
          debugPrint('Error fetching driver for tracking: $e');
        }
      }
    }

    if (driverId == null) {
      debugPrint('No driver ID for location tracking');
      return;
    }

    _driverId = driverId;
    debugPrint('Subscribing to driver location: $driverId');

    // Use RealtimeService for driver location
    _driverLocationSubscription = _realtimeService
        .subscribeToDriverLocation(driverId)
        .listen((data) {
      debugPrint('Driver location update: $data');
      if (mounted) {
        final lat = data['lat'] as double?;
        final lng = data['lng'] as double?;
        if (lat != null && lng != null && _isValidMaldivesCoord(lat, lng)) {
          _driverLocation = LatLng(lat, lng);
          // Smooth animation to new position
          _animateDriverPosition(_driverLocation);
          _mapController?.animateCamera(
            CameraUpdate.newLatLng(_driverLocation),
          );
          // Refresh route when driver moves
          _fetchRoute();
        }
      }
    });

    // Also fetch initial location
    _fetchDriverLocation(driverId);
  }

  bool _isValidMaldivesCoord(double lat, double lng) {
    // Maldives bounds: lat -0.7 to 7.1, lng 72.6 to 73.8
    return lat >= -0.7 && lat <= 7.1 && lng >= 72.6 && lng <= 73.8;
  }

  Future<void> _fetchRoute() async {
    // Determine origin and destination based on ride status
    LatLng origin;
    LatLng destination;

    if (_rideStatus == 'in_progress') {
      origin = _driverLocation;
      destination = _dropoffLocation;
    } else {
      origin = _driverLocation;
      destination = _pickupLocation;
    }

    try {
      final url = 'https://maps.googleapis.com/maps/api/directions/json'
          '?origin=${origin.latitude},${origin.longitude}'
          '&destination=${destination.latitude},${destination.longitude}'
          '&key=${AppConfig.googleMapsApiKey}';

      debugPrint('Fetching route: $url');
      final response = await http.get(Uri.parse(url));
      debugPrint('Route response status: ${response.statusCode}');

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        debugPrint('API status: ${data['status']}');

        if (data['status'] == 'OK' && data['routes'] != null && data['routes'].isNotEmpty) {
          final route = data['routes'][0];
          final polyline = route['overview_polyline']['points'];
          final points = _decodePolyline(polyline);
          debugPrint('Decoded ${points.length} route points');

          final leg = route['legs'][0];
          final duration = leg['duration']['text'];
          final distance = leg['distance']['text'];

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
              _routeEta = duration;
              _routeDistance = distance;
              _nextTurnInstruction = nextInstruction;
              _nextTurnDistance = nextDistance;
              final durationValue = leg['duration']['value'] as int?;
              if (durationValue != null) {
                _etaMinutes = (durationValue / 60).ceil();
              }
            });
          }
        } else {
          debugPrint('Route API error: ${data['status']} - ${data['error_message']}');
          // Fallback to straight line
          if (mounted) {
            setState(() {
              _routePoints = [origin, destination];
            });
          }
        }
      }
    } catch (e) {
      debugPrint('Error fetching route: $e');
      // Fallback to straight line
      if (mounted) {
        setState(() {
          _routePoints = [origin, destination];
        });
      }
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

  Future<void> _fetchDriverLocation(String driverId) async {
    try {
      final response = await SupabaseService.client
          .from('drivers')
          .select('current_location_lat, current_location_lng')
          .eq('id', driverId)
          .maybeSingle();

      if (response != null && mounted) {
        final lat = response['current_location_lat'] as num?;
        final lng = response['current_location_lng'] as num?;
        if (lat != null && lng != null && _isValidMaldivesCoord(lat.toDouble(), lng.toDouble())) {
          setState(() {
            _driverLocation = LatLng(lat.toDouble(), lng.toDouble());
          });
        }
      }
    } catch (e) {
      debugPrint('Error fetching driver location: $e');
    }
  }

  void _startStatusPolling() {
    final rideId = widget.tripData['rideId'];
    if (rideId == null) return;

    _statusPollingTimer = Timer.periodic(const Duration(seconds: 2), (_) async {
      if (!mounted || _tripCompleted) return;

      try {
        final ride = await SupabaseService.getRideById(rideId);
        if (ride != null && mounted) {
          final status = ride['status'] as String?;
          debugPrint('Trip polling status: $status');

          // Update status for UI and show notifications
          if (status != null && status != _rideStatus) {
            final oldStatus = _rideStatus;
            setState(() => _rideStatus = status);

            // Haptic feedback when driver arrives (notification handled elsewhere)
            if (status == 'arrived' && oldStatus != 'arrived') {
              HapticFeedback.heavyImpact();
            }
          }

          if (status == 'completed' && !_tripCompleted) {
            _statusPollingTimer?.cancel();
            _driverLocationSubscription?.cancel();
            _onTripCompleted(); // This sets _tripCompleted = true
          } else if (status == 'cancelled') {
            _statusPollingTimer?.cancel();
            _driverLocationSubscription?.cancel();
            AppSnackbar.error(context, 'Trip Cancelled', subtitle: 'The trip was cancelled');
            Navigator.popUntil(context, (route) => route.isFirst);
          }
        }
      } catch (e) {
        debugPrint('Trip polling error: $e');
      }
    });
  }

  void _onTripCompleted() async {
    if (_tripCompleted) return; // Prevent double navigation
    _tripCompleted = true;

    // Show notification
    NotificationService().showTripCompletedNotification(destination: _dropoff);

    final rideId = widget.tripData['rideId'] as String?;

    // Fetch complete ride data from database
    String? driverId;
    String? driverName;
    String? vehicleNumber;
    double? distance;
    int? duration;

    if (rideId != null) {
      try {
        final ride = await SupabaseService.getRideById(rideId);
        if (ride != null) {
          final driver = ride['driver'] as Map<String, dynamic>?;
          final driverProfile = driver?['profile'] as Map<String, dynamic>?;
          final vehicle = driver?['vehicle'] as Map<String, dynamic>?;

          driverId = driver?['id'] as String?;
          driverName = driverProfile?['full_name'] as String?;
          vehicleNumber = vehicle?['display_name'] as String? ?? vehicle?['plate_no'] as String?;
          debugPrint('Trip complete vehicle data: display_name=${vehicle?['display_name']}, plate_no=${vehicle?['plate_no']}, using=$vehicleNumber');
          distance = (ride['distance_km'] as num?)?.toDouble();

          // Calculate duration from started_at to completed_at
          final startedAt = ride['started_at'] as String?;
          final completedAt = ride['completed_at'] as String?;
          if (startedAt != null && completedAt != null) {
            final start = DateTime.tryParse(startedAt);
            final end = DateTime.tryParse(completedAt);
            if (start != null && end != null) {
              duration = end.difference(start).inMinutes;
              if (duration < 1) duration = 1; // Minimum 1 minute
            }
          }
        }
      } catch (e) {
        debugPrint('Error fetching ride data: $e');
      }
    }

    // Fallback to tripData if database fetch failed
    driverId ??= (widget.tripData['driver'] as Map<String, dynamic>?)?['id'] as String?;
    driverName ??= (widget.tripData['driverName'] as String?);
    vehicleNumber ??= widget.tripData['vehicleNumber'] as String?;

    if (!mounted) return;

    HapticFeedback.heavyImpact();
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(
        builder: (_) => TripCompleteScreen(
          destination: _dropoff,
          rideId: rideId,
          driverId: driverId,
          driverName: driverName,
          vehicleNumber: vehicleNumber,
          distance: distance,
          duration: duration,
        ),
      ),
    );
  }

  Widget _buildMapControl(IconData icon, bool isActive, VoidCallback onTap, {bool alwaysYellow = false}) {
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
          color: showYellow ? AppColors.yellow : Colors.black.withOpacity(0.7),
          borderRadius: BorderRadius.circular(12),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.2),
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

  String _stripHtmlTags(String html) {
    return html.replaceAll(RegExp(r'<[^>]*>'), ' ').replaceAll(RegExp(r'\s+'), ' ').trim();
  }

  IconData _getTurnIcon(String? instruction) {
    if (instruction == null) return Icons.straight;
    final lower = instruction.toLowerCase();
    if (lower.contains('left')) return Icons.turn_left;
    if (lower.contains('right')) return Icons.turn_right;
    if (lower.contains('u-turn')) return Icons.u_turn_left;
    if (lower.contains('roundabout')) return Icons.roundabout_left;
    if (lower.contains('merge')) return Icons.merge;
    if (lower.contains('exit')) return Icons.exit_to_app;
    return Icons.straight;
  }

  void _shareLiveLocation() {
    final rideId = widget.tripData['rideId'] as String?;
    if (rideId == null) return;

    final shareText = '''
I'm on my way! Track my ride in real-time:

Driver: $_driverName
Destination: $_dropoff
ETA: $_etaMinutes min

Live tracking link: https://my-ride-ashen.vercel.app/track/$rideId
''';

    Share.share(shareText, subject: 'Track My MyRide Trip');
    HapticFeedback.mediumImpact();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.bgColor,
      body: Stack(
        children: [
          // Google Map
          GoogleMap(
            initialCameraPosition: CameraPosition(target: _pickupLocation, zoom: 15),
            onMapCreated: (controller) {
              _mapController = controller;
              _fitMapBounds();
            },
            markers: {
              // Driver marker with custom car icon
              Marker(
                markerId: const MarkerId('driver'),
                position: _vehicleState.currentPosition,
                icon: _carIcon ?? BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueYellow),
                rotation: _vehicleState.markerRotation,
                anchor: const Offset(0.5, 0.5),
                flat: true,
                infoWindow: InfoWindow(title: _driverName),
              ),
              // Show pickup marker before trip starts
              if (_rideStatus != 'in_progress')
                Marker(
                  markerId: const MarkerId('pickup'),
                  position: _pickupLocation,
                  icon: _pickupIcon ?? BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueGreen),
                  infoWindow: const InfoWindow(title: 'Pickup'),
                ),
              // Show dropoff marker during trip
              if (_rideStatus == 'in_progress')
                Marker(
                  markerId: const MarkerId('dropoff'),
                  position: _dropoffLocation,
                  icon: _dropoffIcon ?? BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueRed),
                  infoWindow: const InfoWindow(title: 'Drop-off'),
                ),
            },
            polylines: {
              Polyline(
                polylineId: const PolylineId('route'),
                points: _routePoints.isNotEmpty
                    ? _routePoints
                    : (_rideStatus == 'in_progress'
                        ? [_vehicleState.currentPosition, _dropoffLocation]
                        : [_vehicleState.currentPosition, _pickupLocation]),
                color: AppColors.yellow,
                width: 5,
              ),
            },
            mapType: _mapType,
            myLocationEnabled: true,
            myLocationButtonEnabled: false,
            zoomControlsEnabled: false,
            mapToolbarEnabled: false,
            trafficEnabled: _trafficEnabled,
            buildingsEnabled: true,
            compassEnabled: true,
            style: _mapType == MapType.normal && context.isDark ? _darkMapStyle : null,
          ),

          // Map controls (right side)
          Positioned(
            right: 16,
            top: MediaQuery.of(context).padding.top + 130,
            child: Column(
              children: [
                // Share live location
                _buildMapControl(Icons.share_location, false, _shareLiveLocation),
                const SizedBox(height: 8),
                // Map type toggle (normal/satellite/terrain)
                _buildMapControl(
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
                  alwaysYellow: true,
                ),
                const SizedBox(height: 8),
                // Traffic toggle
                _buildMapControl(Icons.traffic, _trafficEnabled, () {
                  setState(() => _trafficEnabled = !_trafficEnabled);
                }),
                const SizedBox(height: 8),
                // Fit all markers
                _buildMapControl(Icons.zoom_out_map, false, () {
                  _fitMapBounds();
                }),
                const SizedBox(height: 8),
                // Center on driver
                _buildMapControl(Icons.my_location, false, () {
                  _mapController?.animateCamera(
                    CameraUpdate.newLatLngZoom(_vehicleState.currentPosition, 17),
                  );
                }),
              ],
            ),
          ),

          // Top bar - matching driver arriving screen
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  GestureDetector(
                    onTap: () => _rideStatus == 'in_progress' ? Navigator.pop(context) : _showCancelConfirmation(),
                    child: Container(
                      width: 42,
                      height: 42,
                      decoration: BoxDecoration(
                        color: context.isDark ? const Color(0xFF2A2A2E) : Colors.white,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Icon(Icons.close, color: context.textColor, size: 22),
                    ),
                  ),
                  const SizedBox(width: 10),
                  // SOS Button (only show if enabled)
                  if (AppSettingsService.sosEnabled)
                    GestureDetector(
                      onTap: () => _showSOSOptions(),
                      child: Container(
                        width: 42,
                        height: 42,
                        decoration: BoxDecoration(
                          color: AppColors.error.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Icon(Icons.sos, color: AppColors.error, size: 20),
                      ),
                    ),
                  const Spacer(),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                    decoration: BoxDecoration(
                      color: AppColors.yellow,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.access_time, color: Colors.black, size: 16),
                        const SizedBox(width: 6),
                        Text('$_etaMinutes min', style: const TextStyle(color: Colors.black, fontSize: 14, fontWeight: FontWeight.w700)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Bottom sheet - Uber style
          DraggableScrollableSheet(
            initialChildSize: 0.38,
            minChildSize: 0.38,
            maxChildSize: 0.50,
            snap: true,
            snapSizes: const [0.38],
            builder: (context, scrollController) {
              final statusColor = _rideStatus == 'in_progress' ? AppColors.success
                  : (_rideStatus == 'arrived' ? const Color(0xFF2196F3) : AppColors.yellow);
              final statusIcon = _rideStatus == 'in_progress' ? Icons.navigation_rounded
                  : (_rideStatus == 'arrived' ? Icons.person_pin_circle_rounded : Icons.local_taxi_rounded);
              final statusText = _rideStatus == 'accepted' ? 'Driver on the way'
                  : (_rideStatus == 'arrived' ? 'Driver has arrived' : 'On trip');

              return Container(
                decoration: BoxDecoration(
                  color: context.isDark ? const Color(0xFF141418) : const Color(0xFFF8F8F8),
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
                  boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.15), blurRadius: 20, offset: const Offset(0, -5))],
                ),
                child: ListView(
                  controller: scrollController,
                  padding: EdgeInsets.zero,
                  children: [
                    // Handle
                    Center(
                      child: Container(
                        margin: const EdgeInsets.only(top: 10),
                        width: 40,
                        height: 4,
                        decoration: BoxDecoration(
                          color: context.isDark ? Colors.white24 : Colors.black12,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),

                    // Uber-style status header
                    Padding(
                      padding: const EdgeInsets.fromLTRB(24, 14, 24, 0),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  statusText,
                                  style: TextStyle(
                                    color: context.textColor,
                                    fontSize: 24,
                                    fontWeight: FontWeight.w800,
                                    letterSpacing: -0.5,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  'Arriving in $_etaMinutes min',
                                  style: TextStyle(color: context.mutedColor, fontSize: 15),
                                ),
                              ],
                            ),
                          ),
                          GestureDetector(
                            onTap: () async {
                              HapticFeedback.lightImpact();
                              // Open navigation to driver's location
                              final lat = _driverLocation.latitude;
                              final lng = _driverLocation.longitude;
                              final url = Uri.parse('https://maps.apple.com/?daddr=$lat,$lng&dirflg=d');
                              if (await canLaunchUrl(url)) {
                                await launchUrl(url, mode: LaunchMode.externalApplication);
                              }
                            },
                            child: Container(
                              width: 52,
                              height: 52,
                              decoration: BoxDecoration(
                                color: statusColor,
                                borderRadius: BorderRadius.circular(14),
                              ),
                              child: Icon(statusIcon, color: Colors.white, size: 26),
                            ),
                          ),
                        ],
                      ),
                    ),

                    // Driver info with profile photo
                    Padding(
                      padding: const EdgeInsets.fromLTRB(24, 16, 24, 0),
                      child: Row(
                        children: [
                          // Driver profile photo with rating badge
                          Stack(
                            clipBehavior: Clip.none,
                            children: [
                              Container(
                                width: 60,
                                height: 60,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  border: Border.all(color: Colors.white, width: 2),
                                  boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.2), blurRadius: 6)],
                                ),
                                child: ClipOval(
                                  child: widget.tripData['driverPhoto'] != null && (widget.tripData['driverPhoto'] as String).isNotEmpty
                                      ? Image.network(
                                          widget.tripData['driverPhoto'] as String,
                                          fit: BoxFit.cover,
                                          errorBuilder: (_, __, ___) => Container(
                                            color: AppColors.yellow,
                                            child: Icon(Icons.person, color: Colors.black87, size: 32),
                                          ),
                                        )
                                      : Container(
                                          color: AppColors.yellow,
                                          child: Icon(Icons.person, color: Colors.black87, size: 32),
                                        ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(width: 16),
                          // Driver info
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  _driverName,
                                  style: TextStyle(color: context.textColor, fontSize: 18, fontWeight: FontWeight.w700),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  [
                                    widget.tripData['vehicleNumber'],
                                    widget.tripData['plateNo'],
                                  ].where((s) => s != null && s.toString().isNotEmpty).join(' - '),
                                  style: TextStyle(color: context.mutedColor, fontSize: 14, fontWeight: FontWeight.w500),
                                ),
                              ],
                            ),
                          ),
                          // Action buttons inline
                          if (AppSettingsService.chatEnabled)
                            _buildCircleAction(Icons.chat_bubble_rounded, () => _messageDriver()),
                          if (AppSettingsService.chatEnabled)
                            const SizedBox(width: 12),
                          _buildCircleAction(Icons.phone_rounded, () => _callDriver()),
                        ],
                      ),
                    ),

                    // Divider
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                      child: Container(height: 1, color: context.isDark ? Colors.white10 : Colors.black.withValues(alpha: 0.08)),
                    ),

                    // Route Card - Simplified
                    Padding(
                      padding: const EdgeInsets.fromLTRB(24, 0, 24, 8),
                      child: Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: context.isDark ? const Color(0xFF1E1E22) : Colors.white,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: context.isDark ? Colors.white10 : Colors.black.withValues(alpha: 0.06)),
                        ),
                        child: Column(
                          children: [
                            Row(
                              children: [
                                Container(
                                  width: 10,
                                  height: 10,
                                  decoration: BoxDecoration(color: AppColors.success, shape: BoxShape.circle),
                                ),
                                const SizedBox(width: 14),
                                Expanded(
                                  child: Text(
                                    widget.tripData['pickup'] ?? 'Current location',
                                    style: TextStyle(color: context.textColor, fontSize: 15, fontWeight: FontWeight.w500),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                              ],
                            ),
                            Padding(
                              padding: const EdgeInsets.only(left: 4),
                              child: Row(
                                children: [
                                  Container(width: 2, height: 20, color: context.isDark ? Colors.white24 : Colors.black12),
                                ],
                              ),
                            ),
                            Row(
                              children: [
                                Container(
                                  width: 10,
                                  height: 10,
                                  decoration: BoxDecoration(color: AppColors.error, shape: BoxShape.circle),
                                ),
                                const SizedBox(width: 14),
                                Expanded(
                                  child: Text(
                                    _dropoff,
                                    style: TextStyle(color: context.textColor, fontSize: 15, fontWeight: FontWeight.w500),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                                GestureDetector(
                                  onTap: () => _showChangeDestinationSheet(),
                                  child: Text('Edit', style: TextStyle(color: AppColors.yellow, fontSize: 14, fontWeight: FontWeight.w600)),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),

                    // Cancel Ride button - only show for accepted/arrived status
                    if (_rideStatus == 'accepted' || _rideStatus == 'arrived')
                      Padding(
                        padding: const EdgeInsets.fromLTRB(24, 8, 24, 8),
                        child: SizedBox(
                          width: double.infinity,
                          child: TextButton(
                            onPressed: () => _showCancelConfirmation(),
                            style: TextButton.styleFrom(
                              foregroundColor: AppColors.error,
                              backgroundColor: AppColors.error.withValues(alpha: 0.1),
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                            ),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(Icons.close_rounded, size: 20),
                                const SizedBox(width: 8),
                                Text('Cancel Ride', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                              ],
                            ),
                          ),
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

  Widget _buildCircleAction(IconData icon, VoidCallback onTap) {
    return GestureDetector(
      onTap: () {
        HapticFeedback.lightImpact();
        onTap();
      },
      child: Container(
        width: 48,
        height: 48,
        decoration: BoxDecoration(
          color: context.isDark ? const Color(0xFF2A2A2E) : Colors.grey[100],
          shape: BoxShape.circle,
        ),
        child: Icon(icon, color: context.textColor, size: 22),
      ),
    );
  }

  Widget _buildActionButton(IconData icon, String label) {
    final Color buttonColor = label == 'Call' ? AppColors.success
        : (label == 'Message' ? AppColors.yellow : const Color(0xFF6366F1));

    return GestureDetector(
      onTap: () {
        HapticFeedback.lightImpact();
        if (label == 'Call') {
          _callDriver();
        } else if (label == 'Message') {
          _messageDriver();
        } else if (label == 'Share') {
          _shareTripDetails();
        }
      },
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 16),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: context.isDark
                ? [const Color(0xFF1E1E22), const Color(0xFF252528)]
                : [Colors.white, const Color(0xFFF8F8FA)],
          ),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: context.isDark ? Colors.white10 : Colors.black.withValues(alpha: 0.06)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.06),
              blurRadius: 12,
              offset: const Offset(0, 3),
            ),
          ],
        ),
        child: Column(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [buttonColor, buttonColor.withValues(alpha: 0.8)],
                ),
                borderRadius: BorderRadius.circular(14),
                boxShadow: [
                  BoxShadow(
                    color: buttonColor.withValues(alpha: 0.4),
                    blurRadius: 10,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Icon(icon, color: Colors.white, size: 24),
            ),
            const SizedBox(height: 10),
            Text(label, style: TextStyle(color: context.textColor, fontSize: 13, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }

  void _messageDriver() {
    final driver = widget.tripData['driver'] as Map<String, dynamic>?;
    final driverProfile = driver?['profile'] as Map<String, dynamic>?;

    // Get driver profile ID from multiple possible sources
    final driverProfileId = widget.tripData['driverProfileId'] as String? ??
        driver?['profile_id'] as String? ??
        driverProfile?['id'] as String?;

    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => ChatScreen(
          driverName: widget.tripData['driverName'] ?? driverProfile?['full_name'] ?? 'Driver',
          driverPhone: widget.tripData['driverPhone'] ?? driverProfile?['phone'] ?? '',
          vehicleNumber: widget.tripData['vehicleNumber'] ?? 'Unknown',
          driverRating: widget.tripData['driverRating']?.toDouble() ?? 0.0,
          rideId: widget.tripData['rideId'] as String?,
          driverUserId: driverProfileId,
        ),
      ),
    );
  }

  void _shareTripDetails() {
    final driverName = _driverName;
    final vehicleNumber = widget.tripData['vehicleNumber'] ?? 'Unknown';
    final message = '''I'm on a trip with MyRide 🚕

Driver: $driverName
Vehicle: $vehicleNumber
From: ${widget.tripData['pickup'] ?? 'Current location'}
To: $_dropoff
ETA: $_etaMinutes min

Track my location:
https://maps.google.com/?q=${_driverLocation.latitude},${_driverLocation.longitude}''';

    Share.share(message, subject: 'My Trip Details');
  }

  void _showChangeDestinationSheet() async {
    String? selectedDestination;
    String? selectedName;
    double? selectedLat;
    double? selectedLng;
    String searchQuery = '';
    bool showMap = false;
    bool isLoading = true;
    LatLng mapLocation = const LatLng(4.1755, 73.5093);
    final searchController = TextEditingController();
    GoogleMapController? googleMapController;

    List<Map<String, dynamic>> allPlaces = [];

    // Load admin locations and user's saved places
    try {
      // Get admin locations
      final adminLocations = await SupabaseService.getLocations();
      for (final loc in adminLocations) {
        double? lat;
        double? lng;
        if (loc['lat'] != null) {
          lat = loc['lat'] is num ? (loc['lat'] as num).toDouble() : double.tryParse(loc['lat'].toString());
        }
        if (loc['lng'] != null) {
          lng = loc['lng'] is num ? (loc['lng'] as num).toDouble() : double.tryParse(loc['lng'].toString());
        }
        if (lat != null && lng != null) {
          allPlaces.add({
            'name': loc['name'] ?? '',
            'address': loc['address'] ?? 'Admin Location',
            'lat': lat,
            'lng': lng,
            'icon': Icons.location_city_rounded,
          });
        }
      }

      // Get user's saved places
      final appState = Provider.of<AppState>(context, listen: false);
      final profileId = appState.profileId;
      if (profileId != null && profileId.isNotEmpty) {
        final savedPlaces = await SupabaseService.client
            .from('saved_places')
            .select()
            .eq('profile_id', profileId)
            .order('created_at', ascending: false);
        for (final place in savedPlaces) {
          double? lat;
          double? lng;
          if (place['lat'] != null) {
            lat = place['lat'] is num ? (place['lat'] as num).toDouble() : double.tryParse(place['lat'].toString());
          }
          if (place['lng'] != null) {
            lng = place['lng'] is num ? (place['lng'] as num).toDouble() : double.tryParse(place['lng'].toString());
          }
          if (lat != null && lng != null) {
            allPlaces.add({
              'name': place['name'] ?? place['label'] ?? 'Saved Place',
              'address': place['address'] ?? 'Saved Location',
              'lat': lat,
              'lng': lng,
              'icon': place['label'] == 'Home' ? Icons.home_rounded : (place['label'] == 'Work' ? Icons.work_rounded : Icons.star_rounded),
            });
          }
        }
      }
    } catch (e) {
      debugPrint('Error loading places: $e');
    }
    isLoading = false;

    if (!mounted) return;

    List<Map<String, dynamic>> googleResults = [];
    bool isSearching = false;
    Timer? searchDebounce;

    Future<void> searchPlaces(String query, void Function(void Function()) setSheetState) async {
      if (query.isEmpty) {
        setSheetState(() {
          googleResults = [];
          isSearching = false;
        });
        return;
      }

      setSheetState(() => isSearching = true);

      try {
        // Restricted to Male/Hulhumale area (15km radius)
        final url = Uri.parse(
          'https://maps.googleapis.com/maps/api/place/autocomplete/json'
          '?input=${Uri.encodeComponent(query)}'
          '&location=4.2000,73.5300'
          '&radius=15000'
          '&strictbounds=true'
          '&components=country:mv'
          '&key=${AppConfig.googleMapsApiKey}'
        );

        final response = await http.get(url);
        if (response.statusCode == 200) {
          final data = json.decode(response.body);
          if (data['status'] == 'OK') {
            final predictions = data['predictions'] as List;
            setSheetState(() {
              googleResults = predictions.map((p) => {
                'place_id': p['place_id'],
                'name': p['structured_formatting']?['main_text'] ?? p['description'],
                'address': p['description'],
                'icon': Icons.location_on_rounded,
                'isGoogle': true,
              }).toList().cast<Map<String, dynamic>>();
              isSearching = false;
            });
          } else {
            setSheetState(() {
              googleResults = [];
              isSearching = false;
            });
          }
        }
      } catch (e) {
        debugPrint('Places search error: $e');
        setSheetState(() => isSearching = false);
      }
    }

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setSheetState) {
          // Filter local places (admin + saved)
          final localMatches = searchQuery.isEmpty
              ? allPlaces
              : allPlaces.where((p) =>
                  (p['name'] as String).toLowerCase().contains(searchQuery.toLowerCase()) ||
                  (p['address'] as String).toLowerCase().contains(searchQuery.toLowerCase())).toList();

          // Combine local matches with Google results
          final filteredPlaces = [...localMatches, ...googleResults];

          return AnimatedContainer(
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeOutCubic,
            height: MediaQuery.of(context).size.height * 0.88,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: context.isDark
                    ? [const Color(0xFF1E1E1E), const Color(0xFF121212)]
                    : [Colors.white, const Color(0xFFF8F9FA)],
              ),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
              boxShadow: [
                BoxShadow(color: Colors.black.withValues(alpha: 0.3), blurRadius: 20, offset: const Offset(0, -5)),
              ],
            ),
            child: Column(
              children: [
                // Handle bar
                Container(
                  margin: const EdgeInsets.only(top: 12),
                  width: 48,
                  height: 5,
                  decoration: BoxDecoration(
                    color: context.isDark ? Colors.white24 : Colors.black12,
                    borderRadius: BorderRadius.circular(3),
                  ),
                ),

                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 20, 24, 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Header with icon
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              gradient: LinearGradient(colors: [AppColors.yellow, AppColors.yellow.withValues(alpha: 0.7)]),
                              borderRadius: BorderRadius.circular(16),
                              boxShadow: [BoxShadow(color: AppColors.yellow.withValues(alpha: 0.3), blurRadius: 12, offset: const Offset(0, 4))],
                            ),
                            child: const Icon(Icons.edit_location_alt_rounded, color: Colors.black, size: 24),
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('Change Destination', style: TextStyle(color: context.textColor, fontSize: 22, fontWeight: FontWeight.w800, letterSpacing: -0.5)),
                                const SizedBox(height: 4),
                                Text('Driver will be notified for approval', style: TextStyle(color: context.mutedColor, fontSize: 14)),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 24),

                      // Modern search bar with toggle
                      Container(
                        padding: const EdgeInsets.all(6),
                        decoration: BoxDecoration(
                          color: context.isDark ? Colors.white.withValues(alpha: 0.08) : Colors.black.withValues(alpha: 0.04),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: context.isDark ? Colors.white10 : Colors.black.withValues(alpha: 0.06)),
                        ),
                        child: Row(
                          children: [
                            Expanded(
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 16),
                                child: Row(
                                  children: [
                                    Icon(Icons.search_rounded, color: context.mutedColor, size: 22),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      child: TextField(
                                        controller: searchController,
                                        style: TextStyle(color: context.textColor, fontSize: 16),
                                        decoration: InputDecoration(
                                          hintText: 'Search places...',
                                          hintStyle: TextStyle(color: context.mutedColor),
                                          border: InputBorder.none,
                                          isDense: true,
                                          contentPadding: const EdgeInsets.symmetric(vertical: 12),
                                        ),
                                        onChanged: (value) {
                                          setSheetState(() => searchQuery = value);
                                          searchDebounce?.cancel();
                                          searchDebounce = Timer(const Duration(milliseconds: 400), () {
                                            searchPlaces(value, setSheetState);
                                          });
                                        },
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                            // Map/List toggle
                            GestureDetector(
                              onTap: () => setSheetState(() => showMap = !showMap),
                              child: AnimatedContainer(
                                duration: const Duration(milliseconds: 200),
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  gradient: showMap
                                      ? LinearGradient(colors: [AppColors.yellow, AppColors.yellow.withValues(alpha: 0.8)])
                                      : null,
                                  color: showMap ? null : Colors.transparent,
                                  borderRadius: BorderRadius.circular(14),
                                  boxShadow: showMap ? [BoxShadow(color: AppColors.yellow.withValues(alpha: 0.3), blurRadius: 8)] : null,
                                ),
                                child: Icon(
                                  showMap ? Icons.list_rounded : Icons.map_rounded,
                                  color: showMap ? Colors.black : context.mutedColor,
                                  size: 22,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // Map or List view
                Expanded(
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 300),
                    child: showMap
                        ? Padding(
                            key: const ValueKey('map'),
                            padding: const EdgeInsets.symmetric(horizontal: 24),
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(24),
                              child: Stack(
                                children: [
                                  GoogleMap(
                                    initialCameraPosition: CameraPosition(target: mapLocation, zoom: 14),
                                    onMapCreated: (controller) => googleMapController = controller,
                                    onTap: (point) {
                                      HapticFeedback.lightImpact();
                                      String nearestName = 'Custom Location';
                                      double minDist = double.infinity;
                                      for (final place in allPlaces) {
                                        final pLat = place['lat'] as double;
                                        final pLng = place['lng'] as double;
                                        final dist = (point.latitude - pLat).abs() + (point.longitude - pLng).abs();
                                        if (dist < minDist && dist < 0.01) {
                                          minDist = dist;
                                          nearestName = 'Near ${place['name']}';
                                        }
                                      }
                                      setSheetState(() {
                                        mapLocation = point;
                                        selectedName = nearestName;
                                        selectedDestination = nearestName;
                                        selectedLat = point.latitude;
                                        selectedLng = point.longitude;
                                      });
                                    },
                                    markers: selectedLat != null ? {
                                      Marker(
                                        markerId: const MarkerId('selected'),
                                        position: LatLng(selectedLat!, selectedLng!),
                                        icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueYellow),
                                      ),
                                    } : {},
                                    myLocationEnabled: true,
                                    myLocationButtonEnabled: false,
                                    zoomControlsEnabled: false,
                                    mapToolbarEnabled: false,
                                    style: context.isDark ? _darkMapStyle : null,
                                  ),
                                  // Tap instruction
                                  Positioned(
                                    top: 16,
                                    left: 16,
                                    right: 16,
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                                      decoration: BoxDecoration(
                                        color: context.isDark ? Colors.black87 : Colors.white,
                                        borderRadius: BorderRadius.circular(12),
                                        boxShadow: [BoxShadow(color: Colors.black26, blurRadius: 8)],
                                      ),
                                      child: Row(
                                        mainAxisSize: MainAxisSize.min,
                                        mainAxisAlignment: MainAxisAlignment.center,
                                        children: [
                                          Icon(Icons.touch_app_rounded, color: AppColors.yellow, size: 18),
                                          const SizedBox(width: 8),
                                          Text('Tap to select location', style: TextStyle(color: context.textColor, fontSize: 13, fontWeight: FontWeight.w500)),
                                        ],
                                      ),
                                    ),
                                  ),
                                  // Selected location card - tap to confirm
                                  if (selectedName != null)
                                    Positioned(
                                      bottom: 16,
                                      left: 16,
                                      right: 16,
                                      child: GestureDetector(
                                        onTap: () {
                                          HapticFeedback.mediumImpact();
                                          Navigator.pop(ctx);
                                          _showWaitingForDriverApproval(selectedName!, selectedName!, lat: selectedLat, lng: selectedLng);
                                        },
                                        child: Container(
                                          padding: const EdgeInsets.all(16),
                                          decoration: BoxDecoration(
                                            gradient: const LinearGradient(
                                              colors: [AppColors.yellow, Color(0xFFFFC107)],
                                              begin: Alignment.topLeft,
                                              end: Alignment.bottomRight,
                                            ),
                                            borderRadius: BorderRadius.circular(16),
                                            boxShadow: [BoxShadow(color: AppColors.yellow.withValues(alpha: 0.4), blurRadius: 12, offset: const Offset(0, 4))],
                                          ),
                                          child: Row(
                                            children: [
                                              Container(
                                                padding: const EdgeInsets.all(10),
                                                decoration: BoxDecoration(
                                                  color: Colors.black.withValues(alpha: 0.15),
                                                  borderRadius: BorderRadius.circular(12),
                                                ),
                                                child: const Icon(Icons.location_on_rounded, color: Colors.black, size: 22),
                                              ),
                                              const SizedBox(width: 14),
                                              Expanded(
                                                child: Column(
                                                  crossAxisAlignment: CrossAxisAlignment.start,
                                                  children: [
                                                    Text(selectedName!, style: const TextStyle(color: Colors.black, fontSize: 15, fontWeight: FontWeight.w700)),
                                                    const SizedBox(height: 2),
                                                    Text('Tap to confirm destination', style: TextStyle(color: Colors.black.withValues(alpha: 0.7), fontSize: 12)),
                                                  ],
                                                ),
                                              ),
                                              const Icon(Icons.send_rounded, color: Colors.black, size: 24),
                                            ],
                                          ),
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                            ),
                          )
                        : isSearching
                            ? Center(
                                key: const ValueKey('loading'),
                                child: Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    SizedBox(
                                      width: 32,
                                      height: 32,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 3,
                                        valueColor: AlwaysStoppedAnimation(AppColors.yellow),
                                      ),
                                    ),
                                    const SizedBox(height: 16),
                                    Text('Searching...', style: TextStyle(color: context.mutedColor)),
                                  ],
                                ),
                              )
                            : filteredPlaces.isEmpty
                                ? Center(
                                    key: const ValueKey('empty'),
                                    child: Column(
                                      mainAxisAlignment: MainAxisAlignment.center,
                                      children: [
                                        Icon(Icons.search_off_rounded, color: context.mutedColor, size: 48),
                                        const SizedBox(height: 16),
                                        Text('No places found', style: TextStyle(color: context.mutedColor, fontSize: 16)),
                                        const SizedBox(height: 8),
                                        Text('Try a different search or use the map', style: TextStyle(color: context.mutedColor.withValues(alpha: 0.7), fontSize: 14)),
                                      ],
                                    ),
                                  )
                                : ListView.builder(
                            key: const ValueKey('list'),
                            padding: const EdgeInsets.symmetric(horizontal: 20),
                            itemCount: filteredPlaces.length,
                            itemBuilder: (context, index) {
                              final place = filteredPlaces[index];
                              final isSelected = selectedDestination == place['name'];
                              return TweenAnimationBuilder<double>(
                                tween: Tween(begin: 0.0, end: 1.0),
                                duration: Duration(milliseconds: 150 + (index * 30)),
                                curve: Curves.easeOutCubic,
                                builder: (context, value, child) => Transform.translate(
                                  offset: Offset(0, 15 * (1 - value)),
                                  child: Opacity(opacity: value, child: child),
                                ),
                                child: GestureDetector(
                                  onTap: () async {
                                    HapticFeedback.lightImpact();

                                    // For Google results, fetch coordinates first
                                    if (place['isGoogle'] == true && place['place_id'] != null) {
                                      try {
                                        final detailsUrl = Uri.parse(
                                          'https://maps.googleapis.com/maps/api/place/details/json'
                                          '?place_id=${place['place_id']}'
                                          '&fields=geometry'
                                          '&key=${AppConfig.googleMapsApiKey}'
                                        );
                                        final response = await http.get(detailsUrl);
                                        if (response.statusCode == 200) {
                                          final data = json.decode(response.body);
                                          if (data['status'] == 'OK') {
                                            final location = data['result']['geometry']['location'];
                                            setSheetState(() {
                                              selectedDestination = place['name'];
                                              selectedName = place['name'];
                                              selectedLat = location['lat'];
                                              selectedLng = location['lng'];
                                            });
                                          }
                                        }
                                      } catch (e) {
                                        debugPrint('Error fetching place details: $e');
                                      }
                                    } else {
                                      // Local place already has coordinates
                                      setSheetState(() {
                                        selectedDestination = place['name'];
                                        selectedName = place['name'];
                                        selectedLat = place['lat'];
                                        selectedLng = place['lng'];
                                      });
                                    }
                                  },
                                  child: AnimatedContainer(
                                    duration: const Duration(milliseconds: 200),
                                    margin: const EdgeInsets.only(bottom: 10),
                                    padding: const EdgeInsets.all(14),
                                    decoration: BoxDecoration(
                                      gradient: isSelected
                                          ? LinearGradient(
                                              colors: [AppColors.yellow.withValues(alpha: 0.15), AppColors.yellow.withValues(alpha: 0.05)],
                                              begin: Alignment.topLeft,
                                              end: Alignment.bottomRight,
                                            )
                                          : null,
                                      color: isSelected ? null : context.cardColor,
                                      borderRadius: BorderRadius.circular(16),
                                      border: Border.all(
                                        color: isSelected ? AppColors.yellow.withValues(alpha: 0.5) : context.borderColor,
                                        width: isSelected ? 1.5 : 1,
                                      ),
                                      boxShadow: isSelected ? [
                                        BoxShadow(color: AppColors.yellow.withValues(alpha: 0.15), blurRadius: 16, offset: const Offset(0, 4)),
                                      ] : null,
                                    ),
                                    child: Row(
                                      children: [
                                        AnimatedContainer(
                                          duration: const Duration(milliseconds: 200),
                                          width: 48,
                                          height: 48,
                                          decoration: BoxDecoration(
                                            gradient: isSelected
                                                ? const LinearGradient(
                                                    colors: [AppColors.yellow, Color(0xFFFFC107)],
                                                    begin: Alignment.topLeft,
                                                    end: Alignment.bottomRight,
                                                  )
                                                : null,
                                            color: isSelected ? null : context.bgColor,
                                            borderRadius: BorderRadius.circular(14),
                                            boxShadow: isSelected ? [
                                              BoxShadow(color: AppColors.yellow.withValues(alpha: 0.3), blurRadius: 8, offset: const Offset(0, 2)),
                                            ] : null,
                                          ),
                                          child: Icon(
                                            place['icon'],
                                            color: isSelected ? Colors.black : context.mutedColor,
                                            size: 22,
                                          ),
                                        ),
                                        const SizedBox(width: 14),
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment: CrossAxisAlignment.start,
                                            children: [
                                              Text(
                                                place['name'],
                                                style: TextStyle(
                                                  color: context.textColor,
                                                  fontSize: 15,
                                                  fontWeight: FontWeight.w700,
                                                  letterSpacing: -0.3,
                                                ),
                                              ),
                                              const SizedBox(height: 3),
                                              Text(
                                                place['address'],
                                                style: TextStyle(
                                                  color: context.mutedColor,
                                                  fontSize: 12,
                                                ),
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                              ),
                                            ],
                                          ),
                                        ),
                                        const SizedBox(width: 8),
                                        AnimatedContainer(
                                          duration: const Duration(milliseconds: 200),
                                          width: 24,
                                          height: 24,
                                          decoration: BoxDecoration(
                                            gradient: isSelected
                                                ? const LinearGradient(colors: [AppColors.yellow, Color(0xFFFFC107)])
                                                : null,
                                            color: isSelected ? null : Colors.transparent,
                                            shape: BoxShape.circle,
                                            border: Border.all(
                                              color: isSelected ? Colors.transparent : context.borderColor,
                                              width: 1.5,
                                            ),
                                          ),
                                          child: isSelected
                                              ? const Icon(Icons.check_rounded, color: Colors.black, size: 16)
                                              : null,
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              );
                            },
                          ),
                  ),
                ),

                // Bottom button
                Container(
                  padding: EdgeInsets.fromLTRB(20, 12, 20, MediaQuery.of(ctx).padding.bottom + 16),
                  decoration: BoxDecoration(
                    color: context.cardColor,
                    border: Border(top: BorderSide(color: context.borderColor, width: 0.5)),
                  ),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    width: double.infinity,
                    height: 56,
                    decoration: BoxDecoration(
                      gradient: selectedDestination != null
                          ? const LinearGradient(
                              colors: [AppColors.yellow, Color(0xFFFFC107)],
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                            )
                          : null,
                      color: selectedDestination == null ? context.bgColor : null,
                      borderRadius: BorderRadius.circular(16),
                      boxShadow: selectedDestination != null ? [
                        BoxShadow(color: AppColors.yellow.withValues(alpha: 0.4), blurRadius: 16, offset: const Offset(0, 4)),
                      ] : null,
                    ),
                    child: Material(
                      color: Colors.transparent,
                      child: InkWell(
                        onTap: selectedDestination != null ? () {
                          HapticFeedback.mediumImpact();
                          Navigator.pop(ctx);
                          _showWaitingForDriverApproval(selectedName!, selectedName!, lat: selectedLat, lng: selectedLng);
                        } : null,
                        borderRadius: BorderRadius.circular(16),
                        child: Center(
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(
                                selectedDestination != null ? Icons.send_rounded : Icons.touch_app_rounded,
                                size: 20,
                                color: selectedDestination != null ? Colors.black : context.mutedColor,
                              ),
                              const SizedBox(width: 10),
                              Text(
                                selectedDestination != null ? 'Confirm Destination' : 'Select a destination',
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w700,
                                  color: selectedDestination != null ? Colors.black : context.mutedColor,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  void _showWaitingForDriverApproval(String newDestination, String destinationName, {double? lat, double? lng}) async {
    final rideId = widget.tripData['rideId'] as String?;
    if (rideId == null) return;

    // Use provided coordinates or defaults
    final newLat = lat ?? 4.1755;
    final newLng = lng ?? 73.5093;

    final sent = await SupabaseService.requestDestinationChange(
      rideId: rideId,
      newDestinationName: destinationName,
      newLat: newLat,
      newLng: newLng,
    );

    if (!sent) {
      if (mounted) {
        AppSnackbar.error(context, 'Failed to send request');
      }
      return;
    }

    // Show waiting dialog and poll for response
    Timer? pollTimer;
    bool dialogClosed = false;

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) {
        // Start polling for driver response
        pollTimer = Timer.periodic(const Duration(seconds: 2), (timer) async {
          if (dialogClosed) {
            timer.cancel();
            return;
          }
          final status = await SupabaseService.getDestinationChangeStatus(rideId);
          if (status == 'approved') {
            timer.cancel();
            dialogClosed = true;
            if (Navigator.canPop(ctx)) {
              Navigator.pop(ctx);
              _showDriverAcceptedChange(destinationName, destinationName);
            }
          } else if (status == 'rejected') {
            timer.cancel();
            dialogClosed = true;
            if (Navigator.canPop(ctx)) {
              Navigator.pop(ctx);
              _showDriverRejectedChange(destinationName);
            }
          }
        });

        return Dialog(
          backgroundColor: context.surfaceColor,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                SizedBox(
                  width: 60,
                  height: 60,
                  child: CircularProgressIndicator(
                    color: AppColors.yellow,
                    strokeWidth: 3,
                  ),
                ),
                const SizedBox(height: 20),
                Text('Requesting Change', style: TextStyle(color: context.textColor, fontSize: 18, fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                Text('Waiting for ${widget.tripData['driverName'] ?? 'driver'} to accept...', textAlign: TextAlign.center, style: TextStyle(color: context.mutedColor, fontSize: 14)),
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: context.isDark ? AppColors.bgDark : Colors.white,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.location_on, color: AppColors.yellow, size: 20),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('New destination', style: TextStyle(color: context.mutedColor, fontSize: 11)),
                            Text(destinationName, style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w600)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  height: 46,
                  child: OutlinedButton(
                    onPressed: () {
                      dialogClosed = true;
                      pollTimer?.cancel();
                      Navigator.pop(ctx);
                    },
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.red,
                      side: BorderSide(color: Colors.red.withValues(alpha: 0.5)),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: Text('Cancel Request', style: TextStyle(fontWeight: FontWeight.w600, color: Colors.red)),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    ).then((_) {
      dialogClosed = true;
      pollTimer?.cancel();
    });
  }

  void _showDriverRejectedChange(String destinationName) {
    HapticFeedback.heavyImpact();
    showDialog(
      context: context,
      builder: (ctx) => Dialog(
        backgroundColor: context.surfaceColor,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 70,
                height: 70,
                decoration: BoxDecoration(color: Colors.red.withValues(alpha: 0.15), shape: BoxShape.circle),
                child: Icon(Icons.close, color: Colors.red, size: 36),
              ),
              const SizedBox(height: 20),
              Text('Request Declined', style: TextStyle(color: context.textColor, fontSize: 18, fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              Text('Driver declined the destination change to $destinationName', textAlign: TextAlign.center, style: TextStyle(color: context.mutedColor, fontSize: 14)),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton(
                  onPressed: () => Navigator.pop(ctx),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.yellow,
                    foregroundColor: Colors.black,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                  child: Text('OK', style: TextStyle(fontWeight: FontWeight.w700)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showDriverAcceptedChange(String newDestination, String destinationName) {
    HapticFeedback.heavyImpact();
    setState(() => _dropoff = newDestination);

    showDialog(
      context: context,
      builder: (ctx) {
        Future.delayed(const Duration(seconds: 2), () {
          if (Navigator.canPop(ctx)) Navigator.pop(ctx);
        });

        return Dialog(
          backgroundColor: context.surfaceColor,
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
                    color: AppColors.success.withValues(alpha: 0.15),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(Icons.check_circle, color: AppColors.success, size: 36),
                ),
                const SizedBox(height: 16),
                Text('Driver Accepted', style: TextStyle(color: context.textColor, fontSize: 18, fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                Text('Destination changed to $destinationName', textAlign: TextAlign.center, style: TextStyle(color: context.mutedColor, fontSize: 14)),
              ],
            ),
          ),
        );
      },
    );
  }

  void _showSOSOptions() {
    HapticFeedback.heavyImpact();
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Container(
        padding: EdgeInsets.fromLTRB(24, 24, 24, MediaQuery.of(ctx).padding.bottom + 24),
        decoration: BoxDecoration(
          color: context.surfaceColor,
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(width: 40, height: 4, decoration: BoxDecoration(color: context.borderColor, borderRadius: BorderRadius.circular(2))),
            const SizedBox(height: 20),
            Container(
              width: 60,
              height: 60,
              decoration: BoxDecoration(
                color: AppColors.error.withValues(alpha: 0.15),
                shape: BoxShape.circle,
              ),
              child: Icon(Icons.sos, color: AppColors.error, size: 30),
            ),
            const SizedBox(height: 12),
            Text('Emergency Options', style: TextStyle(color: context.textColor, fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Text('Get help immediately', style: TextStyle(color: context.mutedColor, fontSize: 13)),
            const SizedBox(height: 20),
            // Main SOS activation button - press and hold
            _SOSHoldButton(
              onActivate: () async {
                Navigator.pop(ctx);
                await _activateSOS();
              },
            ),
            const SizedBox(height: 16),
            Text('Or choose an option:', style: TextStyle(color: context.mutedColor, fontSize: 12)),
            const SizedBox(height: 12),
            _buildSOSOption(ctx, Icons.phone, 'Call Emergency (119)', AppColors.error, () async {
              Navigator.pop(ctx);
              await _callEmergency();
            }),
            const SizedBox(height: 10),
            _buildSOSOption(ctx, Icons.share_location, 'Share Live Location', AppColors.yellow, () {
              Navigator.pop(ctx);
              _shareLocation();
            }),
            const SizedBox(height: 10),
            _buildSOSOption(ctx, Icons.group, 'Alert Emergency Contacts', AppColors.success, () {
              Navigator.pop(ctx);
              _alertEmergencyContacts();
            }),
            const SizedBox(height: 10),
            _buildSOSOption(ctx, Icons.phone_callback, 'Call Driver', Colors.blue, () async {
              Navigator.pop(ctx);
              await _callDriver();
            }),
          ],
        ),
      ),
    );
  }

  Future<void> _activateSOS() async {
    HapticFeedback.heavyImpact();

    // Send SOS alert to admin
    await SupabaseService.triggerSOSAlert(
      latitude: _driverLocation.latitude,
      longitude: _driverLocation.longitude,
      rideId: widget.tripData['rideId'] as String?,
    );

    // Show notification
    NotificationService.showNotification(
      title: '🚨 SOS ACTIVATED',
      body: 'Emergency services have been notified. Help is on the way.',
    );

    // Show confirmation
    _showSOSConfirmed('SOS alert sent to control room');
  }

  Future<void> _callEmergency() async {
    final Uri phoneUri = Uri(scheme: 'tel', path: '119');
    try {
      if (await canLaunchUrl(phoneUri)) {
        await launchUrl(phoneUri);
      } else {
        _showSOSConfirmed('Could not open phone dialer');
      }
    } catch (e) {
      _showSOSConfirmed('Error calling emergency: $e');
    }
  }

  Future<void> _callDriver() async {
    final driverPhone = widget.tripData['driverPhone'] ?? '+960 7771234';
    final Uri phoneUri = Uri(scheme: 'tel', path: driverPhone.replaceAll(' ', ''));
    try {
      if (await canLaunchUrl(phoneUri)) {
        await launchUrl(phoneUri);
      } else {
        _showSOSConfirmed('Could not open phone dialer');
      }
    } catch (e) {
      _showSOSConfirmed('Error calling driver');
    }
  }

  void _shareLocation() {
    final driverName = _driverName;
    final vehicleNumber = widget.tripData['vehicleNumber'] ?? 'Unknown';
    final message = '''🆘 EMERGENCY - I need help!

I'm currently on a trip with MyRide.

Driver: $driverName
Vehicle: $vehicleNumber
Pickup: ${widget.tripData['pickup'] ?? 'Current location'}
Dropoff: $_dropoff

My current location:
https://maps.google.com/?q=${_driverLocation.latitude},${_driverLocation.longitude}

Please contact me or emergency services (119) if needed.''';

    Share.share(message, subject: 'Emergency - My Location');
    _showSOSConfirmed('Location shared');
  }

  void _alertEmergencyContacts() {
    final appState = Provider.of<AppState>(context, listen: false);
    final contacts = appState.emergencyContacts;

    if (contacts.isEmpty) {
      _showNoContactsDialog();
      return;
    }

    final driverName = _driverName;
    final vehicleNumber = widget.tripData['vehicleNumber'] ?? 'Unknown';
    final message = '''🆘 EMERGENCY ALERT from MyRide

I'm on a trip and may need assistance.

Driver: $driverName
Vehicle: $vehicleNumber
Route: ${widget.tripData['pickup'] ?? 'Current location'} → $_dropoff

Location: https://maps.google.com/?q=${_driverLocation.latitude},${_driverLocation.longitude}''';

    // Show confirmation that contacts will be alerted
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.surfaceColor,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text('Alert Contacts?', style: TextStyle(color: context.textColor)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('This will send an SMS to:', style: TextStyle(color: context.mutedColor)),
            const SizedBox(height: 12),
            ...contacts.map((c) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                children: [
                  Icon(Icons.person, color: AppColors.yellow, size: 18),
                  const SizedBox(width: 8),
                  Text('${c['name']} (${c['phone']})', style: TextStyle(color: context.textColor, fontSize: 14)),
                ],
              ),
            )),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text('Cancel', style: TextStyle(color: context.mutedColor)),
          ),
          ElevatedButton(
            onPressed: () async {
              Navigator.pop(ctx);
              // Send SMS to each contact
              for (final contact in contacts) {
                final phone = contact['phone']?.replaceAll(' ', '') ?? '';
                // iOS uses & separator, Android uses ?
                // Using Uri.encodeComponent properly encodes spaces as %20
                final encodedMessage = Uri.encodeComponent(message);
                final smsUrl = Platform.isIOS
                    ? 'sms:$phone&body=$encodedMessage'
                    : 'sms:$phone?body=$encodedMessage';
                final Uri smsUri = Uri.parse(smsUrl);
                try {
                  await launchUrl(smsUri);
                } catch (e) {
                  // Continue to next contact
                }
              }
              _showSOSConfirmed('Emergency contacts alerted');
            },
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.error, foregroundColor: Colors.white),
            child: Text('Send Alert'),
          ),
        ],
      ),
    );
  }

  void _showNoContactsDialog() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.surfaceColor,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text('No Emergency Contacts', style: TextStyle(color: context.textColor)),
        content: Text('Add emergency contacts in your profile settings to use this feature.', style: TextStyle(color: context.mutedColor)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text('OK', style: TextStyle(color: AppColors.yellow)),
          ),
        ],
      ),
    );
  }

  Widget _buildSOSOption(BuildContext ctx, IconData icon, String label, Color color, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: color.withValues(alpha: 0.3)),
        ),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, color: color, size: 22),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Text(label, style: TextStyle(color: context.textColor, fontSize: 15, fontWeight: FontWeight.w600)),
            ),
            Icon(Icons.chevron_right, color: color, size: 22),
          ],
        ),
      ),
    );
  }

  void _showSOSConfirmed(String message) {
    HapticFeedback.heavyImpact();
    AppSnackbar.success(context, message);
  }

  void _showCancelConfirmation() {
    // Don't allow cancel if trip is in progress
    if (_rideStatus == 'in_progress') {
      AppSnackbar.error(context, 'Cannot cancel', subtitle: 'Trip is already in progress');
      return;
    }

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Container(
        padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(ctx).padding.bottom + 20),
        decoration: BoxDecoration(
          color: ctx.isDark ? const Color(0xFF1C1C1E) : Colors.white,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(color: Colors.grey.shade400, borderRadius: BorderRadius.circular(2)),
            ),
            const SizedBox(height: 20),
            Icon(Icons.warning_amber_rounded, color: AppColors.error, size: 48),
            const SizedBox(height: 16),
            Text('Cancel Ride?', style: TextStyle(color: ctx.textColor, fontSize: 20, fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            Text(
              'Are you sure you want to cancel this ride?',
              style: TextStyle(color: ctx.mutedColor, fontSize: 15),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            Row(
              children: [
                Expanded(
                  child: TextButton(
                    onPressed: () => Navigator.pop(ctx),
                    style: TextButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: Text('Keep Ride', style: TextStyle(color: ctx.mutedColor, fontSize: 16, fontWeight: FontWeight.w600)),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton(
                    onPressed: () {
                      Navigator.pop(ctx);
                      _confirmCancel();
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.error,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: const Text('Cancel Ride', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600)),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  void _confirmCancel() async {
    final rideId = widget.tripData['rideId'] as String?;
    if (rideId == null) {
      Navigator.of(context).pushNamedAndRemoveUntil('/home', (route) => false);
      return;
    }

    try {
      await SupabaseService.client
          .from('rides')
          .update({'status': 'cancelled', 'cancelled_at': DateTime.now().toIso8601String()})
          .eq('id', rideId);

      _statusPollingTimer?.cancel();
      _driverLocationSubscription?.cancel();

      if (mounted) {
        AppSnackbar.success(context, 'Ride cancelled');
        Navigator.of(context).pushNamedAndRemoveUntil('/home', (route) => false);
      }
    } catch (e) {
      debugPrint('Error cancelling ride: $e');
      if (mounted) {
        AppSnackbar.error(context, 'Failed to cancel ride');
      }
    }
  }
}

class _SOSHoldButton extends StatefulWidget {
  final VoidCallback onActivate;

  const _SOSHoldButton({required this.onActivate});

  @override
  State<_SOSHoldButton> createState() => _SOSHoldButtonState();
}

class _SOSHoldButtonState extends State<_SOSHoldButton> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  bool _isHolding = false;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    );
    _controller.addStatusListener((status) {
      if (status == AnimationStatus.completed) {
        HapticFeedback.heavyImpact();
        widget.onActivate();
      }
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onTapDown(TapDownDetails details) {
    setState(() => _isHolding = true);
    HapticFeedback.mediumImpact();
    _controller.forward();
  }

  void _onTapUp(TapUpDetails details) {
    setState(() => _isHolding = false);
    _controller.reset();
  }

  void _onTapCancel() {
    setState(() => _isHolding = false);
    _controller.reset();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: _onTapDown,
      onTapUp: _onTapUp,
      onTapCancel: _onTapCancel,
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, child) {
          return Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 16),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [AppColors.error, AppColors.error.withValues(alpha: 0.8)],
              ),
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(
                  color: AppColors.error.withValues(alpha: _isHolding ? 0.6 : 0.4),
                  blurRadius: _isHolding ? 20 : 12,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Stack(
              children: [
                // Progress indicator
                Positioned.fill(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(16),
                    child: LinearProgressIndicator(
                      value: _controller.value,
                      backgroundColor: Colors.transparent,
                      valueColor: AlwaysStoppedAnimation<Color>(Colors.white.withValues(alpha: 0.3)),
                    ),
                  ),
                ),
                // Button content
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.warning_amber, color: Colors.white, size: 24),
                    const SizedBox(width: 10),
                    Column(
                      children: [
                        Text('HOLD TO ACTIVATE SOS', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w700)),
                        if (_isHolding)
                          Text('${(2 - _controller.value * 2).toStringAsFixed(1)}s', style: TextStyle(color: Colors.white70, fontSize: 12)),
                      ],
                    ),
                  ],
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
