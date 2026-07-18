class RideRequest {
  final String id;
  final String? customerId;
  final String customerName;
  final String customerPhone;
  final String? customerPhoto;
  final double? customerRating;
  final int tripsTogether;
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
  final int seatsBooked;
  final String? riderName;
  final String? riderPhone;
  final bool bookedForOther;

  RideRequest({
    required this.id,
    this.customerId,
    required this.customerName,
    required this.customerPhone,
    this.customerPhoto,
    this.customerRating,
    this.tripsTogether = 0,
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
    this.seatsBooked = 1,
    this.riderName,
    this.riderPhone,
    this.bookedForOther = false,
  });

  bool get isScheduled => scheduledTime != null;

  RideRequest copyWith({RideStatus? status, double? customerRating, int? tripsTogether, int? seatsBooked}) {
    return RideRequest(
      id: id,
      customerId: customerId,
      customerName: customerName,
      customerPhone: customerPhone,
      customerPhoto: customerPhoto,
      customerRating: customerRating ?? this.customerRating,
      tripsTogether: tripsTogether ?? this.tripsTogether,
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
      seatsBooked: seatsBooked ?? this.seatsBooked,
      riderName: riderName,
      riderPhone: riderPhone,
      bookedForOther: bookedForOther,
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
