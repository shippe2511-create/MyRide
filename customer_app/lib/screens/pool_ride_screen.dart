import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:provider/provider.dart';
import '../providers/app_state.dart';
import '../services/supabase_service.dart';
import '../theme/app_theme.dart';
import '../widgets/glass_container.dart';
import '../widgets/primary_button.dart';

class PoolRideScreen extends StatefulWidget {
  final String pickupName;
  final double pickupLat;
  final double pickupLng;
  final String dropoffName;
  final double dropoffLat;
  final double dropoffLng;

  const PoolRideScreen({
    super.key,
    required this.pickupName,
    required this.pickupLat,
    required this.pickupLng,
    required this.dropoffName,
    required this.dropoffLat,
    required this.dropoffLng,
  });

  @override
  State<PoolRideScreen> createState() => _PoolRideScreenState();
}

class _PoolRideScreenState extends State<PoolRideScreen> {
  GoogleMapController? _mapController;
  List<Map<String, dynamic>> _availableVehicles = [];
  Map<String, dynamic>? _selectedVehicle;
  int _seatsNeeded = 1;
  bool _isLoading = true;
  bool _isBooking = false;
  String? _error;
  StreamSubscription? _vehicleSubscription;
  Set<Marker> _markers = {};

  @override
  void initState() {
    super.initState();
    _loadAvailableVehicles();
    _subscribeToVehicleUpdates();
  }

  @override
  void dispose() {
    _vehicleSubscription?.cancel();
    _mapController?.dispose();
    super.dispose();
  }

  void _subscribeToVehicleUpdates() {
    _vehicleSubscription = SupabaseService.client
        .channel('pool_vehicles')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'pooled_trips',
          callback: (payload) {
            _loadAvailableVehicles();
          },
        )
        .subscribe() as StreamSubscription?;
  }

  Future<void> _loadAvailableVehicles() async {
    try {
      final result = await SupabaseService.client
          .rpc('get_available_pool_vehicles')
          .select();

      setState(() {
        _availableVehicles = List<Map<String, dynamic>>.from(result);
        _isLoading = false;
        _updateMarkers();
      });
    } catch (e) {
      setState(() {
        _error = 'Failed to load vehicles: $e';
        _isLoading = false;
      });
    }
  }

  void _updateMarkers() {
    final markers = <Marker>{};

    // Pickup marker
    markers.add(Marker(
      markerId: const MarkerId('pickup'),
      position: LatLng(widget.pickupLat, widget.pickupLng),
      icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueGreen),
      infoWindow: InfoWindow(title: 'Pickup', snippet: widget.pickupName),
    ));

    // Dropoff marker
    markers.add(Marker(
      markerId: const MarkerId('dropoff'),
      position: LatLng(widget.dropoffLat, widget.dropoffLng),
      icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueRed),
      infoWindow: InfoWindow(title: 'Dropoff', snippet: widget.dropoffName),
    ));

    // Vehicle markers with seat count
    for (final vehicle in _availableVehicles) {
      final lat = vehicle['driver_lat'] as double?;
      final lng = vehicle['driver_lng'] as double?;
      if (lat != null && lng != null) {
        markers.add(Marker(
          markerId: MarkerId('vehicle_${vehicle['trip_id']}'),
          position: LatLng(lat, lng),
          icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueCyan),
          infoWindow: InfoWindow(
            title: '${vehicle['available_seats']} seats available',
            snippet: '${vehicle['driver_name']} - ${vehicle['plate_no']}',
          ),
          onTap: () => _selectVehicle(vehicle),
        ));
      }
    }

    setState(() => _markers = markers);
  }

  void _selectVehicle(Map<String, dynamic> vehicle) {
    HapticFeedback.lightImpact();
    setState(() => _selectedVehicle = vehicle);
  }

  Future<void> _findBestVehicle() async {
    setState(() => _isLoading = true);

    try {
      final result = await SupabaseService.client.rpc('find_best_vehicle', params: {
        'p_pickup_lat': widget.pickupLat,
        'p_pickup_lng': widget.pickupLng,
        'p_dropoff_lat': widget.dropoffLat,
        'p_dropoff_lng': widget.dropoffLng,
        'p_seats_needed': _seatsNeeded,
      });

      if (result['success'] == true) {
        final vehicleInfo = result['vehicle'];
        // Find full vehicle data
        final vehicle = _availableVehicles.firstWhere(
          (v) => v['trip_id'] == vehicleInfo['trip_id'],
          orElse: () => vehicleInfo,
        );
        setState(() => _selectedVehicle = vehicle);
      } else {
        _showError(result['error'] ?? 'No vehicle available');
      }
    } catch (e) {
      _showError('Failed to find vehicle: $e');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _bookSeats() async {
    if (_selectedVehicle == null) return;

    final customerId = SupabaseService.userId;
    if (customerId == null) {
      _showError('Please log in to book');
      return;
    }

    setState(() => _isBooking = true);
    HapticFeedback.heavyImpact();

    try {
      final result = await SupabaseService.client.rpc('book_pool_seats', params: {
        'p_trip_id': _selectedVehicle!['trip_id'],
        'p_customer_id': customerId,
        'p_seats': _seatsNeeded,
        'p_pickup_lat': widget.pickupLat,
        'p_pickup_lng': widget.pickupLng,
        'p_pickup_name': widget.pickupName,
        'p_dropoff_lat': widget.dropoffLat,
        'p_dropoff_lng': widget.dropoffLng,
        'p_dropoff_name': widget.dropoffName,
      });

      if (result['success'] == true) {
        if (!mounted) return;
        _showSuccess('Booking confirmed! ${result['seats_remaining']} seats remaining.');
        Navigator.pop(context, result);
      } else {
        _showError(result['error'] ?? 'Booking failed');
      }
    } catch (e) {
      _showError('Booking failed: $e');
    } finally {
      setState(() => _isBooking = false);
    }
  }

  void _showError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: AppColors.error,
      ),
    );
  }

  void _showSuccess(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: AppColors.success,
      ),
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
              target: LatLng(widget.pickupLat, widget.pickupLng),
              zoom: 14,
            ),
            markers: _markers,
            onMapCreated: (controller) => _mapController = controller,
            myLocationEnabled: true,
            myLocationButtonEnabled: false,
            zoomControlsEnabled: false,
            mapToolbarEnabled: false,
          ),

          // Back button
          Positioned(
            top: MediaQuery.of(context).padding.top + 10,
            left: 16,
            child: GestureDetector(
              onTap: () => Navigator.pop(context),
              child: Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: context.surfaceColor,
                  borderRadius: BorderRadius.circular(14),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.2),
                      blurRadius: 10,
                    ),
                  ],
                ),
                child: Icon(Icons.arrow_back_ios_new, color: context.textColor, size: 18),
              ),
            ),
          ),

          // Bottom panel
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: _buildBottomPanel(),
          ),

          // Loading overlay
          if (_isLoading)
            Container(
              color: Colors.black.withOpacity(0.3),
              child: const Center(child: CircularProgressIndicator(color: AppColors.yellow)),
            ),
        ],
      ),
    );
  }

  Widget _buildBottomPanel() {
    return GlassContainer(
      borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
      child: Padding(
        padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(context).padding.bottom + 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Handle
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: context.borderColor,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 20),

            // Title
            Text(
              'Pool Ride',
              style: TextStyle(
                color: context.textColor,
                fontSize: 24,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Share your ride and save',
              style: TextStyle(color: context.mutedColor, fontSize: 14),
            ),
            const SizedBox(height: 20),

            // Route info
            _buildRouteInfo(),
            const SizedBox(height: 20),

            // Seat selector
            _buildSeatSelector(),
            const SizedBox(height: 20),

            // Available vehicles
            if (_availableVehicles.isNotEmpty) ...[
              Text(
                'Available Vehicles',
                style: TextStyle(
                  color: context.textColor,
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                height: 100,
                child: ListView.builder(
                  scrollDirection: Axis.horizontal,
                  itemCount: _availableVehicles.length,
                  itemBuilder: (context, index) {
                    final vehicle = _availableVehicles[index];
                    final isSelected = _selectedVehicle?['trip_id'] == vehicle['trip_id'];
                    return _buildVehicleCard(vehicle, isSelected);
                  },
                ),
              ),
              const SizedBox(height: 20),
            ] else if (!_isLoading) ...[
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: context.surfaceColor,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: context.borderColor),
                ),
                child: Row(
                  children: [
                    Icon(Icons.info_outline, color: context.mutedColor),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        'No pool vehicles available right now',
                        style: TextStyle(color: context.mutedColor),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
            ],

            // Action buttons
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: _isLoading ? null : _findBestVehicle,
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      side: BorderSide(color: AppColors.yellow),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                    child: Text(
                      'Find Best',
                      style: TextStyle(
                        color: AppColors.yellow,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  flex: 2,
                  child: PrimaryButton(
                    text: _isBooking ? 'Booking...' : 'Book ${_seatsNeeded} Seat${_seatsNeeded > 1 ? 's' : ''}',
                    onPressed: (_selectedVehicle != null && !_isBooking) ? _bookSeats : null,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRouteInfo() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.surfaceColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.borderColor),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                width: 12,
                height: 12,
                decoration: BoxDecoration(
                  color: AppColors.success,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  widget.pickupName,
                  style: TextStyle(color: context.textColor, fontSize: 14),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.only(left: 5),
            child: Container(
              width: 2,
              height: 20,
              color: context.borderColor,
            ),
          ),
          Row(
            children: [
              Container(
                width: 12,
                height: 12,
                decoration: BoxDecoration(
                  color: AppColors.error,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  widget.dropoffName,
                  style: TextStyle(color: context.textColor, fontSize: 14),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSeatSelector() {
    final maxSeats = _selectedVehicle?['available_seats'] ?? 6;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.surfaceColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'How many seats?',
                style: TextStyle(
                  color: context.textColor,
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: AppColors.yellow.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Row(
                  children: [
                    Icon(Icons.event_seat, color: AppColors.yellow, size: 18),
                    const SizedBox(width: 6),
                    Text(
                      '$_seatsNeeded',
                      style: TextStyle(
                        color: AppColors.yellow,
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: List.generate(6, (index) {
              final seats = index + 1;
              final isSelected = seats == _seatsNeeded;
              final isAvailable = seats <= maxSeats;

              return GestureDetector(
                onTap: isAvailable
                    ? () {
                        HapticFeedback.selectionClick();
                        setState(() => _seatsNeeded = seats);
                      }
                    : null,
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: isSelected
                        ? AppColors.yellow
                        : isAvailable
                            ? context.surfaceColor
                            : context.surfaceColor.withOpacity(0.5),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: isSelected
                          ? AppColors.yellow
                          : isAvailable
                              ? context.borderColor
                              : context.borderColor.withOpacity(0.3),
                      width: isSelected ? 2 : 1,
                    ),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.event_seat,
                        color: isSelected
                            ? AppColors.bgDark
                            : isAvailable
                                ? context.textColor
                                : context.mutedColor.withOpacity(0.5),
                        size: 20,
                      ),
                      Text(
                        '$seats',
                        style: TextStyle(
                          color: isSelected
                              ? AppColors.bgDark
                              : isAvailable
                                  ? context.textColor
                                  : context.mutedColor.withOpacity(0.5),
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            }),
          ),
        ],
      ),
    );
  }

  Widget _buildVehicleCard(Map<String, dynamic> vehicle, bool isSelected) {
    final availableSeats = vehicle['available_seats'] as int? ?? 0;
    final hasEnoughSeats = availableSeats >= _seatsNeeded;

    return GestureDetector(
      onTap: hasEnoughSeats ? () => _selectVehicle(vehicle) : null,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        width: 140,
        margin: const EdgeInsets.only(right: 12),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.yellow.withOpacity(0.15) : context.surfaceColor,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isSelected ? AppColors.yellow : context.borderColor,
            width: isSelected ? 2 : 1,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Icon(
                  Icons.directions_car,
                  color: hasEnoughSeats ? AppColors.success : context.mutedColor,
                  size: 24,
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: hasEnoughSeats
                        ? AppColors.success.withOpacity(0.2)
                        : AppColors.error.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        Icons.event_seat,
                        color: hasEnoughSeats ? AppColors.success : AppColors.error,
                        size: 14,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        '$availableSeats',
                        style: TextStyle(
                          color: hasEnoughSeats ? AppColors.success : AppColors.error,
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const Spacer(),
            Text(
              vehicle['driver_name'] ?? 'Driver',
              style: TextStyle(
                color: context.textColor,
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            Text(
              vehicle['plate_no'] ?? '',
              style: TextStyle(
                color: context.mutedColor,
                fontSize: 12,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
