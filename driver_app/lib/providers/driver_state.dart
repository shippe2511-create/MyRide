import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:geolocator/geolocator.dart';
import '../models/ride_request.dart';
import '../services/notification_service.dart';
import '../services/supabase_service.dart';
import '../services/voice_service.dart';

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
  String _profileId = '';
  String _employeeId = '';
  String _vehicleNumber = '';
  String _vehicleModel = '';
  String _phoneNumber = '';
  String _profileImagePath = '';
  String _avatarUrl = '';
  int _avatarCacheKey = 0; // Cache buster for avatar

  RideRequest? _currentRide;
  final List<RideRequest> _incomingRequests = [];
  final List<RideRequest> _queuedRequests = [];
  final List<CompletedTrip> _completedTrips = [];

  int _todayTrips = 0;
  int _weekTrips = 0;
  int _totalTrips = 0;
  double _rating = 0.0;
  double _todayDistance = 0;
  double _todayEarnings = 0;
  DateTime? _shiftStartTime;
  DateTime? _shiftEndTime;
  Timer? _locationTimer;
  RealtimeChannel? _rideSubscription;
  RealtimeChannel? _driverProfileSubscription;

  // Default location (Maldives)
  double _currentLat = 4.1755;
  double _currentLng = 73.5093;

  // Duty roster from database
  List<Map<String, dynamic>> _dutyRoster = [];
  List<Map<String, dynamic>> _weekShifts = [];

  List<Map<String, dynamic>> get dutyRoster => _dutyRoster;
  List<Map<String, dynamic>> get weekShifts => _weekShifts;

  // Seat management for rides
  int _totalSeats = 6; // Vehicle capacity
  int get totalSeats => _totalSeats;
  int get seatsBooked => _currentRide?.seatsBooked ?? 1;
  int get availableSeats => _totalSeats - seatsBooked;
  bool get hasAvailableSeats => availableSeats > 0;

  DriverState() {
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
  String get profileId => _profileId;
  String get employeeId => _employeeId;
  String get vehicleNumber => _vehicleNumber;
  String get vehicleModel => _vehicleModel;
  String get phoneNumber => _phoneNumber;
  String get profileImagePath => _profileImagePath;
  String get avatarUrl => _avatarUrl;
  int get avatarCacheKey => _avatarCacheKey;
  RideRequest? get currentRide => _currentRide;
  List<RideRequest> get incomingRequests => _incomingRequests;
  List<RideRequest> get queuedRequests => _queuedRequests;
  List<CompletedTrip> get completedTrips => _completedTrips;
  int get todayTrips => _todayTrips;
  int get weekTrips => _weekTrips;
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

  // Check if current time is within duty roster hours (defaults to 8am-4pm)
  bool get isWithinDutyHours {
    final todayShiftInfo = todayShift;

    final now = DateTime.now();
    final startParts = todayShiftInfo['start']!.split(':');
    final endParts = todayShiftInfo['end']!.split(':');

    final shiftStart = DateTime(now.year, now.month, now.day,
      int.parse(startParts[0]), int.parse(startParts[1]));
    final shiftEnd = DateTime(now.year, now.month, now.day,
      int.parse(endParts[0]), int.parse(endParts[1]));

    return now.isAfter(shiftStart) && now.isBefore(shiftEnd);
  }

  // Default shift hours (8am-4pm) when no schedule is set
  static const String _defaultShiftStart = '08:00';
  static const String _defaultShiftEnd = '16:00';

  // Get today's shift info from loaded shifts (defaults to 8am-4pm if not scheduled)
  Map<String, String> get todayShift {
    final today = DateTime.now();
    final todayStr = '${today.year}-${today.month.toString().padLeft(2, '0')}-${today.day.toString().padLeft(2, '0')}';

    for (final shift in _weekShifts) {
      if (shift['shift_date'] == todayStr) {
        return {
          'start': shift['start_time']?.toString().substring(0, 5) ?? _defaultShiftStart,
          'end': shift['end_time']?.toString().substring(0, 5) ?? _defaultShiftEnd,
          'type': shift['shift_type'] ?? 'regular',
        };
      }
    }
    // Default shift: 8am-4pm
    return {
      'start': _defaultShiftStart,
      'end': _defaultShiftEnd,
      'type': 'default',
    };
  }

  // Load shifts from database
  Future<void> loadShifts() async {
    if (_driverId.isEmpty) return;

    try {
      final now = DateTime.now();
      final weekStart = now.subtract(Duration(days: now.weekday - 1));
      final weekEnd = weekStart.add(const Duration(days: 6));

      final shifts = await SupabaseService.getDriverShifts(_driverId, weekStart, weekEnd);
      _weekShifts = shifts;

      // Convert to duty roster format for weekly view
      _dutyRoster = List.generate(7, (dayIndex) {
        final date = weekStart.add(Duration(days: dayIndex));
        final dateStr = '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';

        final dayShifts = shifts.where((s) => s['shift_date'] == dateStr).map((s) => {
          'start': s['start_time']?.toString().substring(0, 5) ?? '00:00',
          'end': s['end_time']?.toString().substring(0, 5) ?? '23:59',
        }).toList();

        return {'shifts': dayShifts};
      });

      notifyListeners();
    } catch (e) {
      debugPrint('Error loading shifts: $e');
    }
  }

  Future<void> _loadPreferences() async {
    try {
      final prefs = await SharedPreferences.getInstance();

      // Load user preferences
      _isDarkMode = prefs.getBool('darkMode') ?? true;
      _hasCompletedOnboarding = prefs.getBool('onboarding') ?? false;
      _isLoggedIn = prefs.getBool('loggedIn') ?? false;
      _driverName = prefs.getString('driverName') ?? '';
      _driverId = prefs.getString('driverId') ?? '';
      _profileId = prefs.getString('profileId') ?? '';
      _employeeId = prefs.getString('employeeId') ?? '';
      _vehicleNumber = prefs.getString('vehicleNumber') ?? '';

      // Sync driverId to SupabaseService
      if (_driverId.isNotEmpty) {
        SupabaseService.setDriverId(_driverId);
        // Load shifts for this week
        loadShifts();
        // Load actual stats from database
        loadDriverStats();
        // Refresh vehicle info from database
        refreshVehicleInfo();
        // Check for active ride on app start
        _checkForActiveRide();
        // Start profile subscription for realtime updates (even when offline)
        _subscribeToDriverProfile();
      }

      // Fetch employee_id from database if not set but logged in
      if (_isLoggedIn && _employeeId.isEmpty && _driverId.isNotEmpty) {
        _fetchEmployeeId();
      }
      _vehicleModel = prefs.getString('vehicleModel') ?? '';
      _phoneNumber = prefs.getString('phoneNumber') ?? '';
      _profileImagePath = prefs.getString('profileImagePath') ?? '';
      _avatarUrl = prefs.getString('avatarUrl') ?? '';

      // Fetch latest avatar from DB if logged in
      if (_isLoggedIn && _driverId.isNotEmpty) {
        _loadAvatarFromDb();
      }

      // Load online state
      final wasOnline = prefs.getBool('isOnline') ?? false;
      if (wasOnline && _driverId.isNotEmpty) {
        _isOnline = true;
        // Will re-initialize subscriptions in home_screen via goOnline check
      }

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
    _avatarCacheKey = DateTime.now().millisecondsSinceEpoch; // Force cache refresh
    final prefs = await SharedPreferences.getInstance();
    prefs.setString('avatarUrl', url);
    notifyListeners();
  }

  Future<void> _loadAvatarFromDb() async {
    if (_driverId.isEmpty) return;
    final url = await SupabaseService.getDriverAvatarUrl(_driverId);
    if (url != null && url.isNotEmpty && url != _avatarUrl) {
      _avatarUrl = url;
      final prefs = await SharedPreferences.getInstance();
      prefs.setString('avatarUrl', url);
      notifyListeners();
    }
  }

  Future<void> setDriverData({
    required String name,
    required String id,
    required String vehicleNumber,
    String vehicleModel = '',
    required String phone,
    double rating = 0.0,
    String avatarUrl = '',
    String employeeId = '',
    String profileId = '',
  }) async {
    _driverName = name;
    _driverId = id;
    _profileId = profileId;
    _employeeId = employeeId;
    _vehicleNumber = vehicleNumber;
    _vehicleModel = vehicleModel;
    _phoneNumber = phone;
    _rating = rating;
    _avatarUrl = avatarUrl;
    _isLoggedIn = true;

    // Sync to SupabaseService
    SupabaseService.setDriverId(id);

    final prefs = await SharedPreferences.getInstance();
    prefs.setBool('loggedIn', true);
    prefs.setString('driverName', name);
    prefs.setString('driverId', id);
    prefs.setString('profileId', profileId);
    prefs.setString('employeeId', employeeId);
    prefs.setString('vehicleNumber', vehicleNumber);
    prefs.setString('vehicleModel', vehicleModel);
    prefs.setString('phoneNumber', phone);
    prefs.setString('avatarUrl', avatarUrl);

    // Load shifts from database
    await loadShifts();

    // Load actual stats from database
    await loadDriverStats();

    // Subscribe to profile updates for suspension detection
    _subscribeToDriverProfile();

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

  // Load driver stats from Supabase (trips, rating)
  Future<void> loadDriverStats() async {
    if (_driverId.isEmpty) return;

    try {
      // Get driver's rating from drivers table
      final driverData = await Supabase.instance.client
          .from('drivers')
          .select('rating, total_trips')
          .eq('id', _driverId)
          .maybeSingle();

      if (driverData != null) {
        _rating = (driverData['rating'] as num?)?.toDouble() ?? 5.0;
        _totalTrips = (driverData['total_trips'] as num?)?.toInt() ?? 0;
      }

      // Get actual completed trips count
      final completedRides = await Supabase.instance.client
          .from('rides')
          .select('id')
          .eq('driver_id', _driverId)
          .eq('status', 'completed');

      _totalTrips = (completedRides as List).length;

      // Get today's trips (convert local midnight to UTC for comparison)
      final now = DateTime.now();
      final todayStart = DateTime(now.year, now.month, now.day);
      final todayStartUtc = todayStart.toUtc().toIso8601String();

      final todayRides = await Supabase.instance.client
          .from('rides')
          .select('id')
          .eq('driver_id', _driverId)
          .eq('status', 'completed')
          .gte('created_at', todayStartUtc);

      _todayTrips = (todayRides as List).length;

      // Calculate average rating from ratings table
      final ratings = await Supabase.instance.client
          .from('ratings')
          .select('rating')
          .eq('to_user_id', _profileId);

      if ((ratings as List).isNotEmpty) {
        final sum = ratings.fold<num>(0, (sum, r) => sum + (r['rating'] as num));
        _rating = sum / ratings.length;
      }

      notifyListeners();
    } catch (e) {
      debugPrint('Error loading driver stats: $e');
    }
  }

  // Actions
  void toggleDarkMode() async {
    _isDarkMode = !_isDarkMode;
    final prefs = await SharedPreferences.getInstance();
    prefs.setBool('darkMode', _isDarkMode);
    notifyListeners();
  }

  void completeChecklist({bool hasIssues = false, Map<String, String> issues = const {}}) async {
    _checklistCompleted = true;
    _checklistCompletedDate = DateTime.now();
    _checklistHasIssues = hasIssues;
    _checklistIssues = Map.from(issues);

    // Clear the needsNewChecklist flag since we just completed one
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('needsNewChecklist', false);

    notifyListeners();
  }

  /// Load today's checklist from database for this driver
  Future<void> loadTodayChecklist() async {
    if (_driverId.isEmpty) return;

    try {
      final prefs = await SharedPreferences.getInstance();

      // Check if we need a new checklist (after ending shift)
      final needsNew = prefs.getBool('needsNewChecklist') ?? false;
      if (needsNew) {
        _checklistCompleted = false;
        _checklistCompletedDate = null;
        _checklistHasIssues = false;
        _checklistIssues = {};
        debugPrint('New checklist required for new shift');
        notifyListeners();
        return;
      }

      final today = DateTime.now();
      final startOfDay = DateTime(today.year, today.month, today.day);
      final endOfDay = startOfDay.add(const Duration(days: 1));

      final response = await SupabaseService.client
          .from('vehicle_checklists')
          .select()
          .eq('driver_id', _driverId)
          .gte('checked_at', startOfDay.toIso8601String())
          .lt('checked_at', endOfDay.toIso8601String())
          .order('checked_at', ascending: false)
          .limit(1)
          .maybeSingle();

      if (response != null) {
        _checklistCompleted = true;
        _checklistCompletedDate = DateTime.tryParse(response['checked_at'] ?? '') ?? today;
        _checklistHasIssues = response['has_issues'] ?? false;
        final issues = response['issues'];
        if (issues is Map) {
          _checklistIssues = Map<String, String>.from(
            issues.map((k, v) => MapEntry(k.toString(), v.toString()))
          );
        }
        debugPrint('Loaded today\'s checklist for driver $_driverId');
      } else {
        _checklistCompleted = false;
        _checklistCompletedDate = null;
        _checklistHasIssues = false;
        _checklistIssues = {};
        debugPrint('No checklist found for today');
      }
      notifyListeners();
    } catch (e) {
      debugPrint('Error loading today\'s checklist: $e');
    }
  }

  void resetChecklist() {
    _checklistCompleted = false;
    _checklistCompletedDate = null;
    _checklistHasIssues = false;
    _checklistIssues = {};
    notifyListeners();
  }

  Timer? _ridePollingTimer;

  String? _vehicleInactiveReason;
  String? get vehicleInactiveReason => _vehicleInactiveReason;

  Future<bool> goOnline() async {
    // Check if vehicle is assigned and active before going online
    if (_driverId.isNotEmpty) {
      final vehicle = await SupabaseService.getDriverVehicle(_driverId);
      if (vehicle == null) {
        _vehicleInactiveReason = 'No vehicle assigned. Please contact admin.';
        _isOnline = false;
        final prefs = await SharedPreferences.getInstance();
        await prefs.setBool('isOnline', false);
        await SupabaseService.updateDriverStatus(driverId: _driverId, isOnline: false);
        notifyListeners();
        return false;
      }
      if (vehicle['is_active'] != true) {
        _vehicleInactiveReason = 'Your vehicle is disabled. Please contact admin.';
        _isOnline = false;
        final prefs = await SharedPreferences.getInstance();
        await prefs.setBool('isOnline', false);
        await SupabaseService.updateDriverStatus(driverId: _driverId, isOnline: false);
        notifyListeners();
        return false;
      }
    }

    _isOnline = true;
    _isOnBreak = false;
    _breakType = '';
    _breakStartTime = null;
    _vehicleInactiveReason = null;
    _incomingRequests.clear(); // Clear any stale requests

    // Save online state
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('isOnline', true);

    // Haptic and voice feedback
    HapticFeedback.mediumImpact();
    VoiceService().announceGoingOnline();
    if (_shiftStartTime == null) {
      _shiftStartTime = DateTime.now();
    }
    _startLocationTracking();

    debugPrint('goOnline: Unified pool system active');
    notifyListeners();

    // Update Supabase
    if (_driverId.isNotEmpty) {
      await SupabaseService.updateDriverStatus(
        driverId: _driverId,
        isOnline: true,
        isOnBreak: false,
      );

      // Subscribe to ride requests
      _subscribeToRideRequests();

      // Start polling for pending rides
      _startRidePolling();
    }
    return true;
  }

  Future<void> loadCompletedTrips() async {
    try {
      debugPrint('loadCompletedTrips: Starting to load for driverId=$_driverId');
      if (_driverId.isEmpty) {
        debugPrint('loadCompletedTrips: No driverId, skipping');
        return;
      }
      final rides = await SupabaseService.getCompletedRides(driverId: _driverId);
      debugPrint('loadCompletedTrips: Got ${rides.length} rides from DB');
      _completedTrips.clear();
      for (final ride in rides) {
        debugPrint('loadCompletedTrips: Processing ride ${ride['id']}');
        final customer = ride['customer'] as Map<String, dynamic>?;
        final distanceVal = ride['distance_km'];
        double distance = 0.0;
        if (distanceVal is num) {
          distance = distanceVal.toDouble();
        } else if (distanceVal is String) {
          distance = double.tryParse(distanceVal) ?? 0.0;
        }

        _completedTrips.add(CompletedTrip(
          id: ride['id'] ?? '',
          customerName: customer?['full_name'] ?? 'Customer',
          pickupLocation: ride['pickup_name'] ?? '',
          dropoffLocation: ride['dropoff_name'] ?? '',
          tripDate: DateTime.tryParse(ride['created_at'] ?? '') ?? DateTime.now(),
          durationMinutes: ride['duration_minutes'] ?? 0,
          distanceKm: distance,
          status: _parseStatus(ride['status']),
        ));
      }
      notifyListeners();
      debugPrint('Loaded ${_completedTrips.length} completed trips from database');
    } catch (e) {
      debugPrint('Error loading completed trips: $e');
    }
  }

  TripStatus _parseStatus(String? status) {
    switch (status) {
      case 'completed':
        return TripStatus.completed;
      case 'cancelled':
        return TripStatus.cancelled;
      case 'rejected':
        return TripStatus.rejected;
      default:
        return TripStatus.completed;
    }
  }

  Future<void> _checkForActiveRide() async {
    debugPrint('_checkForActiveRide called with driverId: $_driverId');
    if (_driverId.isEmpty) {
      debugPrint('_checkForActiveRide: driverId is empty, returning');
      return;
    }

    try {
      debugPrint('Checking active ride for driver: $_driverId');
      final activeRide = await SupabaseService.getActiveRideByDriverId(_driverId);
      if (activeRide != null) {
        debugPrint('Found active ride: ${activeRide['id']} with status ${activeRide['status']}');

        // Convert to RideRequest and set as current ride
        final customer = activeRide['customer'] as Map<String, dynamic>?;
        final status = activeRide['status'] as String;

        // Fetch customer rating and trips together
        final customerId = activeRide['customer_id'] as String?;
        double? customerRating;
        int tripsTogether = 0;
        if (customerId != null && _driverId.isNotEmpty) {
          final stats = await SupabaseService.getCustomerStatsForDriver(customerId, _driverId);
          customerRating = stats['rating'];
          tripsTogether = stats['tripsTogether'] ?? 0;
        }

        _currentRide = RideRequest(
          id: activeRide['id'],
          customerId: customerId,
          customerName: customer?['full_name'] ?? 'Customer',
          customerPhone: customer?['phone'] ?? '',
          customerRating: customerRating,
          tripsTogether: tripsTogether,
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
          seatsBooked: (activeRide['seats_booked'] as num?)?.toInt() ?? 1,
        );

        debugPrint('Restored active ride: ${_currentRide?.id}');
      }
    } catch (e) {
      debugPrint('Error checking for active ride: $e');
    }
  }

  void _startRidePolling() {
    _ridePollingTimer?.cancel();
    // Poll for new rides every 2 seconds as backup to real-time
    _ridePollingTimer = Timer.periodic(const Duration(seconds: 2), (_) {
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

    // Reset checklist for next shift
    _checklistCompleted = false;
    _checklistCompletedDate = null;
    _checklistHasIssues = false;
    _checklistIssues = {};

    // Haptic and voice feedback
    HapticFeedback.lightImpact();
    VoiceService().announceGoingOffline();

    // Clear online, break state and mark checklist as needed for next shift
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('isOnline', false);
    await prefs.setBool('isOnBreak', false);
    await prefs.setBool('needsNewChecklist', true);  // Require checklist for next shift
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

  bool _isValidMaldivesCoord(double lat, double lng) {
    // Maldives bounds: lat -0.7 to 7.1, lng 72.6 to 73.8
    return lat >= -0.7 && lat <= 7.1 && lng >= 72.6 && lng <= 73.8;
  }

  Future<void> _sendLocationUpdate() async {
    if (_driverId.isEmpty) return;
    try {
      // Get real GPS location with shorter timeout for emulator compatibility
      final position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.medium,
        timeLimit: const Duration(seconds: 5),
      ).timeout(
        const Duration(seconds: 6),
        onTimeout: () => throw TimeoutException('Location timeout'),
      );

      double lat = position.latitude;
      double lng = position.longitude;

      // Validate coordinates are in Maldives - if not, use simulated Maldives location
      if (!_isValidMaldivesCoord(lat, lng)) {
        // Simulator returns San Francisco coords - simulate near the ride pickup if active
        if (_currentRide != null) {
          // Simulate driver moving toward pickup location
          final pickupLat = _currentRide!.pickupLat;
          final pickupLng = _currentRide!.pickupLng;
          final jitter = (DateTime.now().second % 10) * 0.0002;
          lat = pickupLat - 0.003 + jitter; // Start slightly away from pickup
          lng = pickupLng - 0.002 + jitter;
          debugPrint('Simulating driver near pickup: lat=$lat, lng=$lng (pickup: $pickupLat, $pickupLng)');
        } else {
          // No active ride - use Male center with jitter
          lat = 4.1755 + (DateTime.now().second * 0.0001);
          lng = 73.5093 + (DateTime.now().second * 0.0001);
          debugPrint('Using simulated Maldives location: lat=$lat, lng=$lng');
        }
      }

      _currentLat = lat;
      _currentLng = lng;

      await SupabaseService.updateLocation(
        _driverId,
        _currentLat,
        _currentLng,
        heading: position.heading,
        speed: position.speed,
      );
    } catch (e) {
      debugPrint('Location update error: $e');
      // On timeout, use last known or simulated location
      if (_currentLat == 0 && _currentLng == 0) {
        _currentLat = 4.1755;
        _currentLng = 73.5093;
      }
      // Still try to update with fallback coordinates
      try {
        await SupabaseService.updateLocation(_driverId, _currentLat, _currentLng);
      } catch (_) {}
    }
  }

  RealtimeChannel? _rideCancellationSubscription;

  void _subscribeToRideRequests() {
    debugPrint('Subscribing to ride requests...');
    _rideSubscription?.unsubscribe();
    _rideSubscription = SupabaseService.subscribeToNewRides((newRide) {
      debugPrint('New ride received: ${newRide['id']}');
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

        // Haptic feedback for new ride
        HapticFeedback.heavyImpact();

        // Voice announcement
        VoiceService().announceNewRide(
          request.pickupLocation,
          request.dropoffLocation,
        );

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

    // Subscribe to driver profile updates (status changes from admin)
    _subscribeToDriverProfile();

    // Subscribe to rides changes for stats refresh
    _subscribeToRidesChanges();

    // Subscribe to vehicle status changes
    _subscribeToVehicleStatus();
  }

  RealtimeChannel? _vehicleStatusSubscription;

  void _subscribeToVehicleStatus() {
    _vehicleStatusSubscription?.unsubscribe();
    _vehicleStatusSubscription = Supabase.instance.client
        .channel('vehicle_status')
        .onPostgresChanges(
          event: PostgresChangeEvent.update,
          schema: 'public',
          table: 'vehicle_types',
          callback: (payload) async {
            debugPrint('Vehicle status update received: ${payload.newRecord}');
            // Check if this is our vehicle and if it was disabled
            final vehicleActive = await SupabaseService.isDriverVehicleActive(_driverId);
            if (!vehicleActive && _isOnline) {
              debugPrint('Vehicle disabled - forcing driver offline');
              _vehicleInactiveReason = 'Your vehicle has been disabled. Please contact admin.';
              _isOnline = false;
              final prefs = await SharedPreferences.getInstance();
              await prefs.setBool('isOnline', false);
              await SupabaseService.updateDriverStatus(driverId: _driverId, isOnline: false);
              notifyListeners();
            }
          },
        )
        .subscribe();
  }

  RealtimeChannel? _ridesStatsSubscription;

  void _subscribeToRidesChanges() {
    if (_driverId.isEmpty) return;

    _ridesStatsSubscription?.unsubscribe();
    _ridesStatsSubscription = Supabase.instance.client
        .channel('rides_stats_$_driverId')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'rides',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'driver_id',
            value: _driverId,
          ),
          callback: (payload) {
            debugPrint('Rides change detected: ${payload.eventType}');
            // Refresh stats when rides are added, updated, or deleted
            refreshStats();
          },
        )
        .subscribe();
  }

  bool _isSuspended = false;
  bool get isSuspended => _isSuspended;

  RealtimeChannel? _profileStatusSubscription;

  void _subscribeToDriverProfile() {
    if (_driverId.isEmpty) return;

    _driverProfileSubscription?.unsubscribe();
    _driverProfileSubscription = Supabase.instance.client
        .channel('driver_profile_$_driverId')
        .onPostgresChanges(
          event: PostgresChangeEvent.update,
          schema: 'public',
          table: 'drivers',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'id',
            value: _driverId,
          ),
          callback: (payload) async {
            debugPrint('Driver profile update received: ${payload.newRecord}');
            final newRecord = payload.newRecord;
            // Update rating if changed
            final newRating = (newRecord['rating'] as num?)?.toDouble();
            if (newRating != null && newRating != _rating) {
              _rating = newRating;
              debugPrint('Driver rating updated to: $_rating');
            }
            // Update total trips if changed - also refresh today's trips
            final newTotalTrips = (newRecord['total_trips'] as num?)?.toInt();
            if (newTotalTrips != null && newTotalTrips != _totalTrips) {
              _totalTrips = newTotalTrips;
              debugPrint('Driver total trips updated to: $_totalTrips');
              // Also refresh today's count since total changed
              refreshStats();
            }
            // Check if vehicle_id changed and refresh vehicle info
            final newVehicleId = newRecord['vehicle_id'] as String?;
            debugPrint('Checking vehicle_id change: $newVehicleId');
            await refreshVehicleInfo();
            notifyListeners();
          },
        )
        .subscribe();

    // Also subscribe to profile status changes (suspension)
    if (_profileId.isNotEmpty) {
      _profileStatusSubscription?.unsubscribe();
      _profileStatusSubscription = Supabase.instance.client
          .channel('profile_status_$_profileId')
          .onPostgresChanges(
            event: PostgresChangeEvent.update,
            schema: 'public',
            table: 'profiles',
            filter: PostgresChangeFilter(
              type: PostgresChangeFilterType.eq,
              column: 'id',
              value: _profileId,
            ),
            callback: (payload) {
              debugPrint('Profile status update received: ${payload.newRecord}');
              final status = payload.newRecord['status'] as String?;
              if (status != null && status != 'approved') {
                debugPrint('Driver suspended! Status: $status');
                _isSuspended = true;
                _isOnline = false;
                notifyListeners();
              } else if (status == 'approved') {
                _isSuspended = false;
                notifyListeners();
              }
            },
          )
          .subscribe();
    }
  }

  Future<void> refreshStats() async {
    if (_driverId.isEmpty) return;
    try {
      // Single RPC call for all stats
      final result = await Supabase.instance.client.rpc('get_driver_stats', params: {
        'p_driver_id': _driverId,
        'p_profile_id': _profileId,
      });

      if (result != null) {
        _totalTrips = (result['total_trips'] as num?)?.toInt() ?? 0;
        _todayTrips = (result['today_trips'] as num?)?.toInt() ?? 0;
        _rating = (result['rating'] as num?)?.toDouble() ?? 0.0;
      }

      debugPrint('Stats refreshed: today=$_todayTrips, total=$_totalTrips, rating=$_rating');
      notifyListeners();
    } catch (e) {
      debugPrint('Error refreshing stats: $e');
    }
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
    if (_currentRide == null) {
      debugPrint('refreshCurrentRide: No current ride');
      return;
    }
    if (_driverId.isEmpty) {
      debugPrint('refreshCurrentRide: No driver ID');
      return;
    }
    try {
      debugPrint('refreshCurrentRide: Fetching for driver $_driverId...');
      final rideData = await SupabaseService.getActiveRideByDriverId(_driverId);
      debugPrint('refreshCurrentRide: DB data dropoff_name=${rideData?['dropoff_name']}');

      if (rideData != null) {
        final updatedRide = _convertSupabaseRideToRequest(rideData);
        if (updatedRide != null) {
          debugPrint('refreshCurrentRide: OLD=${_currentRide!.dropoffLocation}, NEW=${updatedRide.dropoffLocation}');
          _currentRide = updatedRide;
          debugPrint('refreshCurrentRide: Calling notifyListeners()');
          notifyListeners();
        } else {
          debugPrint('refreshCurrentRide: updatedRide is null');
        }
      } else {
        debugPrint('refreshCurrentRide: rideData is null');
      }
    } catch (e) {
      debugPrint('Error refreshing current ride: $e');
    }
  }

  RideRequest? _convertSupabaseRideToRequest(Map<String, dynamic> ride) {
    try {
      final customer = ride['customer'] as Map<String, dynamic>?;
      final statusStr = ride['status'] as String? ?? 'pending';
      final status = statusStr == 'accepted' ? RideStatus.accepted :
                     statusStr == 'arrived' ? RideStatus.arrivedAtPickup :
                     statusStr == 'in_progress' ? RideStatus.inProgress :
                     statusStr == 'completed' ? RideStatus.completed :
                     statusStr == 'cancelled' ? RideStatus.cancelled : RideStatus.pending;

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
        status: status,
        seatsBooked: (ride['seats_booked'] as num?)?.toInt() ?? 1,
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
    _driverProfileSubscription?.unsubscribe();
    _driverProfileSubscription = null;
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

    // Save break state locally
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('isOnBreak', true);
    await prefs.setString('breakType', type);
    await prefs.setString('breakStartTime', _breakStartTime!.toIso8601String());

    // Sync to Supabase (use UTC time)
    if (_driverId.isNotEmpty) {
      await SupabaseService.client
          .from('drivers')
          .update({
            'is_on_break': true,
            'break_type': type,
            'break_start_time': _breakStartTime!.toUtc().toIso8601String(),
          })
          .eq('id', _driverId);

      // Log to break history
      await SupabaseService.client
          .from('break_history')
          .insert({
            'driver_id': _driverId,
            'break_type': type,
            'started_at': _breakStartTime!.toUtc().toIso8601String(),
          });
    }

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

    // Clear break state locally
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('isOnBreak', false);
    await prefs.remove('breakType');
    await prefs.remove('breakStartTime');

    // Sync to Supabase and log break end
    if (_driverId.isNotEmpty) {
      // Get the current break start time before clearing
      final driverData = await SupabaseService.client
          .from('drivers')
          .select('break_start_time')
          .eq('id', _driverId)
          .maybeSingle();

      // Update driver status
      await SupabaseService.client
          .from('drivers')
          .update({
            'is_on_break': false,
            'break_type': null,
            'break_start_time': null,
          })
          .eq('id', _driverId);

      // Update break history with end time and duration
      if (driverData != null && driverData['break_start_time'] != null) {
        final startTime = DateTime.parse(driverData['break_start_time']);
        final endTime = DateTime.now().toUtc();
        final durationMinutes = endTime.difference(startTime).inMinutes;

        await SupabaseService.client
            .from('break_history')
            .update({
              'ended_at': endTime.toIso8601String(),
              'duration_minutes': durationMinutes,
            })
            .eq('driver_id', _driverId)
            .isFilter('ended_at', null)
            .order('created_at', ascending: false)
            .limit(1);
      }
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

  /// Refresh vehicle info from database
  Future<void> refreshVehicleInfo() async {
    if (_driverId.isEmpty) return;
    try {
      final vehicle = await SupabaseService.getDriverVehicle(_driverId);
      if (vehicle != null) {
        _vehicleNumber = vehicle['plate_no'] ?? '';
        _vehicleModel = vehicle['display_name'] ?? '';
      } else {
        _vehicleNumber = '';
        _vehicleModel = '';
      }
      final prefs = await SharedPreferences.getInstance();
      prefs.setString('vehicleNumber', _vehicleNumber);
      prefs.setString('vehicleModel', _vehicleModel);
      notifyListeners();
    } catch (e) {
      debugPrint('Error refreshing vehicle info: $e');
    }
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
        _incomingRequests.removeWhere((r) => r.id == request.id);

        // If driver already has an active ride, queue this one
        if (_currentRide != null) {
          _queuedRequests.add(request.copyWith(status: RideStatus.queued));
          debugPrint('Ride ${request.id} queued - driver has active ride');
        } else {
          _currentRide = request.copyWith(status: RideStatus.accepted);
        }

        // Haptic and voice feedback
        HapticFeedback.mediumImpact();
        VoiceService().announceRideAccepted();

        // Subscribe to chat notifications for this ride
        NotificationService.subscribeToChatMessages(request.id, _driverId);

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

      });
    }
  }

  Future<bool> arrivedAtPickup() async {
    if (_currentRide == null) return false;

    final rideId = _currentRide!.id;

    // Update in Supabase FIRST
    try {
      await SupabaseService.updateRideStatus(rideId, 'arrived');
      debugPrint('arrivedAtPickup: DB updated successfully for $rideId');

      // Only update local state after successful DB update
      _currentRide = _currentRide!.copyWith(status: RideStatus.arrivedAtPickup);

      // Notify customer that driver has arrived
      NotificationService().showCustomerArrivedNotification(
        customerName: _currentRide!.customerName,
        location: _currentRide!.pickupLocation,
      );

      notifyListeners();
      return true;
    } catch (e) {
      debugPrint('arrivedAtPickup ERROR: $e');
      return false;
    }
  }

  Future<bool> startTrip() async {
    if (_currentRide == null) return false;

    final rideId = _currentRide!.id;

    // Update in Supabase FIRST
    try {
      await SupabaseService.updateRideStatus(rideId, 'in_progress');
      debugPrint('startTrip: DB updated successfully for $rideId');

      // Only update local state after successful DB update
      _currentRide = _currentRide!.copyWith(status: RideStatus.inProgress);

      // Haptic and voice feedback
      HapticFeedback.mediumImpact();
      VoiceService().announceTripStarted();

      notifyListeners();
      return true;
    } catch (e) {
      debugPrint('startTrip ERROR: $e');
      return false;
    }
  }

  Future<bool> completeTrip() async {
    if (_currentRide == null) return false;

    final rideId = _currentRide!.id;
    final distance = _currentRide!.estimatedDistance;
    final duration = _currentRide!.estimatedDuration;
    final customerName = _currentRide!.customerName;
    final pickupLocation = _currentRide!.pickupLocation;
    final dropoffLocation = _currentRide!.dropoffLocation;

    // Update in Supabase FIRST
    try {
      await SupabaseService.completeRide(rideId, distanceKm: distance, durationMinutes: duration);
      debugPrint('completeTrip: DB updated successfully for $rideId');

      // Only update local state after successful DB update
      _completedTrips.insert(0, CompletedTrip(
        id: rideId,
        customerName: customerName,
        pickupLocation: pickupLocation,
        dropoffLocation: dropoffLocation,
        tripDate: DateTime.now(),
        durationMinutes: duration,
        distanceKm: distance,
      ));
      _todayTrips++;
      _totalTrips++;
      _todayDistance += distance;

      // Haptic and voice feedback
      HapticFeedback.heavyImpact();
      VoiceService().announceTripCompleted();

      // Show completion notification
      NotificationService().showTripCompletedNotification(
        distance: distance,
        duration: duration,
      );

      // Clear current ride and promote next queued ride
      _currentRide = null;

      // First check local queue
      if (_queuedRequests.isNotEmpty) {
        _currentRide = _queuedRequests.first.copyWith(status: RideStatus.accepted);
        _queuedRequests.removeAt(0);
        debugPrint('Promoted queued ride to current: ${_currentRide?.id}');
      }

      notifyListeners();

      // If no local queue, check database for any active rides
      if (_currentRide == null) {
        await _checkForActiveRide();
      }

      return true;
    } catch (e) {
      debugPrint('completeTrip ERROR: $e');
      return false;
    }
  }

  void cancelTrip() {
    _currentRide = null;
    notifyListeners();
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
  }

  void addToQueue(RideRequest request) {
    _queuedRequests.add(request.copyWith(status: RideStatus.queued));
    _incomingRequests.removeWhere((r) => r.id == request.id);
    notifyListeners();
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
