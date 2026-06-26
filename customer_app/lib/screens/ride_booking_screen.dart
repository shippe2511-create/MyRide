import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../providers/app_state.dart';
import '../theme/app_theme.dart';
import '../services/supabase_service.dart';
import '../widgets/app_snackbar.dart';
import 'driver_matching_screen.dart';

const String _darkMapStyle = '''
[
  {"elementType": "geometry", "stylers": [{"color": "#212121"}]},
  {"elementType": "labels.icon", "stylers": [{"visibility": "off"}]},
  {"elementType": "labels.text.fill", "stylers": [{"color": "#757575"}]},
  {"featureType": "road", "elementType": "geometry.fill", "stylers": [{"color": "#2c2c2c"}]},
  {"featureType": "water", "elementType": "geometry", "stylers": [{"color": "#000000"}]}
]
''';

class RideBookingScreen extends StatefulWidget {
  final String pickup;
  final String dropoff;
  final LatLng? pickupLatLng;
  final LatLng? dropoffLatLng;

  const RideBookingScreen({
    super.key,
    required this.pickup,
    required this.dropoff,
    this.pickupLatLng,
    this.dropoffLatLng,
  });

  @override
  State<RideBookingScreen> createState() => _RideBookingScreenState();
}

class _RideBookingScreenState extends State<RideBookingScreen> {
  late LatLng pickupLoc;
  late LatLng dropoffLoc;
  bool _isScheduling = false;

  @override
  void initState() {
    super.initState();
    pickupLoc = widget.pickupLatLng ?? const LatLng(4.2286, 73.5400);
    dropoffLoc = widget.dropoffLatLng ?? const LatLng(4.1918, 73.5290);
  }

  void _showSchedulePicker(BuildContext context) {
    DateTime selectedDate = DateTime.now().add(const Duration(hours: 1));
    TimeOfDay selectedTime = TimeOfDay.fromDateTime(selectedDate);

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setModalState) => Container(
          padding: EdgeInsets.fromLTRB(20, 16, 20, MediaQuery.of(ctx).padding.bottom + 20),
          decoration: BoxDecoration(
            color: context.cardColor,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Handle
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: context.borderColor,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 20),

              // Title
              Row(
                children: [
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: AppColors.yellow.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Icon(Icons.schedule, color: AppColors.yellow, size: 26),
                  ),
                  const SizedBox(width: 14),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Schedule Ride',
                        style: TextStyle(
                          color: context.textColor,
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      Text(
                        'Book in advance for later',
                        style: TextStyle(color: context.mutedColor, fontSize: 13),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 24),

              // Date picker
              GestureDetector(
                onTap: () async {
                  final date = await showDatePicker(
                    context: context,
                    initialDate: selectedDate,
                    firstDate: DateTime.now(),
                    lastDate: DateTime.now().add(const Duration(days: 7)),
                    builder: (context, child) => Theme(
                      data: Theme.of(context).copyWith(
                        colorScheme: ColorScheme.dark(
                          primary: AppColors.yellow,
                          surface: context.cardColor,
                        ),
                      ),
                      child: child!,
                    ),
                  );
                  if (date != null) {
                    setModalState(() {
                      selectedDate = DateTime(
                        date.year, date.month, date.day,
                        selectedTime.hour, selectedTime.minute,
                      );
                    });
                  }
                },
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: context.bgColor,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: context.borderColor),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.calendar_today, color: AppColors.yellow, size: 22),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          DateFormat('EEEE, MMM d').format(selectedDate),
                          style: TextStyle(color: context.textColor, fontSize: 16, fontWeight: FontWeight.w600),
                        ),
                      ),
                      Icon(Icons.chevron_right, color: context.mutedColor),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),

              // Time picker
              GestureDetector(
                onTap: () async {
                  final time = await showTimePicker(
                    context: context,
                    initialTime: selectedTime,
                    builder: (context, child) => Theme(
                      data: Theme.of(context).copyWith(
                        colorScheme: ColorScheme.dark(
                          primary: AppColors.yellow,
                          surface: context.cardColor,
                        ),
                      ),
                      child: child!,
                    ),
                  );
                  if (time != null) {
                    setModalState(() {
                      selectedTime = time;
                      selectedDate = DateTime(
                        selectedDate.year, selectedDate.month, selectedDate.day,
                        time.hour, time.minute,
                      );
                    });
                  }
                },
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: context.bgColor,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: context.borderColor),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.access_time, color: AppColors.yellow, size: 22),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          DateFormat('h:mm a').format(selectedDate),
                          style: TextStyle(color: context.textColor, fontSize: 16, fontWeight: FontWeight.w600),
                        ),
                      ),
                      Icon(Icons.chevron_right, color: context.mutedColor),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 24),

              // Schedule button
              SizedBox(
                width: double.infinity,
                height: 54,
                child: ElevatedButton(
                  onPressed: _isScheduling
                      ? null
                      : () => _scheduleRide(ctx, selectedDate),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.yellow,
                    foregroundColor: Colors.black,
                    disabledBackgroundColor: AppColors.yellow.withValues(alpha: 0.5),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                  child: _isScheduling
                      ? SizedBox(
                          width: 24,
                          height: 24,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black),
                        )
                      : Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.check_circle, size: 22),
                            const SizedBox(width: 10),
                            Text(
                              'Schedule Ride',
                              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                            ),
                          ],
                        ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _scheduleRide(BuildContext ctx, DateTime scheduledTime) async {
    setState(() => _isScheduling = true);

    try {
      final appState = Provider.of<AppState>(context, listen: false);
      await SupabaseService.createRide(
        pickupName: widget.pickup,
        dropoffName: widget.dropoff,
        pickupLat: pickupLoc.latitude,
        pickupLng: pickupLoc.longitude,
        dropoffLat: dropoffLoc.latitude,
        dropoffLng: dropoffLoc.longitude,
        scheduledTime: scheduledTime,
        customerId: appState.profileId,
      );

      if (mounted) {
        Navigator.pop(ctx); // Close bottom sheet
        AppSnackbar.success(context, 'Ride scheduled for ${DateFormat('MMM d, h:mm a').format(scheduledTime)}');
        Navigator.pop(context); // Go back to home
      }
    } catch (e) {
      if (mounted) {
        AppSnackbar.error(context, 'Failed to schedule ride', subtitle: '$e');
      }
    } finally {
      if (mounted) setState(() => _isScheduling = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomPadding = MediaQuery.of(context).padding.bottom;
    final centerLat = (pickupLoc.latitude + dropoffLoc.latitude) / 2;
    final centerLng = (pickupLoc.longitude + dropoffLoc.longitude) / 2;

    return Scaffold(
      backgroundColor: context.bgColor,
      body: Stack(
        children: [
          // Google Map
          Positioned.fill(
            bottom: 0,
            child: GoogleMap(
              initialCameraPosition: CameraPosition(
                target: LatLng(centerLat, centerLng),
                zoom: 13.5,
              ),
              markers: {
                Marker(
                  markerId: const MarkerId('pickup'),
                  position: pickupLoc,
                  icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueGreen),
                  infoWindow: InfoWindow(title: 'Pickup', snippet: widget.pickup),
                ),
                Marker(
                  markerId: const MarkerId('dropoff'),
                  position: dropoffLoc,
                  icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueRed),
                  infoWindow: InfoWindow(title: 'Drop-off', snippet: widget.dropoff),
                ),
              },
              polylines: {
                Polyline(
                  polylineId: const PolylineId('route'),
                  points: [pickupLoc, dropoffLoc],
                  color: AppColors.yellow,
                  width: 4,
                ),
              },
              myLocationEnabled: true,
              myLocationButtonEnabled: false,
              zoomControlsEnabled: false,
              mapToolbarEnabled: false,
              style: context.isDark ? _darkMapStyle : null,
            ),
          ),

          // Top bar - minimal style
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  GestureDetector(
                    onTap: () => Navigator.pop(context),
                    child: Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        color: context.surfaceColor,
                        borderRadius: BorderRadius.circular(16),
                        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.4), blurRadius: 12)],
                      ),
                      child: Icon(Icons.arrow_back, color: context.textColor, size: 24),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                    decoration: BoxDecoration(
                      color: context.surfaceColor,
                      borderRadius: BorderRadius.circular(24),
                      boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.4), blurRadius: 12)],
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 8,
                          height: 8,
                          decoration: BoxDecoration(color: AppColors.success, shape: BoxShape.circle),
                        ),
                        const SizedBox(width: 8),
                        Text('Staff Transport', style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w600)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Bottom panel - fixed position
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: Container(
              decoration: BoxDecoration(
                color: context.surfaceColor,
                borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
                boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.5), blurRadius: 20, offset: const Offset(0, -4))],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Drag handle
                  Container(
                    margin: const EdgeInsets.only(top: 12),
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(color: context.borderColor, borderRadius: BorderRadius.circular(2)),
                  ),

                  // Content
                  Padding(
                    padding: EdgeInsets.fromLTRB(20, 20, 20, bottomPadding + 20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Route card
                        Container(
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color: context.isDark ? AppColors.bgDark : const Color(0xFFF5F5F5),
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: context.borderColor.withValues(alpha: 0.5)),
                          ),
                          child: Column(
                            children: [
                              Row(
                                children: [
                                  Column(
                                    children: [
                                      Container(
                                        width: 12,
                                        height: 12,
                                        decoration: BoxDecoration(color: AppColors.success, shape: BoxShape.circle),
                                      ),
                                      Container(width: 2, height: 32, color: context.borderColor),
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
                                      children: [
                                        _buildLocationItem('Pickup', widget.pickup),
                                        const SizedBox(height: 16),
                                        _buildLocationItem('Dropoff', widget.dropoff),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),

                        const SizedBox(height: 16),

                        // Staff card
                        Consumer<AppState>(
                          builder: (context, appState, _) => Container(
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: context.isDark ? AppColors.bgDark : const Color(0xFFF5F5F5),
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(color: context.borderColor.withValues(alpha: 0.5)),
                            ),
                            child: Row(
                              children: [
                                Container(
                                  width: 50,
                                  height: 50,
                                  decoration: BoxDecoration(
                                    gradient: LinearGradient(
                                      colors: [AppColors.yellow, AppColors.yellow.withValues(alpha: 0.7)],
                                      begin: Alignment.topLeft,
                                      end: Alignment.bottomRight,
                                    ),
                                    borderRadius: BorderRadius.circular(14),
                                  ),
                                  child: Icon(Icons.badge, color: Colors.black, size: 26),
                                ),
                                const SizedBox(width: 14),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        appState.userName.isNotEmpty ? appState.userName : 'Staff Member',
                                        style: TextStyle(color: context.textColor, fontSize: 16, fontWeight: FontWeight.w700),
                                      ),
                                      const SizedBox(height: 2),
                                      Text('ID: ${appState.staffId}', style: TextStyle(color: context.mutedColor, fontSize: 13)),
                                    ],
                                  ),
                                ),
                                Container(
                                  padding: const EdgeInsets.all(8),
                                  decoration: BoxDecoration(
                                    color: AppColors.success.withValues(alpha: 0.15),
                                    shape: BoxShape.circle,
                                  ),
                                  child: Icon(Icons.verified, color: AppColors.success, size: 20),
                                ),
                              ],
                            ),
                          ),
                        ),

                        const SizedBox(height: 20),

                        // Request button
                        SizedBox(
                          width: double.infinity,
                          height: 58,
                          child: ElevatedButton(
                            onPressed: () {
                              HapticFeedback.mediumImpact();
                              Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (_) => DriverMatchingScreen(
                                    pickup: widget.pickup,
                                    dropoff: widget.dropoff,
                                    rideType: 'Staff Car',
                                    pickupLat: pickupLoc.latitude,
                                    pickupLng: pickupLoc.longitude,
                                    dropoffLat: dropoffLoc.latitude,
                                    dropoffLng: dropoffLoc.longitude,
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
                            child: const Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(Icons.local_taxi, size: 22),
                                SizedBox(width: 10),
                                Text('Request Ride', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
                              ],
                            ),
                          ),
                        ),

                        const SizedBox(height: 12),

                        // Schedule for Later button
                        SizedBox(
                          width: double.infinity,
                          height: 50,
                          child: OutlinedButton.icon(
                            onPressed: () => _showSchedulePicker(context),
                            icon: Icon(Icons.schedule, color: context.textColor),
                            label: Text(
                              'Schedule for Later',
                              style: TextStyle(
                                color: context.textColor,
                                fontSize: 15,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            style: OutlinedButton.styleFrom(
                              side: BorderSide(color: context.borderColor),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                            ),
                          ),
                        ),

                        const SizedBox(height: 12),

                        // Info text centered
                        Center(
                          child: Text(
                            'Nearest driver will be assigned automatically',
                            style: TextStyle(color: context.mutedColor, fontSize: 12),
                          ),
                        ),
                      ],
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

  Widget _buildLocationItem(String label, String location) {
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: TextStyle(color: context.mutedColor, fontSize: 11, fontWeight: FontWeight.w500)),
              const SizedBox(height: 2),
              Text(
                location,
                style: TextStyle(color: context.textColor, fontSize: 15, fontWeight: FontWeight.w600),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ],
    );
  }
}
