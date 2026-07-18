import 'dart:async';
import 'dart:convert';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';
import '../config/app_config.dart';
import '../theme/app_theme.dart';
import '../services/supabase_service.dart';
import 'driver_matching_screen.dart';

const String _darkMapStyle = '''
[
  {"elementType": "geometry", "stylers": [{"color": "#212121"}]},
  {"elementType": "labels.icon", "stylers": [{"visibility": "off"}]},
  {"elementType": "labels.text.fill", "stylers": [{"color": "#757575"}]},
  {"elementType": "labels.text.stroke", "stylers": [{"color": "#212121"}]},
  {"featureType": "road", "elementType": "geometry.fill", "stylers": [{"color": "#2c2c2c"}]},
  {"featureType": "road", "elementType": "labels.text.fill", "stylers": [{"color": "#8a8a8a"}]},
  {"featureType": "water", "elementType": "geometry", "stylers": [{"color": "#000000"}]},
  {"featureType": "water", "elementType": "labels.text.fill", "stylers": [{"color": "#3d3d3d"}]}
]
''';

class RideConfirmScreen extends StatefulWidget {
  final String pickup;
  final String dropoff;
  final double pickupLat;
  final double pickupLng;
  final double dropoffLat;
  final double dropoffLng;

  const RideConfirmScreen({
    super.key,
    required this.pickup,
    required this.dropoff,
    required this.pickupLat,
    required this.pickupLng,
    required this.dropoffLat,
    required this.dropoffLng,
  });

  @override
  State<RideConfirmScreen> createState() => _RideConfirmScreenState();
}

class _RideConfirmScreenState extends State<RideConfirmScreen> {
  List<LatLng> _routePoints = [];
  GoogleMapController? _mapController;
  String? _duration;
  String? _distance;
  BitmapDescriptor? _pickupIcon;
  BitmapDescriptor? _dropoffIcon;
  MapType _mapType = MapType.normal;
  bool _hasPrivateAccess = false;
  bool _usePrivatePool = false;
  RealtimeChannel? _assignmentChannel;
  Timer? _privateAccessPollingTimer;

  // Book for someone else
  bool _bookingForOther = false;
  final _riderNameController = TextEditingController();
  final _riderPhoneController = TextEditingController();
  String? _riderPhoneError;

  @override
  void initState() {
    super.initState();
    _createMarkerIcons();
    _fetchRoute();
    _checkPrivateAccess();
    _setupRealtimeSubscription();
    _startPrivateAccessPolling();
  }

  @override
  void dispose() {
    _assignmentChannel?.unsubscribe();
    _privateAccessPollingTimer?.cancel();
    _riderNameController.dispose();
    _riderPhoneController.dispose();
    super.dispose();
  }

  void _startPrivateAccessPolling() {
    _privateAccessPollingTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      if (mounted) _checkPrivateAccess();
    });
  }

  bool _validateRiderPhone(String phone) {
    // Remove spaces and dashes
    final cleaned = phone.replaceAll(RegExp(r'[\s\-]'), '');
    // Must be 7 digits (Maldives local) or +960 followed by 7 digits
    if (cleaned.startsWith('+960')) {
      return cleaned.length == 11 && RegExp(r'^\+960\d{7}$').hasMatch(cleaned);
    } else if (cleaned.startsWith('960')) {
      return cleaned.length == 10 && RegExp(r'^960\d{7}$').hasMatch(cleaned);
    } else {
      return cleaned.length == 7 && RegExp(r'^\d{7}$').hasMatch(cleaned);
    }
  }

  String _formatPhoneForStorage(String phone) {
    final cleaned = phone.replaceAll(RegExp(r'[\s\-]'), '');
    if (cleaned.startsWith('+960')) return cleaned;
    if (cleaned.startsWith('960')) return '+$cleaned';
    return '+960$cleaned';
  }

  void _setupRealtimeSubscription() {
    // Use profileId from SupabaseService (phone-based login) or fall back to auth user id
    final profileId = SupabaseService.profileId;
    final userId = (profileId != null && profileId.isNotEmpty)
        ? profileId
        : Supabase.instance.client.auth.currentUser?.id;
    if (userId == null || userId.isEmpty) return;

    _assignmentChannel = Supabase.instance.client
        .channel('ride_confirm_pools_$userId')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'customer_pools',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'customer_id',
            value: userId,
          ),
          callback: (payload) {
            debugPrint('RideConfirmScreen: Pool changed for user $userId, payload=$payload');
            _checkPrivateAccess();
          },
        )
        .subscribe();
  }

  Future<void> _checkPrivateAccess() async {
    final hasAccess = await SupabaseService.hasPrivatePoolAccess();
    debugPrint('RideConfirmScreen: hasPrivateAccess=$hasAccess');
    if (mounted) {
      setState(() => _hasPrivateAccess = hasAccess);
    }
  }

  Future<void> _createMarkerIcons() async {
    _pickupIcon = await _createLabeledMarker('A', Colors.green);
    _dropoffIcon = await _createLabeledMarker('B', Colors.red);
    if (mounted) setState(() {});
  }

  Future<BitmapDescriptor> _createLabeledMarker(String label, Color color) async {
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
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);

    return BitmapDescriptor.bytes(bytes!.buffer.asUint8List());
  }

  Future<void> _fetchRoute() async {
    try {
      final url = 'https://maps.googleapis.com/maps/api/directions/json'
          '?origin=${widget.pickupLat},${widget.pickupLng}'
          '&destination=${widget.dropoffLat},${widget.dropoffLng}'
          '&key=${AppConfig.googleMapsApiKey}';

      final response = await http.get(Uri.parse(url));
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        if (data['routes'] != null && data['routes'].isNotEmpty) {
          final route = data['routes'][0];
          final polyline = route['overview_polyline']['points'];
          final points = _decodePolyline(polyline);

          // Get duration and distance
          final leg = route['legs'][0];
          final duration = leg['duration']['text'];
          final distance = leg['distance']['text'];

          if (mounted) {
            setState(() {
              _routePoints = points;
              _duration = duration;
              _distance = distance;
            });

            // Fit map to route bounds with extra bottom padding for bottom sheet
            _fitMapToBounds();
          }
        }
      }
    } catch (e) {
      debugPrint('Error fetching route: $e');
      // Fallback to straight line
      if (mounted) {
        setState(() {
          _routePoints = [
            LatLng(widget.pickupLat, widget.pickupLng),
            LatLng(widget.dropoffLat, widget.dropoffLng),
          ];
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

  LatLngBounds _getBounds(List<LatLng> points) {
    double minLat = points.first.latitude;
    double maxLat = points.first.latitude;
    double minLng = points.first.longitude;
    double maxLng = points.first.longitude;

    for (var point in points) {
      if (point.latitude < minLat) minLat = point.latitude;
      if (point.latitude > maxLat) maxLat = point.latitude;
      if (point.longitude < minLng) minLng = point.longitude;
      if (point.longitude > maxLng) maxLng = point.longitude;
    }

    return LatLngBounds(
      southwest: LatLng(minLat, minLng),
      northeast: LatLng(maxLat, maxLng),
    );
  }

  void _fitMapToBounds() {
    if (_mapController == null) return;

    // Include both markers and route points in bounds calculation
    final allPoints = <LatLng>[
      LatLng(widget.pickupLat, widget.pickupLng),
      LatLng(widget.dropoffLat, widget.dropoffLng),
      ..._routePoints,
    ];

    if (allPoints.isEmpty) return;

    final bounds = _getBounds(allPoints);

    // Padding: top 80, left/right 60, bottom 320 (to account for bottom sheet ~280 + margin)
    _mapController!.animateCamera(
      CameraUpdate.newLatLngBounds(bounds, 60),
    );

    // Apply additional offset to shift map up to account for bottom sheet
    Future.delayed(const Duration(milliseconds: 300), () {
      if (_mapController != null && mounted) {
        _mapController!.moveCamera(
          CameraUpdate.scrollBy(0, -100), // Scroll map up by 100 pixels
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.bgColor,
      body: Stack(
        children: [
          // Map
          GoogleMap(
            initialCameraPosition: CameraPosition(
              target: LatLng(
                (widget.pickupLat + widget.dropoffLat) / 2,
                (widget.pickupLng + widget.dropoffLng) / 2,
              ),
              zoom: 13,
            ),
            mapType: _mapType,
            onMapCreated: (controller) {
              _mapController = controller;
              // Fit bounds after map is created
              Future.delayed(const Duration(milliseconds: 500), () => _fitMapToBounds());
            },
            markers: {
              Marker(
                markerId: const MarkerId('pickup'),
                position: LatLng(widget.pickupLat, widget.pickupLng),
                icon: _pickupIcon ?? BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueGreen),
                anchor: const Offset(0.5, 1.0),
              ),
              Marker(
                markerId: const MarkerId('dropoff'),
                position: LatLng(widget.dropoffLat, widget.dropoffLng),
                icon: _dropoffIcon ?? BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueRed),
                anchor: const Offset(0.5, 1.0),
              ),
            },
            polylines: {
              Polyline(
                polylineId: const PolylineId('route'),
                points: _routePoints.isNotEmpty
                    ? _routePoints
                    : [
                        LatLng(widget.pickupLat, widget.pickupLng),
                        LatLng(widget.dropoffLat, widget.dropoffLng),
                      ],
                color: AppColors.yellow,
                width: 5,
              ),
            },
            myLocationEnabled: true,
            myLocationButtonEnabled: false,
            zoomControlsEnabled: false,
            style: _mapType == MapType.normal && context.isDark ? _darkMapStyle : null,
          ),

          // Map layer button
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

          // Back button
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: GestureDetector(
                onTap: () => Navigator.pop(context),
                child: Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: context.surfaceColor,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Icon(Icons.arrow_back, color: context.textColor),
                ),
              ),
            ),
          ),

          // Bottom panel
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: Container(
              padding: EdgeInsets.fromLTRB(20, 24, 20, MediaQuery.of(context).padding.bottom + 20),
              decoration: BoxDecoration(
                color: context.surfaceColor,
                borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'Confirm your ride',
                    style: TextStyle(color: context.textColor, fontSize: 20, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 20),

                  // Route summary
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: context.isDark ? Colors.white.withValues(alpha: 0.05) : Colors.black.withValues(alpha: 0.03),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Row(
                      children: [
                        Column(
                          children: [
                            Container(
                              width: 12,
                              height: 12,
                              decoration: const BoxDecoration(color: Color(0xFF22C55E), shape: BoxShape.circle),
                            ),
                            Container(width: 2, height: 30, color: context.borderColor),
                            Container(
                              width: 12,
                              height: 12,
                              decoration: BoxDecoration(color: AppColors.error, borderRadius: BorderRadius.circular(3)),
                            ),
                          ],
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Pickup', style: TextStyle(color: context.mutedColor, fontSize: 12)),
                              Text(widget.pickup, style: TextStyle(color: context.textColor, fontSize: 15, fontWeight: FontWeight.w600)),
                              const SizedBox(height: 14),
                              Text('Dropoff', style: TextStyle(color: context.mutedColor, fontSize: 12)),
                              Text(widget.dropoff, style: TextStyle(color: context.textColor, fontSize: 15, fontWeight: FontWeight.w600), overflow: TextOverflow.ellipsis),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),

                  // Duration and distance
                  if (_duration != null || _distance != null) ...[
                    const SizedBox(height: 16),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        if (_duration != null) ...[
                          Icon(Icons.access_time, color: context.mutedColor, size: 18),
                          const SizedBox(width: 6),
                          Text(_duration!, style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w500)),
                        ],
                        if (_duration != null && _distance != null)
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            child: Container(width: 1, height: 16, color: context.borderColor),
                          ),
                        if (_distance != null) ...[
                          Icon(Icons.route, color: context.mutedColor, size: 18),
                          const SizedBox(width: 6),
                          Text(_distance!, style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w500)),
                        ],
                      ],
                    ),
                  ],

                  const SizedBox(height: 20),

                  // Ride options card - unified design
                  Container(
                    decoration: BoxDecoration(
                      color: context.cardColor,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: context.borderColor.withValues(alpha: 0.5)),
                    ),
                    child: Column(
                      children: [
                        // Private vehicle option (only shown if customer has private access)
                        if (_hasPrivateAccess) ...[
                          _buildOptionTile(
                            icon: Icons.directions_car_filled_outlined,
                            title: 'Private Vehicle',
                            subtitle: _usePrivatePool ? 'Your assigned vehicle' : 'Use your dedicated driver',
                            isActive: _usePrivatePool,
                            activeColor: Colors.purple,
                            onTap: () {
                              HapticFeedback.selectionClick();
                              setState(() => _usePrivatePool = !_usePrivatePool);
                            },
                          ),
                          Divider(height: 1, color: context.borderColor.withValues(alpha: 0.3), indent: 68),
                        ],
                        // Book for someone else option
                        _buildOptionTile(
                          icon: Icons.person_add_alt_1_outlined,
                          title: 'Book for someone else',
                          subtitle: _bookingForOther ? 'Driver contacts the rider' : 'Send ride to a friend or family',
                          isActive: _bookingForOther,
                          activeColor: AppColors.yellow,
                          onTap: () {
                            HapticFeedback.selectionClick();
                            setState(() {
                              _bookingForOther = !_bookingForOther;
                              if (!_bookingForOther) _riderPhoneError = null;
                            });
                          },
                        ),
                        // Rider details fields with animation
                        AnimatedSize(
                          duration: const Duration(milliseconds: 250),
                          curve: Curves.easeOut,
                          child: _bookingForOther
                              ? Column(
                                  children: [
                                    Divider(height: 1, color: context.borderColor.withValues(alpha: 0.3), indent: 20, endIndent: 20),
                                    Padding(
                                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                                      child: Container(
                                        decoration: BoxDecoration(
                                          color: context.isDark ? Colors.white.withValues(alpha: 0.05) : Colors.black.withValues(alpha: 0.03),
                                          borderRadius: BorderRadius.circular(14),
                                        ),
                                        child: Column(
                                          children: [
                                            TextField(
                                              controller: _riderNameController,
                                              style: TextStyle(color: context.textColor, fontSize: 15),
                                              textCapitalization: TextCapitalization.words,
                                              decoration: InputDecoration(
                                                hintText: "Rider's name",
                                                hintStyle: TextStyle(color: context.mutedColor),
                                                prefixIcon: Padding(
                                                  padding: const EdgeInsets.only(left: 14, right: 10),
                                                  child: Icon(Icons.person_outline, color: AppColors.yellow, size: 20),
                                                ),
                                                prefixIconConstraints: const BoxConstraints(minWidth: 44),
                                                filled: true,
                                                fillColor: Colors.transparent,
                                                border: InputBorder.none,
                                                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                                              ),
                                            ),
                                            Divider(height: 1, color: context.borderColor.withValues(alpha: 0.3), indent: 50),
                                            TextField(
                                              controller: _riderPhoneController,
                                              style: TextStyle(color: context.textColor, fontSize: 15),
                                              keyboardType: TextInputType.phone,
                                              onChanged: (value) {
                                                if (_riderPhoneError != null) {
                                                  setState(() => _riderPhoneError = null);
                                                }
                                              },
                                              decoration: InputDecoration(
                                                hintText: "7XXXXXX",
                                                hintStyle: TextStyle(color: context.mutedColor),
                                                prefixIcon: Padding(
                                                  padding: const EdgeInsets.only(left: 14, right: 10),
                                                  child: Icon(Icons.phone_outlined, color: AppColors.yellow, size: 20),
                                                ),
                                                prefixIconConstraints: const BoxConstraints(minWidth: 44),
                                                prefixText: '+960 ',
                                                prefixStyle: TextStyle(color: context.textColor, fontSize: 15),
                                                filled: true,
                                                fillColor: Colors.transparent,
                                                border: InputBorder.none,
                                                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ),
                                    if (_riderPhoneError != null) ...[
                                      Padding(
                                        padding: const EdgeInsets.only(left: 16, bottom: 8),
                                        child: Row(
                                          children: [
                                            const Icon(Icons.error_outline, color: Colors.red, size: 14),
                                            const SizedBox(width: 6),
                                            Text(
                                              _riderPhoneError!,
                                              style: const TextStyle(color: Colors.red, fontSize: 12),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ],
                                  ],
                                )
                              : const SizedBox.shrink(),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Request button
                  SizedBox(
                    width: double.infinity,
                    height: 56,
                    child: ElevatedButton(
                      onPressed: () {
                        // Validate rider phone if booking for someone else
                        if (_bookingForOther) {
                          final phone = _riderPhoneController.text.trim();
                          if (_riderNameController.text.trim().isEmpty) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('Please enter rider name'), backgroundColor: Colors.red),
                            );
                            return;
                          }
                          if (phone.isEmpty) {
                            setState(() => _riderPhoneError = 'Phone number is required');
                            return;
                          }
                          if (!_validateRiderPhone(phone)) {
                            setState(() => _riderPhoneError = 'Enter a valid 7-digit Maldives number');
                            return;
                          }
                        }

                        HapticFeedback.mediumImpact();
                        Navigator.pushReplacement(
                          context,
                          MaterialPageRoute(
                            builder: (_) => DriverMatchingScreen(
                              pickup: widget.pickup,
                              dropoff: widget.dropoff,
                              rideType: 'Staff Car',
                              pickupLat: widget.pickupLat,
                              pickupLng: widget.pickupLng,
                              dropoffLat: widget.dropoffLat,
                              dropoffLng: widget.dropoffLng,
                              seatsBooked: 1,
                              pool: _usePrivatePool ? 'private' : 'public',
                              riderName: _bookingForOther ? _riderNameController.text.trim() : null,
                              riderPhone: _bookingForOther ? _formatPhoneForStorage(_riderPhoneController.text.trim()) : null,
                              bookedForOther: _bookingForOther,
                            ),
                          ),
                        );
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.yellow,
                        foregroundColor: Colors.black,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                        elevation: 0,
                      ),
                      child: const Text(
                        'Request Ride',
                        style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
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

  Widget _buildOptionTile({
    required IconData icon,
    required String title,
    required String subtitle,
    required bool isActive,
    required Color activeColor,
    required VoidCallback onTap,
  }) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: isActive
                      ? activeColor.withValues(alpha: 0.15)
                      : context.isDark ? Colors.white.withValues(alpha: 0.05) : Colors.black.withValues(alpha: 0.05),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  icon,
                  color: isActive ? activeColor : context.mutedColor,
                  size: 22,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: TextStyle(
                        color: isActive ? activeColor : context.textColor,
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: TextStyle(
                        color: context.mutedColor,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                width: 48,
                height: 28,
                padding: const EdgeInsets.all(2),
                decoration: BoxDecoration(
                  color: isActive ? activeColor : context.borderColor,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: AnimatedAlign(
                  duration: const Duration(milliseconds: 200),
                  curve: Curves.easeOut,
                  alignment: isActive ? Alignment.centerRight : Alignment.centerLeft,
                  child: Container(
                    width: 24,
                    height: 24,
                    decoration: BoxDecoration(
                      color: isActive ? Colors.black : context.cardColor,
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.15),
                          blurRadius: 4,
                          offset: const Offset(0, 2),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
