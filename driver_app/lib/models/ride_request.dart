class RideRequest {
  final String id;
  final String? customerId;
  final String customerName;
  final String customerPhone;
  final String? customerPhoto;
  final String pickupLocation;
  final String dropoffLocation;
  final String pickupAddress;
  final String dropoffAddress;
  final double pickupLat;
  final double pickupLng;
  final double dropoffLat;
  final double dropoffLng;
  final DateTime requestTime;
  final DateTime? scheduledTime;
  final double estimatedDistance;
  final int estimatedDuration;
  final double? fare;
  final RideStatus status;

  RideRequest({
    required this.id,
    this.customerId,
    required this.customerName,
    required this.customerPhone,
    this.customerPhoto,
    required this.pickupLocation,
    required this.dropoffLocation,
    required this.pickupAddress,
    required this.dropoffAddress,
    required this.pickupLat,
    required this.pickupLng,
    required this.dropoffLat,
    required this.dropoffLng,
    required this.requestTime,
    this.scheduledTime,
    required this.estimatedDistance,
    required this.estimatedDuration,
    this.fare,
    this.status = RideStatus.pending,
  });

  bool get isScheduled => scheduledTime != null;

  RideRequest copyWith({RideStatus? status}) {
    return RideRequest(
      id: id,
      customerId: customerId,
      customerName: customerName,
      customerPhone: customerPhone,
      customerPhoto: customerPhoto,
      pickupLocation: pickupLocation,
      dropoffLocation: dropoffLocation,
      pickupAddress: pickupAddress,
      dropoffAddress: dropoffAddress,
      pickupLat: pickupLat,
      pickupLng: pickupLng,
      dropoffLat: dropoffLat,
      dropoffLng: dropoffLng,
      requestTime: requestTime,
      scheduledTime: scheduledTime,
      estimatedDistance: estimatedDistance,
      estimatedDuration: estimatedDuration,
      fare: fare,
      status: status ?? this.status,
    );
  }
}

enum RideStatus {
  pending,
  accepted,
  arrivedAtPickup,
  inProgress,
  completed,
  cancelled,
  queued,
}

enum TripStatus {
  completed,
  cancelled,
  rejected,
}

class CompletedTrip {
  final String id;
  final String customerName;
  final String pickupLocation;
  final String dropoffLocation;
  final DateTime tripDate;
  final int durationMinutes;
  final double distanceKm;
  final int rating;
  final TripStatus status;
  final String? cancellationReason;

  CompletedTrip({
    required this.id,
    required this.customerName,
    required this.pickupLocation,
    required this.dropoffLocation,
    required this.tripDate,
    required this.durationMinutes,
    required this.distanceKm,
    this.rating = 0,
    this.status = TripStatus.completed,
    this.cancellationReason,
  });
}
