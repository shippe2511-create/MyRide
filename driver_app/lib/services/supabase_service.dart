import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class SupabaseService {
  static const String _supabaseUrl = 'https://lwkndyyfmmrzazdvrsnk.supabase.co';
  static const String _supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3a25keXlmbW1yemF6ZHZyc25rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMTM0NzAsImV4cCI6MjA5NTg4OTQ3MH0.hIcx_gway6VJrTYV1MAXAbcapgTfxo4zYOwgmS2uChg';

  static SupabaseClient get client => Supabase.instance.client;

  // Driver ID for phone-based login (not using Supabase Auth)
  static String? _driverId;
  static void setDriverId(String? id) => _driverId = id;
  static String? get driverId => _driverId;

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
      // Try exact match first
      var response = await client
          .from('profiles')
          .select()
          .eq('phone', phone)
          .maybeSingle();

      if (response != null) return response;

      // Try without country code (+960)
      String phoneWithoutCode = phone;
      if (phone.startsWith('+960')) {
        phoneWithoutCode = phone.substring(4);
      } else if (phone.startsWith('960')) {
        phoneWithoutCode = phone.substring(3);
      }

      if (phoneWithoutCode != phone) {
        response = await client
            .from('profiles')
            .select()
            .eq('phone', phoneWithoutCode)
            .maybeSingle();
      }

      return response;
    } catch (e) {
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
    final data = <String, dynamic>{
      'phone': phone,
      'full_name': fullName,
      'gender': gender,
      'employee_id': staffId,
      'emergency_contacts': emergencyContacts,
      'role': 'driver',
      'status': 'pending',
    };

    if (email != null && email.isNotEmpty) {
      data['email'] = email;
    }

    // Use upsert to handle existing records
    final response = await client.from('profiles').upsert(
      data,
      onConflict: 'employee_id',
    ).select().single();
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
    await client.auth.signOut();
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

  static Future<void> updateProfile(Map<String, dynamic> data) async {
    if (visibleUserId == null) return;
    await client
        .from('profiles')
        .update(data)
        .eq('id', visibleUserId!);
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
          .update({
            'is_online': isOnline,
            'last_updated': DateTime.now().toIso8601String(),
          })
          .eq('driver_id', driverId);
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

    return allRides;
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

  static Future<List<Map<String, dynamic>>> getCompletedRides() async {
    final driver = await getDriverProfile();
    if (driver == null) return [];

    final response = await client
        .from('rides')
        .select('*, customer:profiles!customer_id(*), rating:ratings(*)')
        .eq('driver_id', driver['id'])
        .inFilter('status', ['completed', 'cancelled', 'rejected'])
        .order('created_at', ascending: false)
        .limit(50);
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
    if (id == null || id.isEmpty) return [];

    // Use RPC to bypass RLS (phone login doesn't set auth.uid())
    final response = await client.rpc('get_driver_documents', params: {
      'p_driver_id': id,
    });
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
      await client
          .from('documents')
          .delete()
          .eq('id', documentId)
          .eq('driver_id', driverId);
      return true;
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

  static Future<List<Map<String, dynamic>>> getDriverRatings(String driverId) async {
    final response = await client
        .from('ratings')
        .select('*, from_user:profiles!ratings_from_user_id_fkey(full_name)')
        .eq('to_user_id', visibleUserId ?? driverId)
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
      await client.from('chat_messages').insert({
        'ride_id': rideId,
        'sender_id': id,
        'sender_type': senderType,
        'message': message,
        'created_at': DateTime.now().toIso8601String(),
      });

      // Queue push notification for customer
      try {
        final ride = await client
            .from('rides')
            .select('customer_id')
            .eq('id', rideId)
            .maybeSingle();

        final customerId = ride?['customer_id'];
        if (customerId != null) {
          await client.from('push_notification_queue').insert({
            'user_id': customerId,
            'title': 'New message from Driver',
            'body': message.length > 100 ? '${message.substring(0, 100)}...' : message,
            'data': {'type': 'chat', 'ride_id': rideId},
            'ride_id': rideId,
            'status': 'pending',
          });
        }
      } catch (e) {
        debugPrint('Error queueing chat notification: $e');
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
    return client
        .channel('chat_$rideId')
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'chat_messages',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'ride_id',
            value: rideId,
          ),
          callback: (payload) {
            onNewMessage(payload.newRecord);
          },
        )
        .subscribe();
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
      final file = File(filePath);
      if (driverId.isEmpty) {
        debugPrint('Error: driverId is empty');
        return null;
      }

      final extension = filePath.split('.').last.toLowerCase();
      final fileName = '$driverId/${documentType}_${DateTime.now().millisecondsSinceEpoch}.$extension';

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
      final file = File(filePath);
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
  static Future<void> registerFcmToken(String token, String? userId) async {
    if (userId == null) return;

    try {
      await client.from('push_tokens').upsert({
        'user_id': userId,
        'token': token,
        'platform': 'ios',
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
      await client.from('notifications').update({'read': true}).eq('id', notificationId);
    } catch (e) {
      debugPrint('Error marking notification as read: $e');
    }
  }

  static Future<void> markAllNotificationsAsRead(String driverId) async {
    try {
      await client.from('notifications').update({'read': true}).eq('user_id', driverId);
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
      int fuelCount = 0;
      int maintenanceCount = 0;

      for (final log in logs) {
        final amount = (log['amount'] ?? 0).toDouble();
        if (log['log_type'] == 'fuel') {
          fuelTotal += amount;
          fuelCount++;
        } else {
          maintenanceTotal += amount;
          maintenanceCount++;
        }
      }

      return {
        'fuel_total': fuelTotal,
        'fuel_count': fuelCount,
        'maintenance_total': maintenanceTotal,
        'maintenance_count': maintenanceCount,
        'total': fuelTotal + maintenanceTotal,
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
}
