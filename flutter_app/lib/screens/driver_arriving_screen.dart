import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../providers/app_state.dart';
import '../theme/app_theme.dart';
import '../services/supabase_service.dart';
import '../services/notification_service.dart';
import 'trip_tracking_screen.dart';
import 'chat_screen.dart';

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
  final int eta;
  final String? rideId;

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
    required this.eta,
    this.rideId,
  });

  @override
  State<DriverArrivingScreen> createState() => _DriverArrivingScreenState();
}

class _DriverArrivingScreenState extends State<DriverArrivingScreen> {
  late Timer _etaTimer;
  Timer? _statusPollingTimer;
  int _currentEta = 0;
  final LatLng _pickupLocation = const LatLng(4.2286, 73.5400);
  late LatLng _driverLocation;
  RealtimeChannel? _rideSubscription;
  bool _driverArrived = false;
  bool _tripStarted = false;

  @override
  void initState() {
    super.initState();
    _currentEta = widget.eta;
    _driverLocation = LatLng(_pickupLocation.latitude + 0.008, _pickupLocation.longitude + 0.005);
    _startEtaCountdown();
    _subscribeToRideUpdates();
    _startStatusPolling(); // Backup polling
  }

  void _subscribeToRideUpdates() {
    if (widget.rideId == null) return;

    _rideSubscription = SupabaseService.subscribeToRideUpdates(widget.rideId!, (update) {
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
      // Show notification
      NotificationService().showDriverArrivedNotification(
        driverName: widget.driverName,
        vehicle: widget.vehicleNumber,
      );
      _onDriverArrived(); // This sets _driverArrived = true with setState
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
              'rideId': widget.rideId,
              'status': 'in_progress',
            },
          ),
        ),
      );
    } else if (status == 'cancelled') {
      _statusPollingTimer?.cancel();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Ride was cancelled'), backgroundColor: Colors.red),
      );
      Navigator.popUntil(context, (route) => route.isFirst);
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

    // Show in-app snackbar
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Driver has arrived at pickup location!'),
          backgroundColor: Colors.green,
          duration: Duration(seconds: 3),
        ),
      );
    }
  }

  void _startTrip() {
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(
        builder: (_) => TripTrackingScreen(
          tripData: {
            'id': 'trip-${DateTime.now().millisecondsSinceEpoch}',
            'pickup': widget.pickup,
            'dropoff': widget.dropoff,
            'driverName': widget.driverName,
            'driverRating': widget.driverRating,
            'vehicleNumber': widget.vehicleNumber,
            'vehicleModel': widget.vehicleModel,
            'driverPhone': widget.driverPhone,
            'rideType': widget.rideType,
            'status': 'in_progress',
          },
        ),
      ),
    );
  }

  @override
  void dispose() {
    _etaTimer.cancel();
    _statusPollingTimer?.cancel();
    _rideSubscription?.unsubscribe();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.bgColor,
      body: Stack(
        children: [
          // Map
          FlutterMap(
            options: MapOptions(initialCenter: _pickupLocation, initialZoom: 15),
            children: [
              TileLayer(urlTemplate: context.isDark ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', subdomains: const ['a', 'b', 'c', 'd']),
              PolylineLayer(polylines: [Polyline(points: [_driverLocation, _pickupLocation], color: AppColors.yellow, strokeWidth: 4)]),
              MarkerLayer(
                markers: [
                  Marker(
                    point: _pickupLocation,
                    width: 44,
                    height: 44,
                    child: Container(
                      decoration: BoxDecoration(color: AppColors.success, shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 3)),
                      child: Icon(Icons.person, color: Colors.white, size: 22),
                    ),
                  ),
                  Marker(
                    point: _driverLocation,
                    width: 50,
                    height: 50,
                    child: Container(
                      decoration: BoxDecoration(color: AppColors.yellow, shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 3), boxShadow: [BoxShadow(color: AppColors.yellow.withValues(alpha: 0.5), blurRadius: 12)]),
                      child: Icon(Icons.local_taxi, color: Colors.black, size: 26),
                    ),
                  ),
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
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(color: context.surfaceColor, borderRadius: BorderRadius.circular(14)),
                      child: Icon(Icons.close, color: context.textColor, size: 22),
                    ),
                  ),
                  const SizedBox(width: 10),
                  // SOS Button
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
            initialChildSize: 0.44,
            minChildSize: 0.35,
            maxChildSize: 0.44,
            snap: true,
            snapSizes: const [0.44],
            builder: (context, scrollController) {
              return Container(
                decoration: BoxDecoration(color: context.surfaceColor, borderRadius: const BorderRadius.vertical(top: Radius.circular(28))),
                child: ListView(
                  controller: scrollController,
                  padding: EdgeInsets.zero,
                  children: [
                    Center(child: Container(margin: const EdgeInsets.only(top: 12), width: 40, height: 4, decoration: BoxDecoration(color: context.borderColor, borderRadius: BorderRadius.circular(2)))),

                    // Status
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
                      child: Row(
                        children: [
                          Container(
                            width: 10,
                            height: 10,
                            decoration: BoxDecoration(
                              color: _driverArrived ? AppColors.yellow : AppColors.success,
                              shape: BoxShape.circle,
                            ),
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

                    // Driver info
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
                      child: Row(
                        children: [
                          CircleAvatar(radius: 28, backgroundColor: context.bgColor, child: Icon(Icons.person, color: context.mutedColor, size: 28)),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(widget.driverName, style: TextStyle(color: context.textColor, fontSize: 17, fontWeight: FontWeight.w700)),
                                const SizedBox(height: 4),
                                Row(
                                  children: [
                                    Icon(Icons.star, color: AppColors.yellow, size: 16),
                                    const SizedBox(width: 4),
                                    Text('${widget.driverRating}', style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w600)),
                                    const SizedBox(width: 10),
                                    Text(widget.vehicleNumber, style: TextStyle(color: context.mutedColor, fontSize: 13)),
                                  ],
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  'Vehicle: ${widget.vehicleModel}',
                                  style: TextStyle(color: context.mutedColor, fontSize: 12),
                                ),
                              ],
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                            decoration: BoxDecoration(color: AppColors.yellow.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(10), border: Border.all(color: AppColors.yellow.withValues(alpha: 0.3))),
                            child: Text(widget.vehicleModel, style: TextStyle(color: AppColors.yellow, fontSize: 15, fontWeight: FontWeight.w700, letterSpacing: 1)),
                          ),
                        ],
                      ),
                    ),

                    // Action buttons
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
                      child: Row(
                        children: [
                          Expanded(child: _buildActionButton(Icons.phone, 'Call')),
                          const SizedBox(width: 12),
                          Expanded(child: _buildActionButton(Icons.message, 'Message')),
                          const SizedBox(width: 12),
                          Expanded(child: _buildActionButton(Icons.share_location, 'Share')),
                        ],
                      ),
                    ),

                    // Trip route
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 16, 20, 30),
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

    Share.share(message, subject: 'My Ride Details');
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
            const SizedBox(height: 24),
            Row(
              children: [
                Expanded(child: SizedBox(height: 50, child: OutlinedButton(onPressed: () => Navigator.pop(ctx), style: OutlinedButton.styleFrom(foregroundColor: ctx.textColor, side: BorderSide(color: ctx.borderColor), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))), child: Text('Keep Ride', style: TextStyle(color: ctx.textColor, fontWeight: FontWeight.w600))))),
                const SizedBox(width: 12),
                Expanded(child: SizedBox(height: 50, child: ElevatedButton(onPressed: () { Navigator.pop(ctx); Navigator.popUntil(context, (route) => route.isFirst); }, style: ElevatedButton.styleFrom(backgroundColor: AppColors.error, foregroundColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)), elevation: 0), child: Text('Cancel', style: TextStyle(fontWeight: FontWeight.w600))))),
              ],
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
