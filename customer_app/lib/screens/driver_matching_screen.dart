import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../theme/app_theme.dart';
import '../services/supabase_service.dart';
import '../services/notification_service.dart';
import '../providers/app_state.dart';
import 'driver_arriving_screen.dart';

class DriverMatchingScreen extends StatefulWidget {
  final String pickup;
  final String dropoff;
  final String rideType;
  final double pickupLat;
  final double pickupLng;
  final double dropoffLat;
  final double dropoffLng;

  const DriverMatchingScreen({
    super.key,
    required this.pickup,
    required this.dropoff,
    required this.rideType,
    required this.pickupLat,
    required this.pickupLng,
    required this.dropoffLat,
    required this.dropoffLng,
  });

  @override
  State<DriverMatchingScreen> createState() => _DriverMatchingScreenState();
}

class _DriverMatchingScreenState extends State<DriverMatchingScreen>
    with TickerProviderStateMixin {
  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;
  late Timer _matchTimer;
  late Timer _driverMoveTimer;
  int _driversChecked = 0;
  String _statusText = 'Finding your driver...';
  String? _rideId;
  RealtimeChannel? _rideSubscription;
  bool _driverFound = false;

  late LatLng _userLocation;
  List<LatLng> _driverLocations = [];
  int _availableDriverCount = 0;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _userLocation = LatLng(widget.pickupLat, widget.pickupLng);
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
    _fetchAvailableDrivers();
    _createRideInDatabase();

    _pulseController = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    )..repeat(reverse: true);

    _pulseAnimation = Tween<double>(begin: 1.0, end: 2.0).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );

    _startMatching();
    _startDriverMovement();
  }

  Future<void> _fetchAvailableDrivers() async {
    try {
      // Get real driver locations from database
      final locations = await SupabaseService.getOnlineDriverLocations();

      setState(() {
        _availableDriverCount = locations.length;
        _driverLocations = locations.map((loc) {
          final lat = double.tryParse(loc['lat']?.toString() ?? '') ?? 0;
          final lng = double.tryParse(loc['lng']?.toString() ?? '') ?? 0;
          return LatLng(lat, lng);
        }).where((loc) => loc.latitude != 0 && loc.longitude != 0).toList();
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

      final ride = await SupabaseService.createRide(
        pickupName: widget.pickup,
        dropoffName: widget.dropoff,
        pickupLat: widget.pickupLat,
        pickupLng: widget.pickupLng,
        dropoffLat: widget.dropoffLat,
        dropoffLng: widget.dropoffLng,
        customerId: customerId,
      );
      _rideId = ride['id'];
      debugPrint('Ride created: $_rideId');

      // Subscribe to chat notifications for this ride
      if (customerId != null) {
        NotificationService.subscribeToChatMessages(_rideId!, customerId);
      }

      // Subscribe to ride status updates
      _subscribeToRideUpdates();

      // Also poll as backup (realtime may not work without auth)
      _startStatusPolling();
    } catch (e) {
      debugPrint('Error creating ride: $e');
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

  void _subscribeToRideUpdates() {
    if (_rideId == null) return;

    _rideSubscription = SupabaseService.subscribeToRideUpdates(_rideId!, (update) {
      if (!mounted || _driverFound) return;

      final status = update['status'] as String?;
      debugPrint('Ride status updated: $status');

      if (status == 'accepted' || status == 'arrived' || status == 'in_progress') {
        _matchTimer.cancel();
        _onDriverFound();
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
    _driverMoveTimer = Timer.periodic(const Duration(milliseconds: 1500), (timer) {
      if (!mounted) return;
      setState(() {
        for (int i = 0; i < _driverLocations.length; i++) {
          final random = Random();
          _driverLocations[i] = LatLng(
            _driverLocations[i].latitude + (random.nextDouble() - 0.5) * 0.001,
            _driverLocations[i].longitude + (random.nextDouble() - 0.5) * 0.001,
          );
        }
      });
    });
  }

  void _onDriverFound() async {
    if (_driverFound) return; // Prevent duplicate calls
    _driverFound = true;

    HapticFeedback.mediumImpact();
    _rideSubscription?.unsubscribe();
    _statusPollingTimer?.cancel();

    // Show notification
    NotificationService().showDriverAcceptedNotification(
      driverName: 'Driver',
      vehicle: 'On the way',
      minutesAway: 5,
    );

    // Get the ACTUAL driver who accepted from the ride record
    String driverName = 'Driver';
    double driverRating = 5.0;
    String vehicleNumber = '';
    String vehicleModel = '';
    String driverPhone = '';
    String? driverPhoto;
    String? driverProfileId;

    try {
      if (_rideId != null) {
        // Fetch the ride with actual driver info
        final ride = await SupabaseService.getRideById(_rideId!);

        if (ride != null && ride['driver'] != null) {
          final driver = ride['driver'];
          final profile = driver['profile'];
          final vehicle = driver['vehicle'];

          driverName = profile?['full_name'] ?? 'Driver';
          driverRating = (driver['rating'] ?? 5.0).toDouble();
          driverPhone = profile?['phone'] ?? '';
          driverPhoto = profile?['avatar_url'];
          driverProfileId = driver['profile_id'] as String? ?? profile?['id'] as String?;

          if (vehicle != null) {
            vehicleNumber = vehicle['plate_no'] ?? '';
            vehicleModel = vehicle['display_name'] ?? '';
          }

          debugPrint('Found actual driver: $driverName, profileId: $driverProfileId');
        }
      }
    } catch (e) {
      debugPrint('Error fetching driver: $e');
    }

    if (!mounted) return;

    Navigator.pushReplacement(
      context,
      MaterialPageRoute(
        builder: (_) => DriverArrivingScreen(
          pickup: widget.pickup,
          dropoff: widget.dropoff,
          rideType: widget.rideType,
          driverName: driverName,
          driverRating: driverRating,
          vehicleNumber: vehicleNumber,
          vehicleModel: vehicleModel,
          driverPhone: driverPhone,
          driverPhoto: driverPhoto,
          driverProfileId: driverProfileId,
          eta: 4,
          rideId: _rideId,
        ),
      ),
    );
  }

  @override
  void dispose() {
    _pulseController.dispose();
    _matchTimer.cancel();
    _driverMoveTimer.cancel();
    _rideSubscription?.unsubscribe();
    _statusPollingTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.bgColor,
      body: Stack(
        children: [
          // Live Map
          FlutterMap(
            options: MapOptions(
              initialCenter: _userLocation,
              initialZoom: 15,
            ),
            children: [
              TileLayer(
                urlTemplate: context.isDark ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
                subdomains: const ['a', 'b', 'c', 'd'],
              ),
              // User marker with pulse
              MarkerLayer(
                markers: [
                  // User location with pulse animation
                  Marker(
                    point: _userLocation,
                    width: 100,
                    height: 100,
                    child: AnimatedBuilder(
                      animation: _pulseAnimation,
                      builder: (context, child) {
                        return Stack(
                          alignment: Alignment.center,
                          children: [
                            // Pulse ring
                            Container(
                              width: 30 * _pulseAnimation.value,
                              height: 30 * _pulseAnimation.value,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: AppColors.yellow.withValues(alpha: 0.3 / _pulseAnimation.value),
                              ),
                            ),
                            // User dot
                            Container(
                              width: 24,
                              height: 24,
                              decoration: BoxDecoration(
                                color: AppColors.yellow,
                                shape: BoxShape.circle,
                                border: Border.all(color: Colors.white, width: 3),
                                boxShadow: [
                                  BoxShadow(
                                    color: AppColors.yellow.withValues(alpha: 0.5),
                                    blurRadius: 12,
                                  ),
                                ],
                              ),
                            ),
                          ],
                        );
                      },
                    ),
                  ),
                  // Driver markers
                  ..._driverLocations.map((loc) => Marker(
                    point: loc,
                    width: 44,
                    height: 44,
                    child: Container(
                      decoration: BoxDecoration(
                        color: AppColors.yellow,
                        borderRadius: BorderRadius.circular(12),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.3),
                            blurRadius: 8,
                            offset: const Offset(0, 2),
                          ),
                        ],
                      ),
                      child: Icon(Icons.local_taxi, color: Colors.black, size: 24),
                    ),
                  )),
                ],
              ),
            ],
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
                  const SizedBox(height: 20),

                  // Simple loading with text
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.5,
                          valueColor: AlwaysStoppedAnimation<Color>(AppColors.yellow),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Text(
                        _statusText,
                        style: TextStyle(color: context.textColor, fontSize: 17, fontWeight: FontWeight.w600),
                      ),
                    ],
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
