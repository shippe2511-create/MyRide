/// Configuration for driver arrival notifications
/// Adjust these thresholds to tune notification timing
class DriverArrivalConfig {
  // "Driver is arriving" notification thresholds
  // Fires when ETA drops to this value OR distance is within fallback
  static const int arrivingEtaSeconds = 120; // 2 minutes
  static const double arrivingDistanceMeters = 300.0; // 300m fallback if no ETA

  // "Driver has arrived" notification threshold
  static const double arrivedDistanceMeters = 50.0; // 50m from pickup

  // Notification messages
  static const String arrivingTitle = 'Driver Arriving';
  static const String arrivingBody = 'Your driver is arriving — please head to the pickup point';

  static const String arrivedTitle = 'Driver Arrived';
  static const String arrivedBody = 'Your driver has arrived at the pickup point';
}
