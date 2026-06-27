import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../theme/app_theme.dart';

class PoolTripScreen extends StatefulWidget {
  final String tripId;
  final String vehicleNumber;

  const PoolTripScreen({
    super.key,
    required this.tripId,
    required this.vehicleNumber,
  });

  @override
  State<PoolTripScreen> createState() => _PoolTripScreenState();
}

class _PoolTripScreenState extends State<PoolTripScreen> {
  final _supabase = Supabase.instance.client;
  GoogleMapController? _mapController;

  Map<String, dynamic>? _tripInfo;
  List<Map<String, dynamic>> _stops = [];
  bool _isLoading = true;
  String? _error;

  RealtimeChannel? _tripChannel;
  RealtimeChannel? _stopsChannel;
  RealtimeChannel? _bookingsChannel;

  @override
  void initState() {
    super.initState();
    _loadTripData();
    _subscribeToUpdates();
  }

  @override
  void dispose() {
    _tripChannel?.unsubscribe();
    _stopsChannel?.unsubscribe();
    _bookingsChannel?.unsubscribe();
    _mapController?.dispose();
    super.dispose();
  }

  void _subscribeToUpdates() {
    // Subscribe to trip updates
    _tripChannel = _supabase
        .channel('pool_trip_${widget.tripId}')
        .onPostgresChanges(
          event: PostgresChangeEvent.update,
          schema: 'public',
          table: 'pooled_trips',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'id',
            value: widget.tripId,
          ),
          callback: (payload) {
            debugPrint('Trip update: ${payload.newRecord}');
            _loadTripData();
          },
        )
        .subscribe();

    // Subscribe to new bookings
    _bookingsChannel = _supabase
        .channel('pool_bookings_${widget.tripId}')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'pool_bookings',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'trip_id',
            value: widget.tripId,
          ),
          callback: (payload) {
            debugPrint('Booking update: ${payload.eventType}');
            if (payload.eventType == PostgresChangeEvent.insert) {
              HapticFeedback.heavyImpact();
              _showNewBookingNotification(payload.newRecord);
            }
            _loadTripData();
          },
        )
        .subscribe();

    // Subscribe to stop updates
    _stopsChannel = _supabase
        .channel('pool_stops_${widget.tripId}')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'pool_stops',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'trip_id',
            value: widget.tripId,
          ),
          callback: (payload) {
            _loadTripData();
          },
        )
        .subscribe();
  }

  void _showNewBookingNotification(Map<String, dynamic> booking) {
    if (!mounted) return;
    final seats = booking['seats_booked'] ?? 1;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            const Icon(Icons.person_add, color: Colors.white),
            const SizedBox(width: 12),
            Text('New passenger! $seats seat${seats > 1 ? 's' : ''} booked'),
          ],
        ),
        backgroundColor: AppColors.success,
        behavior: SnackBarBehavior.floating,
        margin: const EdgeInsets.all(16),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }

  Future<void> _loadTripData() async {
    try {
      // Load trip info
      final tripResult = await _supabase
          .from('pooled_trips')
          .select()
          .eq('id', widget.tripId)
          .single();

      // Load stops with customer info
      final stopsResult = await _supabase
          .rpc('get_trip_stops', params: {'p_trip_id': widget.tripId});

      setState(() {
        _tripInfo = tripResult;
        _stops = List<Map<String, dynamic>>.from(stopsResult);
        _isLoading = false;
      });

      _updateMapBounds();
    } catch (e) {
      setState(() {
        _error = 'Failed to load trip: $e';
        _isLoading = false;
      });
    }
  }

  void _updateMapBounds() {
    if (_stops.isEmpty || _mapController == null) return;

    final bounds = LatLngBounds(
      southwest: LatLng(
        _stops.map((s) => s['lat'] as double).reduce((a, b) => a < b ? a : b),
        _stops.map((s) => s['lng'] as double).reduce((a, b) => a < b ? a : b),
      ),
      northeast: LatLng(
        _stops.map((s) => s['lat'] as double).reduce((a, b) => a > b ? a : b),
        _stops.map((s) => s['lng'] as double).reduce((a, b) => a > b ? a : b),
      ),
    );

    _mapController?.animateCamera(CameraUpdate.newLatLngBounds(bounds, 80));
  }

  Future<void> _completeStop(String stopId) async {
    HapticFeedback.heavyImpact();

    try {
      final result = await _supabase.rpc('complete_pool_stop', params: {
        'p_stop_id': stopId,
      });

      if (result['success'] == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${result['stop_type'] == 'pickup' ? 'Pickup' : 'Dropoff'} completed!'),
            backgroundColor: AppColors.success,
          ),
        );
        _loadTripData();
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Error: $e'),
          backgroundColor: AppColors.error,
        ),
      );
    }
  }

  Future<void> _endTrip() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.cardColor,
        title: Text('End Pool Trip?', style: TextStyle(color: context.textColor)),
        content: Text(
          'Make sure all passengers have been dropped off.',
          style: TextStyle(color: context.mutedColor),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('Cancel', style: TextStyle(color: context.mutedColor)),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.error),
            child: const Text('End Trip'),
          ),
        ],
      ),
    );

    if (confirm != true) return;

    try {
      await _supabase
          .from('pooled_trips')
          .update({
            'status': 'completed',
            'completed_at': DateTime.now().toUtc().toIso8601String(),
          })
          .eq('id', widget.tripId);

      if (!mounted) return;
      Navigator.pop(context);
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Error ending trip: $e'),
          backgroundColor: AppColors.error,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return Scaffold(
        backgroundColor: context.bgColor,
        body: const Center(child: CircularProgressIndicator(color: AppColors.yellow)),
      );
    }

    if (_error != null) {
      return Scaffold(
        backgroundColor: context.bgColor,
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.error_outline, color: AppColors.error, size: 48),
              const SizedBox(height: 16),
              Text(_error!, style: TextStyle(color: context.textColor)),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: _loadTripData,
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
    }

    final totalSeats = _tripInfo?['total_seats'] ?? 0;
    final availableSeats = _tripInfo?['available_seats'] ?? 0;
    final bookedSeats = totalSeats - availableSeats;

    return Scaffold(
      backgroundColor: context.bgColor,
      body: Stack(
        children: [
          // Map
          GoogleMap(
            initialCameraPosition: CameraPosition(
              target: _stops.isNotEmpty
                  ? LatLng(_stops.first['lat'], _stops.first['lng'])
                  : const LatLng(4.1755, 73.5093),
              zoom: 14,
            ),
            markers: _buildMarkers(),
            polylines: _buildPolylines(),
            onMapCreated: (controller) {
              _mapController = controller;
              _updateMapBounds();
            },
            myLocationEnabled: true,
            myLocationButtonEnabled: false,
            zoomControlsEnabled: false,
          ),

          // Header
          Positioned(
            top: MediaQuery.of(context).padding.top + 10,
            left: 16,
            right: 16,
            child: _buildHeader(bookedSeats, availableSeats, totalSeats),
          ),

          // Bottom stop list
          DraggableScrollableSheet(
            initialChildSize: 0.35,
            minChildSize: 0.15,
            maxChildSize: 0.7,
            builder: (context, scrollController) {
              return Container(
              decoration: BoxDecoration(
                color: context.cardColor,
                borderRadius: BorderRadius.circular(20),
              ),
                borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
                child: Column(
                  children: [
                    // Handle
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      child: Container(
                        width: 40,
                        height: 4,
                        decoration: BoxDecoration(
                          color: context.borderColor,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                    // Title
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            'Stops (${_stops.where((s) => s['status'] == 'pending').length} remaining)',
                            style: TextStyle(
                              color: context.textColor,
                              fontSize: 18,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          TextButton.icon(
                            onPressed: _endTrip,
                            icon: Icon(Icons.stop_circle, color: AppColors.error, size: 20),
                            label: Text('End Trip', style: TextStyle(color: AppColors.error)),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 8),
                    // Stop list
                    Expanded(
                      child: ListView.builder(
                        controller: scrollController,
                        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
                        itemCount: _stops.length,
                        itemBuilder: (context, index) => _buildStopCard(_stops[index], index),
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

  Widget _buildHeader(int booked, int available, int total) {
    return Container(
              decoration: BoxDecoration(
                color: context.cardColor,
                borderRadius: BorderRadius.circular(20),
              ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            GestureDetector(
              onTap: () => Navigator.pop(context),
              child: Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: context.cardColor,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(Icons.arrow_back_ios_new, color: context.textColor, size: 16),
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Pool Trip - ${widget.vehicleNumber}',
                    style: TextStyle(
                      color: context.textColor,
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Text(
                    '${_stops.length} stops in queue',
                    style: TextStyle(color: context.mutedColor, fontSize: 12),
                  ),
                ],
              ),
            ),
            // Seat indicator
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              decoration: BoxDecoration(
                color: available > 0 ? AppColors.success.withOpacity(0.2) : AppColors.error.withOpacity(0.2),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: available > 0 ? AppColors.success : AppColors.error,
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.event_seat,
                    color: available > 0 ? AppColors.success : AppColors.error,
                    size: 20,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '$booked/$total',
                    style: TextStyle(
                      color: available > 0 ? AppColors.success : AppColors.error,
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStopCard(Map<String, dynamic> stop, int index) {
    final isPickup = stop['stop_type'] == 'pickup';
    final isCompleted = stop['status'] == 'completed';
    final isPending = stop['status'] == 'pending';

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isCompleted
            ? context.cardColor.withOpacity(0.5)
            : context.cardColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isCompleted
              ? context.borderColor.withOpacity(0.5)
              : isPickup
                  ? AppColors.success.withOpacity(0.5)
                  : AppColors.error.withOpacity(0.5),
        ),
      ),
      child: Row(
        children: [
          // Sequence number
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: isCompleted
                  ? context.mutedColor.withOpacity(0.3)
                  : isPickup
                      ? AppColors.success
                      : AppColors.error,
              shape: BoxShape.circle,
            ),
            child: Center(
              child: isCompleted
                  ? Icon(Icons.check, color: context.mutedColor, size: 18)
                  : Text(
                      '${index + 1}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
            ),
          ),
          const SizedBox(width: 12),
          // Stop info
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: isPickup
                            ? AppColors.success.withOpacity(0.2)
                            : AppColors.error.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        isPickup ? 'PICKUP' : 'DROPOFF',
                        style: TextStyle(
                          color: isPickup ? AppColors.success : AppColors.error,
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      '${stop['seats']} seat${(stop['seats'] ?? 1) > 1 ? 's' : ''}',
                      style: TextStyle(
                        color: context.mutedColor,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  stop['customer_name'] ?? 'Customer',
                  style: TextStyle(
                    color: isCompleted ? context.mutedColor : context.textColor,
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    decoration: isCompleted ? TextDecoration.lineThrough : null,
                  ),
                ),
                Text(
                  stop['location_name'] ?? 'Location',
                  style: TextStyle(
                    color: context.mutedColor,
                    fontSize: 13,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          // Complete button
          if (isPending)
            GestureDetector(
              onTap: () => _completeStop(stop['stop_id']),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                decoration: BoxDecoration(
                  color: AppColors.yellow,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  isPickup ? 'Picked' : 'Dropped',
                  style: TextStyle(
                    color: AppColors.darkBg,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Set<Marker> _buildMarkers() {
    final markers = <Marker>{};

    for (var i = 0; i < _stops.length; i++) {
      final stop = _stops[i];
      final isPickup = stop['stop_type'] == 'pickup';
      final isCompleted = stop['status'] == 'completed';

      markers.add(Marker(
        markerId: MarkerId('stop_${stop['stop_id']}'),
        position: LatLng(stop['lat'], stop['lng']),
        icon: BitmapDescriptor.defaultMarkerWithHue(
          isCompleted
              ? BitmapDescriptor.hueViolet
              : isPickup
                  ? BitmapDescriptor.hueGreen
                  : BitmapDescriptor.hueRed,
        ),
        infoWindow: InfoWindow(
          title: '${i + 1}. ${stop['customer_name']}',
          snippet: '${isPickup ? 'Pickup' : 'Dropoff'} - ${stop['location_name']}',
        ),
      ));
    }

    return markers;
  }

  Set<Polyline> _buildPolylines() {
    if (_stops.length < 2) return {};

    final points = _stops
        .where((s) => s['status'] == 'pending')
        .map((s) => LatLng(s['lat'], s['lng']))
        .toList();

    if (points.length < 2) return {};

    return {
      Polyline(
        polylineId: const PolylineId('route'),
        points: points,
        color: AppColors.yellow,
        width: 4,
        patterns: [PatternItem.dash(20), PatternItem.gap(10)],
      ),
    };
  }
}
