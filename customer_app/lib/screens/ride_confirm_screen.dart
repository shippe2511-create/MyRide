import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:http/http.dart' as http;
import '../config/app_config.dart';
import '../theme/app_theme.dart';
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

  @override
  void initState() {
    super.initState();
    _fetchRoute();
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

            // Fit map to route bounds
            if (_mapController != null && points.isNotEmpty) {
              final bounds = _getBounds(points);
              _mapController!.animateCamera(
                CameraUpdate.newLatLngBounds(bounds, 80),
              );
            }
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
            onMapCreated: (controller) {
              _mapController = controller;
              // Fit bounds after map is created if route is already loaded
              if (_routePoints.isNotEmpty) {
                final bounds = _getBounds(_routePoints);
                controller.animateCamera(
                  CameraUpdate.newLatLngBounds(bounds, 80),
                );
              }
            },
            markers: {
              Marker(
                markerId: const MarkerId('pickup'),
                position: LatLng(widget.pickupLat, widget.pickupLng),
                icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueGreen),
              ),
              Marker(
                markerId: const MarkerId('dropoff'),
                position: LatLng(widget.dropoffLat, widget.dropoffLng),
                icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueRed),
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
            style: context.isDark ? _darkMapStyle : null,
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

                  // Request button
                  SizedBox(
                    width: double.infinity,
                    height: 56,
                    child: ElevatedButton(
                      onPressed: () {
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
}
