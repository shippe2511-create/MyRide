import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import '../providers/app_state.dart';
import '../theme/app_theme.dart';
import '../services/supabase_service.dart';
import '../services/notification_service.dart';
import 'trip_complete_screen.dart';
import 'chat_screen.dart';

class TripTrackingScreen extends StatefulWidget {
  final Map<String, dynamic> tripData;

  const TripTrackingScreen({super.key, required this.tripData});

  @override
  State<TripTrackingScreen> createState() => _TripTrackingScreenState();
}

class _TripTrackingScreenState extends State<TripTrackingScreen> {
  late MapController _mapController;

  LatLng _driverLocation = const LatLng(4.2100, 73.5350);
  final LatLng _pickupLocation = const LatLng(4.2286, 73.5400);
  final LatLng _dropoffLocation = const LatLng(4.1918, 73.5290);

  int _etaMinutes = 12;
  late String _dropoff;
  Timer? _simulationTimer;
  Timer? _statusPollingTimer;
  bool _tripCompleted = false;
  String _rideStatus = 'accepted'; // accepted, arrived, in_progress, completed

  @override
  void initState() {
    super.initState();
    _mapController = MapController();
    _dropoff = widget.tripData['dropoff'] ?? 'Velana International Airport';
    _rideStatus = widget.tripData['status'] as String? ?? 'accepted';
    _startDriverSimulation();
    _startStatusPolling(); // Poll for driver completing the trip
  }

  @override
  void dispose() {
    _simulationTimer?.cancel();
    _statusPollingTimer?.cancel();
    super.dispose();
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

          // Update status for UI
          if (status != null && status != _rideStatus) {
            setState(() => _rideStatus = status);
          }

          if (status == 'completed' && !_tripCompleted) {
            _statusPollingTimer?.cancel();
            _simulationTimer?.cancel();
            _onTripCompleted(); // This sets _tripCompleted = true
          } else if (status == 'cancelled') {
            _statusPollingTimer?.cancel();
            _simulationTimer?.cancel();
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Trip was cancelled'), backgroundColor: Colors.red),
            );
            Navigator.popUntil(context, (route) => route.isFirst);
          }
        }
      } catch (e) {
        debugPrint('Trip polling error: $e');
      }
    });
  }

  void _startDriverSimulation() {
    _simulationTimer = Timer.periodic(const Duration(seconds: 3), (timer) {
      if (mounted && !_tripCompleted) {
        setState(() {
          _driverLocation = LatLng(
            _driverLocation.latitude - 0.001,
            _driverLocation.longitude - 0.0005,
          );
          if (_etaMinutes > 1) {
            _etaMinutes--;
          }
          // Don't auto-complete - wait for driver to mark as completed via database
        });
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
          vehicleNumber = vehicle?['plate_no'] as String? ?? vehicle?['display_name'] as String?;
          distance = (ride['distance_km'] as num?)?.toDouble();

          // Calculate duration from started_at to completed_at
          final startedAt = ride['started_at'] as String?;
          final completedAt = ride['completed_at'] as String?;
          if (startedAt != null && completedAt != null) {
            final start = DateTime.tryParse(startedAt);
            final end = DateTime.tryParse(completedAt);
            if (start != null && end != null) {
              duration = end.difference(start).inMinutes;
              if (duration! < 1) duration = 1; // Minimum 1 minute
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.bgColor,
      body: Stack(
        children: [
          // Full screen map
          FlutterMap(
            mapController: _mapController,
            options: MapOptions(
              initialCenter: _driverLocation,
              initialZoom: 14,
            ),
            children: [
              TileLayer(
                urlTemplate: context.isDark ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
                subdomains: const ['a', 'b', 'c', 'd'],
              ),
              PolylineLayer(
                polylines: [
                  Polyline(
                    points: [_pickupLocation, _driverLocation, _dropoffLocation],
                    color: AppColors.yellow,
                    strokeWidth: 4,
                  ),
                ],
              ),
              MarkerLayer(
                markers: [
                  Marker(
                    point: _pickupLocation,
                    width: 44,
                    height: 44,
                    child: Container(
                      decoration: BoxDecoration(
                        color: AppColors.success,
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white, width: 3),
                      ),
                      child: Icon(Icons.person, color: Colors.white, size: 22),
                    ),
                  ),
                  Marker(
                    point: _dropoffLocation,
                    width: 44,
                    height: 44,
                    child: Container(
                      decoration: BoxDecoration(
                        color: AppColors.error,
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white, width: 3),
                      ),
                      child: Icon(Icons.flag, color: Colors.white, size: 20),
                    ),
                  ),
                  Marker(
                    point: _driverLocation,
                    width: 50,
                    height: 50,
                    child: Container(
                      decoration: BoxDecoration(
                        color: AppColors.yellow,
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white, width: 3),
                        boxShadow: [BoxShadow(color: AppColors.yellow.withValues(alpha: 0.5), blurRadius: 12)],
                      ),
                      child: Icon(Icons.local_taxi, color: Colors.black, size: 26),
                    ),
                  ),
                ],
              ),
            ],
          ),

          // Top bar - matching driver arriving screen
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  GestureDetector(
                    onTap: () => Navigator.pop(context),
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
                  // SOS Button
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

          // Simple bottom sheet
          DraggableScrollableSheet(
            initialChildSize: 0.48,
            minChildSize: 0.35,
            maxChildSize: 0.6,
            snap: true,
            snapSizes: const [0.48],
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

                    // Simple Status Row
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
                      child: Row(
                        children: [
                          Container(
                            width: 40,
                            height: 40,
                            decoration: BoxDecoration(
                              color: statusColor,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Icon(statusIcon, color: Colors.white, size: 22),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              statusText,
                              style: TextStyle(
                                color: context.textColor,
                                fontSize: 18,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                            decoration: BoxDecoration(
                              color: statusColor.withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Text(
                              '$_etaMinutes min',
                              style: TextStyle(color: statusColor, fontSize: 14, fontWeight: FontWeight.w700),
                            ),
                          ),
                        ],
                      ),
                    ),

                    // Simple Driver Card
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
                      child: Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: context.isDark ? const Color(0xFF1E1E22) : Colors.white,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: context.isDark ? Colors.white10 : Colors.black.withValues(alpha: 0.06)),
                        ),
                        child: Row(
                          children: [
                            Container(
                              width: 50,
                              height: 50,
                              decoration: BoxDecoration(
                                color: AppColors.yellow,
                                borderRadius: BorderRadius.circular(14),
                              ),
                              child: Icon(Icons.person_rounded, color: Colors.black, size: 28),
                            ),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    widget.tripData['driverName'] ?? 'Driver',
                                    style: TextStyle(color: context.textColor, fontSize: 17, fontWeight: FontWeight.w700),
                                  ),
                                  const SizedBox(height: 4),
                                  Row(
                                    children: [
                                      Icon(Icons.star_rounded, color: AppColors.yellow, size: 16),
                                      const SizedBox(width: 4),
                                      Text('${widget.tripData['driverRating'] ?? 4.9}', style: TextStyle(color: context.mutedColor, fontSize: 14, fontWeight: FontWeight.w600)),
                                      const SizedBox(width: 10),
                                      Text('•', style: TextStyle(color: context.mutedColor)),
                                      const SizedBox(width: 10),
                                      Text(widget.tripData['vehicleNumber'] ?? 'MV70', style: TextStyle(color: context.mutedColor, fontSize: 14, fontWeight: FontWeight.w600)),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),

                    // Modern Action Buttons
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
                      child: Row(
                        children: [
                          Expanded(child: _buildActionButton(Icons.phone_rounded, 'Call')),
                          const SizedBox(width: 12),
                          Expanded(child: _buildActionButton(Icons.chat_bubble_rounded, 'Message')),
                          const SizedBox(width: 12),
                          Expanded(child: _buildActionButton(Icons.share_location_rounded, 'Share')),
                        ],
                      ),
                    ),

                    // Simple Route Card
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
                      child: Container(
                        padding: const EdgeInsets.all(14),
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
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Text(
                                    widget.tripData['pickup'] ?? 'Current location',
                                    style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w600),
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
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Text(
                                    _dropoff,
                                    style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w600),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                                GestureDetector(
                                  onTap: () => _showChangeDestinationSheet(),
                                  child: Text('Change', style: TextStyle(color: AppColors.yellow, fontSize: 13, fontWeight: FontWeight.w700)),
                                ),
                              ],
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
        ],
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
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: context.isDark ? const Color(0xFF1E1E22) : Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: context.isDark ? Colors.white10 : Colors.black.withValues(alpha: 0.06)),
        ),
        child: Column(
          children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: buttonColor.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, color: buttonColor, size: 22),
            ),
            const SizedBox(height: 8),
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
          driverRating: widget.tripData['driverRating']?.toDouble() ?? 4.9,
          rideId: widget.tripData['rideId'] as String?,
          driverUserId: driverProfileId,
        ),
      ),
    );
  }

  void _shareTripDetails() {
    final driverName = widget.tripData['driverName'] ?? 'Driver';
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

  void _showChangeDestinationSheet() {
    String? selectedDestination;
    String? selectedName;
    double? selectedLat;
    double? selectedLng;
    String searchQuery = '';
    bool showMap = false;
    LatLng mapLocation = const LatLng(4.1755, 73.5093);
    final searchController = TextEditingController();
    final mapController = MapController();

    final List<Map<String, dynamic>> allPlaces = [
      {'name': 'Hulhumale Phase 2', 'address': 'Hulhumale Phase 2, Flat Area', 'lat': 4.2286, 'lng': 73.5400, 'icon': Icons.apartment_rounded},
      {'name': 'Hulhumale Phase 1', 'address': 'Hulhumale Phase 1, Housing Area', 'lat': 4.2116, 'lng': 73.5380, 'icon': Icons.home_work_rounded},
      {'name': 'Male City Center', 'address': 'Republic Square, Male', 'lat': 4.1755, 'lng': 73.5093, 'icon': Icons.location_city_rounded},
      {'name': 'Velana Airport', 'address': 'Velana International Airport', 'lat': 4.1918, 'lng': 73.5290, 'icon': Icons.flight_rounded},
      {'name': 'Ferry Terminal', 'address': 'Hulhumale Ferry Terminal', 'lat': 4.2106, 'lng': 73.5400, 'icon': Icons.directions_boat_rounded},
      {'name': 'Tree Top Hospital', 'address': 'Tree Top Hospital, Hulhumale', 'lat': 4.2250, 'lng': 73.5420, 'icon': Icons.local_hospital_rounded},
      {'name': 'ADK Hospital', 'address': 'ADK Hospital, Male City', 'lat': 4.1740, 'lng': 73.5100, 'icon': Icons.medical_services_rounded},
      {'name': 'Central Park', 'address': 'Hulhumale Central Park', 'lat': 4.2200, 'lng': 73.5380, 'icon': Icons.park_rounded},
    ];

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setSheetState) {
          final filteredPlaces = searchQuery.isEmpty
              ? allPlaces
              : allPlaces.where((p) =>
                  (p['name'] as String).toLowerCase().contains(searchQuery.toLowerCase()) ||
                  (p['address'] as String).toLowerCase().contains(searchQuery.toLowerCase())).toList();

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
                                        onChanged: (value) => setSheetState(() => searchQuery = value),
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
                                  FlutterMap(
                                    mapController: mapController,
                                    options: MapOptions(
                                      initialCenter: mapLocation,
                                      initialZoom: 14,
                                      onTap: (tapPosition, point) {
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
                                    ),
                                    children: [
                                      TileLayer(
                                        urlTemplate: context.isDark
                                            ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
                                            : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
                                        subdomains: const ['a', 'b', 'c', 'd'],
                                      ),
                                      MarkerLayer(
                                        markers: [
                                          if (selectedLat != null)
                                            Marker(
                                              point: LatLng(selectedLat!, selectedLng!),
                                              width: 50,
                                              height: 60,
                                              child: TweenAnimationBuilder<double>(
                                                tween: Tween(begin: 0.5, end: 1.0),
                                                duration: const Duration(milliseconds: 300),
                                                curve: Curves.elasticOut,
                                                builder: (context, value, child) => Transform.scale(
                                                  scale: value,
                                                  child: Column(
                                                    children: [
                                                      Container(
                                                        padding: const EdgeInsets.all(8),
                                                        decoration: BoxDecoration(
                                                          gradient: LinearGradient(colors: [AppColors.yellow, AppColors.yellow.withValues(alpha: 0.8)]),
                                                          shape: BoxShape.circle,
                                                          boxShadow: [BoxShadow(color: AppColors.yellow.withValues(alpha: 0.5), blurRadius: 12, spreadRadius: 2)],
                                                        ),
                                                        child: const Icon(Icons.place_rounded, color: Colors.black, size: 22),
                                                      ),
                                                      Container(width: 3, height: 12, decoration: BoxDecoration(color: AppColors.yellow, borderRadius: BorderRadius.circular(2))),
                                                    ],
                                                  ),
                                                ),
                                              ),
                                            ),
                                        ],
                                      ),
                                    ],
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
                                  // Selected location card
                                  if (selectedName != null)
                                    Positioned(
                                      bottom: 16,
                                      left: 16,
                                      right: 16,
                                      child: Container(
                                        padding: const EdgeInsets.all(16),
                                        decoration: BoxDecoration(
                                          gradient: LinearGradient(
                                            colors: context.isDark
                                                ? [const Color(0xFF2A2A2A), const Color(0xFF1E1E1E)]
                                                : [Colors.white, const Color(0xFFF8F9FA)],
                                          ),
                                          borderRadius: BorderRadius.circular(16),
                                          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.2), blurRadius: 12, offset: const Offset(0, 4))],
                                        ),
                                        child: Row(
                                          children: [
                                            Container(
                                              padding: const EdgeInsets.all(10),
                                              decoration: BoxDecoration(
                                                color: AppColors.yellow.withValues(alpha: 0.15),
                                                borderRadius: BorderRadius.circular(12),
                                              ),
                                              child: Icon(Icons.location_on_rounded, color: AppColors.yellow, size: 22),
                                            ),
                                            const SizedBox(width: 14),
                                            Expanded(
                                              child: Column(
                                                crossAxisAlignment: CrossAxisAlignment.start,
                                                children: [
                                                  Text(selectedName!, style: TextStyle(color: context.textColor, fontSize: 15, fontWeight: FontWeight.w700)),
                                                  Text('${selectedLat!.toStringAsFixed(4)}, ${selectedLng!.toStringAsFixed(4)}', style: TextStyle(color: context.mutedColor, fontSize: 12)),
                                                ],
                                              ),
                                            ),
                                            Icon(Icons.check_circle_rounded, color: AppColors.success, size: 24),
                                          ],
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                            ),
                          )
                        : ListView.builder(
                            key: const ValueKey('list'),
                            padding: const EdgeInsets.symmetric(horizontal: 24),
                            itemCount: filteredPlaces.length,
                            itemBuilder: (context, index) {
                              final place = filteredPlaces[index];
                              final isSelected = selectedDestination == place['name'];
                              return TweenAnimationBuilder<double>(
                                tween: Tween(begin: 0.0, end: 1.0),
                                duration: Duration(milliseconds: 200 + (index * 50)),
                                curve: Curves.easeOutCubic,
                                builder: (context, value, child) => Transform.translate(
                                  offset: Offset(0, 20 * (1 - value)),
                                  child: Opacity(opacity: value, child: child),
                                ),
                                child: GestureDetector(
                                  onTap: () {
                                    HapticFeedback.lightImpact();
                                    setSheetState(() {
                                      selectedDestination = place['name'];
                                      selectedName = place['name'];
                                      selectedLat = place['lat'];
                                      selectedLng = place['lng'];
                                    });
                                  },
                                  child: AnimatedContainer(
                                    duration: const Duration(milliseconds: 200),
                                    margin: const EdgeInsets.only(bottom: 12),
                                    padding: const EdgeInsets.all(16),
                                    decoration: BoxDecoration(
                                      gradient: isSelected
                                          ? LinearGradient(colors: [AppColors.yellow.withValues(alpha: 0.2), AppColors.yellow.withValues(alpha: 0.1)])
                                          : null,
                                      color: isSelected ? null : (context.isDark ? Colors.white.withValues(alpha: 0.05) : Colors.white),
                                      borderRadius: BorderRadius.circular(18),
                                      border: Border.all(
                                        color: isSelected ? AppColors.yellow : (context.isDark ? Colors.white10 : Colors.black.withValues(alpha: 0.06)),
                                        width: isSelected ? 2 : 1,
                                      ),
                                      boxShadow: isSelected ? [BoxShadow(color: AppColors.yellow.withValues(alpha: 0.2), blurRadius: 12, offset: const Offset(0, 4))] : null,
                                    ),
                                    child: Row(
                                      children: [
                                        AnimatedContainer(
                                          duration: const Duration(milliseconds: 200),
                                          width: 52,
                                          height: 52,
                                          decoration: BoxDecoration(
                                            gradient: isSelected
                                                ? LinearGradient(colors: [AppColors.yellow, AppColors.yellow.withValues(alpha: 0.7)])
                                                : null,
                                            color: isSelected ? null : (context.isDark ? Colors.white.withValues(alpha: 0.08) : Colors.black.withValues(alpha: 0.04)),
                                            borderRadius: BorderRadius.circular(14),
                                          ),
                                          child: Icon(place['icon'], color: isSelected ? Colors.black : context.mutedColor, size: 24),
                                        ),
                                        const SizedBox(width: 14),
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment: CrossAxisAlignment.start,
                                            children: [
                                              Text(place['name'], style: TextStyle(color: isSelected ? AppColors.yellow : context.textColor, fontSize: 16, fontWeight: FontWeight.w700)),
                                              const SizedBox(height: 3),
                                              Text(place['address'], style: TextStyle(color: context.mutedColor, fontSize: 13)),
                                            ],
                                          ),
                                        ),
                                        AnimatedContainer(
                                          duration: const Duration(milliseconds: 200),
                                          width: 28,
                                          height: 28,
                                          decoration: BoxDecoration(
                                            gradient: isSelected ? LinearGradient(colors: [AppColors.yellow, AppColors.yellow.withValues(alpha: 0.8)]) : null,
                                            color: isSelected ? null : Colors.transparent,
                                            shape: BoxShape.circle,
                                            border: Border.all(color: isSelected ? Colors.transparent : context.borderColor, width: 2),
                                          ),
                                          child: isSelected ? const Icon(Icons.check_rounded, color: Colors.black, size: 18) : null,
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
                  padding: EdgeInsets.fromLTRB(24, 16, 24, MediaQuery.of(ctx).padding.bottom + 20),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: context.isDark
                          ? [Colors.transparent, const Color(0xFF121212)]
                          : [Colors.transparent, const Color(0xFFF8F9FA)],
                    ),
                  ),
                  child: SizedBox(
                    width: double.infinity,
                    height: 58,
                    child: ElevatedButton(
                      onPressed: selectedDestination != null ? () {
                        HapticFeedback.mediumImpact();
                        Navigator.pop(ctx);
                        _showWaitingForDriverApproval(selectedName!, selectedName!, lat: selectedLat, lng: selectedLng);
                      } : null,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.yellow,
                        foregroundColor: Colors.black,
                        disabledBackgroundColor: context.isDark ? Colors.white12 : Colors.black12,
                        disabledForegroundColor: context.mutedColor,
                        elevation: selectedDestination != null ? 8 : 0,
                        shadowColor: AppColors.yellow.withValues(alpha: 0.4),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(selectedDestination != null ? Icons.send_rounded : Icons.location_off_rounded, size: 20),
                          const SizedBox(width: 10),
                          Text(
                            selectedDestination != null ? 'Request Change' : 'Select a destination',
                            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, letterSpacing: 0.3),
                          ),
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
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to send request'), backgroundColor: Colors.red),
        );
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
              _showDriverAcceptedChange(newDestination, destinationName);
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
                      foregroundColor: context.mutedColor,
                      side: BorderSide(color: context.borderColor),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: Text('Cancel Request', style: TextStyle(fontWeight: FontWeight.w600)),
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

  void _showCancelDialog() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: context.surfaceColor,
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(width: 40, height: 4, decoration: BoxDecoration(color: context.borderColor, borderRadius: BorderRadius.circular(2))),
            const SizedBox(height: 24),
            Container(width: 60, height: 60, decoration: BoxDecoration(color: AppColors.error.withValues(alpha: 0.15), shape: BoxShape.circle), child: Icon(Icons.warning_amber_rounded, color: AppColors.error, size: 30)),
            const SizedBox(height: 16),
            Text('Cancel Trip?', style: TextStyle(color: context.textColor, fontSize: 20, fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            Text('Are you sure you want to cancel?', style: TextStyle(color: context.mutedColor, fontSize: 15)),
            const SizedBox(height: 24),
            Row(
              children: [
                Expanded(
                  child: SizedBox(
                    height: 50,
                    child: OutlinedButton(
                      onPressed: () => Navigator.pop(ctx),
                      style: OutlinedButton.styleFrom(foregroundColor: context.textColor, side: BorderSide(color: context.borderColor), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                      child: Text('Keep Trip', style: TextStyle(fontWeight: FontWeight.w600)),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: SizedBox(
                    height: 50,
                    child: ElevatedButton(
                      onPressed: () {
                        Navigator.pop(ctx);
                        Navigator.popUntil(context, (route) => route.isFirst);
                      },
                      style: ElevatedButton.styleFrom(backgroundColor: AppColors.error, foregroundColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)), elevation: 0),
                      child: Text('Cancel', style: TextStyle(fontWeight: FontWeight.w600)),
                    ),
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

  void _completeTrip() {
    HapticFeedback.heavyImpact();
    _onTripCompleted();
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
    final driverName = widget.tripData['driverName'] ?? 'Driver';
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

    final driverName = widget.tripData['driverName'] ?? 'Driver';
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
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            Icon(Icons.check_circle, color: Colors.white, size: 20),
            const SizedBox(width: 10),
            Text(message),
          ],
        ),
        backgroundColor: AppColors.success,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }
}
