import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/supabase_service.dart';
import '../providers/driver_state.dart';
import '../theme/app_theme.dart';
import '../widgets/app_snackbar.dart';

class BusTripScreen extends StatefulWidget {
  final String tripId;
  final Map<String, dynamic> assignment;

  const BusTripScreen({
    super.key,
    required this.tripId,
    required this.assignment,
  });

  @override
  State<BusTripScreen> createState() => _BusTripScreenState();
}

class _BusTripScreenState extends State<BusTripScreen> {
  List<Map<String, dynamic>> _stops = [];
  Map<String, dynamic>? _trip;
  Map<String, Map<String, int>> _stopCounts = {}; // stopId -> {boarded, alighted}
  bool _isLoading = true;
  bool _isAdvancing = false;
  bool _isCompleting = false;
  int _currentStopIndex = 0;
  int _onBoardCount = 0;
  Timer? _locationTimer;
  bool _busFullAlertSent = false; // Track if alert was sent for current stop

  @override
  void initState() {
    super.initState();
    _loadData();
    _startLocationTracking();
  }

  @override
  void dispose() {
    _locationTimer?.cancel();
    super.dispose();
  }

  void _startLocationTracking() {
    // Update location every 10 seconds
    _locationTimer = Timer.periodic(const Duration(seconds: 10), (_) {
      _updateLocation();
    });
    // Also update immediately
    _updateLocation();
  }

  Future<void> _updateLocation() async {
    try {
      final position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );

      final driverState = context.read<DriverState>();
      final route = widget.assignment['route'] as Map<String, dynamic>?;
      final vehicle = widget.assignment['vehicle'] as Map<String, dynamic>?;
      final vehicleCapacity = vehicle?['capacity'] as int? ?? 0;

      final currentStopName = _stops.isNotEmpty && _currentStopIndex < _stops.length
          ? _stops[_currentStopIndex]['stop_name'] as String?
          : null;

      await SupabaseService.updateBusLocation(
        tripId: widget.tripId,
        driverId: driverState.driverId,
        vehicleId: widget.assignment['vehicle_id'] as String?,
        routeId: widget.assignment['route_id'] as String,
        latitude: position.latitude,
        longitude: position.longitude,
        currentStopName: currentStopName,
        currentStopIndex: _currentStopIndex,
        passengersOnBoard: _onBoardCount,
        vehicleCapacity: vehicleCapacity,
      );

      // Check if bus is full and send alert
      if (vehicleCapacity > 0 && _onBoardCount >= vehicleCapacity && !_busFullAlertSent) {
        _busFullAlertSent = true;
        await SupabaseService.createBusFullAlert(
          tripId: widget.tripId,
          routeId: widget.assignment['route_id'] as String,
          routeName: route?['route_name'] ?? 'Unknown Route',
          stopName: currentStopName ?? 'Unknown Stop',
          stopIndex: _currentStopIndex,
          vehicleNumber: vehicle?['vehicle_number'],
          passengersOnBoard: _onBoardCount,
          vehicleCapacity: vehicleCapacity,
          latitude: position.latitude,
          longitude: position.longitude,
        );
        debugPrint('Bus full alert sent!');
      }
    } catch (e) {
      debugPrint('Error updating location: $e');
    }
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final routeId = widget.assignment['route_id'] as String?;
      if (routeId != null) {
        final stops = await SupabaseService.getBusRouteStops(routeId);
        final trip = await SupabaseService.getBusTrip(widget.tripId);

        setState(() {
          _stops = stops;
          _trip = trip;
          _isLoading = false;

          // Find current stop index
          if (trip != null && trip['current_stop_id'] != null) {
            final idx = stops.indexWhere((s) => s['id'] == trip['current_stop_id']);
            if (idx >= 0) _currentStopIndex = idx;
          }
        });

        // Load passenger counts
        await _loadPassengerCounts();
      }
    } catch (e) {
      debugPrint('Error loading data: $e');
      setState(() => _isLoading = false);
    }
  }

  Future<void> _loadPassengerCounts() async {
    try {
      final counts = await SupabaseService.getPassengerCounts(widget.tripId);
      int totalBoarded = 0;
      int totalAlighted = 0;
      final stopCountsMap = <String, Map<String, int>>{};

      for (final count in counts) {
        final stopId = count['stop_id'] as String?;
        final boarded = (count['boarded_count'] as int?) ?? 0;
        final alighted = (count['alighted_count'] as int?) ?? 0;

        if (stopId != null) {
          stopCountsMap[stopId] = {'boarded': boarded, 'alighted': alighted};
        }

        totalBoarded += boarded;
        totalAlighted += alighted;
      }

      setState(() {
        _stopCounts = stopCountsMap;
        _onBoardCount = totalBoarded - totalAlighted;
      });
    } catch (e) {
      debugPrint('Error loading passenger counts: $e');
    }
  }

  Future<void> _openNavigation() async {
    HapticFeedback.lightImpact();

    // Get current stop name for navigation
    final currentStop = _stops.isNotEmpty && _currentStopIndex < _stops.length
        ? _stops[_currentStopIndex]
        : null;
    final stopName = currentStop?['stop_name'] as String?;

    if (stopName == null || stopName.isEmpty) {
      AppSnackbar.error(context, 'No stop location available');
      return;
    }

    // Open in maps - try Apple Maps first on iOS
    final query = Uri.encodeComponent(stopName);
    final appleMapsUrl = 'maps://?q=$query';
    final googleMapsUrl = 'https://www.google.com/maps/search/?api=1&query=$query';

    try {
      // Try Apple Maps first
      final uri = Uri.parse(appleMapsUrl);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri);
      } else {
        // Fallback to Google Maps in browser
        final gUri = Uri.parse(googleMapsUrl);
        await launchUrl(gUri, mode: LaunchMode.externalApplication);
      }
    } catch (e) {
      debugPrint('Error opening maps: $e');
      if (mounted) AppSnackbar.error(context, 'Could not open maps');
    }
  }

  Future<void> _advanceToNextStop() async {
    if (_currentStopIndex >= _stops.length - 1) return;

    HapticFeedback.mediumImpact();

    // Show passenger count dialog before advancing
    final counts = await _showPassengerCountDialog();
    if (counts == null) return; // User cancelled

    setState(() => _isAdvancing = true);

    // Record passenger counts for current stop
    final currentStop = _stops[_currentStopIndex];
    await SupabaseService.recordPassengerCount(
      tripId: widget.tripId,
      stopId: currentStop['id'],
      boarded: counts['boarded'] ?? 0,
      alighted: counts['alighted'] ?? 0,
      stopIndex: _currentStopIndex,
      stopName: currentStop['stop_name'] ?? currentStop['name'] ?? 'Stop ${_currentStopIndex + 1}',
    );

    final nextStop = _stops[_currentStopIndex + 1];
    final success = await SupabaseService.advanceToNextStop(widget.tripId, nextStop['id']);

    if (success) {
      setState(() {
        _currentStopIndex++;
        _stopCounts[currentStop['id']] = {
          'boarded': counts['boarded'] ?? 0,
          'alighted': counts['alighted'] ?? 0,
        };
        _onBoardCount += (counts['boarded'] ?? 0) - (counts['alighted'] ?? 0);
        _isAdvancing = false;
        _busFullAlertSent = false; // Reset for next stop
      });
      // Update location immediately after advancing
      _updateLocation();
    } else {
      setState(() => _isAdvancing = false);
      if (mounted) AppSnackbar.error(context, 'Failed to advance stop');
    }
  }

  Future<Map<String, int>?> _showPassengerCountDialog() async {
    int boarded = 0;
    int alighted = 0;
    final currentStop = _stops[_currentStopIndex];

    return showModalBottomSheet<Map<String, int>>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setDialogState) => Container(
          decoration: BoxDecoration(
            color: context.cardColor,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
          ),
          padding: EdgeInsets.only(
            left: 24,
            right: 24,
            top: 24,
            bottom: MediaQuery.of(ctx).padding.bottom + 24,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: context.mutedColor.withValues(alpha: 0.3),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 24),
              Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [Colors.blue, Colors.blue.withValues(alpha: 0.7)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(18),
                ),
                child: const Icon(Icons.people_alt_rounded, size: 32, color: Colors.white),
              ),
              const SizedBox(height: 16),
              Text(
                'Passenger Count',
                style: TextStyle(
                  color: context.textColor,
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: AppColors.yellow.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.location_on, color: AppColors.yellow, size: 16),
                    const SizedBox(width: 6),
                    Text(
                      currentStop['stop_name'] ?? 'Current Stop',
                      style: TextStyle(
                        color: AppColors.yellow,
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              // Current on-board display
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: context.bgColor,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.people, color: context.mutedColor, size: 24),
                    const SizedBox(width: 10),
                    Text(
                      'Currently on board: ',
                      style: TextStyle(color: context.mutedColor, fontSize: 15),
                    ),
                    Text(
                      '$_onBoardCount',
                      style: TextStyle(
                        color: context.textColor,
                        fontSize: 24,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),

              // Boarded counter
              _buildCounterRow(
                context,
                'Boarded',
                Icons.arrow_circle_up_rounded,
                Colors.green,
                boarded,
                (val) => setDialogState(() => boarded = val),
              ),
              const SizedBox(height: 12),

              // Alighted counter
              _buildCounterRow(
                context,
                'Alighted',
                Icons.arrow_circle_down_rounded,
                Colors.orange,
                alighted,
                (val) => setDialogState(() => alighted = val),
                max: _onBoardCount + boarded,
              ),

              const SizedBox(height: 20),

              // Preview of new count
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.blue.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: Colors.blue.withValues(alpha: 0.3)),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.trending_flat, color: Colors.blue, size: 24),
                    const SizedBox(width: 10),
                    Text(
                      'After this stop: ',
                      style: TextStyle(color: Colors.blue, fontSize: 15, fontWeight: FontWeight.w500),
                    ),
                    Text(
                      '${_onBoardCount + boarded - alighted}',
                      style: const TextStyle(
                        color: Colors.blue,
                        fontSize: 24,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const Text(
                      ' passengers',
                      style: TextStyle(color: Colors.blue, fontSize: 15, fontWeight: FontWeight.w500),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 24),

              Row(
                children: [
                  Expanded(
                    child: TextButton(
                      onPressed: () => Navigator.pop(ctx, null),
                      style: TextButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                          side: BorderSide(color: context.borderColor),
                        ),
                      ),
                      child: Text(
                        'Cancel',
                        style: TextStyle(color: context.mutedColor, fontWeight: FontWeight.w600, fontSize: 16),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: ElevatedButton(
                      onPressed: () => Navigator.pop(ctx, {'boarded': boarded, 'alighted': alighted}),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.yellow,
                        foregroundColor: Colors.black,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                        elevation: 0,
                      ),
                      child: const Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.check_rounded, size: 22),
                          SizedBox(width: 8),
                          Text('Confirm & Next', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildCounterRow(
    BuildContext context,
    String label,
    IconData icon,
    Color color,
    int value,
    Function(int) onChanged, {
    int max = 99,
  }) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: color,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, color: Colors.white, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  label,
                  style: TextStyle(
                    color: context.textColor,
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              // Minus button
              GestureDetector(
                onTap: value > 0 ? () {
                  HapticFeedback.lightImpact();
                  onChanged(value - 1);
                } : null,
                child: Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: value > 0 ? color : context.borderColor,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(Icons.remove, color: Colors.white, size: 24),
                ),
              ),
              Container(
                width: 60,
                alignment: Alignment.center,
                child: Text(
                  '$value',
                  style: TextStyle(
                    color: context.textColor,
                    fontSize: 32,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              // Plus button
              GestureDetector(
                onTap: value < max ? () {
                  HapticFeedback.lightImpact();
                  onChanged(value + 1);
                } : null,
                child: Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: value < max ? color : context.borderColor,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(Icons.add, color: Colors.white, size: 24),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          // Quick add buttons
          Row(
            children: [
              for (final preset in [1, 5, 10])
                Expanded(
                  child: Padding(
                    padding: EdgeInsets.only(right: preset == 10 ? 0 : 8),
                    child: GestureDetector(
                      onTap: (value + preset) <= max ? () {
                        HapticFeedback.mediumImpact();
                        onChanged(value + preset);
                      } : null,
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        decoration: BoxDecoration(
                          color: (value + preset) <= max ? color.withValues(alpha: 0.2) : context.borderColor.withValues(alpha: 0.3),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          '+$preset',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: (value + preset) <= max ? color : context.mutedColor,
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _completeTrip() async {
    HapticFeedback.mediumImpact();

    final confirm = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Container(
        decoration: BoxDecoration(
          color: context.cardColor,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        padding: EdgeInsets.only(
          left: 24,
          right: 24,
          top: 24,
          bottom: MediaQuery.of(ctx).padding.bottom + 24,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: context.mutedColor.withValues(alpha: 0.3),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 24),
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [Colors.green, Colors.green.withValues(alpha: 0.7)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Icon(Icons.flag_rounded, size: 36, color: Colors.white),
            ),
            const SizedBox(height: 20),
            Text(
              'Complete Trip?',
              style: TextStyle(
                color: context.textColor,
                fontSize: 24,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: context.bgColor,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                children: [
                  _buildSummaryRow(Icons.route_rounded, 'Stops Completed', '${_currentStopIndex + 1}/${_stops.length}'),
                  const SizedBox(height: 10),
                  _buildSummaryRow(Icons.people_rounded, 'Total Passengers', '$_totalPassengers'),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.blue.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  Icon(Icons.info_outline_rounded, color: Colors.blue, size: 20),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'You will exit bus mode and return to normal on-demand rides.',
                      style: TextStyle(color: Colors.blue, fontSize: 13, height: 1.4),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            Row(
              children: [
                Expanded(
                  child: TextButton(
                    onPressed: () => Navigator.pop(ctx, false),
                    style: TextButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                        side: BorderSide(color: context.borderColor),
                      ),
                    ),
                    child: Text(
                      'Cancel',
                      style: TextStyle(color: context.mutedColor, fontWeight: FontWeight.w600, fontSize: 16),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  flex: 2,
                  child: ElevatedButton(
                    onPressed: () => Navigator.pop(ctx, true),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.green,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      elevation: 0,
                    ),
                    child: const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.check_circle_rounded, size: 22),
                        SizedBox(width: 8),
                        Text('Complete Trip', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );

    if (confirm != true) return;

    setState(() => _isCompleting = true);

    final success = await SupabaseService.completeBusTrip(widget.tripId, widget.assignment['id']);

    if (success && mounted) {
      final driverState = context.read<DriverState>();
      driverState.exitBusMode();

      AppSnackbar.success(context, 'Trip completed successfully!');
      Navigator.of(context).popUntil((route) => route.isFirst);
    } else {
      setState(() => _isCompleting = false);
      if (mounted) AppSnackbar.error(context, 'Failed to complete trip');
    }
  }

  Widget _buildSummaryRow(IconData icon, String label, String value) {
    return Row(
      children: [
        Icon(icon, color: context.mutedColor, size: 20),
        const SizedBox(width: 10),
        Text(label, style: TextStyle(color: context.mutedColor, fontSize: 14)),
        const Spacer(),
        Text(value, style: TextStyle(color: context.textColor, fontSize: 16, fontWeight: FontWeight.w700)),
      ],
    );
  }

  int get _totalPassengers {
    int total = 0;
    for (final counts in _stopCounts.values) {
      total += counts['boarded'] ?? 0;
    }
    return total;
  }

  @override
  Widget build(BuildContext context) {
    final route = widget.assignment['route'] as Map<String, dynamic>?;
    final vehicle = widget.assignment['vehicle'] as Map<String, dynamic>?;

    return Scaffold(
      backgroundColor: context.bgColor,
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: AppColors.yellow))
          : Column(
              children: [
                // Header
                Container(
                  padding: EdgeInsets.only(
                    left: 20,
                    right: 20,
                    top: MediaQuery.of(context).padding.top + 16,
                    bottom: 20,
                  ),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [AppColors.yellow, AppColors.yellow.withValues(alpha: 0.85)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                  ),
                  child: Column(
                    children: [
                      Row(
                        children: [
                          // Back button
                          GestureDetector(
                            onTap: () => Navigator.pop(context),
                            child: Container(
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                color: AppColors.darkBg.withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: const Icon(Icons.arrow_back_rounded, color: AppColors.darkBg, size: 24),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Container(
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: AppColors.darkBg.withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: const Icon(Icons.directions_bus_rounded, color: AppColors.darkBg, size: 24),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: AppColors.darkBg,
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: const Text(
                                    'BUS MODE',
                                    style: TextStyle(
                                      color: AppColors.yellow,
                                      fontSize: 10,
                                      fontWeight: FontWeight.w800,
                                      letterSpacing: 1,
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  route?['route_name'] ?? 'Bus Trip',
                                  style: const TextStyle(
                                    color: AppColors.darkBg,
                                    fontSize: 18,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          // On-board count badge
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                            decoration: BoxDecoration(
                              color: AppColors.darkBg,
                              borderRadius: BorderRadius.circular(16),
                            ),
                            child: Row(
                              children: [
                                const Icon(Icons.people_rounded, color: AppColors.yellow, size: 20),
                                const SizedBox(width: 8),
                                Text(
                                  '$_onBoardCount',
                                  style: const TextStyle(
                                    color: AppColors.yellow,
                                    fontWeight: FontWeight.w800,
                                    fontSize: 20,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      // Route and vehicle info
                      Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: AppColors.darkBg.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Row(
                          children: [
                            Expanded(
                              child: Row(
                                children: [
                                  Icon(Icons.route_rounded, color: AppColors.darkBg.withValues(alpha: 0.7), size: 18),
                                  const SizedBox(width: 8),
                                  Text(
                                    '${route?['route_code'] ?? ''} • ${route?['direction'] ?? ''}',
                                    style: TextStyle(color: AppColors.darkBg, fontSize: 13, fontWeight: FontWeight.w600),
                                  ),
                                ],
                              ),
                            ),
                            Container(
                              width: 1,
                              height: 20,
                              color: AppColors.darkBg.withValues(alpha: 0.2),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Row(
                                children: [
                                  Icon(Icons.directions_bus_filled_rounded, color: AppColors.darkBg.withValues(alpha: 0.7), size: 18),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Text(
                                      vehicle != null ? '${vehicle['vehicle_number']}' : '',
                                      style: TextStyle(color: AppColors.darkBg, fontSize: 13, fontWeight: FontWeight.w600),
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),

                // Progress indicator
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                  color: context.cardColor,
                  child: Row(
                    children: [
                      Text(
                        'Stop ${_currentStopIndex + 1} of ${_stops.length}',
                        style: TextStyle(color: context.mutedColor, fontSize: 13, fontWeight: FontWeight.w500),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(4),
                          child: LinearProgressIndicator(
                            value: _stops.isEmpty ? 0 : (_currentStopIndex + 1) / _stops.length,
                            backgroundColor: context.borderColor,
                            valueColor: const AlwaysStoppedAnimation(AppColors.yellow),
                            minHeight: 6,
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.green.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Row(
                          children: [
                            Container(
                              width: 6,
                              height: 6,
                              decoration: const BoxDecoration(
                                color: Colors.green,
                                shape: BoxShape.circle,
                              ),
                            ),
                            const SizedBox(width: 6),
                            const Text(
                              'LIVE',
                              style: TextStyle(
                                color: Colors.green,
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),

                // Stops list
                Expanded(
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: _stops.length,
                    itemBuilder: (context, index) => _buildStopCard(index),
                  ),
                ),

                // Bottom action bar
                Container(
                  padding: EdgeInsets.only(
                    left: 16,
                    right: 16,
                    top: 16,
                    bottom: MediaQuery.of(context).padding.bottom + 16,
                  ),
                  decoration: BoxDecoration(
                    color: context.cardColor,
                    border: Border(top: BorderSide(color: context.borderColor)),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.05),
                        blurRadius: 10,
                        offset: const Offset(0, -4),
                      ),
                    ],
                  ),
                  child: Row(
                    children: [
                      // On-board count
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                        decoration: BoxDecoration(
                          color: context.bgColor,
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Row(
                          children: [
                            Icon(Icons.people_rounded, color: AppColors.yellow, size: 22),
                            const SizedBox(width: 10),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  '$_onBoardCount',
                                  style: TextStyle(
                                    color: context.textColor,
                                    fontWeight: FontWeight.w800,
                                    fontSize: 18,
                                  ),
                                ),
                                Text(
                                  'on board',
                                  style: TextStyle(
                                    color: context.mutedColor,
                                    fontSize: 11,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 10),
                      // Navigate button
                      GestureDetector(
                        onTap: _openNavigation,
                        child: Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: Colors.blue.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: Colors.blue.withValues(alpha: 0.3)),
                          ),
                          child: const Icon(Icons.navigation_rounded, color: Colors.blue, size: 24),
                        ),
                      ),
                      const SizedBox(width: 10),
                      // Next Stop / Complete button
                      Expanded(
                        child: _currentStopIndex >= _stops.length - 1
                            ? ElevatedButton(
                                onPressed: _isCompleting ? null : _completeTrip,
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: Colors.green,
                                  foregroundColor: Colors.white,
                                  padding: const EdgeInsets.symmetric(vertical: 18),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(14),
                                  ),
                                  elevation: 0,
                                ),
                                child: _isCompleting
                                    ? const SizedBox(
                                        width: 22,
                                        height: 22,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2.5,
                                          color: Colors.white,
                                        ),
                                      )
                                    : const Row(
                                        mainAxisAlignment: MainAxisAlignment.center,
                                        children: [
                                          Icon(Icons.flag_rounded, size: 22),
                                          SizedBox(width: 10),
                                          Text(
                                            'Complete Trip',
                                            style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                                          ),
                                        ],
                                      ),
                              )
                            : ElevatedButton(
                                onPressed: _isAdvancing ? null : _advanceToNextStop,
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: AppColors.yellow,
                                  foregroundColor: AppColors.darkBg,
                                  padding: const EdgeInsets.symmetric(vertical: 18),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(14),
                                  ),
                                  elevation: 0,
                                ),
                                child: _isAdvancing
                                    ? const SizedBox(
                                        width: 22,
                                        height: 22,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2.5,
                                          color: AppColors.darkBg,
                                        ),
                                      )
                                    : Row(
                                        mainAxisAlignment: MainAxisAlignment.center,
                                        children: [
                                          const Icon(Icons.arrow_forward_rounded, size: 22),
                                          const SizedBox(width: 10),
                                          Flexible(
                                            child: Text(
                                              'Next Stop',
                                              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                                              overflow: TextOverflow.ellipsis,
                                            ),
                                          ),
                                        ],
                                      ),
                              ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
    );
  }

  Widget _buildStopCard(int index) {
    final stop = _stops[index];
    final stopId = stop['id'] as String?;
    final isCurrent = index == _currentStopIndex;
    final isPast = index < _currentStopIndex;
    final counts = stopId != null ? _stopCounts[stopId] : null;
    final boarded = counts?['boarded'] ?? 0;
    final alighted = counts?['alighted'] ?? 0;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Timeline
        SizedBox(
          width: 44,
          child: Column(
            children: [
              Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                  gradient: isCurrent
                      ? LinearGradient(
                          colors: [AppColors.yellow, AppColors.yellow.withValues(alpha: 0.8)],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        )
                      : isPast
                          ? LinearGradient(
                              colors: [Colors.green, Colors.green.withValues(alpha: 0.8)],
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                            )
                          : null,
                  color: !isCurrent && !isPast ? context.cardColor : null,
                  shape: BoxShape.circle,
                  border: !isCurrent && !isPast
                      ? Border.all(color: context.borderColor, width: 2)
                      : null,
                  boxShadow: isCurrent
                      ? [
                          BoxShadow(
                            color: AppColors.yellow.withValues(alpha: 0.4),
                            blurRadius: 8,
                            offset: const Offset(0, 2),
                          ),
                        ]
                      : null,
                ),
                child: Center(
                  child: isPast
                      ? const Icon(Icons.check_rounded, color: Colors.white, size: 16)
                      : Text(
                          '${index + 1}',
                          style: TextStyle(
                            color: isCurrent ? AppColors.darkBg : context.mutedColor,
                            fontWeight: FontWeight.w700,
                            fontSize: 12,
                          ),
                        ),
                ),
              ),
              if (index < _stops.length - 1)
                Container(
                  width: 3,
                  height: isPast || isCurrent ? 70 : 60,
                  margin: const EdgeInsets.symmetric(vertical: 4),
                  decoration: BoxDecoration(
                    color: isPast ? Colors.green : context.borderColor,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
            ],
          ),
        ),

        // Stop card
        Expanded(
          child: Container(
            margin: const EdgeInsets.only(bottom: 16),
            decoration: BoxDecoration(
              color: isCurrent
                  ? AppColors.yellow.withValues(alpha: 0.1)
                  : context.cardColor,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: isCurrent ? AppColors.yellow : context.borderColor,
                width: isCurrent ? 2 : 1,
              ),
              boxShadow: isCurrent
                  ? [
                      BoxShadow(
                        color: AppColors.yellow.withValues(alpha: 0.15),
                        blurRadius: 12,
                        offset: const Offset(0, 4),
                      ),
                    ]
                  : null,
            ),
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.all(14),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (isCurrent)
                              Container(
                                margin: const EdgeInsets.only(bottom: 6),
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                decoration: BoxDecoration(
                                  color: AppColors.yellow,
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: const Text(
                                  'CURRENT STOP',
                                  style: TextStyle(
                                    color: AppColors.darkBg,
                                    fontSize: 10,
                                    fontWeight: FontWeight.w800,
                                    letterSpacing: 0.5,
                                  ),
                                ),
                              ),
                            Text(
                              stop['stop_name'] ?? 'Stop ${index + 1}',
                              style: TextStyle(
                                color: isPast ? context.mutedColor : context.textColor,
                                fontSize: 16,
                                fontWeight: isCurrent ? FontWeight.w700 : FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                      if (isPast)
                        Container(
                          padding: const EdgeInsets.all(6),
                          decoration: BoxDecoration(
                            color: Colors.green.withValues(alpha: 0.15),
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(Icons.check_rounded, color: Colors.green, size: 18),
                        ),
                    ],
                  ),
                ),

                // Show passenger counts for past stops
                if (isPast && (boarded > 0 || alighted > 0))
                  Container(
                    padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
                    child: Row(
                      children: [
                        if (boarded > 0)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                            decoration: BoxDecoration(
                              color: Colors.green.withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Row(
                              children: [
                                Icon(Icons.arrow_upward_rounded, color: Colors.green, size: 14),
                                const SizedBox(width: 4),
                                Text(
                                  '+$boarded',
                                  style: const TextStyle(
                                    color: Colors.green,
                                    fontSize: 13,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        if (boarded > 0 && alighted > 0) const SizedBox(width: 8),
                        if (alighted > 0)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                            decoration: BoxDecoration(
                              color: Colors.orange.withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Row(
                              children: [
                                Icon(Icons.arrow_downward_rounded, color: Colors.orange, size: 14),
                                const SizedBox(width: 4),
                                Text(
                                  '-$alighted',
                                  style: const TextStyle(
                                    color: Colors.orange,
                                    fontSize: 13,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ],
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
    );
  }
}
