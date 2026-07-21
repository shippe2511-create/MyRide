import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../utils/image_utils.dart';

class SupabaseService {
  static const String _supabaseUrl = 'https://lwkndyyfmmrzazdvrsnk.supabase.co';
  static const String _supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3a25keXlmbW1yemF6ZHZyc25rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMTM0NzAsImV4cCI6MjA5NTg4OTQ3MH0.hIcx_gway6VJrTYV1MAXAbcapgTfxo4zYOwgmS2uChg';

  static SupabaseClient get client => Supabase.instance.client;

  // Driver ID for phone-based login (not using Supabase Auth)
  static String? _driverId;
  static void setDriverId(String? id) => _driverId = id;
  static String? get driverId => _driverId;

  // Profile ID (for session management - different from driver ID)
  static String? _profileId;
  static void setProfileId(String? id) => _profileId = id;
  static String? get profileId => _profileId;

  static Future<void> initialize() async {
    await Supabase.initialize(
      url: _supabaseUrl,
      // ignore: deprecated_member_use
      anonKey: _supabaseAnonKey,
    );
  }

  // Auth methods - returns driverId first, then falls back to Supabase Auth user
  static User? get currentUser => client.auth.currentUser;
  static String? get visibleUserId => _driverId ?? currentUser?.id;
  static bool get isLoggedIn => visibleUserId != null;

  // Check if phone exists in system
  static Future<Map<String, dynamic>?> checkPhoneExists(String phone) async {
    try {
      // Normalize: strip spaces, +, and country code to get local 7-digit
      String normalizedPhone = phone.replaceAll(RegExp(r'[\s\-\(\)]'), '');
      if (normalizedPhone.startsWith('+960')) {
        normalizedPhone = normalizedPhone.substring(4);
      } else if (normalizedPhone.startsWith('960')) {
        normalizedPhone = normalizedPhone.substring(3);
      }

      debugPrint('checkPhoneExists: input=$phone, normalized=$normalizedPhone');

      // Try with normalized (local) phone first
      var response = await client
          .from('profiles')
          .select()
          .eq('phone', normalizedPhone)
          .maybeSingle();

      // If not found, try with +960 prefix
      if (response == null) {
        response = await client
            .from('profiles')
            .select()
            .eq('phone', '+960$normalizedPhone')
            .maybeSingle();
      }

      // If still not found, try original input
      if (response == null && phone != normalizedPhone) {
        response = await client
            .from('profiles')
            .select()
            .eq('phone', phone)
            .maybeSingle();
      }

      debugPrint('checkPhoneExists: found=${response != null}');
      return response;
    } catch (e) {
      debugPrint('checkPhoneExists error: $e');
      return null;
    }
  }

  // Sign up with phone (for new drivers)
  static Future<Map<String, dynamic>> signUpWithPhone({
    required String phone,
    required String fullName,
    String? email,
    String? gender,
    String? staffId,
    List<Map<String, dynamic>>? emergencyContacts,
    bool isDriver = true,
  }) async {
    // Check if auto-approve is enabled using RPC
    String status = 'pending';
    try {
      final autoApprove = await client.rpc('get_driver_auto_approve');
      debugPrint('Driver auto-approve setting: $autoApprove');
      if (autoApprove == true) {
        status = 'approved';
      }
    } catch (e) {
      debugPrint('Error checking driver auto-approve: $e');
    }

    debugPrint('Registering driver with status: $status');

    final data = <String, dynamic>{
      'phone': phone,
      'full_name': fullName,
      'gender': gender,
      'employee_id': staffId,
      'emergency_contacts': emergencyContacts,
      'role': 'driver',
      'status': status,
    };

    if (email != null && email.isNotEmpty) {
      data['email'] = email;
    }

    // Use upsert to handle existing records
    final response = await client.from('profiles').upsert(
      data,
      onConflict: 'employee_id',
    ).select().single();

    // If auto-approved, also create driver record
    if (status == 'approved' && response['id'] != null) {
      try {
        await client.from('drivers').insert({
          'profile_id': response['id'],
          'rating': 0.0,
          'total_trips': 0,
          'is_online': false,
        });
        debugPrint('Created driver record for auto-approved driver');
      } catch (e) {
        debugPrint('Error creating driver record: $e');
      }
    }

    return response;
  }

  static Future<AuthResponse> signUp({
    required String email,
    required String password,
    required String fullName,
    required String phone,
    String? employeeId,
    String? licenseNumber,
  }) async {
    final response = await client.auth.signUp(
      email: email,
      password: password,
      data: {
        'full_name': fullName,
        'phone': phone,
        'employee_id': employeeId,
        'license_number': licenseNumber,
        'role': 'driver',
      },
    );

    // Ensure profile has pending status for driver approval
    if (response.user != null) {
      await client.from('profiles').update({
        'status': 'pending',
        'role': 'driver',
        'full_name': fullName,
        'phone': phone,
        'employee_id': employeeId,
      }).eq('id', response.user!.id);
    }

    return response;
  }

  static Future<AuthResponse> signIn({
    required String email,
    required String password,
  }) async {
    return await client.auth.signInWithPassword(
      email: email,
      password: password,
    );
  }

  static Future<void> signOut() async {
    // Clear session on sign out
    await clearSession();
    await client.auth.signOut();
  }

  // Session management for single-device login
  static String? _sessionToken;
  static String? get sessionToken => _sessionToken;

  static Future<String> _generateSessionToken() async {
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    final random = DateTime.now().microsecond;
    return 'drv_${timestamp}_$random';
  }

  static Future<String?> _getDeviceId() async {
    return 'driver_app_${DateTime.now().millisecondsSinceEpoch}';
  }

  // Save session token to persistent storage
  static Future<void> _saveSessionToken(String token) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('driver_session_token', token);
  }

  // Load session token from persistent storage
  static Future<void> loadSessionToken() async {
    final prefs = await SharedPreferences.getInstance();
    _sessionToken = prefs.getString('driver_session_token');
    debugPrint('Loaded driver session token: $_sessionToken');
  }

  // Register session after login - invalidates other devices
  static Future<bool> registerSession(String oderId) async {
    try {
      final deviceId = await _getDeviceId();
      _sessionToken = await _generateSessionToken();

      // Use RPC function to bypass RLS
      await client.rpc('register_user_session', params: {
        'p_user_id': oderId,
        'p_device_id': deviceId,
        'p_device_name': 'Driver App',
        'p_app_type': 'driver',
        'p_session_token': _sessionToken,
      });

      // Save token to persistent storage
      await _saveSessionToken(_sessionToken!);

      // Broadcast to kick out other devices instantly
      await client.channel('session_kick_$oderId').sendBroadcastMessage(
        event: 'new_session',
        payload: {'token': _sessionToken, 'app_type': 'driver'},
      );

      debugPrint('Driver session registered: $_sessionToken');
      return true;
    } catch (e) {
      debugPrint('Error registering driver session: $e');
      return false;
    }
  }

  // Check if current session is still valid
  static Future<bool> isSessionValid() async {
    if (_sessionToken == null || _driverId == null) return true; // No session to validate

    try {
      final isValid = await client.rpc('check_session_valid', params: {
        'p_user_id': _driverId,
        'p_app_type': 'driver',
        'p_session_token': _sessionToken,
      });

      if (isValid != true) {
        debugPrint('Driver session invalidated - logged in from another device');
      }
      return isValid == true;
    } catch (e) {
      debugPrint('Error checking driver session: $e');
      return true; // Don't kick user out on network errors
    }
  }

  // Clear session on logout
  static Future<void> clearSession() async {
    if (_driverId == null) return;

    try {
      await client.rpc('clear_user_session', params: {
        'p_user_id': _driverId,
        'p_app_type': 'driver',
      });
    } catch (e) {
      debugPrint('Error clearing driver session: $e');
    }
    _sessionToken = null;
  }

  // Profile methods
  static Future<Map<String, dynamic>?> getProfile() async {
    if (visibleUserId == null) return null;
    final response = await client
        .from('profiles')
        .select()
        .eq('id', visibleUserId!)
        .single();
    return response;
  }

  // Fields that require admin approval before updating
  static const _fieldsRequiringApproval = ['phone', 'employee_id'];

  static Future<Map<String, dynamic>> updateProfile(Map<String, dynamic> data) async {
    if (visibleUserId == null) return {'success': false, 'pending': []};

    // Separate fields that need approval vs instant update
    final Map<String, dynamic> instantUpdate = {};
    final List<String> pendingFields = [];

    // Get current profile to compare
    final currentProfile = await client.from('profiles').select().eq('id', visibleUserId!).single();

    for (final entry in data.entries) {
      if (_fieldsRequiringApproval.contains(entry.key)) {
        final oldValue = currentProfile[entry.key]?.toString();
        final newValue = entry.value?.toString();

        // Only submit if value actually changed
        if (oldValue != newValue && newValue != null && newValue.isNotEmpty) {
          // Submit for approval
          await client.from('pending_profile_changes').insert({
            'user_id': visibleUserId,
            'field_name': entry.key,
            'old_value': oldValue,
            'new_value': newValue,
            'status': 'pending',
          });
          pendingFields.add(entry.key);
        }
      } else {
        // Instant update allowed
        instantUpdate[entry.key] = entry.value;
      }
    }

    // Apply instant updates
    if (instantUpdate.isNotEmpty) {
      await client.from('profiles').update(instantUpdate).eq('id', visibleUserId!);
    }

    return {
      'success': true,
      'pending': pendingFields,
    };
  }

  // Check if user has pending profile changes
  static Future<List<Map<String, dynamic>>> getPendingProfileChanges() async {
    if (visibleUserId == null) return [];

    final response = await client
        .from('pending_profile_changes')
        .select()
        .eq('user_id', visibleUserId!)
        .eq('status', 'pending')
        .order('submitted_at', ascending: false);

    return List<Map<String, dynamic>>.from(response);
  }

  // Driver methods
  static Future<Map<String, dynamic>?> getDriverProfile() async {
    if (visibleUserId == null) return null;
    try {
      final response = await client
          .from('drivers')
          .select('*, profile:profiles(*), vehicle:vehicle_types(*)')
          .eq('profile_id', visibleUserId!)
          .single();
      return response;
    } catch (e) {
      return null;
    }
  }

  // Get driver by profile UUID (for phone-based login)
  static Future<Map<String, dynamic>?> getDriverByProfileId(String profileId) async {
    try {
      final response = await client
          .from('drivers')
          .select('*, profile:profiles(*), vehicle:vehicle_types(*)')
          .eq('profile_id', profileId)
          .maybeSingle();
      return response;
    } catch (e) {
      debugPrint('Error getting driver by profile ID: $e');
      return null;
    }
  }

  static Future<void> createDriverProfile({
    String? licenseNumber,
    DateTime? licenseExpiry,
  }) async {
    if (visibleUserId == null) return;
    await client.from('drivers').insert({
      'profile_id': visibleUserId!,
      'license_number': licenseNumber,
      'license_expiry': licenseExpiry?.toIso8601String(),
    });
  }

  /// Get driver's assigned vehicle info
  static Future<Map<String, dynamic>?> getDriverVehicle(String driverId) async {
    try {
      final driver = await client
          .from('drivers')
          .select('vehicle:vehicle_types(id, plate_no, display_name, name, is_active)')
          .eq('id', driverId)
          .maybeSingle();

      if (driver == null) return null;
      return driver['vehicle'] as Map<String, dynamic>?;
    } catch (e) {
      debugPrint('Error getting driver vehicle: $e');
      return null;
    }
  }

  /// Check if the driver's assigned vehicle is active
  /// Returns false if: no vehicle assigned, vehicle is inactive, or driver not found
  static Future<bool> isDriverVehicleActive(String driverId) async {
    try {
      final driver = await client
          .from('drivers')
          .select('vehicle_id, vehicle:vehicle_types(is_active)')
          .eq('id', driverId)
          .maybeSingle();

      if (driver == null) return false;
      if (driver['vehicle_id'] == null) return false; // No vehicle assigned - block

      final vehicle = driver['vehicle'] as Map<String, dynamic>?;
      if (vehicle == null) return false;

      return vehicle['is_active'] == true;
    } catch (e) {
      debugPrint('Error checking vehicle status: $e');
      return false; // Block on error to be safe
    }
  }

  static Future<void> updateDriverStatus({
    required String driverId,
    bool? isOnline,
    bool? isOnBreak,
    String? breakType,
    double? lat,
    double? lng,
  }) async {
    if (driverId.isEmpty) return;
    final data = <String, dynamic>{};
    if (isOnline != null) data['is_online'] = isOnline;
    if (isOnBreak != null) {
      data['is_on_break'] = isOnBreak;
      if (isOnBreak) {
        data['break_start_time'] = DateTime.now().toIso8601String();
        data['break_type'] = breakType;
      } else {
        data['break_start_time'] = null;
        data['break_type'] = null;
      }
    }
    if (lat != null) data['current_location_lat'] = lat;
    if (lng != null) data['current_location_lng'] = lng;

    await client
        .from('drivers')
        .update(data)
        .eq('id', driverId);

    // Also update driver_locations table for admin panel visibility
    if (isOnline != null) {
      await client
          .from('driver_locations')
          .upsert({
            'driver_id': driverId,
            'is_online': isOnline,
            'last_updated': DateTime.now().toIso8601String(),
          }, onConflict: 'driver_id');
    }
  }

  static Future<void> updateLocation(String driverId, double lat, double lng, {double? heading, double? speed}) async {
    await updateDriverStatus(driverId: driverId, lat: lat, lng: lng);

    // Also update live tracking table directly
    try {
      await client.from('driver_locations').upsert({
        'driver_id': driverId,
        'lat': lat,
        'lng': lng,
        'heading': heading,
        'speed': speed,
        'is_online': true,
        'last_updated': DateTime.now().toIso8601String(),
      }, onConflict: 'driver_id');
      debugPrint('Driver location updated: lat=$lat, lng=$lng');
    } catch (e) {
      debugPrint('Error updating driver location: $e');
    }
  }

  static Future<void> setDriverOnlineStatus(String driverId, bool isOnline) async {
    if (driverId.isEmpty) return;

    // Update drivers table
    await updateDriverStatus(driverId: driverId, isOnline: isOnline);

    // Update live tracking table
    try {
      await client.from('driver_locations')
          .upsert({
            'driver_id': driverId,
            'is_online': isOnline,
            'last_updated': DateTime.now().toIso8601String(),
          }, onConflict: 'driver_id');
    } catch (e) {
      debugPrint('Error updating driver_locations: $e');
    }
  }

  // Vehicle methods
  static Future<void> addVehicle({
    required String vehicleNumber,
    String? vehicleType,
    String? vehicleModel,
    String? vehicleColor,
  }) async {
    final driver = await getDriverProfile();
    if (driver == null) return;

    await client.from('vehicles').insert({
      'driver_id': driver['id'],
      'vehicle_number': vehicleNumber,
      'vehicle_type': vehicleType ?? 'sedan',
      'vehicle_model': vehicleModel,
      'vehicle_color': vehicleColor,
    });
  }

  // Rides methods
  static Future<List<Map<String, dynamic>>> getPendingRides() async {
    // Fetch pending rides: recent immediate rides OR scheduled rides that are due
    final now = DateTime.now().toUtc().toIso8601String();
    final cutoffTime = DateTime.now().toUtc().subtract(const Duration(minutes: 30)).toIso8601String();
    debugPrint('getPendingRides: now=$now, cutoff=$cutoffTime');

    // Get driver's pool memberships and assigned customers
    final currentDriverId = driverId;
    Set<String> driverPools = {'public'}; // Default to public
    Set<String> assignedCustomerIds = {};

    if (currentDriverId != null) {
      // Get driver's pool memberships
      final poolsResponse = await client
          .from('driver_pools')
          .select('pool')
          .eq('driver_id', currentDriverId);
      driverPools = (poolsResponse as List).map((p) => p['pool'] as String).toSet();
      if (driverPools.isEmpty) driverPools = {'public'};

      // Get customers assigned to this driver (for private pool)
      if (driverPools.contains('private')) {
        final assignmentsResponse = await client
            .from('customer_driver_assignments')
            .select('customer_id')
            .eq('driver_id', currentDriverId);
        assignedCustomerIds = (assignmentsResponse as List)
            .map((a) => a['customer_id'] as String)
            .toSet();
      }
    }

    debugPrint('Driver pools: $driverPools, assigned customers: ${assignedCustomerIds.length}');

    // Get immediate rides (no scheduled_time, created recently)
    final immediateRides = await client
        .from('rides')
        .select('*, customer:profiles!customer_id(*)')
        .eq('status', 'pending')
        .isFilter('scheduled_time', null)
        .gte('created_at', cutoffTime)
        .order('created_at', ascending: true);

    // Get scheduled rides that are due (scheduled_time <= now) but not too old (within 10 min window)
    final scheduledCutoff = DateTime.now().toUtc().subtract(const Duration(minutes: 10)).toIso8601String();
    final scheduledRides = await client
        .from('rides')
        .select('*, customer:profiles!customer_id(*)')
        .eq('status', 'pending')
        .not('scheduled_time', 'is', null)
        .lte('scheduled_time', now)
        .gte('scheduled_time', scheduledCutoff) // Only show if scheduled within last 10 min
        .order('scheduled_time', ascending: true);

    debugPrint('Found ${immediateRides.length} immediate + ${scheduledRides.length} scheduled rides');

    // Combine both lists
    final allRides = <Map<String, dynamic>>[
      ...List<Map<String, dynamic>>.from(immediateRides),
      ...List<Map<String, dynamic>>.from(scheduledRides),
    ];

    // Filter rides based on driver's pool access
    final filteredRides = allRides.where((ride) {
      final ridePool = ride['pool'] as String? ?? 'public';
      final customerId = ride['customer_id'] as String?;

      if (ridePool == 'private') {
        // Private rides: only show to drivers in private pool AND assigned to this customer
        return driverPools.contains('private') &&
               customerId != null &&
               assignedCustomerIds.contains(customerId);
      } else {
        // Public rides: show to drivers in public pool
        return driverPools.contains('public');
      }
    }).toList();

    // Sort: private rides first (priority), then by created_at
    filteredRides.sort((a, b) {
      final aPool = a['pool'] as String? ?? 'public';
      final bPool = b['pool'] as String? ?? 'public';

      // Private rides come first
      if (aPool == 'private' && bPool != 'private') return -1;
      if (bPool == 'private' && aPool != 'private') return 1;

      // Within same pool, sort by created_at
      final aTime = DateTime.tryParse(a['created_at'] ?? '') ?? DateTime.now();
      final bTime = DateTime.tryParse(b['created_at'] ?? '') ?? DateTime.now();
      return aTime.compareTo(bTime);
    });

    debugPrint('Filtered to ${filteredRides.length} rides for this driver');
    return filteredRides;
  }

  // Get the current status of a specific ride
  static Future<String?> getRideStatus(String rideId) async {
    try {
      final response = await client
          .from('rides')
          .select('status')
          .eq('id', rideId)
          .maybeSingle();
      return response?['status'] as String?;
    } catch (e) {
      return null;
    }
  }

  static Future<Map<String, dynamic>?> getActiveRide() async {
    if (visibleUserId == null) return null;
    try {
      final driver = await getDriverProfile();
      if (driver == null) return null;

      final response = await client
          .from('rides')
          .select('*, customer:profiles!customer_id(*)')
          .eq('driver_id', driver['id'])
          .inFilter('status', ['accepted', 'arrived', 'in_progress'])
          .order('created_at', ascending: false)
          .limit(1)
          .maybeSingle();
      return response;
    } catch (e) {
      return null;
    }
  }

  // Get active ride by driver ID (for phone-based login)
  static Future<Map<String, dynamic>?> getActiveRideByDriverId(String driverId) async {
    debugPrint('getActiveRideByDriverId called with driverId: $driverId');
    try {
      final response = await client
          .from('rides')
          .select('*, customer:profiles!customer_id(*)')
          .eq('driver_id', driverId)
          .inFilter('status', ['accepted', 'arrived', 'in_progress'])
          .order('created_at', ascending: true)  // FIFO: oldest first
          .limit(1)
          .maybeSingle();
      debugPrint('getActiveRideByDriverId result for $driverId: ${response != null ? 'FOUND ride ${response['id']}' : 'NO RIDE FOUND'}');
      return response;
    } catch (e) {
      debugPrint('getActiveRideByDriverId ERROR: $e');
      return null;
    }
  }

  // Accept ride using atomic RPC function (prevents race conditions)
  static Future<Map<String, dynamic>> acceptRide(String rideId, {required String driverId}) async {
    try {
      debugPrint('Accepting ride $rideId with driver $driverId');

      // Use atomic RPC function
      final result = await client.rpc('accept_ride', params: {
        'p_ride_id': rideId,
        'p_driver_id': driverId,
      });

      debugPrint('Accept ride result: $result');

      if (result is Map && result['success'] == true) {
        return {
          'success': true,
          'driver_name': result['driver_name'],
          'driver_phone': result['driver_phone'],
        };
      } else {
        return {
          'success': false,
          'error': result?['error'] ?? 'Ride already taken',
        };
      }
    } catch (e) {
      debugPrint('Error accepting ride: $e');
      return {
        'success': false,
        'error': e.toString(),
      };
    }
  }

  // Decline/skip a ride (doesn't change status, just removes from driver's view)
  static Future<void> declineRide(String rideId) async {
    // For now, just log - the ride stays pending for other drivers
    debugPrint('Driver declined ride: $rideId');
  }

  static Future<void> updateRideStatus(String rideId, String status, {String? cancelReason}) async {
    final driverId = _driverId;
    if (driverId == null || driverId.isEmpty) {
      throw Exception('Driver not logged in');
    }

    debugPrint('updateRideStatus: rideId=$rideId, status=$status, driverId=$driverId');

    final result = await client.rpc('update_ride_status', params: {
      'p_ride_id': rideId,
      'p_caller_id': driverId,
      'p_caller_type': 'driver',
      'p_new_status': status,
      'p_cancel_reason': cancelReason,
    });

    debugPrint('updateRideStatus RPC result: $result');

    if (result != null && result['success'] == false) {
      throw Exception(result['error'] ?? 'Failed to update ride status');
    }
  }

  static Future<void> completeRide(String rideId, {double? distanceKm, int? durationMinutes}) async {
    final driverId = _driverId;
    if (driverId == null || driverId.isEmpty) {
      throw Exception('Driver not logged in');
    }

    debugPrint('completeRide: rideId=$rideId, driverId=$driverId');

    final result = await client.rpc('update_ride_status', params: {
      'p_ride_id': rideId,
      'p_caller_id': driverId,
      'p_caller_type': 'driver',
      'p_new_status': 'completed',
      'p_distance_km': distanceKm,
      'p_duration_minutes': durationMinutes,
    });

    debugPrint('completeRide RPC result: $result');

    if (result != null && result['success'] == false) {
      throw Exception(result['error'] ?? 'Failed to complete ride');
    }
  }

  static Future<List<Map<String, dynamic>>> getCompletedRides({String? driverId}) async {
    String? driverIdToUse = driverId;

    if (driverIdToUse == null) {
      final driver = await getDriverProfile();
      debugPrint('getCompletedRides: driver = $driver');
      if (driver == null) return [];
      driverIdToUse = driver['id'];
    }

    debugPrint('getCompletedRides: querying for driver_id = $driverIdToUse');
    final response = await client
        .from('rides')
        .select('*, customer:profiles!customer_id(*), rating:ratings(*)')
        .eq('driver_id', driverIdToUse!)
        .inFilter('status', ['completed', 'cancelled', 'rejected'])
        .order('created_at', ascending: false)
        .limit(50);
    debugPrint('getCompletedRides: got ${response.length} rides');
    return List<Map<String, dynamic>>.from(response);
  }

  // Shifts methods
  static Future<List<Map<String, dynamic>>> getMyShifts({DateTime? fromDate, DateTime? toDate}) async {
    final driver = await getDriverProfile();
    if (driver == null) return [];

    var query = client
        .from('shifts')
        .select()
        .eq('driver_id', driver['id']);

    if (fromDate != null) {
      query = query.gte('shift_date', fromDate.toIso8601String().split('T')[0]);
    }
    if (toDate != null) {
      query = query.lte('shift_date', toDate.toIso8601String().split('T')[0]);
    }

    final response = await query.order('shift_date').order('start_time');
    return List<Map<String, dynamic>>.from(response);
  }

  static Future<List<Map<String, dynamic>>> getDriverShifts(String driverId, DateTime fromDate, DateTime toDate) async {
    try {
      final response = await client
          .from('shifts')
          .select()
          .eq('driver_id', driverId)
          .gte('shift_date', fromDate.toIso8601String().split('T')[0])
          .lte('shift_date', toDate.toIso8601String().split('T')[0])
          .order('shift_date')
          .order('start_time');
      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      debugPrint('Error getting driver shifts: $e');
      return [];
    }
  }

  // Documents methods
  static Future<List<Map<String, dynamic>>> getMyDocuments({String? driverId}) async {
    final id = driverId ?? _driverId;
    debugPrint('getMyDocuments called with driverId param: $driverId, _driverId: $_driverId, using: $id');
    if (id == null || id.isEmpty) {
      debugPrint('getMyDocuments: id is null or empty, returning []');
      return [];
    }

    // Use RPC to bypass RLS (phone login doesn't set auth.uid())
    final response = await client.rpc('get_driver_documents', params: {
      'p_driver_id': id,
    });
    debugPrint('getMyDocuments response: $response');
    return List<Map<String, dynamic>>.from(response);
  }

  static Future<List<Map<String, dynamic>>> getDocumentTypes() async {
    final response = await client.rpc('get_document_types');
    return List<Map<String, dynamic>>.from(response);
  }

  static Future<void> uploadDocument({
    required String documentType,
    required String fileUrl,
    required String driverId,
    DateTime? expiryDate,
  }) async {
    if (driverId.isEmpty) return;

    // Use RPC function to bypass RLS (phone-login doesn't set auth.uid())
    final result = await client.rpc('upsert_driver_document', params: {
      'p_driver_id': driverId,
      'p_document_type': documentType,
      'p_file_url': fileUrl,
      'p_expiry_date': expiryDate?.toIso8601String(),
    });

    if (result is Map && result['error'] != null) {
      throw Exception(result['error']);
    }
  }

  static Future<bool> deleteDocument({
    required String documentId,
    required String driverId,
  }) async {
    if (driverId.isEmpty || documentId.isEmpty) return false;
    try {
      final result = await client.rpc('delete_driver_document', params: {
        'p_driver_id': driverId,
        'p_document_id': documentId,
      });
      debugPrint('Delete document result: $result');
      if (result is Map && result['success'] == true) {
        return true;
      }
      return false;
    } catch (e) {
      debugPrint('Error deleting document: $e');
      return false;
    }
  }

  // Notifications methods
  static Future<List<Map<String, dynamic>>> getNotifications() async {
    if (visibleUserId == null) return [];
    final response = await client
        .from('notifications')
        .select()
        .eq('user_id', visibleUserId!)
        .order('created_at', ascending: false)
        .limit(50);
    return List<Map<String, dynamic>>.from(response);
  }

  static Future<void> markNotificationRead(String notificationId) async {
    await client
        .from('notifications')
        .update({'is_read': true})
        .eq('id', notificationId);
  }

  static Future<void> sendCustomerNotification({
    required String customerId,
    required String title,
    required String message,
    String? rideId,
    String type = 'ride_update',
  }) async {
    try {
      await client.from('notifications').insert({
        'user_id': customerId,
        'title': title,
        'message': message,
        'type': type,
        'ride_id': rideId,
        'is_read': false,
        'created_at': DateTime.now().toIso8601String(),
      });
    } catch (e) {
      debugPrint('Failed to send notification: $e');
    }
  }

  static Future<void> notifyCustomerDriverArrived({
    required String rideId,
    required String customerId,
    required String driverName,
    required String location,
  }) async {
    await sendCustomerNotification(
      customerId: customerId,
      title: 'Driver Arrived',
      message: '$driverName has arrived at $location. Please come out.',
      rideId: rideId,
      type: 'driver_arrived',
    );
  }

  // Ratings methods
  static Future<Map<String, dynamic>> getDriverRatingsMap() async {
    final driver = await getDriverProfile();
    if (driver == null) return {'average': 0.0, 'total': 0, 'ratings': []};

    final response = await client
        .from('ratings')
        .select('*, ride:rides!inner(*)')
        .eq('to_user_id', visibleUserId!)
        .order('created_at', ascending: false)
        .limit(20);

    final ratings = List<Map<String, dynamic>>.from(response);
    final total = ratings.length;
    final average = total > 0
        ? ratings.map((r) => r['rating'] as int).reduce((a, b) => a + b) / total
        : 5.0;

    return {
      'average': average,
      'total': total,
      'ratings': ratings,
    };
  }

  static Future<List<Map<String, dynamic>>> getDriverRatings(String profileId) async {
    final response = await client
        .from('ratings')
        .select('*, from_user:profiles!ratings_from_user_id_fkey(full_name)')
        .eq('to_user_id', profileId)
        .order('created_at', ascending: false)
        .limit(100);
    return List<Map<String, dynamic>>.from(response);
  }

  static Future<Map<String, dynamic>> getCustomerStatsForDriver(String customerId, String driverId) async {
    try {
      // Get customer's average rating
      final ratingsRes = await client
          .from('ratings')
          .select('rating')
          .eq('to_user_id', customerId);

      double? avgRating;
      if (ratingsRes.isNotEmpty) {
        final ratings = ratingsRes.map((r) => (r['rating'] as num).toDouble()).toList();
        avgRating = ratings.reduce((a, b) => a + b) / ratings.length;
      }

      // Count trips together
      final tripsRes = await client
          .from('rides')
          .select('id')
          .eq('customer_id', customerId)
          .eq('driver_id', driverId)
          .eq('status', 'completed');

      return {
        'rating': avgRating,
        'tripsTogether': tripsRes.length,
      };
    } catch (e) {
      debugPrint('Error getting customer stats: $e');
      return {'rating': null, 'tripsTogether': 0};
    }
  }

  // Vehicle Checklist methods
  static Future<void> saveVehicleChecklist({
    required String driverId,
    required String driverName,
    required String vehicleNumber,
    required bool hasIssues,
    required Map<String, String> issues,
    required Map<String, bool> allItems,
    Map<String, List<File>>? issuePhotos,
  }) async {
    debugPrint('Saving checklist for driver: $driverId, name: $driverName, vehicle: $vehicleNumber');

    // Upload photos and build issues with photo URLs
    final issuesWithPhotos = <String, Map<String, dynamic>>{};

    for (final entry in issues.entries) {
      final photoUrls = <String>[];

      // Upload photos for this issue if any
      if (issuePhotos != null && issuePhotos.containsKey(entry.key)) {
        final photos = issuePhotos[entry.key]!;
        for (int i = 0; i < photos.length; i++) {
          final file = photos[i];
          final fileName = '${driverId}_${entry.key}_${DateTime.now().millisecondsSinceEpoch}_$i.jpg';
          final path = 'checklist-photos/$fileName';

          try {
            await client.storage.from('documents').upload(path, file);
            final url = client.storage.from('documents').getPublicUrl(path);
            photoUrls.add(url);
          } catch (e) {
            debugPrint('Failed to upload checklist photo: $e');
          }
        }
      }

      issuesWithPhotos[entry.key] = {
        'note': entry.value,
        'photos': photoUrls,
      };
    }

    final data = {
      'driver_id': driverId,
      'driver_name': driverName,
      'vehicle_number': vehicleNumber,
      'has_issues': hasIssues,
      'issues': issuesWithPhotos.isEmpty ? {} : issuesWithPhotos,
      'all_items': allItems,
      'checked_at': DateTime.now().toUtc().toIso8601String(),
    };

    debugPrint('Inserting checklist: $data');

    final response = await client.from('vehicle_checklists').insert(data).select();
    debugPrint('Checklist saved: $response');
  }

  // Real-time subscriptions
  static RealtimeChannel subscribeToNewRides(
    void Function(Map<String, dynamic>) onNewRide,
  ) {
    return client
        .channel('new_rides')
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'rides',
          callback: (payload) async {
            // Only notify for pending rides
            final status = payload.newRecord['status'];
            if (status == 'pending') {
              // Fetch full ride data with customer info
              final rideId = payload.newRecord['id'];
              try {
                final fullRide = await client
                    .from('rides')
                    .select('*, customer:profiles!customer_id(*)')
                    .eq('id', rideId)
                    .single();
                onNewRide(fullRide);
              } catch (e) {
                // Fallback to basic data
                onNewRide(payload.newRecord);
              }
            }
          },
        )
        .subscribe();
  }

  // Subscribe to ride cancellations/status changes
  static RealtimeChannel subscribeToRideCancellations(
    void Function(Map<String, dynamic>) onUpdate,
  ) {
    return client
        .channel('ride_cancellations')
        .onPostgresChanges(
          event: PostgresChangeEvent.update,
          schema: 'public',
          table: 'rides',
          callback: (payload) {
            onUpdate(payload.newRecord);
          },
        )
        .subscribe();
  }

  static RealtimeChannel subscribeToRideUpdates(
    String rideId,
    void Function(Map<String, dynamic>) onUpdate,
  ) {
    return client
        .channel('ride_$rideId')
        .onPostgresChanges(
          event: PostgresChangeEvent.update,
          schema: 'public',
          table: 'rides',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'id',
            value: rideId,
          ),
          callback: (payload) {
            onUpdate(payload.newRecord);
          },
        )
        .subscribe();
  }

  // Chat methods
  static Future<List<Map<String, dynamic>>> getChatMessages(String rideId) async {
    final response = await client
        .from('chat_messages')
        .select()
        .eq('ride_id', rideId)
        .order('created_at', ascending: true);
    return List<Map<String, dynamic>>.from(response);
  }

  // Store active chat channel for broadcasting
  static RealtimeChannel? _activeChatChannel;

  static Future<void> sendChatMessage({
    required String rideId,
    required String message,
    required String senderType,
    String? senderId,
  }) async {
    final id = senderId ?? visibleUserId;
    if (id == null) {
      debugPrint('Error sending message: no sender ID available');
      throw Exception('No sender ID available');
    }
    try {
      // Get customer_id for receiver_id
      final ride = await client
          .from('rides')
          .select('customer_id')
          .eq('id', rideId)
          .maybeSingle();

      final customerId = ride?['customer_id'];

      final result = await client.from('chat_messages').insert({
        'ride_id': rideId,
        'sender_id': id,
        'receiver_id': customerId,
        'sender_type': senderType,
        'message': message,
        'created_at': DateTime.now().toIso8601String(),
      }).select().single();

      // Always broadcast the message for other devices to receive
      try {
        final broadcastChannel = client.channel('chat_broadcast_$rideId');
        await broadcastChannel.subscribe();
        await broadcastChannel.sendBroadcastMessage(
          event: 'new_message',
          payload: result,
        );
        debugPrint('SupabaseService: Broadcasted chat message for ride $rideId');
      } catch (e) {
        debugPrint('SupabaseService: Error broadcasting: $e');
      }

      // Queue push notification for customer
      if (customerId != null) {
        try {
          await client.from('push_notification_queue').insert({
            'user_id': customerId,
            'title': 'New message from Driver',
            'body': message.length > 100 ? '${message.substring(0, 100)}...' : message,
            'data': {'type': 'chat', 'ride_id': rideId},
            'ride_id': rideId,
            'status': 'pending',
          });
        } catch (e) {
          debugPrint('Error queueing chat notification: $e');
        }
      }
    } catch (e) {
      debugPrint('Error sending chat message: $e');
      rethrow;
    }
  }

  static Future<void> markMessagesAsRead(String rideId, {String? userId}) async {
    final id = userId ?? visibleUserId;
    if (id == null) return;
    try {
      await client
          .from('chat_messages')
          .update({'is_read': true})
          .eq('ride_id', rideId)
          .neq('sender_id', id);
    } catch (e) {
      debugPrint('Error marking messages as read: $e');
    }
  }

  static RealtimeChannel subscribeToChatMessages(
    String rideId,
    void Function(Map<String, dynamic>) onNewMessage,
  ) {
    debugPrint('SupabaseService: Creating chat broadcast subscription for ride $rideId');
    _activeChatChannel = client
        .channel('chat_broadcast_$rideId')
        .onBroadcast(
          event: 'new_message',
          callback: (payload) {
            debugPrint('SupabaseService: Chat message received via broadcast: $payload');
            onNewMessage(payload);
          },
        )
        .subscribe((status, error) {
          debugPrint('SupabaseService: Chat broadcast subscription status=$status, error=$error');
        });
    return _activeChatChannel!;
  }

  static void clearChatChannel() {
    _activeChatChannel = null;
  }

  // Check for destination change status (driver polls this)
  static Future<Map<String, dynamic>?> getPendingDestinationChange(String rideId) async {
    try {
      final response = await client
          .from('rides')
          .select('dropoff_name, pending_dropoff_name, pending_dropoff_lat, pending_dropoff_lng, destination_change_status')
          .eq('id', rideId)
          .maybeSingle();
      return response;
    } catch (e) {
      return null;
    }
  }

  // Approve destination change (driver)
  static Future<bool> approveDestinationChange(String rideId) async {
    debugPrint('approveDestinationChange called for ride: $rideId');
    try {
      // Get pending destination
      final pending = await client
          .from('rides')
          .select('pending_dropoff_name, pending_dropoff_lat, pending_dropoff_lng')
          .eq('id', rideId)
          .maybeSingle();

      debugPrint('approveDestinationChange pending data: $pending');

      if (pending == null || pending['pending_dropoff_name'] == null) {
        debugPrint('approveDestinationChange: No pending destination name found');
        return false;
      }

      final newDropoffName = pending['pending_dropoff_name'] as String;
      final newDropoffLat = pending['pending_dropoff_lat'];
      final newDropoffLng = pending['pending_dropoff_lng'];

      debugPrint('approveDestinationChange: Updating to $newDropoffName');

      // Update actual destination and clear pending
      await client.from('rides').update({
        'dropoff_name': newDropoffName,
        'dropoff_lat': newDropoffLat,
        'dropoff_lng': newDropoffLng,
        'destination_change_status': 'approved',
        'pending_dropoff_name': null,
        'pending_dropoff_lat': null,
        'pending_dropoff_lng': null,
      }).eq('id', rideId);

      debugPrint('approveDestinationChange: SUCCESS - updated to $newDropoffName');
      return true;
    } catch (e) {
      debugPrint('Error approving destination change: $e');
      return false;
    }
  }

  // Reject destination change (driver)
  static Future<bool> rejectDestinationChange(String rideId) async {
    try {
      await client.from('rides').update({
        'destination_change_status': 'rejected',
        'pending_dropoff_name': null,
        'pending_dropoff_lat': null,
        'pending_dropoff_lng': null,
      }).eq('id', rideId);
      return true;
    } catch (e) {
      debugPrint('Error rejecting destination change: $e');
      return false;
    }
  }

  // Document Storage - upload file to Supabase Storage
  static Future<String?> uploadDocumentFile({
    required String filePath,
    required String documentType,
    required String driverId,
  }) async {
    try {
      if (driverId.isEmpty) {
        debugPrint('Error: driverId is empty');
        return null;
      }

      // Compress document image before upload
      final compressed = await ImageUtils.compressImage(
        filePath,
        type: ImageType.document,
      );
      final file = compressed ?? File(filePath);

      final fileName = '$driverId/${documentType}_${DateTime.now().millisecondsSinceEpoch}.jpg';

      await client.storage.from('documents').upload(
        fileName,
        file,
        fileOptions: const FileOptions(upsert: true),
      );

      // Get public URL for the document
      final publicUrl = client.storage.from('documents').getPublicUrl(fileName);
      debugPrint('Document uploaded: $publicUrl');
      return publicUrl;
    } catch (e) {
      debugPrint('Error uploading document: $e');
      return null;
    }
  }

  // Avatar/Profile Photo Storage
  static Future<String?> uploadAvatar(String filePath, String userId) async {
    try {
      // Compress avatar before upload (400x400, 80% quality)
      final compressed = await ImageUtils.compressImage(
        filePath,
        type: ImageType.avatar,
      );
      final file = compressed ?? File(filePath);
      final fileName = 'driver_avatar_$userId.jpg';

      await client.storage.from('avatars').upload(
        fileName,
        file,
        fileOptions: const FileOptions(upsert: true),
      );

      final url = client.storage.from('avatars').getPublicUrl(fileName);
      debugPrint('Avatar uploaded: $url');
      return url;
    } catch (e) {
      debugPrint('Error uploading avatar: $e');
      return null;
    }
  }

  static Future<bool> updateDriverAvatarUrl(String driverId, String avatarUrl) async {
    try {
      await client.from('drivers').update({
        'avatar_url': avatarUrl,
      }).eq('id', driverId);
      return true;
    } catch (e) {
      debugPrint('Error updating driver avatar: $e');
      return false;
    }
  }

  static Future<String?> getDriverAvatarUrl(String driverId) async {
    try {
      final response = await client
          .from('drivers')
          .select('avatar_url')
          .eq('id', driverId)
          .maybeSingle();
      return response?['avatar_url'] as String?;
    } catch (e) {
      return null;
    }
  }

  // Driver Stats
  static Future<Map<String, dynamic>> getDriverStats(String driverId, String period) async {
    try {
      DateTime startDate;
      final now = DateTime.now();

      switch (period) {
        case 'today':
          startDate = DateTime(now.year, now.month, now.day);
          break;
        case 'week':
          startDate = now.subtract(Duration(days: now.weekday - 1));
          startDate = DateTime(startDate.year, startDate.month, startDate.day);
          break;
        case 'month':
          startDate = DateTime(now.year, now.month, 1);
          break;
        default:
          startDate = DateTime(now.year, now.month, now.day);
      }

      final response = await client
          .from('rides')
          .select('id, status, distance_km, duration_minutes, created_at')
          .eq('driver_id', driverId)
          .gte('created_at', startDate.toIso8601String())
          .inFilter('status', ['completed', 'cancelled']);

      final rides = List<Map<String, dynamic>>.from(response);
      final completedRides = rides.where((r) => r['status'] == 'completed').toList();
      final cancelledRides = rides.where((r) => r['status'] == 'cancelled').toList();

      double totalDistance = 0;
      int totalDuration = 0;

      for (final ride in completedRides) {
        totalDistance += (ride['distance_km'] ?? 0).toDouble();
        totalDuration += (ride['duration_minutes'] ?? 0) as int;
      }

      // Get average rating
      final ratingsResponse = await client
          .from('ratings')
          .select('rating')
          .eq('to_user_id', driverId)
          .gte('created_at', startDate.toIso8601String());

      final ratings = List<Map<String, dynamic>>.from(ratingsResponse);
      double avgRating = 5.0;
      if (ratings.isNotEmpty) {
        final sum = ratings.fold<int>(0, (s, r) => s + (r['rating'] as int));
        avgRating = sum / ratings.length;
      }

      final completionRate = rides.isNotEmpty
          ? ((completedRides.length / rides.length) * 100).round()
          : 100;

      return {
        'total_rides': completedRides.length,
        'total_distance': totalDistance,
        'total_duration': totalDuration,
        'avg_rating': avgRating,
        'completion_rate': completionRate,
        'cancelled_rides': cancelledRides.length,
      };
    } catch (e) {
      debugPrint('Error getting driver earnings: $e');
      return {
        'total_rides': 0,
        'total_distance': 0.0,
        'total_duration': 0,
        'avg_rating': 5.0,
        'completion_rate': 100,
      };
    }
  }

  static Future<List<Map<String, dynamic>>> getCompletedRidesForDriver(String driverId, String period) async {
    try {
      DateTime startDate;
      final now = DateTime.now();

      switch (period) {
        case 'today':
          startDate = DateTime(now.year, now.month, now.day);
          break;
        case 'week':
          startDate = now.subtract(Duration(days: now.weekday - 1));
          startDate = DateTime(startDate.year, startDate.month, startDate.day);
          break;
        case 'month':
          startDate = DateTime(now.year, now.month, 1);
          break;
        default:
          startDate = DateTime(now.year, now.month, now.day);
      }

      final response = await client
          .from('rides')
          .select('*, customer:profiles!customer_id(*)')
          .eq('driver_id', driverId)
          .eq('status', 'completed')
          .gte('created_at', startDate.toIso8601String())
          .order('created_at', ascending: false)
          .limit(20);

      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      debugPrint('Error getting completed rides: $e');
      return [];
    }
  }

  // Register FCM token for push notifications
  static Future<void> registerFcmToken(String token, {String? userId}) async {
    final finalUserId = userId ?? currentUser?.id;
    if (finalUserId == null) return;

    try {
      await client.from('push_tokens').upsert({
        'user_id': finalUserId,
        'token': token,
        'platform': 'android',
        'updated_at': DateTime.now().toIso8601String(),
      }, onConflict: 'user_id');
    } catch (e) {
      debugPrint('Error registering FCM token: $e');
    }
  }

  // Send push notification to customer
  static Future<void> sendPushToCustomer({
    required String customerId,
    required String title,
    required String body,
    String? rideId,
  }) async {
    try {
      await client.from('push_notification_queue').insert({
        'user_id': customerId,
        'title': title,
        'body': body,
        'data': rideId != null ? {'ride_id': rideId} : null,
        'status': 'pending',
        'created_at': DateTime.now().toIso8601String(),
      });
    } catch (e) {
      debugPrint('Error sending push notification: $e');
    }
  }

  // Driver Notifications
  static Future<List<Map<String, dynamic>>> getDriverNotifications(String driverId) async {
    try {
      final response = await client
          .from('notifications')
          .select()
          .eq('user_id', driverId)
          .order('created_at', ascending: false)
          .limit(50);
      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      debugPrint('Error getting driver notifications: $e');
      return [];
    }
  }

  static Future<void> markNotificationAsRead(String notificationId) async {
    try {
      await client.from('notifications').update({'is_read': true}).eq('id', notificationId);
    } catch (e) {
      debugPrint('Error marking notification as read: $e');
    }
  }

  static Future<void> markAllNotificationsAsRead(String driverId) async {
    try {
      await client.from('notifications').update({'is_read': true}).eq('user_id', driverId);
    } catch (e) {
      debugPrint('Error marking all notifications as read: $e');
    }
  }

  static Future<void> deleteNotification(String notificationId) async {
    try {
      await client.from('notifications').delete().eq('id', notificationId);
    } catch (e) {
      debugPrint('Error deleting notification: $e');
    }
  }

  // Emergency Contacts (global, managed by admin)
  static Future<List<Map<String, dynamic>>> getEmergencyContacts() async {
    try {
      final response = await client
          .from('emergency_contacts')
          .select()
          .eq('is_active', true)
          .order('sort_order');
      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      debugPrint('Error getting emergency contacts: $e');
      return [];
    }
  }

  // SOS Alert
  static Future<bool> triggerSOSAlert({
    required String userId,
    String? driverId,
    String? rideId,
    double? latitude,
    double? longitude,
    String? locationAddress,
  }) async {
    try {
      await client.from('sos_alerts').insert({
        'user_id': userId,
        'ride_id': rideId,
        'driver_id': driverId,
        'latitude': latitude,
        'longitude': longitude,
        'location_address': locationAddress,
        'status': 'active',
        'created_at': DateTime.now().toIso8601String(),
      });
      debugPrint('SOS alert inserted successfully for user: $userId');
      return true;
    } catch (e) {
      debugPrint('Error triggering SOS alert: $e');
      return false;
    }
  }

  // Vehicle Logs (Fuel & Maintenance)
  static Future<List<Map<String, dynamic>>> getVehicleLogs({String? logType, int limit = 50}) async {
    final id = _driverId;
    if (id == null || id.isEmpty) return [];

    try {
      dynamic response;
      if (logType != null && logType.isNotEmpty) {
        response = await client
            .from('vehicle_logs')
            .select()
            .eq('driver_id', id)
            .eq('log_type', logType)
            .order('log_date', ascending: false)
            .limit(limit);
      } else {
        response = await client
            .from('vehicle_logs')
            .select()
            .eq('driver_id', id)
            .order('log_date', ascending: false)
            .limit(limit);
      }
      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      debugPrint('Error getting vehicle logs: $e');
      return [];
    }
  }

  static Future<Map<String, dynamic>?> addVehicleLog({
    required String logType,
    double? amount,
    int? odometer,
    String? notes,
    DateTime? logDate,
  }) async {
    final id = _driverId;
    if (id == null || id.isEmpty) return null;

    try {
      final response = await client.from('vehicle_logs').insert({
        'driver_id': id,
        'log_type': logType,
        'amount': amount,
        'odometer': odometer,
        'notes': notes,
        'log_date': (logDate ?? DateTime.now()).toIso8601String().split('T')[0],
      }).select().single();
      return response;
    } catch (e) {
      debugPrint('Error adding vehicle log: $e');
      return null;
    }
  }

  static Future<bool> deleteVehicleLog(String logId) async {
    try {
      await client.from('vehicle_logs').delete().eq('id', logId);
      return true;
    } catch (e) {
      debugPrint('Error deleting vehicle log: $e');
      return false;
    }
  }

  static Future<Map<String, dynamic>> getVehicleLogStats() async {
    final id = _driverId;
    if (id == null || id.isEmpty) return {};

    try {
      final now = DateTime.now();
      final monthStart = DateTime(now.year, now.month, 1);

      final response = await client
          .from('vehicle_logs')
          .select('log_type, amount')
          .eq('driver_id', id)
          .gte('log_date', monthStart.toIso8601String().split('T')[0]);

      final logs = List<Map<String, dynamic>>.from(response);

      double fuelTotal = 0;
      double maintenanceTotal = 0;
      double repairTotal = 0;
      double cleaningTotal = 0;
      int fuelCount = 0;
      int maintenanceCount = 0;
      int repairCount = 0;
      int cleaningCount = 0;

      for (final log in logs) {
        final amount = (log['amount'] ?? 0).toDouble();
        switch (log['log_type']) {
          case 'fuel':
            fuelTotal += amount;
            fuelCount++;
            break;
          case 'maintenance':
            maintenanceTotal += amount;
            maintenanceCount++;
            break;
          case 'repair':
            repairTotal += amount;
            repairCount++;
            break;
          case 'cleaning':
            cleaningTotal += amount;
            cleaningCount++;
            break;
        }
      }

      return {
        'fuel_total': fuelTotal,
        'fuel_count': fuelCount,
        'maintenance_total': maintenanceTotal,
        'maintenance_count': maintenanceCount,
        'repair_total': repairTotal,
        'repair_count': repairCount,
        'cleaning_total': cleaningTotal,
        'cleaning_count': cleaningCount,
        'total': fuelTotal + maintenanceTotal + repairTotal + cleaningTotal,
      };
    } catch (e) {
      debugPrint('Error getting vehicle log stats: $e');
      return {};
    }
  }

  // =====================================================
  // POOL TRIP METHODS
  // =====================================================

  /// Start a new pool trip
  static Future<Map<String, dynamic>> startPoolTrip(String vehicleId, String driverId) async {
    try {
      final result = await client.rpc('start_pooled_trip', params: {
        'p_vehicle_id': vehicleId,
        'p_driver_id': driverId,
      });
      return Map<String, dynamic>.from(result);
    } catch (e) {
      debugPrint('Error starting pool trip: $e');
      return {'success': false, 'error': e.toString()};
    }
  }

  /// Get active pool trip for driver
  static Future<Map<String, dynamic>?> getActivePoolTrip(String driverId) async {
    try {
      final result = await client
          .from('pooled_trips')
          .select('''
            *,
            vehicle:vehicles!pooled_trips_vehicle_id_fkey(vehicle_number, vehicle_model, capacity)
          ''')
          .eq('driver_id', driverId)
          .eq('status', 'active')
          .maybeSingle();

      return result;
    } catch (e) {
      debugPrint('Error getting active pool trip: $e');
      return null;
    }
  }

  /// Get trip stops
  static Future<List<Map<String, dynamic>>> getPoolTripStops(String tripId) async {
    try {
      final result = await client.rpc('get_trip_stops', params: {
        'p_trip_id': tripId,
      });
      return List<Map<String, dynamic>>.from(result);
    } catch (e) {
      debugPrint('Error getting trip stops: $e');
      return [];
    }
  }

  /// Complete a stop
  static Future<Map<String, dynamic>> completePoolStop(String stopId) async {
    try {
      final result = await client.rpc('complete_pool_stop', params: {
        'p_stop_id': stopId,
      });
      return Map<String, dynamic>.from(result);
    } catch (e) {
      debugPrint('Error completing stop: $e');
      return {'success': false, 'error': e.toString()};
    }
  }

  /// End pool trip
  static Future<bool> endPoolTrip(String tripId) async {
    try {
      await client
          .from('pooled_trips')
          .update({
            'status': 'completed',
            'completed_at': DateTime.now().toUtc().toIso8601String(),
          })
          .eq('id', tripId);
      return true;
    } catch (e) {
      debugPrint('Error ending pool trip: $e');
      return false;
    }
  }

  /// Subscribe to pool trip updates
  static RealtimeChannel subscribeToPoolTrip(String tripId, Function(Map<String, dynamic>) onUpdate) {
    return client
        .channel('pool_trip_$tripId')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'pooled_trips',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'id',
            value: tripId,
          ),
          callback: (payload) {
            onUpdate(payload.newRecord);
          },
        )
        .subscribe();
  }

  /// Subscribe to pool bookings for a trip
  static RealtimeChannel subscribeToPoolBookings(String tripId, Function(Map<String, dynamic>) onUpdate) {
    return client
        .channel('pool_bookings_$tripId')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'pool_bookings',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'trip_id',
            value: tripId,
          ),
          callback: (payload) {
            onUpdate(payload.newRecord);
          },
        )
        .subscribe();
  }

  /// Get active break tips from database
  static Future<List<Map<String, dynamic>>> getBreakTips() async {
    try {
      final response = await client
          .from('break_tips')
          .select()
          .eq('is_active', true)
          .order('sort_order', ascending: true);
      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      debugPrint('Error fetching break tips: $e');
      return [];
    }
  }

  /// Get random active motivational quote
  static Future<Map<String, dynamic>?> getRandomQuote() async {
    try {
      final response = await client
          .from('motivational_quotes')
          .select()
          .eq('is_active', true);
      final quotes = List<Map<String, dynamic>>.from(response);
      if (quotes.isEmpty) return null;
      quotes.shuffle();
      return quotes.first;
    } catch (e) {
      debugPrint('Error fetching quote: $e');
      return null;
    }
  }

  static Future<List<Map<String, dynamic>>> getAllActiveQuotes() async {
    try {
      debugPrint('getAllActiveQuotes: fetching...');
      final response = await client
          .from('motivational_quotes')
          .select()
          .eq('is_active', true)
          .order('sort_order', ascending: true);
      debugPrint('getAllActiveQuotes: got ${response.length} quotes');
      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      debugPrint('Error fetching quotes: $e');
      return [];
    }
  }

  // Notification Settings
  static Future<Map<String, dynamic>> getNotificationSettings(String profileId) async {
    try {
      final response = await client
          .from('profiles')
          .select('notification_settings')
          .eq('id', profileId)
          .single();

      final settings = response['notification_settings'] as Map<String, dynamic>?;
      return settings ?? {
        'ride_requests': true,
        'trip_updates': true,
        'promotions': false,
        'sounds': true,
        'vibration': true,
      };
    } catch (e) {
      debugPrint('Error getting notification settings: $e');
      return {
        'ride_requests': true,
        'trip_updates': true,
        'promotions': false,
        'sounds': true,
        'vibration': true,
      };
    }
  }

  static Future<void> updateNotificationSettings(String profileId, Map<String, dynamic> settings) async {
    try {
      await client
          .from('profiles')
          .update({'notification_settings': settings})
          .eq('id', profileId);
    } catch (e) {
      debugPrint('Error updating notification settings: $e');
      rethrow;
    }
  }

  // Generic file upload to storage (with optional compression)
  static Future<String?> uploadFile({
    required String bucket,
    required String path,
    required File file,
    ImageType? imageType,
  }) async {
    try {
      File uploadFile = file;

      // Compress if image type specified
      if (imageType != null) {
        final compressed = await ImageUtils.compressImage(
          file.path,
          type: imageType,
        );
        if (compressed != null) {
          uploadFile = compressed;
        }
      }

      await client.storage.from(bucket).upload(
        path,
        uploadFile,
        fileOptions: const FileOptions(cacheControl: '3600', upsert: true),
      );
      final url = client.storage.from(bucket).getPublicUrl(path);
      return url;
    } catch (e) {
      debugPrint('Error uploading file to $bucket: $e');
      return null;
    }
  }
}
