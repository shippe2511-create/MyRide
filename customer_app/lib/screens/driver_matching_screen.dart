import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';
import '../theme/app_theme.dart';
import '../services/supabase_service.dart';
import '../services/notification_service.dart';
import '../services/realtime_service.dart';
import '../providers/app_state.dart';
import 'trip_tracking_screen.dart';
import '../config/app_config.dart';
import '../services/app_settings_service.dart';
import 'package:geolocator/geolocator.dart';

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

class DriverMatchingScreen extends StatefulWidget {
  final String pickup;
  final String dropoff;
  final String rideType;
  final double pickupLat;
  final double pickupLng;
  final double dropoffLat;
  final double dropoffLng;
  final int seatsBooked;
  final String pool;
  // Book for someone else
  final String? riderName;
  final String? riderPhone;
  final bool bookedForOther;

  const DriverMatchingScreen({
    super.key,
    required this.pickup,
    required this.dropoff,
    required this.rideType,
    required this.pickupLat,
    required this.pickupLng,
    required this.dropoffLat,
    required this.dropoffLng,
    this.seatsBooked = 1,
    this.pool = 'public',
    this.riderName,
    this.riderPhone,
    this.bookedForOther = false,
  });

  @override
  State<DriverMatchingScreen> createState() => _DriverMatchingScreenState();
}

class _DriverMatchingScreenState extends State<DriverMatchingScreen>
    with TickerProviderStateMixin {
  late AnimationController _pulseController;
  late Timer _matchTimer;
  late Timer _driverMoveTimer;
  int _driversChecked = 0;
  String _statusText = 'Finding your driver...';
  String? _rideId;
  StreamSubscription<Map<String, dynamic>>? _rideSubscription;
  bool _driverFound = false;
  final _realtimeService = RealtimeService();

  late LatLng _userLocation;
  List<LatLng> _driverLocations = [];
  int _availableDriverCount = 0;
  Set<Polyline> _routePolylines = {};
  BitmapDescriptor? _pickupIcon;
  BitmapDescriptor? _dropoffIcon;
  BitmapDescriptor? _carIcon;
  MapType _mapType = MapType.normal;

  bool _isValidMaldivesLat(double lat) => lat >= 3.5 && lat <= 7.5;
  bool _isValidMaldivesLng(double lng) => lng >= 72.0 && lng <= 74.0;

  LatLng _getValidUserLocation() {
    // Validate pickup location is in Maldives, otherwise use a location near dropoff
    if (_isValidMaldivesLat(widget.pickupLat) && _isValidMaldivesLng(widget.pickupLng)) {
      return LatLng(widget.pickupLat, widget.pickupLng);
    } else if (_isValidMaldivesLat(widget.dropoffLat) && _isValidMaldivesLng(widget.dropoffLng)) {
      // Place pickup 500m-1km away from dropoff (realistic ride distance)
      return LatLng(widget.dropoffLat - 0.008, widget.dropoffLng - 0.005);
    } else {
      // Default to Malé center
      return const LatLng(4.1755, 73.5093);
    }
  }

  LatLng _getValidDropoffLocation() {
    if (_isValidMaldivesLat(widget.dropoffLat) && _isValidMaldivesLng(widget.dropoffLng)) {
      return LatLng(widget.dropoffLat, widget.dropoffLng);
    } else {
      // Default to Hulhumalé
      return const LatLng(4.2116, 73.5300);
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _userLocation = _getValidUserLocation();
  }

  final List<String> _statusMessages = [
    'Finding your driver...',
    'Checking nearby drivers...',
    'Matching with the best driver...',
    'Almost there...',
  ];

  @override
  void initState() {
    super.initState();
    _loadMarkerIcons();
    _fetchAvailableDrivers();
    _createRideInDatabase();
    _fetchRoute();

    _pulseController = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    )..repeat(reverse: true);

    _startMatching();
    _startDriverMovement();
  }

  Future<void> _loadMarkerIcons() async {
    _pickupIcon = await _createPinIcon('A', const Color(0xFF22C55E));
    _dropoffIcon = await _createPinIcon('B', AppColors.error);
    _carIcon = await _createCarIcon();
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
        style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w900),
      ),
      textDirection: TextDirection.ltr,
    );
    textPainter.layout();
    textPainter.paint(
      canvas,
      Offset((size.width - textPainter.width) / 2, 15 - textPainter.height / 2),
    );

    final picture = pictureRecorder.endRecording();
    final image = await picture.toImage(size.width.toInt(), size.height.toInt());
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    return BitmapDescriptor.bytes(bytes!.buffer.asUint8List());
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

  Future<void> _fetchRoute() async {
    try {
      // Use validated locations
      final validPickup = _getValidUserLocation();
      final validDropoff = _getValidDropoffLocation();
      final origin = '${validPickup.latitude},${validPickup.longitude}';
      final destination = '${validDropoff.latitude},${validDropoff.longitude}';

      final url = Uri.parse(
        'https://maps.googleapis.com/maps/api/directions/json'
        '?origin=$origin'
        '&destination=$destination'
        '&mode=driving'
        '&key=${AppConfig.googleMapsApiKey}'
      );

      final response = await http.get(url);
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        if (data['status'] == 'OK' && data['routes'].isNotEmpty) {
          final points = data['routes'][0]['overview_polyline']['points'];
          final routePoints = _decodePolyline(points);

          setState(() {
            _routePolylines = {
              Polyline(
                polylineId: const PolylineId('route'),
                points: routePoints,
                color: const Color(0xFFFFD60A),
                width: 4,
              ),
            };
          });
        }
      }
    } catch (e) {
      debugPrint('Error fetching route: $e');
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
      int dlat = ((result & 1) != 0 ? ~(result >> 1) : (result >> 1));
      lat += dlat;

      shift = 0;
      result = 0;
      do {
        b = encoded.codeUnitAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      int dlng = ((result & 1) != 0 ? ~(result >> 1) : (result >> 1));
      lng += dlng;

      points.add(LatLng(lat / 1E5, lng / 1E5));
    }
    return points;
  }

  Future<void> _fetchAvailableDrivers() async {
    try {
      // Get real driver locations from database
      final locations = await SupabaseService.getOnlineDriverLocations();
      debugPrint('Fetched ${locations.length} online drivers from DB');

      // Filter to only valid Maldives locations
      final validLocations = locations.map((loc) {
        final lat = double.tryParse(loc['lat']?.toString() ?? '') ?? 0;
        final lng = double.tryParse(loc['lng']?.toString() ?? '') ?? 0;
        return LatLng(lat, lng);
      }).where((loc) => _isValidMaldivesLat(loc.latitude) && _isValidMaldivesLng(loc.longitude)).toList();

      debugPrint('Valid Maldives driver locations: ${validLocations.length}');

      setState(() {
        _driverLocations = validLocations;
        _availableDriverCount = _driverLocations.length;
      });
    } catch (e) {
      debugPrint('Error fetching drivers: $e');
    }
  }

  Future<void> _createRideInDatabase() async {
    try {
      // Get customer ID from AppState
      final appState = Provider.of<AppState>(context, listen: false);
      final customerId = appState.profileId;

      // Validate ride distance against max allowed
      final distanceInMeters = Geolocator.distanceBetween(
        widget.pickupLat, widget.pickupLng,
        widget.dropoffLat, widget.dropoffLng,
      );
      final distanceInKm = distanceInMeters / 1000;
      final maxDistance = AppSettingsService.maxRideDistanceKm;

      if (distanceInKm > maxDistance) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Ride distance (${distanceInKm.toStringAsFixed(1)} km) exceeds maximum allowed ($maxDistance km)'),
              backgroundColor: Colors.red,
            ),
          );
          Navigator.pop(context);
        }
        return;
      }

      // Validate pickup coordinates - use dropoff area if invalid
      double validPickupLat = widget.pickupLat;
      double validPickupLng = widget.pickupLng;
      if (!_isValidMaldivesLat(validPickupLat) || !_isValidMaldivesLng(validPickupLng)) {
        // Place pickup near dropoff if dropoff is valid
        if (_isValidMaldivesLat(widget.dropoffLat) && _isValidMaldivesLng(widget.dropoffLng)) {
          validPickupLat = widget.dropoffLat - 0.008;
          validPickupLng = widget.dropoffLng - 0.005;
        } else {
          // Default to Malé center
          validPickupLat = 4.1755;
          validPickupLng = 73.5093;
        }
      }

      // Create ride request in database
      final rideData = await SupabaseService.createRide(
        customerId: customerId,
        pickupName: widget.pickup,
        pickupLat: validPickupLat,
        pickupLng: validPickupLng,
        dropoffName: widget.dropoff,
        dropoffLat: widget.dropoffLat,
        dropoffLng: widget.dropoffLng,
        pool: widget.pool,
        riderName: widget.riderName,
        riderPhone: widget.riderPhone,
        bookedForOther: widget.bookedForOther,
      );

      _rideId = rideData['id'];
      debugPrint('Ride request created: $_rideId');
      _startStatusPolling();
    } catch (e) {
      debugPrint('Error creating ride: $e');
      if (mounted) Navigator.pop(context);
    }
  }

  Timer? _statusPollingTimer;

  void _startStatusPolling() {
    _statusPollingTimer = Timer.periodic(const Duration(seconds: 2), (_) async {
      if (_rideId == null || _driverFound || !mounted) return;

      try {
        final ride = await SupabaseService.getRideById(_rideId!);

        if (ride != null && !_driverFound && mounted) {
          final status = ride['status'] as String?;
          debugPrint('Polling ride $_rideId: status = $status');

          if (status == 'accepted' || status == 'arrived' || status == 'in_progress') {
            _statusPollingTimer?.cancel();
            _matchTimer.cancel();
            _onDriverFound();
          } else if (status == 'cancelled') {
            _statusPollingTimer?.cancel();
            if (mounted) {
              Navigator.pop(context);
            }
          }
        }
      } catch (e) {
        debugPrint('Polling error: $e');
      }
    });
  }

  void _startMatching() {
    _matchTimer = Timer.periodic(const Duration(milliseconds: 800), (timer) {
      if (!mounted) return;
      setState(() {
        _driversChecked = min(_driversChecked + Random().nextInt(3) + 1, 15);
        _statusText = _statusMessages[min(timer.tick ~/ 2, _statusMessages.length - 1)];
      });

      // REMOVED auto-trigger - wait for real driver to accept via Supabase
      // Driver acceptance is handled in _subscribeToRideUpdates()
    });
  }

  void _startDriverMovement() {
    // Don't randomly move drivers - show real positions only
    _driverMoveTimer = Timer.periodic(const Duration(seconds: 5), (timer) {
      if (!mounted) return;
      // Refresh driver locations from database
      _fetchAvailableDrivers();
    });
  }

  void _onDriverFound() async {
    if (_driverFound) return; // Prevent duplicate calls
    _driverFound = true;

    HapticFeedback.mediumImpact();
    _rideSubscription?.cancel();
    _statusPollingTimer?.cancel();

    // Get the ACTUAL driver who accepted from the ride record
    String driverName = 'Driver';
    double driverRating = 5.0;
    String vehicleNumber = '';
    String? plateNo;
    String vehicleModel = '';
    String driverPhone = '';
    String? driverPhoto;
    String? driverProfileId;
    String? driverId;

    try {
      if (_rideId != null) {
        // Small delay to ensure DB is consistent after driver acceptance
        await Future.delayed(const Duration(milliseconds: 500));

        // Fetch the ride with actual driver info
        final ride = await SupabaseService.getRideById(_rideId!);
        debugPrint('Ride response: $ride');

        if (ride != null && ride['driver'] != null) {
          final driver = ride['driver'];
          debugPrint('Driver data: $driver');
          final profile = driver['profile'];
          debugPrint('Profile data: $profile');
          final vehicle = driver['vehicle'];

          driverId = driver['id'] as String?;
          driverName = profile?['full_name'] ?? 'Driver';
          driverRating = (driver['rating'] ?? 5.0).toDouble();
          driverPhone = profile?['phone'] ?? '';
          // Get driver photo from driver's avatar_url first, then fallback to profile
          driverPhoto = driver['avatar_url'] as String? ?? profile?['avatar_url'] as String?;
          driverProfileId = driver['profile_id'] as String? ?? profile?['id'] as String?;

          if (vehicle != null) {
            vehicleNumber = vehicle['display_name'] ?? '';
            plateNo = vehicle['plate_no'] as String?;
            vehicleModel = vehicle['name'] ?? 'Vehicle';
          }

          debugPrint('Found actual driver: $driverName, driverId: $driverId, profileId: $driverProfileId, photo: $driverPhoto, plateNo: $plateNo');
        } else {
          debugPrint('No driver in ride response. Ride driver_id: ${ride?['driver_id']}');
        }
      }
    } catch (e) {
      debugPrint('Error fetching driver: $e');
    }

    // Show notification after we have the actual driver name
    NotificationService().showDriverAcceptedNotification(
      driverName: driverName,
      vehicle: vehicleModel.isNotEmpty ? vehicleModel : 'On the way',
      minutesAway: 5,
    );

    if (!mounted) return;

    // If booked for someone else, show share sheet to send tracking link
    if (widget.bookedForOther && widget.riderPhone != null && _rideId != null) {
      await _showShareTrackingSheet(driverName);
    }

    if (!mounted) return;

    Navigator.pushReplacement(
      context,
      MaterialPageRoute(
        builder: (_) => TripTrackingScreen(
          tripData: {
            'rideId': _rideId,
            'driverName': driverName,
            'driverRating': driverRating,
            'vehicleNumber': vehicleNumber,
            'plateNo': plateNo,
            'vehicleModel': vehicleModel,
            'driverPhone': driverPhone,
            'driverPhoto': driverPhoto,
            'driverProfileId': driverProfileId,
            'driverId': driverId,
            'pickup': widget.pickup,
            'dropoff': widget.dropoff,
            'pickup_lat': widget.pickupLat,
            'pickup_lng': widget.pickupLng,
            'dropoff_lat': widget.dropoffLat,
            'dropoff_lng': widget.dropoffLng,
            'status': 'accepted',
          },
        ),
      ),
    );
  }

  Future<void> _showShareTrackingSheet(String driverName) async {
    final appState = Provider.of<AppState>(context, listen: false);
    final bookerName = appState.userName ?? 'Someone';
    final trackingUrl = 'https://my-ride-omega.vercel.app/track/$_rideId';
    final message = '$bookerName booked you a MyRide. Track your driver here: $trackingUrl';

    await showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => SafeArea(
        top: false,
        child: Container(
          padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
          decoration: BoxDecoration(
            color: ctx.surfaceColor,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: ctx.borderColor,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 16),
              Icon(Icons.check_circle, color: Colors.green, size: 48),
              const SizedBox(height: 12),
              Text(
                'Driver Found!',
                style: TextStyle(
                  color: ctx.textColor,
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Share the tracking link with ${widget.riderName}',
                style: TextStyle(color: ctx.mutedColor, fontSize: 13),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 20),

              // WhatsApp button
              _buildShareOption(
                ctx,
                Icons.chat,
                'WhatsApp',
                const Color(0xFF25D366),
                () async {
                  Navigator.pop(ctx);
                  final phone = widget.riderPhone!.replaceAll('+', '');
                  final encodedMsg = Uri.encodeComponent(message);
                  final url = 'https://wa.me/$phone?text=$encodedMsg';
                  if (await canLaunchUrl(Uri.parse(url))) {
                    await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
                  }
                },
              ),
              const SizedBox(height: 10),

              // SMS button
              _buildShareOption(
                ctx,
                Icons.sms,
                'SMS',
                Colors.blue,
                () async {
                  Navigator.pop(ctx);
                  final smsUrl = 'sms:${widget.riderPhone}?body=${Uri.encodeComponent(message)}';
                  if (await canLaunchUrl(Uri.parse(smsUrl))) {
                    await launchUrl(Uri.parse(smsUrl));
                  }
                },
              ),
              const SizedBox(height: 10),

              // Copy link button
              _buildShareOption(
                ctx,
                Icons.copy,
                'Copy Link',
                Colors.orange,
                () {
                  Navigator.pop(ctx);
                  Clipboard.setData(ClipboardData(text: trackingUrl));
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Tracking link copied!')),
                  );
                },
              ),
              const SizedBox(height: 10),

              // More options
              _buildShareOption(
                ctx,
                Icons.share,
                'More Options',
                ctx.mutedColor,
                () {
                  Navigator.pop(ctx);
                  SharePlus.instance.share(ShareParams(text: message, subject: 'MyRide Tracking Link'));
                },
              ),

              const SizedBox(height: 12),
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: Text('Skip', style: TextStyle(color: ctx.mutedColor, fontSize: 14)),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildShareOption(BuildContext ctx, IconData icon, String label, Color color, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: color.withValues(alpha: 0.3)),
        ),
        child: Row(
          children: [
            Icon(icon, color: color, size: 24),
            const SizedBox(width: 16),
            Text(
              label,
              style: TextStyle(
                color: ctx.textColor,
                fontSize: 16,
                fontWeight: FontWeight.w600,
              ),
            ),
            const Spacer(),
            Icon(Icons.chevron_right, color: ctx.mutedColor),
          ],
        ),
      ),
    );
  }

  @override
  void dispose() {
    _pulseController.dispose();
    _matchTimer.cancel();
    _driverMoveTimer.cancel();
    _rideSubscription?.cancel();
    _statusPollingTimer?.cancel();
    if (_rideId != null) {
      _realtimeService.unsubscribe('ride_$_rideId');
      // Auto-cancel ride if leaving without driver assignment
      _autoCancelIfPending();
    }
    super.dispose();
  }

  Future<void> _autoCancelIfPending() async {
    if (_rideId == null) return;
    try {
      // Check if ride is still pending (no driver assigned)
      final ride = await SupabaseService.getRideById(_rideId!);
      if (ride != null && ride['status'] == 'pending') {
        debugPrint('Auto-cancelling pending ride $_rideId');
        await SupabaseService.cancelRide(_rideId!, reason: 'Customer left matching screen');
      }
    } catch (e) {
      debugPrint('Error auto-cancelling ride: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.bgColor,
      body: Stack(
        children: [
          // Google Map
          Builder(builder: (context) {
            final dropoff = _getValidDropoffLocation();
            return GoogleMap(
            initialCameraPosition: CameraPosition(target: _userLocation, zoom: 14),
            mapType: _mapType,
            markers: {
              Marker(
                markerId: const MarkerId('pickup'),
                position: _userLocation,
                icon: _pickupIcon ?? BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueGreen),
                anchor: const Offset(0.5, 1.0),
              ),
              Marker(
                markerId: const MarkerId('dropoff'),
                position: dropoff,
                icon: _dropoffIcon ?? BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueRed),
                anchor: const Offset(0.5, 1.0),
              ),
              ..._driverLocations.asMap().entries.map((entry) => Marker(
                markerId: MarkerId('driver_${entry.key}'),
                position: entry.value,
                icon: _carIcon ?? BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueOrange),
                anchor: const Offset(0.5, 0.5),
              )),
            },
            polylines: _routePolylines,
            onMapCreated: (controller) {
              Future.delayed(const Duration(milliseconds: 500), () {
                final bounds = LatLngBounds(
                  southwest: LatLng(
                    _userLocation.latitude < dropoff.latitude ? _userLocation.latitude : dropoff.latitude,
                    _userLocation.longitude < dropoff.longitude ? _userLocation.longitude : dropoff.longitude,
                  ),
                  northeast: LatLng(
                    _userLocation.latitude > dropoff.latitude ? _userLocation.latitude : dropoff.latitude,
                    _userLocation.longitude > dropoff.longitude ? _userLocation.longitude : dropoff.longitude,
                  ),
                );
                controller.animateCamera(CameraUpdate.newLatLngBounds(bounds, 80));
              });
            },
            myLocationEnabled: true,
            myLocationButtonEnabled: false,
            zoomControlsEnabled: false,
            mapToolbarEnabled: false,
            style: _mapType == MapType.normal && context.isDark ? _darkMapStyle : null,
          );
          }),

          // Map type button (normal/satellite/terrain)
          Positioned(
            right: 16,
            top: MediaQuery.of(context).padding.top + 70,
            child: GestureDetector(
              onTap: () => setState(() {
                if (_mapType == MapType.normal) {
                  _mapType = MapType.satellite;
                } else if (_mapType == MapType.satellite) {
                  _mapType = MapType.terrain;
                } else {
                  _mapType = MapType.normal;
                }
              }),
              child: Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: const Color(0xFFFFD60A),
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
                  _mapType == MapType.satellite ? Icons.satellite_alt :
                  _mapType == MapType.terrain ? Icons.terrain : Icons.map,
                  color: Colors.black,
                  size: 24,
                ),
              ),
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
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        color: context.surfaceColor,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Icon(Icons.close, color: context.textColor, size: 24),
                    ),
                  ),
                  const Spacer(),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                    decoration: BoxDecoration(
                      color: context.surfaceColor,
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
                        const SizedBox(width: 8),
                        Text(
                          '$_availableDriverCount driver${_availableDriverCount == 1 ? '' : 's'} nearby',
                          style: TextStyle(color: context.textColor, fontSize: 13, fontWeight: FontWeight.w600),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Simple Bottom Panel
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: Container(
              padding: EdgeInsets.fromLTRB(20, 16, 20, MediaQuery.of(context).padding.bottom + 20),
              decoration: BoxDecoration(
                color: context.isDark ? const Color(0xFF141418) : Colors.white,
                borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
                boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.15), blurRadius: 20, offset: const Offset(0, -5))],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Handle
                  Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: context.isDark ? Colors.white24 : Colors.black12,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Searching animation - simple spinning loader
                  SizedBox(
                    height: 60,
                    width: 60,
                    child: CircularProgressIndicator(
                      strokeWidth: 4,
                      valueColor: AlwaysStoppedAnimation<Color>(AppColors.yellow),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Status text
                  Text(
                    _statusText,
                    style: TextStyle(color: context.textColor, fontSize: 18, fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 16),

                  // Simple route display
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: context.isDark ? const Color(0xFF1E1E22) : const Color(0xFFF5F5F5),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Column(
                      children: [
                        Row(
                          children: [
                            Container(width: 10, height: 10, decoration: BoxDecoration(color: AppColors.success, shape: BoxShape.circle)),
                            const SizedBox(width: 12),
                            Expanded(child: Text(widget.pickup, style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w500), maxLines: 1, overflow: TextOverflow.ellipsis)),
                          ],
                        ),
                        Padding(
                          padding: const EdgeInsets.only(left: 4),
                          child: Row(children: [Container(width: 2, height: 16, color: context.isDark ? Colors.white24 : Colors.black12)]),
                        ),
                        Row(
                          children: [
                            Container(width: 10, height: 10, decoration: BoxDecoration(color: AppColors.error, shape: BoxShape.circle)),
                            const SizedBox(width: 12),
                            Expanded(child: Text(widget.dropoff, style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w500), maxLines: 1, overflow: TextOverflow.ellipsis)),
                          ],
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 14),

                  // Simple Cancel button
                  SizedBox(
                    width: double.infinity,
                    height: 50,
                    child: TextButton(
                      onPressed: () => _showCancelConfirmation(),
                      style: TextButton.styleFrom(
                        foregroundColor: AppColors.error,
                        backgroundColor: AppColors.error.withValues(alpha: 0.1),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.close_rounded, size: 20),
                          const SizedBox(width: 8),
                          Text('Cancel Request', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
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
  }

  void _showCancelConfirmation() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: ctx.isDark
                ? [const Color(0xFF1E1E1E), const Color(0xFF121212)]
                : [Colors.white, const Color(0xFFF8F8F8)],
          ),
          borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.3), blurRadius: 20, offset: const Offset(0, -5))],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(width: 48, height: 5, decoration: BoxDecoration(color: ctx.isDark ? Colors.white24 : Colors.black12, borderRadius: BorderRadius.circular(3))),
            const SizedBox(height: 28),
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                gradient: LinearGradient(colors: [AppColors.error.withValues(alpha: 0.2), AppColors.error.withValues(alpha: 0.1)]),
                shape: BoxShape.circle,
              ),
              child: Icon(Icons.warning_amber_rounded, color: AppColors.error, size: 44),
            ),
            const SizedBox(height: 24),
            Text('Cancel Ride?', style: TextStyle(color: ctx.textColor, fontSize: 24, fontWeight: FontWeight.w800, letterSpacing: -0.5)),
            const SizedBox(height: 10),
            Text(
              'Are you sure you want to cancel?\nWe\'re still searching for your driver.',
              textAlign: TextAlign.center,
              style: TextStyle(color: ctx.mutedColor, fontSize: 15, height: 1.4),
            ),
            const SizedBox(height: 28),
            Row(
              children: [
                Expanded(
                  child: Container(
                    height: 56,
                    decoration: BoxDecoration(
                      gradient: LinearGradient(colors: [AppColors.yellow, const Color(0xFFFFC107)]),
                      borderRadius: BorderRadius.circular(16),
                      boxShadow: [BoxShadow(color: AppColors.yellow.withValues(alpha: 0.3), blurRadius: 12)],
                    ),
                    child: ElevatedButton(
                      onPressed: () => Navigator.pop(ctx),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.transparent,
                        foregroundColor: Colors.black,
                        shadowColor: Colors.transparent,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                      ),
                      child: Text('Keep Searching', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                    ),
                  ),
                ),
                const SizedBox(width: 14),
                Container(
                  height: 56,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: AppColors.error.withValues(alpha: 0.5), width: 2),
                  ),
                  child: TextButton(
                    onPressed: () async {
                      Navigator.pop(ctx);
                      if (_rideId != null) {
                        try {
                          await SupabaseService.cancelRide(_rideId!, reason: 'Cancelled by customer');
                        } catch (e) {
                          debugPrint('Error cancelling ride: $e');
                        }
                      }
                      Navigator.pop(context);
                    },
                    style: TextButton.styleFrom(
                      foregroundColor: AppColors.error,
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                    child: Text('Cancel', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                  ),
                ),
              ],
            ),
            SizedBox(height: MediaQuery.of(ctx).padding.bottom + 10),
          ],
        ),
      ),
    );
  }
}
