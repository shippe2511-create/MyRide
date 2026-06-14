import 'dart:async';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/ride_request.dart';
import '../services/notification_service.dart';
import '../services/supabase_service.dart';

class DriverState extends ChangeNotifier {
  bool _isDarkMode = true;
  bool _isOnline = false;
  bool _isOnBreak = false;
  String _breakType = '';
  DateTime? _breakStartTime;
  bool _hasCompletedOnboarding = false;
  bool _isLoggedIn = false;
  bool _checklistCompleted = false;
  DateTime? _checklistCompletedDate;
  bool _checklistHasIssues = false;
  Map<String, String> _checklistIssues = {};
  bool _isOnHomeScreen = false;

  String _driverName = '';
  String _driverId = '';
  String _employeeId = '';
  String _vehicleNumber = '';
  String _vehicleModel = '';
  String _phoneNumber = '';
  String _profileImagePath = '';
  String _avatarUrl = '';

  RideRequest? _currentRide;
  final List<RideRequest> _incomingRequests = [];
  final List<RideRequest> _queuedRequests = [];
  final List<CompletedTrip> _completedTrips = [];

  int _todayTrips = 0;
  int _totalTrips = 0;
  double _rating = 4.8;
  double _todayDistance = 0;
  double _todayEarnings = 0;
  DateTime? _shiftStartTime;
  DateTime? _shiftEndTime;
  Timer? _locationTimer;
  RealtimeChannel? _rideSubscription;

  // Default location (Maldives)
  double _currentLat = 4.1755;
  double _currentLng = 73.5093;

  // Duty roster schedule (weekday index 0=Monday to 6=Sunday)
  final List<Map<String, dynamic>> _dutyRoster = [
    // Monday
    {'shifts': [{'start': '06:00', 'end': '14:00'}]},
    // Tuesday
    {'shifts': [{'start': '06:00', 'end': '14:00'}]},
    // Wednesday
    {'shifts': [{'start': '14:00', 'end': '22:00'}]},
    // Thursday
    {'shifts': [{'start': '06:00', 'end': '14:00'}]},
    // Friday
    {'shifts': [{'start': '06:00', 'end': '14:00'}]},
    // Saturday - day off
    {'shifts': []},
    // Sunday
    {'shifts': [{'start': '14:00', 'end': '22:00'}]},
  ];

  List<Map<String, dynamic>> get dutyRoster => _dutyRoster;

  // Seat management for shared rides
  int _totalSeats = 8; // Van capacity
  int get totalSeats => _totalSeats;
  int get usedSeats => (_currentRide != null ? 1 : 0) + _queuedRequests.length;
  int get availableSeats => _totalSeats - usedSeats;
  bool get hasAvailableSeats => availableSeats > 0;

  DriverState() {
    // _loadMockData(); // DISABLED - using real Supabase data only
    _initPreferences();
  }

  Future<void> _initPreferences() async {
    await Future.delayed(const Duration(milliseconds: 100));
    _loadPreferences();
  }

  // Getters
  bool get isDarkMode => _isDarkMode;
  bool get isOnline => _isOnline;
  bool get isOnBreak => _isOnBreak;
  String get breakType => _breakType;
  DateTime? get breakStartTime => _breakStartTime;
  int get breakDurationMinutes => _breakStartTime != null
      ? DateTime.now().difference(_breakStartTime!).inMinutes
      : 0;
  bool get hasCompletedOnboarding => _hasCompletedOnboarding;
  bool get isLoggedIn => _isLoggedIn;
  String get driverName => _driverName;
  String get driverId => _driverId;
  String get employeeId => _employeeId;
  String get vehicleNumber => _vehicleNumber;
  String get vehicleModel => _vehicleModel;
  String get phoneNumber => _phoneNumber;
  String get profileImagePath => _profileImagePath;
  String get avatarUrl => _avatarUrl;
  RideRequest? get currentRide => _currentRide;
  List<RideRequest> get incomingRequests => _incomingRequests;
  List<RideRequest> get queuedRequests => _queuedRequests;
  List<CompletedTrip> get completedTrips => _completedTrips;
  int get todayTrips => _todayTrips;
  int get totalTrips => _totalTrips;
  double get rating => _rating;
  double get todayDistance => _todayDistance;
  double get todayEarnings => _todayEarnings;
  DateTime? get shiftStartTime => _shiftStartTime;
  DateTime? get shiftEndTime => _shiftEndTime;
  bool get hasActiveShift => _shiftStartTime != null;
  int get shiftDurationMinutes => _shiftStartTime != null
      ? DateTime.now().difference(_shiftStartTime!).inMinutes
      : 0;
  bool get hasActiveRide => _currentRide != null;
  bool get checklistCompleted => _checklistCompleted && _isChecklistValidToday();
  bool get checklistHasIssues => _checklistHasIssues;
  Map<String, String> get checklistIssues => _checklistIssues;
  bool get isOnHomeScreen => _isOnHomeScreen;

  void setOnHomeScreen(bool value) {
    if (_isOnHomeScreen != value) {
      _isOnHomeScreen = value;
      notifyListeners();
    }
  }

  bool _isChecklistValidToday() {
    if (_checklistCompletedDate == null) return false;
    final now = DateTime.now();
    return _checklistCompletedDate!.year == now.year &&
        _checklistCompletedDate!.month == now.month &&
        _checklistCompletedDate!.day == now.day;
  }

  // Check if current time is within duty roster hours
  bool get isWithinDutyHours => true; // Always allow for now

  // Get today's shift info
  Map<String, String>? get todayShift => null;

  Future<void> _loadPreferences() async {
    try {
      final prefs = await SharedPreferences.getInstance();

      // Load user preferences
      _isDarkMode = prefs.getBool('darkMode') ?? true;
      _hasCompletedOnboarding = prefs.getBool('onboarding') ?? false;
      _isLoggedIn = prefs.getBool('loggedIn') ?? false;
      _driverName = prefs.getString('driverName') ?? '';
      _driverId = prefs.getString('driverId') ?? '';
      _employeeId = prefs.getString('employeeId') ?? '';
      _vehicleNumber = prefs.getString('vehicleNumber') ?? '';

      // Fetch employee_id from database if not set but logged in
      if (_isLoggedIn && _employeeId.isEmpty && _driverId.isNotEmpty) {
        _fetchEmployeeId();
      }
      _vehicleModel = prefs.getString('vehicleModel') ?? '';
      _phoneNumber = prefs.getString('phoneNumber') ?? '';
      _profileImagePath = prefs.getString('profileImagePath') ?? '';
      _avatarUrl = prefs.getString('avatarUrl') ?? '';

      // Load break state if saved
      final wasOnBreak = prefs.getBool('isOnBreak') ?? false;
      if (wasOnBreak) {
        final savedType = prefs.getString('breakType');
        final breakStartStr = prefs.getString('breakStartTime');
        if (savedType != null && savedType.isNotEmpty && breakStartStr != null) {
          final parsedTime = DateTime.tryParse(breakStartStr);
          if (parsedTime != null) {
            _isOnBreak = true;
            _isOnline = true;
            _breakType = savedType;
            _breakStartTime = parsedTime;

            // Check if break exceeded 30 minutes
            final minutes = DateTime.now().difference(parsedTime).inMinutes;
            if (minutes >= 30) {
              NotificationService().showBreakReminderNow(
                breakType: savedType,
                minutes: minutes,
              );
            } else {
              // Schedule reminder for remaining time
              NotificationService().scheduleBreakReminder(
                breakType: savedType,
                delayMinutes: 30 - minutes,
              );
            }
          }
        }
      }

      notifyListeners();
    } catch (e) {
      debugPrint('Error loading preferences: $e');
      notifyListeners();
    }
  }

  Future<void> updateProfileImage(String path) async {
    _profileImagePath = path;
    final prefs = await SharedPreferences.getInstance();
    prefs.setString('profileImagePath', path);
    notifyListeners();
  }

  Future<void> updateAvatarUrl(String url) async {
    _avatarUrl = url;
    final prefs = await SharedPreferences.getInstance();
    prefs.setString('avatarUrl', url);
    notifyListeners();
  }

  Future<void> setDriverData({
    required String name,
    required String id,
    required String vehicleNumber,
    String vehicleModel = '',
    required String phone,
    double rating = 5.0,
    String avatarUrl = '',
    String employeeId = '',
  }) async {
    _driverName = name;
    _driverId = id;
    _employeeId = employeeId;
    _vehicleNumber = vehicleNumber;
    _vehicleModel = vehicleModel;
    _phoneNumber = phone;
    _rating = rating;
    _avatarUrl = avatarUrl;
    _isLoggedIn = true;

    final prefs = await SharedPreferences.getInstance();
    prefs.setBool('loggedIn', true);
    prefs.setString('driverName', name);
    prefs.setString('driverId', id);
    prefs.setString('employeeId', employeeId);
    prefs.setString('vehicleNumber', vehicleNumber);
    prefs.setString('vehicleModel', vehicleModel);
    prefs.setString('phoneNumber', phone);
    prefs.setString('avatarUrl', avatarUrl);

    notifyListeners();
  }

  Future<void> _fetchEmployeeId() async {
    try {
      final response = await Supabase.instance.client
          .from('drivers')
          .select('profile:profiles(employee_id)')
          .eq('id', _driverId)
          .maybeSingle();

      if (response != null && response['profile'] != null) {
        final empId = response['profile']['employee_id'] ?? '';
        if (empId.isNotEmpty) {
          _employeeId = empId;
          final prefs = await SharedPreferences.getInstance();
          prefs.setString('employeeId', empId);
          notifyListeners();
        }
      }
    } catch (e) {
      debugPrint('Error fetching employee ID: $e');
    }
  }

  // REMOVED - No mock data, all data comes from Supabase
  void _loadMockData() {
    // Mock data removed - fetch real data from Supabase instead
  }

  // Actions
  void toggleDarkMode() async {
    _isDarkMode = !_isDarkMode;
    final prefs = await SharedPreferences.getInstance();
    prefs.setBool('darkMode', _isDarkMode);
    notifyListeners();
  }

  void completeChecklist({bool hasIssues = false, Map<String, String> issues = const {}}) {
    _checklistCompleted = true;
    _checklistCompletedDate = DateTime.now();
    _checklistHasIssues = hasIssues;
    _checklistIssues = Map.from(issues);
    notifyListeners();
  }

  void resetChecklist() {
    _checklistCompleted = false;
    _checklistCompletedDate = null;
    _checklistHasIssues = false;
    _checklistIssues = {};
    notifyListeners();
  }

  Timer? _ridePollingTimer;

  void goOnline() async {
    _isOnline = true;
    _isOnBreak = false;
    _breakType = '';
    _breakStartTime = null;
    _incomingRequests.clear(); // Clear any stale requests
    if (_shiftStartTime == null) {
      _shiftStartTime = DateTime.now();
    }
    _startLocationTracking();

    // Check for active ride FIRST before subscribing to new rides
    await _checkForActiveRide();

    // Only look for new rides if no active ride
    if (!hasActiveRide) {
      _subscribeToRideRequests();
      _loadPendingRides();
      _startRidePolling();
    }

    debugPrint('goOnline complete: hasActiveRide=$hasActiveRide, currentRide=${_currentRide?.id}');
    notifyListeners();

    // Update Supabase
    if (_driverId.isNotEmpty) {
      await SupabaseService.updateDriverStatus(
        driverId: _driverId,
        isOnline: true,
        isOnBreak: false,
      );
    }
  }

  Future<void> _checkForActiveRide() async {
    if (_driverId.isEmpty) return;

    try {
      final activeRide = await SupabaseService.getActiveRideByDriverId(_driverId);
      if (activeRide != null) {
        debugPrint('Found active ride: ${activeRide['id']} with status ${activeRide['status']}');

        // Convert to RideRequest and set as current ride
        final customer = activeRide['customer'] as Map<String, dynamic>?;
        final status = activeRide['status'] as String;

        _currentRide = RideRequest(
          id: activeRide['id'],
          customerId: activeRide['customer_id'] as String?,
          customerName: customer?['full_name'] ?? 'Customer',
          customerPhone: customer?['phone'] ?? '',
          pickupLocation: activeRide['pickup_name'] ?? 'Pickup',
          pickupAddress: activeRide['pickup_name'] ?? '',
          pickupLat: (activeRide['pickup_lat'] as num?)?.toDouble() ?? 0,
          pickupLng: (activeRide['pickup_lng'] as num?)?.toDouble() ?? 0,
          dropoffLocation: activeRide['dropoff_name'] ?? 'Dropoff',
          dropoffAddress: activeRide['dropoff_name'] ?? '',
          dropoffLat: (activeRide['dropoff_lat'] as num?)?.toDouble() ?? 0,
          dropoffLng: (activeRide['dropoff_lng'] as num?)?.toDouble() ?? 0,
          estimatedDistance: (activeRide['estimated_distance'] as num?)?.toDouble() ?? 5.0,
          estimatedDuration: (activeRide['estimated_duration'] as num?)?.toInt() ?? 15,
          status: status == 'accepted' ? RideStatus.accepted :
                  status == 'arrived' ? RideStatus.arrivedAtPickup :
                  status == 'in_progress' ? RideStatus.inProgress : RideStatus.accepted,
          requestTime: DateTime.tryParse(activeRide['created_at'] ?? '') ?? DateTime.now(),
        );

        debugPrint('Restored active ride: ${_currentRide?.id}');
      }
    } catch (e) {
      debugPrint('Error checking for active ride: $e');
    }
  }

  void _startRidePolling() {
    _ridePollingTimer?.cancel();
    // Poll for new rides every 5 seconds as backup to real-time
    _ridePollingTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      if (_isOnline && !_isOnBreak && !hasActiveRide) {
        _loadPendingRides();
      }
    });
  }

  void _stopRidePolling() {
    _ridePollingTimer?.cancel();
    _ridePollingTimer = null;
  }

  void goOffline() async {
    _isOnline = false;
    _isOnBreak = false;
    _breakType = '';
    _breakStartTime = null;
    _shiftEndTime = DateTime.now();
    _incomingRequests.clear();
    _stopLocationTracking();
    _stopRidePolling();
    _unsubscribeFromRides();

    // Clear break state when going offline
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('isOnBreak', false);
    await prefs.remove('breakType');
    await prefs.remove('breakStartTime');

    // Update Supabase
    if (_driverId.isNotEmpty) {
      await SupabaseService.updateDriverStatus(
        driverId: _driverId,
        isOnline: false,
        isOnBreak: false,
      );
    }

    notifyListeners();
  }

  void _startLocationTracking() {
    // Send initial location
    _sendLocationUpdate();

    // Start periodic updates every 5 seconds
    _locationTimer?.cancel();
    _locationTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      if (_isOnline) {
        _sendLocationUpdate();
      }
    });
  }

  void _stopLocationTracking() {
    _locationTimer?.cancel();
    _locationTimer = null;

    // Mark driver as offline in database
    if (_driverId.isNotEmpty) {
      SupabaseService.setDriverOnlineStatus(_driverId, false);
    }
  }

  Future<void> _sendLocationUpdate() async {
    if (_driverId.isEmpty) return;
    try {
      // Simulate slight movement for demo
      _currentLat += (DateTime.now().millisecond % 10 - 5) * 0.0001;
      _currentLng += (DateTime.now().millisecond % 10 - 5) * 0.0001;

      await SupabaseService.updateLocation(
        _driverId,
        _currentLat,
        _currentLng,
        heading: 0,
        speed: _isOnline && !_isOnBreak ? 25.0 : 0,
      );
    } catch (e) {
      debugPrint('Location update error: $e');
    }
  }

  RealtimeChannel? _rideCancellationSubscription;

  void _subscribeToRideRequests() {
    _rideSubscription?.unsubscribe();
    _rideSubscription = SupabaseService.subscribeToNewRides((newRide) {
      if (!_isOnline || _isOnBreak) return;

      // Check if this is a scheduled ride that's not due yet
      final scheduledTimeStr = newRide['scheduled_time'] as String?;
      if (scheduledTimeStr != null) {
        final scheduledTime = DateTime.tryParse(scheduledTimeStr);
        if (scheduledTime != null && scheduledTime.isAfter(DateTime.now().toUtc())) {
          debugPrint('Ignoring scheduled ride - not due yet: $scheduledTimeStr');
          return; // Don't show scheduled rides until their time arrives
        }
      }

      // Convert Supabase ride to RideRequest model
      final request = _convertSupabaseRideToRequest(newRide);
      if (request != null && !_incomingRequests.any((r) => r.id == request.id)) {
        _incomingRequests.add(request);

        // Show notification
        NotificationService().showRideRequestNotification(
          customerName: request.customerName,
          pickup: request.pickupLocation,
          dropoff: request.dropoffLocation,
          distance: request.estimatedDistance,
        );

        notifyListeners();
      }
    });

    // Subscribe to ride cancellations/updates
    _subscribeToRideCancellations();
  }

  void _subscribeToRideCancellations() {
    _rideCancellationSubscription?.unsubscribe();
    _rideCancellationSubscription = SupabaseService.subscribeToRideCancellations((updatedRide) {
      final rideId = updatedRide['id'] as String?;
      final status = updatedRide['status'] as String?;

      if (rideId != null && (status == 'cancelled' || status == 'accepted' || status == 'completed')) {
        // Remove from incoming requests if cancelled or already taken
        final removed = _incomingRequests.any((r) => r.id == rideId);
        _incomingRequests.removeWhere((r) => r.id == rideId);

        if (removed) {
          debugPrint('Ride $rideId removed - status: $status');
          notifyListeners();
        }
      }
    });
  }

  Future<void> _loadPendingRides() async {
    try {
      final rides = await SupabaseService.getPendingRides();

      bool changed = false;

      // Get list of current pending ride IDs from database
      final pendingIds = rides.map((r) => r['id'] as String).toSet();

      debugPrint('Polling: ${rides.length} pending rides in DB, ${_incomingRequests.length} local');

      // Remove rides that are no longer pending (cancelled, accepted by another driver, etc)
      if (_incomingRequests.isNotEmpty) {
        final toRemove = _incomingRequests.where((r) => !pendingIds.contains(r.id)).toList();
        for (final ride in toRemove) {
          debugPrint('Removing ride ${ride.id} - no longer pending');
          _incomingRequests.remove(ride);
          changed = true;
        }
      }

      // Add new rides - available to all drivers until accepted
      for (final ride in rides) {
        final request = _convertSupabaseRideToRequest(ride);
        if (request != null && !_incomingRequests.any((r) => r.id == request.id)) {
          _incomingRequests.add(request);
          changed = true;
          debugPrint('Added ride: ${request.customerName} - ${request.pickupLocation}');

          // Show notification for new ride
          NotificationService().showRideRequestNotification(
            customerName: request.customerName,
            pickup: request.pickupLocation,
            dropoff: request.dropoffLocation,
            distance: request.estimatedDistance,
          );
        }
      }

      // Only notify if something changed
      if (changed) {
        notifyListeners();
      }
    } catch (e) {
      debugPrint('Error loading pending rides: $e');
    }
  }

  // Manual refresh for pending rides
  Future<void> refreshPendingRides() async {
    if (_isOnline && !_isOnBreak) {
      await _loadPendingRides();
    }
  }

  // Refresh current ride data (after destination change etc)
  Future<void> refreshCurrentRide() async {
    if (_currentRide == null) return;
    try {
      final rideData = await SupabaseService.getActiveRide();
      if (rideData != null) {
        final updatedRide = _convertSupabaseRideToRequest(rideData);
        if (updatedRide != null) {
          _currentRide = updatedRide.copyWith(status: _currentRide!.status);
          notifyListeners();
        }
      }
    } catch (e) {
      debugPrint('Error refreshing current ride: $e');
    }
  }

  RideRequest? _convertSupabaseRideToRequest(Map<String, dynamic> ride) {
    try {
      final customer = ride['customer'] as Map<String, dynamic>?;
      return RideRequest(
        id: ride['id'] ?? '',
        customerId: ride['customer_id'] as String?,
        customerName: customer?['full_name'] ?? 'Customer',
        customerPhone: customer?['phone'] ?? '',
        pickupLocation: ride['pickup_name'] ?? 'Pickup',
        pickupAddress: ride['pickup_name'] ?? '',
        dropoffLocation: ride['dropoff_name'] ?? 'Dropoff',
        dropoffAddress: ride['dropoff_name'] ?? '',
        pickupLat: (ride['pickup_lat'] as num?)?.toDouble() ?? 4.1755,
        pickupLng: (ride['pickup_lng'] as num?)?.toDouble() ?? 73.5093,
        dropoffLat: (ride['dropoff_lat'] as num?)?.toDouble() ?? 4.2234,
        dropoffLng: (ride['dropoff_lng'] as num?)?.toDouble() ?? 73.5367,
        requestTime: DateTime.tryParse(ride['created_at'] ?? '') ?? DateTime.now(),
        estimatedDistance: (ride['distance_km'] as num?)?.toDouble() ?? 5.0,
        estimatedDuration: (ride['duration_minutes'] as num?)?.toInt() ?? 15,
      );
    } catch (e) {
      debugPrint('Error converting ride: $e');
      return null;
    }
  }

  void _unsubscribeFromRides() {
    _rideSubscription?.unsubscribe();
    _rideSubscription = null;
    _rideCancellationSubscription?.unsubscribe();
    _rideCancellationSubscription = null;
  }

  void endShift() {
    _shiftStartTime = null;
    _shiftEndTime = null;
    goOffline();
  }

  void startBreak(String type) async {
    _isOnBreak = true;
    _breakType = type;
    _breakStartTime = DateTime.now();
    _incomingRequests.clear();

    // Save break state
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('isOnBreak', true);
    await prefs.setString('breakType', type);
    await prefs.setString('breakStartTime', _breakStartTime!.toIso8601String());

    // Schedule break reminder after 30 minutes (works even when app is closed)
    NotificationService().scheduleBreakReminder(
      breakType: type,
      delayMinutes: 30,
    );

    notifyListeners();
  }

  void endBreak() async {
    _isOnBreak = false;
    _breakType = '';
    _breakStartTime = null;

    // Cancel break reminder
    NotificationService().cancelBreakReminder();

    // Clear break state
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('isOnBreak', false);
    await prefs.remove('breakType');
    await prefs.remove('breakStartTime');

    if (_isOnline) {
      // _simulateIncomingRequest(); // DISABLED - using real Supabase data
    }
    notifyListeners();
  }

  void toggleOnline() {
    if (_isOnline) {
      goOffline();
    } else {
      goOnline();
    }
  }

  void completeOnboarding() async {
    _hasCompletedOnboarding = true;
    final prefs = await SharedPreferences.getInstance();
    prefs.setBool('onboarding', true);
    notifyListeners();
  }

  void login({
    required String name,
    required String id,
    required String vehicle,
    required String phone,
  }) async {
    _driverName = name;
    _driverId = id;
    _vehicleNumber = vehicle;
    _phoneNumber = phone;
    _isLoggedIn = true;

    final prefs = await SharedPreferences.getInstance();
    prefs.setBool('loggedIn', true);
    prefs.setString('driverName', name);
    prefs.setString('driverId', id);
    prefs.setString('vehicleNumber', vehicle);
    prefs.setString('phoneNumber', phone);
    notifyListeners();
  }

  void logout() async {
    _isLoggedIn = false;
    _isOnline = false;
    _currentRide = null;
    _incomingRequests.clear();

    final prefs = await SharedPreferences.getInstance();
    prefs.setBool('loggedIn', false);
    notifyListeners();
  }

  int _requestCounter = 0;

  // DISABLED - No more mock requests, only real Supabase requests
  void _simulateIncomingRequest() {
    // Mock requests disabled - real requests come from Supabase via _loadPendingRides()
  }

  Future<Map<String, dynamic>> acceptRide(RideRequest request) async {
    // Ensure we have a driver ID
    if (_driverId.isEmpty) {
      debugPrint('No driver ID set - cannot accept ride');
      return {'success': false, 'error': 'Driver not logged in'};
    }

    // Try to accept in Supabase (atomic operation)
    try {
      final result = await SupabaseService.acceptRide(request.id, driverId: _driverId);

      if (result['success'] == true) {
        // Success - update local state
        _currentRide = request.copyWith(status: RideStatus.accepted);
        _incomingRequests.removeWhere((r) => r.id == request.id);
        notifyListeners();
        return result;
      } else {
        // Another driver got it first - remove from list and refresh
        _incomingRequests.removeWhere((r) => r.id == request.id);
        notifyListeners();
        // Refresh to get latest pending rides
        await _loadPendingRides();
        return result;
      }
    } catch (e) {
      debugPrint('Error accepting ride in Supabase: $e');
      return {'success': false, 'error': e.toString()};
    }
  }

  Future<void> declineRide(RideRequest request) async {
    _incomingRequests.removeWhere((r) => r.id == request.id);
    notifyListeners();

    // Just skip this ride locally - it stays pending for other drivers
    try {
      await SupabaseService.declineRide(request.id);
    } catch (e) {
      debugPrint('Error rejecting ride in Supabase: $e');
    }
  }

  // Called when ride request times out (driver didn't respond)
  void expireRide(RideRequest request) {
    _incomingRequests.removeWhere((r) => r.id == request.id);
    // Don't add to _expiredRideIds - let the ride reappear on next poll
    // This keeps the ride available to all drivers until one accepts
    debugPrint('Ride ${request.id} timed out - will reappear on next poll');
    notifyListeners();
  }

  Future<void> cancelRide(RideRequest request, String reason) async {
    // Clear current ride
    _currentRide = null;
    // Clear queued requests
    _queuedRequests.clear();
    notifyListeners();

    // Update in Supabase
    try {
      await SupabaseService.updateRideStatus(request.id, 'cancelled', cancelReason: reason);
    } catch (e) {
      debugPrint('Error cancelling ride in Supabase: $e');
    }

    // Simulate a new incoming request after cancellation
    if (_isOnline) {
      Future.delayed(const Duration(seconds: 3), () {
        // _simulateIncomingRequest(); // DISABLED - using real Supabase data
      });
    }
  }

  Future<void> arrivedAtPickup() async {
    if (_currentRide != null) {
      _currentRide = _currentRide!.copyWith(status: RideStatus.arrivedAtPickup);

      // Notify customer that driver has arrived
      NotificationService().showCustomerArrivedNotification(
        customerName: _currentRide!.customerName,
        location: _currentRide!.pickupLocation,
      );

      notifyListeners();

      // Update in Supabase
      try {
        await SupabaseService.updateRideStatus(_currentRide!.id, 'arrived');
      } catch (e) {
        debugPrint('Error updating ride status: $e');
      }
    }
  }

  Future<void> startTrip() async {
    if (_currentRide != null) {
      _currentRide = _currentRide!.copyWith(status: RideStatus.inProgress);
      notifyListeners();

      // Update in Supabase
      try {
        await SupabaseService.updateRideStatus(_currentRide!.id, 'in_progress');
      } catch (e) {
        debugPrint('Error updating ride status: $e');
      }
    }
  }

  Future<void> completeTrip() async {
    if (_currentRide != null) {
      final rideId = _currentRide!.id;
      final distance = _currentRide!.estimatedDistance;
      final duration = _currentRide!.estimatedDuration;

      _completedTrips.insert(0, CompletedTrip(
        id: rideId,
        customerName: _currentRide!.customerName,
        pickupLocation: _currentRide!.pickupLocation,
        dropoffLocation: _currentRide!.dropoffLocation,
        tripDate: DateTime.now(),
        durationMinutes: duration,
        distanceKm: distance,
      ));
      _todayTrips++;
      _totalTrips++;
      _todayDistance += distance;

      // Show completion notification
      NotificationService().showTripCompletedNotification(
        distance: distance,
        duration: duration,
      );

      // Update in Supabase
      try {
        await SupabaseService.completeRide(rideId, distanceKm: distance, durationMinutes: duration);
      } catch (e) {
        debugPrint('Error completing ride: $e');
      }

      // Auto-start next queued ride if available
      if (_queuedRequests.isNotEmpty) {
        _currentRide = _queuedRequests.first.copyWith(status: RideStatus.accepted);
        _queuedRequests.removeAt(0);
        NotificationService().showRideRequestNotification(
          customerName: _currentRide!.customerName,
          pickup: _currentRide!.pickupLocation,
          dropoff: _currentRide!.dropoffLocation,
          distance: _currentRide!.estimatedDistance,
        );
      } else {
        _currentRide = null;
        if (_isOnline) {
          // _simulateIncomingRequest(); // DISABLED - using real Supabase data
        }
      }

      notifyListeners();
    }
  }

  void cancelTrip() {
    _currentRide = null;
    notifyListeners();

    if (_isOnline) {
      // _simulateIncomingRequest(); // DISABLED - using real Supabase data
    }
  }

  void cancelTripWithReason(String reason) {
    if (_currentRide != null) {
      _completedTrips.insert(0, CompletedTrip(
        id: _currentRide!.id,
        customerName: _currentRide!.customerName,
        pickupLocation: _currentRide!.pickupLocation,
        dropoffLocation: _currentRide!.dropoffLocation,
        tripDate: DateTime.now(),
        durationMinutes: 0,
        distanceKm: 0,
        rating: 0,
        status: TripStatus.cancelled,
        cancellationReason: reason,
      ));
    }
    _currentRide = null;
    notifyListeners();

    if (_isOnline) {
      // _simulateIncomingRequest(); // DISABLED - using real Supabase data
    }
  }

  void addToQueue(RideRequest request) {
    _queuedRequests.add(request.copyWith(status: RideStatus.queued));
    _incomingRequests.removeWhere((r) => r.id == request.id);
    notifyListeners();

    // Simulate next request if seats still available
    if (_currentRide != null && hasAvailableSeats && _incomingRequests.isEmpty) {
      // _simulateIncomingRequest(); // DISABLED - using real Supabase data
    }
  }

  void removeFromQueue(String requestId) {
    _queuedRequests.removeWhere((r) => r.id == requestId);
    notifyListeners();
  }

  void startQueuedRide() {
    if (_queuedRequests.isNotEmpty && _currentRide == null) {
      _currentRide = _queuedRequests.first.copyWith(status: RideStatus.accepted);
      _queuedRequests.removeAt(0);
      notifyListeners();
    }
  }
}
