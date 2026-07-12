import 'dart:async';
import 'dart:convert';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
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
import '../utils/marker_animation.dart';
import '../widgets/status_animation.dart';
import '../widgets/app_notification_banner.dart';
import '../widgets/app_snackbar.dart';
import 'trip_tracking_screen.dart';
import 'trip_complete_screen.dart';
import 'chat_screen.dart';
import '../services/app_settings_service.dart';

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

class DriverArrivingScreen extends StatefulWidget {
  final String pickup;
  final String dropoff;
  final String rideType;
  final String driverName;
  final double driverRating;
  final String vehicleNumber;
  final String vehicleModel;
  final String driverPhone;
  final String? driverPhoto;
  final String? driverProfileId;
  final String? driverId;
  final int eta;
  final String? rideId;
  final double? pickupLat;
  final double? pickupLng;
  final double? dropoffLat;
  final double? dropoffLng;

  const DriverArrivingScreen({
    super.key,
    required this.pickup,
    required this.dropoff,
    required this.rideType,
    required this.driverName,
    required this.driverRating,
    required this.vehicleNumber,
    required this.vehicleModel,
    required this.driverPhone,
    this.driverPhoto,
    this.driverProfileId,
    this.driverId,
    required this.eta,
    this.rideId,
    this.pickupLat,
    this.pickupLng,
    this.dropoffLat,
    this.dropoffLng,
  });

  @override
  State<DriverArrivingScreen> createState() => _DriverArrivingScreenState();
}

class _DriverArrivingScreenState extends State<DriverArrivingScreen> with SingleTickerProviderStateMixin {
  late Timer _etaTimer;
  Timer? _statusPollingTimer;
  Timer? _chatPollingTimer;
  String? _lastDriverMsgId;
  int _currentEta = 0;
  late LatLng _pickupLocation;
  late LatLng _driverLocation;
  late VehicleMarkerState _vehicleState;
  late AnimationController _markerAnimController;
  StreamSubscription<Map<String, dynamic>>? _rideSubscription;
  StreamSubscription<Map<String, dynamic>>? _driverLocationSubscription;
  bool _driverArrived = false;
  bool _tripStarted = false;
  GoogleMapController? _mapController;
  final _realtimeService = RealtimeService();
  List<LatLng> _routePoints = [];
  bool _trafficEnabled = false;
  MapType _mapType = MapType.normal;
  BitmapDescriptor? _pickupIcon;
  BitmapDescriptor? _carIcon;

  // Animation interpolation state
  LatLng _animStartPos = const LatLng(0, 0);
  LatLng _animEndPos = const LatLng(0, 0);
  double _animStartBearing = 0;
  double _animEndBearing = 0;

  bool _isValidMaldivesCoord(double lat, double lng) {
    return lat >= -0.7 && lat <= 7.1 && lng >= 72.6 && lng <= 73.8;
  }

  Future<void> _fetchRoute() async {
    try {
      final url = 'https://maps.googleapis.com/maps/api/directions/json'
          '?origin=${_driverLocation.latitude},${_driverLocation.longitude}'
          '&destination=${_pickupLocation.latitude},${_pickupLocation.longitude}'
          '&key=${AppConfig.googleMapsApiKey}';

      debugPrint('Fetching route: $url');
      final response = await http.get(Uri.parse(url));
      debugPrint('Route response: ${response.statusCode}');

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        debugPrint('API status: ${data['status']}');

        if (data['status'] == 'OK' && data['routes'] != null && data['routes'].isNotEmpty) {
          final route = data['routes'][0];
          final polyline = route['overview_polyline']['points'];
          final points = _decodePolyline(polyline);
          debugPrint('Decoded ${points.length} route points');

          final leg = route['legs'][0];
          final durationValue = leg['duration']['value'] as int?;

          if (mounted) {
            setState(() {
              _routePoints = points;
              if (durationValue != null) {
                _currentEta = (durationValue / 60).ceil();
              }
            });
          }
        } else {
          debugPrint('Route API error: ${data['status']}');
          if (mounted) {
            setState(() {
              _routePoints = [_driverLocation, _pickupLocation];
            });
          }
        }
      }
    } catch (e) {
      debugPrint('Error fetching route: $e');
      if (mounted) {
        setState(() {
          _routePoints = [_driverLocation, _pickupLocation];
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

  Future<void> _loadPickupIcon() async {
    _pickupIcon = await _createPinIcon('A', const Color(0xFF22C55E));
    if (mounted) setState(() {});
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

  @override
  void initState() {
    super.initState();
    _currentEta = widget.eta;

    _markerAnimController = AnimationController(
      duration: const Duration(milliseconds: 1000),
      vsync: this,
    );

    // Use passed coordinates or default to Male center
    final pLat = widget.pickupLat ?? 4.1755;
    final pLng = widget.pickupLng ?? 73.5093;

    _pickupLocation = _isValidMaldivesCoord(pLat, pLng)
        ? LatLng(pLat, pLng)
        : const LatLng(4.1755, 73.5093);
    _driverLocation = LatLng(_pickupLocation.latitude + 0.008, _pickupLocation.longitude + 0.005);
    _vehicleState = VehicleMarkerState(currentPosition: _driverLocation);
    _startEtaCountdown();
    _subscribeToRideUpdates();
    _subscribeToDriverLocation();
    _startStatusPolling(); // Backup polling
    _fetchRoute();
    _loadPickupIcon();
    _loadCarIcon();

    // Poll for chat messages directly
    if (widget.rideId != null) {
      _loadInitialChatState();
      Future.delayed(const Duration(seconds: 2), () {
        if (mounted) _startChatPolling();
      });
    }
  }

  void _startChatPolling() {
    _chatPollingTimer = Timer.periodic(const Duration(seconds: 2), (_) async {
      if (widget.rideId == null) return;
      try {
        final messages = await SupabaseService.getChatMessages(widget.rideId!);

        // Find latest driver message
        String? latestId;
        String? latestText;
        for (final msg in messages) {
          if (msg['sender_type'] == 'driver') {
            latestId = msg['id']?.toString();
            latestText = msg['message'] as String?;
          }
        }

        // If new driver message found
        if (latestId != null && latestId != _lastDriverMsgId && latestText != null && latestText.isNotEmpty && mounted) {
          _lastDriverMsgId = latestId;
          NotificationService.showNotification(
            title: 'New message from Driver',
            body: latestText,
          );
        }
      } catch (e) {
        // ignore
      }
    });

    // Load initial last message ID
    _loadInitialChatState();
  }

  Future<void> _loadInitialChatState() async {
    if (widget.rideId == null) return;
    try {
      final messages = await SupabaseService.getChatMessages(widget.rideId!);
      for (final msg in messages.reversed) {
        if (msg['sender_type'] == 'driver') {
          _lastDriverMsgId = msg['id']?.toString();
          break;
        }
      }
    } catch (e) {
      // ignore
    }
  }

  void _subscribeToDriverLocation() async {
    if (widget.driverId == null) return;

    // Subscribe to realtime location updates using RealtimeService
    _driverLocationSubscription = _realtimeService
        .subscribeToDriverLocation(widget.driverId!)
        .listen((data) {
      if (mounted) {
        final lat = data['lat'] as double?;
        final lng = data['lng'] as double?;
        if (lat != null && lng != null && _isValidMaldivesCoord(lat, lng)) {
          final newPos = LatLng(lat, lng);
          _driverLocation = newPos;
          _animateDriverPosition(newPos);
          // Refresh route when driver moves
          _fetchRoute();
          // Move camera to follow driver
          _mapController?.animateCamera(CameraUpdate.newLatLng(newPos));
        }
      }
    });

    // Fetch initial location from drivers table (more reliable)
    try {
      final response = await SupabaseService.client
          .from('drivers')
          .select('current_location_lat, current_location_lng')
          .eq('id', widget.driverId!)
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

  void _subscribeToRideUpdates() {
    if (widget.rideId == null) return;

    _rideSubscription = _realtimeService.subscribeToRide(widget.rideId!).listen((update) {
      _handleStatusUpdate(update['status'] as String?);
    });
  }

  void _startStatusPolling() {
    if (widget.rideId == null) return;

    _statusPollingTimer = Timer.periodic(const Duration(seconds: 2), (_) async {
      // Only stop polling when trip has started, NOT when driver arrives
      if (!mounted || _tripStarted) return;

      try {
        final ride = await SupabaseService.getRideById(widget.rideId!);
        if (ride != null && mounted) {
          final status = ride['status'] as String?;
          debugPrint('Polling ride status: $status');
          _handleStatusUpdate(status);
        }
      } catch (e) {
        debugPrint('Polling error: $e');
      }
    });
  }

  void _handleStatusUpdate(String? status) {
    if (!mounted || _tripStarted) return;

    debugPrint('Ride status updated: $status');

    if (status == 'arrived' && !_driverArrived) {
      _etaTimer.cancel();
      // Don't cancel polling here - need to detect when trip starts
      _onDriverArrived(); // This sets _driverArrived = true and shows notification
    } else if (status == 'in_progress' && !_tripStarted) {
      _tripStarted = true;
      _etaTimer.cancel();
      _statusPollingTimer?.cancel();
      // Show notification
      NotificationService().showTripStartedNotification(
        destination: widget.dropoff,
        eta: '15 min',
      );
      // Driver started the trip
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => TripTrackingScreen(
            tripData: {
              'pickup': widget.pickup,
              'dropoff': widget.dropoff,
              'driverName': widget.driverName,
              'vehicleNumber': widget.vehicleNumber,
              'driverPhone': widget.driverPhone,
              'driverProfileId': widget.driverProfileId,
              'driver': {'id': widget.driverId},
              'rideId': widget.rideId,
              'status': 'in_progress',
            },
          ),
        ),
      );
    } else if (status == 'completed' && !_tripStarted) {
      _tripStarted = true;
      _etaTimer.cancel();
      _statusPollingTimer?.cancel();
      // Trip completed (skip straight to complete screen)
      NotificationService().showTripCompletedNotification(destination: widget.dropoff);
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => TripCompleteScreen(
            destination: widget.dropoff,
            rideId: widget.rideId,
            driverName: widget.driverName,
            vehicleNumber: widget.vehicleNumber,
          ),
        ),
      );
    } else if (status == 'cancelled') {
      _statusPollingTimer?.cancel();
      AppSnackbar.error(context, 'Ride was cancelled');
      Navigator.of(context).pushNamedAndRemoveUntil('/home', (route) => false);
    }
  }

  void _startEtaCountdown() {
    _etaTimer = Timer.periodic(const Duration(seconds: 3), (timer) {
      if (!mounted || _driverArrived || _tripStarted) return;
      if (_currentEta > 1) {
        setState(() {
          _currentEta--;
          _driverLocation = LatLng(
            _driverLocation.latitude - 0.002,
            _driverLocation.longitude - 0.00125,
          );
        });
      }
      // Don't auto-trigger - wait for actual status change from database
    });
  }

  void _onDriverArrived() {
    if (_driverArrived) return;
    setState(() {
      _driverArrived = true;
      _etaTimer.cancel(); // Stop ETA countdown
    });
    HapticFeedback.heavyImpact();

    // Send push notification (wrapped in try-catch for macOS compatibility)
    try {
      NotificationService().showDriverArrivedNotification(
        driverName: widget.driverName,
        vehicle: widget.vehicleNumber,
      );
    } catch (e) {
      debugPrint('Notification error: $e');
    }

    // Show modern in-app banner (blue for driver arrived)
    if (mounted) {
      AppNotificationBanner.show(
        context,
        title: 'Driver Arrived',
        message: '${widget.driverName} has arrived at pickup location',
        type: NotificationType.info,
      );
    }
  }

  void _animateDriverPosition(LatLng newPosition) {
    final distance = calculateDistance(_vehicleState.currentPosition, newPosition);
    if (distance < 1.0) return;

    _vehicleState.updateTarget(newPosition);

    _animStartPos = _vehicleState.currentPosition;
    _animEndPos = _vehicleState.targetPosition;
    _animStartBearing = _vehicleState.currentBearing;
    _animEndBearing = _vehicleState.targetBearing;

    _markerAnimController.reset();
    _markerAnimController.removeListener(_onAnimationTick);
    _markerAnimController.addListener(_onAnimationTick);
    _markerAnimController.forward();
  }

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
    _etaTimer.cancel();
    _statusPollingTimer?.cancel();
    _chatPollingTimer?.cancel();
    _rideSubscription?.cancel();
    _driverLocationSubscription?.cancel();
    if (widget.rideId != null) {
      _realtimeService.unsubscribe('ride_${widget.rideId}');
    }
    if (widget.driverId != null) {
      _realtimeService.unsubscribe('driver_location_${widget.driverId}');
    }
    _mapController?.dispose();
    super.dispose();
  }

  Set<Marker> _buildMarkers() {
    return {
      Marker(
        markerId: const MarkerId('pickup'),
        position: _pickupLocation,
        icon: _pickupIcon ?? BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueGreen),
        infoWindow: InfoWindow(title: 'Pickup', snippet: widget.pickup),
      ),
      Marker(
        markerId: const MarkerId('driver'),
        position: _vehicleState.currentPosition,
        icon: _carIcon ?? BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueYellow),
        rotation: _vehicleState.markerRotation,
        anchor: const Offset(0.5, 0.5),
        flat: true,
        infoWindow: InfoWindow(title: widget.driverName, snippet: widget.vehicleModel),
      ),
    };
  }

  Set<Polyline> _buildPolylines() {
    return {
      Polyline(
        polylineId: const PolylineId('route'),
        points: _routePoints.isNotEmpty ? _routePoints : [_vehicleState.currentPosition, _pickupLocation],
        color: AppColors.yellow,
        width: 5,
      ),
    };
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
        child: Icon(icon, color: showYellow ? Colors.black : Colors.white, size: 22),
      ),
    );
  }

  void _shareLiveLocation() {
    final shareText = '''
My ride is on the way!

Driver: ${widget.driverName}
Vehicle: ${widget.vehicleModel} (${widget.vehicleNumber})
ETA: $_currentEta min
Pickup: ${widget.pickup}
Destination: ${widget.dropoff}

${widget.rideId != null ? 'Track: https://my-ride-ashen.vercel.app/track/${widget.rideId}' : ''}
''';

    SharePlus.instance.share(ShareParams(text: shareText, subject: 'Track My MyRide'));
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
            onMapCreated: (controller) => _mapController = controller,
            markers: _buildMarkers(),
            polylines: _buildPolylines(),
            mapType: _mapType,
            myLocationEnabled: true,
            myLocationButtonEnabled: false,
            zoomControlsEnabled: false,
            mapToolbarEnabled: false,
            trafficEnabled: _trafficEnabled,
            buildingsEnabled: true,
            style: _mapType == MapType.normal && context.isDark ? _darkMapStyle : null,
          ),

          // Map controls (right side)
          Positioned(
            right: 16,
            top: MediaQuery.of(context).padding.top + 70,
            child: Column(
              children: [
                // Share location
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
              ],
            ),
          ),

          // Top bar
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  GestureDetector(
                    onTap: () => _showCancelConfirmation(),
                    child: Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(color: context.surfaceColor, borderRadius: BorderRadius.circular(14)),
                      child: Icon(Icons.close, color: context.textColor, size: 22),
                    ),
                  ),
                  const SizedBox(width: 10),
                  // SOS Button (only show if enabled)
                  if (AppSettingsService.sosEnabled)
                    GestureDetector(
                      onTap: () => _showSOSOptions(),
                      child: Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          color: AppColors.error.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: AppColors.error.withValues(alpha: 0.5)),
                        ),
                        child: Icon(Icons.sos, color: AppColors.error, size: 22),
                      ),
                    ),
                  const Spacer(),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                    decoration: BoxDecoration(color: AppColors.yellow, borderRadius: BorderRadius.circular(20)),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(_driverArrived ? Icons.check_circle : Icons.access_time, color: Colors.black, size: 18),
                        const SizedBox(width: 6),
                        Text(_driverArrived ? 'Arrived' : '$_currentEta min', style: TextStyle(color: Colors.black, fontSize: 15, fontWeight: FontWeight.w700)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Bottom sheet
          DraggableScrollableSheet(
            initialChildSize: 0.38,
            minChildSize: 0.30,
            maxChildSize: 0.42,
            snap: true,
            snapSizes: const [0.38],
            builder: (context, scrollController) {
              return Container(
                decoration: BoxDecoration(color: context.surfaceColor, borderRadius: const BorderRadius.vertical(top: Radius.circular(28))),
                child: ListView(
                  controller: scrollController,
                  padding: EdgeInsets.zero,
                  children: [
                    Center(child: Container(margin: const EdgeInsets.only(top: 12), width: 40, height: 4, decoration: BoxDecoration(color: context.borderColor, borderRadius: BorderRadius.circular(2)))),

                    // Status with animation
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 10, 20, 0),
                      child: Row(
                        children: [
                          if (_driverArrived)
                            const StatusAnimation(
                              type: TripAnimationType.complete,
                              size: 28,
                              repeat: false,
                            )
                          else
                            PulsingDot(
                              color: AppColors.success,
                              size: 10,
                            ),
                          const SizedBox(width: 10),
                          Text(
                            _driverArrived ? 'Driver has arrived!' : 'Driver is on the way',
                            style: TextStyle(
                              color: _driverArrived ? AppColors.yellow : AppColors.success,
                              fontSize: 15,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),

                    // Vehicle with driver overlay (Uber/Careem style)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
                      child: Row(
                        children: [
                          // Vehicle image with driver photo overlay
                          SizedBox(
                            width: 120,
                            height: 80,
                            child: Stack(
                              clipBehavior: Clip.none,
                              children: [
                                // Vehicle image
                                Positioned(
                                  right: 0,
                                  top: 0,
                                  child: Image.asset(
                                    'assets/images/pickup_truck.png',
                                    width: 100,
                                    height: 70,
                                    fit: BoxFit.contain,
                                  ),
                                ),
                                // Driver photo with rating badge
                                Positioned(
                                  left: 0,
                                  bottom: 0,
                                  child: Stack(
                                    clipBehavior: Clip.none,
                                    children: [
                                      Container(
                                        width: 52,
                                        height: 52,
                                        decoration: BoxDecoration(
                                          shape: BoxShape.circle,
                                          border: Border.all(color: Colors.white, width: 2),
                                          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.2), blurRadius: 6)],
                                        ),
                                        child: ClipOval(
                                          child: widget.driverPhoto != null && widget.driverPhoto!.isNotEmpty
                                              ? Image.network(
                                                  widget.driverPhoto!,
                                                  fit: BoxFit.cover,
                                                  errorBuilder: (_, __, ___) => Container(
                                                    color: AppColors.yellow,
                                                    child: Icon(Icons.person, color: Colors.black87, size: 28),
                                                  ),
                                                )
                                              : Container(
                                                  color: AppColors.yellow,
                                                  child: Icon(Icons.person, color: Colors.black87, size: 28),
                                                ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(widget.driverName, style: TextStyle(color: context.textColor, fontSize: 17, fontWeight: FontWeight.w700)),
                                const SizedBox(height: 4),
                                Text(widget.vehicleNumber, style: TextStyle(color: context.mutedColor, fontSize: 14, fontWeight: FontWeight.w500)),
                                const SizedBox(height: 4),
                                Text(
                                  widget.vehicleModel,
                                  style: TextStyle(color: context.mutedColor, fontSize: 12),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),

                    // Action buttons
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
                      child: Row(
                        children: [
                          Expanded(child: _buildActionButton(Icons.phone, 'Call')),
                          if (AppSettingsService.chatEnabled) ...[
                            const SizedBox(width: 12),
                            Expanded(child: _buildActionButton(Icons.message, 'Message')),
                          ],
                          const SizedBox(width: 12),
                          Expanded(child: _buildActionButton(Icons.share_location, 'Share')),
                        ],
                      ),
                    ),

                    // Trip route
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
                      child: Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(color: context.isDark ? context.isDark ? AppColors.bgDark : Colors.white : Colors.white, borderRadius: BorderRadius.circular(16)),
                        child: Column(
                          children: [
                            Row(
                              children: [
                                Container(width: 10, height: 10, decoration: BoxDecoration(color: AppColors.success, shape: BoxShape.circle)),
                                const SizedBox(width: 12),
                                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('Pickup', style: TextStyle(color: context.mutedColor, fontSize: 11)), Text(widget.pickup, style: TextStyle(color: context.textColor, fontSize: 14))])),
                              ],
                            ),
                            Padding(padding: const EdgeInsets.only(left: 4), child: Container(width: 2, height: 16, color: context.borderColor)),
                            Row(
                              children: [
                                Container(width: 10, height: 10, decoration: BoxDecoration(color: AppColors.error, borderRadius: BorderRadius.circular(3))),
                                const SizedBox(width: 12),
                                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('Dropoff', style: TextStyle(color: context.mutedColor, fontSize: 11)), Text(widget.dropoff, style: TextStyle(color: context.textColor, fontSize: 14))])),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),

                    // Cancel Ride button
                    if (!_tripStarted)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(20, 4, 20, 16),
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

  Widget _buildActionButton(IconData icon, String label) {
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
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(color: context.isDark ? context.isDark ? AppColors.bgDark : Colors.white : Colors.white, borderRadius: BorderRadius.circular(12)),
        child: Column(
          children: [
            Icon(icon, color: AppColors.yellow, size: 22),
            const SizedBox(height: 4),
            Text(label, style: TextStyle(color: context.mutedColor, fontSize: 12, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }

  void _messageDriver() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => ChatScreen(
          driverName: widget.driverName,
          driverPhone: widget.driverPhone,
          vehicleNumber: widget.vehicleNumber,
          driverRating: widget.driverRating,
          rideId: widget.rideId,
          driverUserId: widget.driverProfileId,
        ),
      ),
    );
  }

  void _shareTripDetails() {
    final message = '''I'm waiting for my ride with MyRide 🚕

Driver: ${widget.driverName}
Vehicle: ${widget.vehicleNumber} (${widget.vehicleModel})
From: ${widget.pickup}
To: ${widget.dropoff}
ETA: $_currentEta min

Track my location:
https://maps.google.com/?q=${_pickupLocation.latitude},${_pickupLocation.longitude}''';

    SharePlus.instance.share(ShareParams(text: message, subject: 'My Ride Details'));
  }

  void _confirmCancel(String reason) async {
    HapticFeedback.mediumImpact();
    // Update ride status to cancelled with reason
    if (widget.rideId != null) {
      await SupabaseService.cancelRide(widget.rideId!, reason: reason);
    }
    if (mounted) {
      AppSnackbar.success(context, 'Ride cancelled');
      Navigator.of(context).pushNamedAndRemoveUntil('/home', (route) => false);
    }
  }

  void _showCancelConfirmation() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(color: ctx.surfaceColor, borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(width: 40, height: 4, decoration: BoxDecoration(color: ctx.borderColor, borderRadius: BorderRadius.circular(2))),
            const SizedBox(height: 24),
            Container(width: 60, height: 60, decoration: BoxDecoration(color: AppColors.error.withValues(alpha: 0.15), shape: BoxShape.circle), child: Icon(Icons.warning_amber_rounded, color: AppColors.error, size: 30)),
            const SizedBox(height: 16),
            Text('Cancel Ride?', style: TextStyle(color: ctx.textColor, fontSize: 20, fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            Text('Your driver is already on the way', style: TextStyle(color: ctx.mutedColor, fontSize: 15)),
            const SizedBox(height: 16),
            Text('Why are you cancelling?', style: TextStyle(color: ctx.mutedColor, fontSize: 13)),
            const SizedBox(height: 12),
            ...['Changed my plans', 'Driver taking too long', 'Booked by mistake', 'Other reason'].map((reason) =>
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: InkWell(
                  onTap: () {
                    Navigator.pop(ctx);
                    _confirmCancel(reason);
                  },
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
                    decoration: BoxDecoration(
                      border: Border.all(color: ctx.borderColor),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(reason, style: TextStyle(color: ctx.textColor, fontSize: 15)),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              height: 50,
              child: OutlinedButton(
                onPressed: () => Navigator.pop(ctx),
                style: OutlinedButton.styleFrom(foregroundColor: ctx.textColor, side: BorderSide(color: ctx.borderColor), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                child: Text('Keep Ride', style: TextStyle(color: ctx.textColor, fontWeight: FontWeight.w600)),
              ),
            ),
            SizedBox(height: MediaQuery.of(ctx).padding.bottom + 10),
          ],
        ),
      ),
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

    // Get current location
    double? lat = _pickupLocation.latitude;
    double? lng = _pickupLocation.longitude;

    // Send SOS alert to admin
    await SupabaseService.triggerSOSAlert(
      latitude: lat,
      longitude: lng,
      rideId: widget.rideId,
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
      _showSOSConfirmed('Error calling emergency');
    }
  }

  Future<void> _callDriver() async {
    final Uri phoneUri = Uri(scheme: 'tel', path: widget.driverPhone.replaceAll(' ', ''));
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
    final message = '''🆘 EMERGENCY - I need help!

I'm waiting for my ride with MyRide.

Driver: ${widget.driverName}
Vehicle: ${widget.vehicleNumber} (${widget.vehicleModel})
Pickup: ${widget.pickup}
Dropoff: ${widget.dropoff}
ETA: $_currentEta minutes

My current location:
https://maps.google.com/?q=${_pickupLocation.latitude},${_pickupLocation.longitude}

Please contact me or emergency services (119) if needed.''';

    SharePlus.instance.share(ShareParams(text: message, subject: 'Emergency - My Location'));
    _showSOSConfirmed('Location shared');
  }

  void _alertEmergencyContacts() {
    final appState = Provider.of<AppState>(context, listen: false);
    final contacts = appState.emergencyContacts;

    if (contacts.isEmpty) {
      _showNoContactsDialog();
      return;
    }

    final message = '''🆘 EMERGENCY ALERT from MyRide

I'm waiting for a ride and may need assistance.

Driver: ${widget.driverName}
Vehicle: ${widget.vehicleNumber}
Location: ${widget.pickup}

Map: https://maps.google.com/?q=${_pickupLocation.latitude},${_pickupLocation.longitude}''';

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
              for (final contact in contacts) {
                final phone = contact['phone']?.replaceAll(' ', '') ?? '';
                final Uri smsUri = Uri(scheme: 'sms', path: phone, queryParameters: {'body': message});
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
