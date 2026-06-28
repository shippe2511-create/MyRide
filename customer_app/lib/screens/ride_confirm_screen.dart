import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
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

class RideConfirmScreen extends StatelessWidget {
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
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.bgColor,
      body: Stack(
        children: [
          // Map
          GoogleMap(
            initialCameraPosition: CameraPosition(
              target: LatLng((pickupLat + dropoffLat) / 2, (pickupLng + dropoffLng) / 2),
              zoom: 13,
            ),
            markers: {
              Marker(
                markerId: const MarkerId('pickup'),
                position: LatLng(pickupLat, pickupLng),
                icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueGreen),
              ),
              Marker(
                markerId: const MarkerId('dropoff'),
                position: LatLng(dropoffLat, dropoffLng),
                icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueRed),
              ),
            },
            polylines: {
              Polyline(
                polylineId: const PolylineId('route'),
                points: [LatLng(pickupLat, pickupLng), LatLng(dropoffLat, dropoffLng)],
                color: AppColors.yellow,
                width: 4,
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
                              Text(pickup, style: TextStyle(color: context.textColor, fontSize: 15, fontWeight: FontWeight.w600)),
                              const SizedBox(height: 14),
                              Text('Dropoff', style: TextStyle(color: context.mutedColor, fontSize: 12)),
                              Text(dropoff, style: TextStyle(color: context.textColor, fontSize: 15, fontWeight: FontWeight.w600), overflow: TextOverflow.ellipsis),
                            ],
                          ),
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
                        HapticFeedback.mediumImpact();
                        Navigator.pushReplacement(
                          context,
                          MaterialPageRoute(
                            builder: (_) => DriverMatchingScreen(
                              pickup: pickup,
                              dropoff: dropoff,
                              rideType: 'Staff Car',
                              pickupLat: pickupLat,
                              pickupLng: pickupLng,
                              dropoffLat: dropoffLat,
                              dropoffLng: dropoffLng,
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
