import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class SupabaseService {
  static const String _supabaseUrl = 'https://lwkndyyfmmrzazdvrsnk.supabase.co';
  static const String _supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3a25keXlmbW1yemF6ZHZyc25rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMTM0NzAsImV4cCI6MjA5NTg4OTQ3MH0.hIcx_gway6VJrTYV1MAXAbcapgTfxo4zYOwgmS2uChg';

  static SupabaseClient get client => Supabase.instance.client;

  // Profile ID for phone-based login (not using Supabase Auth)
  static String? _profileId;
  static void setProfileId(String? id) => _profileId = id;
  static String? get profileId => _profileId;

  static Future<void> initialize() async {
    await Supabase.initialize(
      url: _supabaseUrl,
      anonKey: _supabaseAnonKey,
    );
  }

  // Auth methods - returns profileId first, then falls back to Supabase Auth user
  static User? get currentUser => client.auth.currentUser;
  static String? get userId => _profileId ?? currentUser?.id;
  static bool get isLoggedIn => userId != null;

  // Check if phone exists in system
  static Future<Map<String, dynamic>?> checkPhoneExists(String phone) async {
    try {
      // Try with full phone number first
      var response = await client
          .from('profiles')
          .select()
          .eq('phone', phone)
          .maybeSingle();

      // If not found and phone has country code, try without it
      if (response == null && phone.startsWith('+960')) {
        final localPhone = phone.substring(4); // Remove +960
        response = await client
            .from('profiles')
            .select()
            .eq('phone', localPhone)
            .maybeSingle();
      }

      return response;
    } catch (e) {
      return null;
    }
  }

  // Check if employee_id exists in system
  static Future<Map<String, dynamic>?> checkEmployeeIdExists(String employeeId) async {
    try {
      final response = await client
          .from('profiles')
          .select()
          .eq('employee_id', employeeId)
          .maybeSingle();
      return response;
    } catch (e) {
      return null;
    }
  }

  // Sign up with phone (for new users)
  static Future<Map<String, dynamic>> signUpWithPhone({
    required String phone,
    required String fullName,
    String? email,
    String? gender,
    String? staffId,
    List<Map<String, dynamic>>? emergencyContacts,
  }) async {
    // Check if auto-approve is enabled using RPC
    String status = 'pending';
    try {
      final autoApprove = await client.rpc('get_customer_auto_approve');
      debugPrint('Auto-approve setting: $autoApprove');
      if (autoApprove == true) {
        status = 'approved';
      }
    } catch (e) {
      debugPrint('Error checking auto-approve: $e');
    }

    debugPrint('Registering customer with status: $status');

    final data = <String, dynamic>{
      'phone': phone,
      'full_name': fullName,
      'gender': gender,
      'employee_id': staffId,
      'emergency_contacts': emergencyContacts,
      'role': 'customer',
      'status': status,
    };

    if (email != null && email.isNotEmpty) {
      data['email'] = email;
    }

    // Insert new profile
    final response = await client.from('profiles').insert(data).select().single();
    return response;
  }

  static Future<AuthResponse> signUp({
    required String email,
    required String password,
    required String fullName,
    required String phone,
    String? employeeId,
    String? department,
  }) async {
    return await client.auth.signUp(
      email: email,
      password: password,
      data: {
        'full_name': fullName,
        'phone': phone,
        'employee_id': employeeId,
        'department': department,
        'role': 'customer',
      },
    );
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

  static Future<void> resetPassword(String email) async {
    await client.auth.resetPasswordForEmail(email);
  }

  static Future<void> changePassword(String newPassword) async {
    await client.auth.updateUser(UserAttributes(password: newPassword));
  }

  // Profile methods
  static Future<Map<String, dynamic>?> getProfile() async {
    final id = userId;
    if (id == null) return null;
    final response = await client
        .from('profiles')
        .select()
        .eq('id', id)
        .single();
    return response;
  }

  // Get profile by employee_id (for non-auth login)
  static Future<Map<String, dynamic>?> getProfileByEmployeeId(String employeeId) async {
    try {
      final response = await client
          .from('profiles')
          .select()
          .eq('employee_id', employeeId)
          .maybeSingle();
      return response;
    } catch (e) {
      return null;
    }
  }

  // Get profile by phone (for non-auth login)
  static Future<Map<String, dynamic>?> getProfileByPhone(String phone) async {
    try {
      final response = await client
          .from('profiles')
          .select()
          .eq('phone', phone)
          .maybeSingle();
      return response;
    } catch (e) {
      return null;
    }
  }

  // Fields that require admin approval before updating
  static const _fieldsRequiringApproval = ['phone', 'employee_id'];

  static Future<Map<String, dynamic>> updateProfile(Map<String, dynamic> data) async {
    final id = userId;
    if (id == null) return {'success': false, 'pending': []};

    // Separate fields that need approval vs instant update
    final Map<String, dynamic> instantUpdate = {};
    final List<String> pendingFields = [];

    // Get current profile to compare
    final currentProfile = await client.from('profiles').select().eq('id', id).single();

    for (final entry in data.entries) {
      if (_fieldsRequiringApproval.contains(entry.key)) {
        final oldValue = currentProfile[entry.key]?.toString();
        final newValue = entry.value?.toString();

        // Only submit if value actually changed
        if (oldValue != newValue && newValue != null && newValue.isNotEmpty) {
          // Submit for approval
          await client.from('pending_profile_changes').insert({
            'user_id': id,
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
      await client.from('profiles').update(instantUpdate).eq('id', id);
    }

    return {
      'success': true,
      'pending': pendingFields,
    };
  }

  // Check if user has pending profile changes
  static Future<List<Map<String, dynamic>>> getPendingProfileChanges() async {
    final id = userId;
    if (id == null) return [];

    final response = await client
        .from('pending_profile_changes')
        .select()
        .eq('user_id', id)
        .eq('status', 'pending')
        .order('submitted_at', ascending: false);

    return List<Map<String, dynamic>>.from(response);
  }

  // Locations methods
  static Future<List<Map<String, dynamic>>> getLocations() async {
    final response = await client
        .from('locations')
        .select()
        .eq('is_active', true)
        .order('name');
    return List<Map<String, dynamic>>.from(response);
  }

  // Rides methods
  static Future<Map<String, dynamic>> createRide({
    required String pickupName,
    required String dropoffName,
    required double pickupLat,
    required double pickupLng,
    required double dropoffLat,
    required double dropoffLng,
    String? pickupLocationId,
    String? dropoffLocationId,
    DateTime? scheduledTime,
    String? customerId,
    int seatsBooked = 1,
  }) async {
    // Priority: passed customerId > auth user > lookup by stored profile
    String? finalCustomerId = customerId ?? currentUser?.id;

    if (finalCustomerId == null) {
      throw Exception('Customer ID is required to create a ride');
    }

    // Cancel any existing pending rides for this customer first
    await client.from('rides')
        .update({'status': 'cancelled', 'cancel_reason': 'New ride requested'})
        .eq('customer_id', finalCustomerId)
        .eq('status', 'pending');

    final response = await client.from('rides').insert({
      'customer_id': finalCustomerId,
      'pickup_name': pickupName,
      'dropoff_name': dropoffName,
      'pickup_lat': pickupLat,
      'pickup_lng': pickupLng,
      'dropoff_lat': dropoffLat,
      'dropoff_lng': dropoffLng,
      'pickup_location_id': pickupLocationId,
      'dropoff_location_id': dropoffLocationId,
      'scheduled_time': scheduledTime?.toIso8601String(),
      'seats_booked': seatsBooked,
      'status': 'pending',
    }).select().single();
    return response;
  }

  static Future<List<Map<String, dynamic>>> getMyRides() async {
    final id = userId;
    if (id == null) return [];
    final response = await client
        .from('rides')
        .select('*, driver:drivers(*, profile:profiles(*), vehicle:vehicle_types(*))')
        .eq('customer_id', id)
        .order('created_at', ascending: false);
    return List<Map<String, dynamic>>.from(response);
  }

  // Get active rides for a customer (pending or accepted)
  static Future<List<Map<String, dynamic>>> getMyScheduledRides(String? customerId) async {
    if (customerId == null) return [];
    try {
      final response = await client
          .from('rides')
          .select('''
            *,
            driver:drivers!rides_driver_id_fkey(
              id, rating, avatar_url,
              profile:profiles!drivers_profile_id_fkey(id, full_name, phone, avatar_url),
              vehicle:vehicle_types!drivers_vehicle_id_fkey(id, display_name, plate_no, name)
            )
          ''')
          .eq('customer_id', customerId)
          .inFilter('status', ['scheduled', 'pending', 'accepted', 'arrived', 'in_progress'])
          .order('created_at', ascending: false)
          .limit(5);
      debugPrint('Found ${response.length} active rides for customer');
      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      debugPrint('Error getting scheduled rides: $e');
      return [];
    }
  }

  static Future<Map<String, dynamic>?> getActiveRide() async {
    final id = userId;
    if (id == null) return null;
    try {
      final response = await client
          .from('rides')
          .select('*, driver:drivers(*, profile:profiles(*), vehicle:vehicle_types(*))')
          .eq('customer_id', id)
          .inFilter('status', ['pending', 'accepted', 'arrived', 'in_progress'])
          .order('created_at', ascending: false)
          .limit(1)
          .maybeSingle();
      return response;
    } catch (e) {
      return null;
    }
  }

  // Get ride by ID (for polling status)
  static Future<Map<String, dynamic>?> getRideById(String rideId) async {
    try {
      final response = await client
          .from('rides')
          .select('''
            *,
            driver:drivers!rides_driver_id_fkey(
              *,
              profile:profiles!drivers_profile_id_fkey(id, full_name, phone, avatar_url),
              vehicle:vehicle_types!drivers_vehicle_id_fkey(display_name, plate_no, name)
            )
          ''')
          .eq('id', rideId)
          .maybeSingle();
      debugPrint('getRideById response: $response');
      return response;
    } catch (e) {
      debugPrint('Error getting ride: $e');
      return null;
    }
  }

  static Future<void> cancelRide(String rideId, {String? reason}) async {
    final id = userId;
    if (id == null) throw Exception('User not logged in');

    debugPrint('cancelRide: rideId=$rideId, userId=$id, reason=$reason');

    final result = await client.rpc('update_ride_status', params: {
      'p_ride_id': rideId,
      'p_caller_id': id,
      'p_caller_type': 'customer',
      'p_new_status': 'cancelled',
      'p_cancel_reason': reason,
    });

    debugPrint('cancelRide RPC result: $result');

    if (result != null && result['success'] == false) {
      throw Exception(result['error'] ?? 'Failed to cancel ride');
    }
  }

  static Future<void> rateRide({
    required String rideId,
    required String driverUserId,
    required int rating,
    String? comment,
  }) async {
    final id = userId;
    if (id == null) return;
    await client.from('ratings').insert({
      'ride_id': rideId,
      'from_user_id': id,
      'to_user_id': driverUserId,
      'rating': rating,
      'comment': comment,
    });
  }

  static Future<void> rateDriver({
    required String rideId,
    required int rating,
    String? feedback,
    String? comment,
  }) async {
    // Use auth.uid() directly to match RLS policy
    final id = currentUser?.id;
    debugPrint('rateDriver: userId=$id, rideId=$rideId, rating=$rating');
    if (id == null) {
      debugPrint('rateDriver: No user ID, aborting');
      return;
    }

    // Get driver ID from ride
    final ride = await client.from('rides').select('driver_id').eq('id', rideId).single();
    final driverId = ride['driver_id'];
    debugPrint('rateDriver: driverId=$driverId');
    if (driverId == null) {
      debugPrint('rateDriver: No driver ID, aborting');
      return;
    }

    // Get driver's profile ID
    final driver = await client.from('drivers').select('profile_id').eq('id', driverId).single();
    final driverUserId = driver['profile_id'];
    debugPrint('rateDriver: driverProfileId=$driverUserId');

    final fullComment = [feedback, comment].where((s) => s != null && s.isNotEmpty).join(' - ');

    try {
      await client.from('ratings').insert({
        'ride_id': rideId,
        'from_user_id': id,
        'to_user_id': driverUserId,
        'rating': rating,
        'comment': fullComment.isEmpty ? null : fullComment,
      });
      debugPrint('rateDriver: Rating inserted successfully');
    } catch (e) {
      debugPrint('rateDriver ERROR: $e');
      rethrow;
    }

    // Update ride as rated
    await client.from('rides').update({'is_rated': true}).eq('id', rideId);

    // Calculate and update driver's average rating
    try {
      final ratingsResult = await client
          .from('ratings')
          .select('rating')
          .eq('to_user_id', driverUserId);

      if (ratingsResult.isNotEmpty) {
        final ratings = List<Map<String, dynamic>>.from(ratingsResult);
        final totalRatings = ratings.length;
        final sumRatings = ratings.fold<num>(0, (sum, r) {
          final ratingValue = r['rating'];
          if (ratingValue is int) return sum + ratingValue;
          if (ratingValue is double) return sum + ratingValue;
          return sum;
        });
        final avgRating = sumRatings / totalRatings;

        // Update driver's rating in drivers table
        await client
            .from('drivers')
            .update({'rating': avgRating})
            .eq('id', driverId);

        debugPrint('Updated driver $driverId rating to $avgRating (from $totalRatings ratings)');
      }
    } catch (e) {
      debugPrint('Error updating driver rating: $e');
    }
  }

  // Saved Places methods
  static Future<List<Map<String, dynamic>>> getSavedPlaces() async {
    final id = userId;
    if (id == null) return [];
    final response = await client
        .from('saved_places')
        .select()
        .eq('user_id', id)
        .order('created_at');
    return List<Map<String, dynamic>>.from(response);
  }

  static Future<bool> addSavedPlace({
    required String name,
    required String address,
    String icon = 'location_on',
    String color = 'yellow',
    double? latitude,
    double? longitude,
    String? staffId,
    String? profileId,
  }) async {
    try {
      String? resolvedUserId = userId;

      // Fallback: get profile ID by staffId
      if (userId == null && staffId != null && staffId.isNotEmpty) {
        final profile = await client
            .from('profiles')
            .select('id')
            .eq('employee_id', staffId)
            .maybeSingle();
        resolvedUserId = profile?['id'];
      }

      if (resolvedUserId == null) {
        debugPrint('addSavedPlace: No user ID found');
        return false;
      }

      debugPrint('addSavedPlace: Saving place "$name" for user $resolvedUserId');
      await client.from('saved_places').insert({
        'user_id': resolvedUserId,
        'name': name,
        'address': address,
        'icon': icon,
        'color': color,
        'latitude': latitude,
        'longitude': longitude,
      });
      debugPrint('addSavedPlace: Successfully saved');
      return true;
    } catch (e) {
      debugPrint('addSavedPlace ERROR: $e');
      return false;
    }
  }

  static Future<bool> deleteSavedPlace(String placeId) async {
    try {
      final id = userId;
      if (id == null) {
        debugPrint('Cannot delete saved place: not logged in');
        return false;
      }

      final response = await client
          .from('saved_places')
          .delete()
          .eq('id', placeId)
          .eq('user_id', id)
          .select();

      debugPrint('Delete saved place response: $response');
      return true;
    } catch (e) {
      debugPrint('Error deleting saved place: $e');
      return false;
    }
  }

  static Future<bool> updateSavedPlace(String placeId, {String? address, double? lat, double? lng}) async {
    try {
      final id = userId;
      if (id == null) {
        debugPrint('Cannot update saved place: not logged in');
        return false;
      }

      final updates = <String, dynamic>{};
      if (address != null) updates['address'] = address;
      if (lat != null) updates['latitude'] = lat;
      if (lng != null) updates['longitude'] = lng;

      if (updates.isEmpty) return true;

      await client
          .from('saved_places')
          .update(updates)
          .eq('id', placeId)
          .eq('user_id', id);

      debugPrint('Updated saved place $placeId');
      return true;
    } catch (e) {
      debugPrint('Error updating saved place: $e');
      return false;
    }
  }

  static Future<String> exportUserData() async {
    final id = userId;
    if (id == null) throw Exception('Not logged in');

    final profile = await client.from('profiles').select().eq('id', id).single();
    final rides = await client.from('rides').select().eq('customer_id', id).order('created_at', ascending: false).limit(100);
    final savedPlaces = await client.from('saved_places').select().eq('user_id', id);

    final buffer = StringBuffer();
    buffer.writeln('=== MY MYRIDE DATA EXPORT ===');
    buffer.writeln('Generated: ${DateTime.now().toIso8601String()}');
    buffer.writeln('');
    buffer.writeln('--- PROFILE ---');
    buffer.writeln('Name: ${profile['full_name']}');
    buffer.writeln('Phone: ${profile['phone']}');
    buffer.writeln('Email: ${profile['email'] ?? 'Not set'}');
    buffer.writeln('Employee ID: ${profile['employee_id'] ?? 'Not set'}');
    buffer.writeln('Joined: ${profile['created_at']}');
    buffer.writeln('');
    buffer.writeln('--- SAVED PLACES (${savedPlaces.length}) ---');
    for (final place in savedPlaces) {
      buffer.writeln('${place['name']}: ${place['address']}');
    }
    buffer.writeln('');
    buffer.writeln('--- RIDE HISTORY (${rides.length}) ---');
    for (final ride in rides) {
      buffer.writeln('${ride['created_at']}: ${ride['pickup_name']} → ${ride['dropoff_name']} (${ride['status']})');
    }
    return buffer.toString();
  }

  static Future<void> clearSearchHistory() async {
    // Search history is stored locally, not in saved_places
    // This is a no-op since we use Google Places API directly
  }

  static Future<void> deleteAccount() async {
    final id = userId;
    if (id == null) throw Exception('Not logged in');

    // Delete user data from tables
    await client.from('saved_places').delete().eq('user_id', id);
    await client.from('emergency_contacts').delete().eq('user_id', id);
    await client.from('notifications').delete().eq('user_id', id);

    // Mark profile as deleted (soft delete)
    await client.from('profiles').update({
      'full_name': 'Deleted User',
      'phone': null,
      'email': null,
      'avatar_url': null,
      'is_active': false,
    }).eq('id', id);

    // Sign out
    await client.auth.signOut();
  }

  // Inbox / Notifications
  static Future<List<Map<String, dynamic>>> getInboxMessages() async {
    final id = userId;
    if (id == null) return [];
    final response = await client
        .from('notifications')
        .select()
        .eq('user_id', id)
        .order('created_at', ascending: false)
        .limit(50);
    return List<Map<String, dynamic>>.from(response);
  }

  static Future<void> markMessageRead(String messageId) async {
    await client.from('notifications').update({'is_read': true}).eq('id', messageId);
  }

  static Future<void> markAllMessagesRead() async {
    final id = userId;
    if (id == null) return;
    await client.from('notifications').update({'is_read': true}).eq('user_id', id);
  }

  static Future<void> deleteNotification(String notificationId) async {
    await client.from('notifications').delete().eq('id', notificationId);
  }

  static Future<bool> upsertSavedPlace({
    required String name,
    required String address,
    String icon = 'location_on',
    String color = 'yellow',
    double? latitude,
    double? longitude,
  }) async {
    final id = userId;
    if (id == null) return false;
    try {
      final existing = await client
          .from('saved_places')
          .select('id')
          .eq('user_id', id)
          .eq('name', name)
          .maybeSingle();

      if (existing != null) {
        await client.from('saved_places').update({
          'address': address,
          'icon': icon,
          'color': color,
          'latitude': latitude,
          'longitude': longitude,
          'updated_at': DateTime.now().toIso8601String(),
        }).eq('id', existing['id']);
      } else {
        await client.from('saved_places').insert({
          'user_id': id,
          'name': name,
          'address': address,
          'icon': icon,
          'color': color,
          'latitude': latitude,
          'longitude': longitude,
        });
      }
      return true;
    } catch (e) {
      debugPrint('upsertSavedPlace ERROR: $e');
      return false;
    }
  }

  // Notifications methods
  static Future<List<Map<String, dynamic>>> getNotifications() async {
    final id = userId;
    if (id == null) return [];
    final response = await client
        .from('notifications')
        .select()
        .eq('user_id', id)
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

  static Future<void> markAllNotificationsRead() async {
    final id = userId;
    if (id == null) return;
    await client
        .from('notifications')
        .update({'is_read': true})
        .eq('user_id', id);
  }

  // Real-time subscriptions
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

  static RealtimeChannel subscribeToNewNotifications(
    void Function(Map<String, dynamic>) onNotification,
  ) {
    final id = userId;
    if (id == null) {
      throw Exception('User not logged in');
    }
    return client
        .channel('notifications_$id')
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'notifications',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'user_id',
            value: id,
          ),
          callback: (payload) {
            onNotification(payload.newRecord);
          },
        )
        .subscribe();
  }

  // Online drivers for tracking
  static Future<List<Map<String, dynamic>>> getOnlineDrivers() async {
    final response = await client
        .from('drivers')
        .select('*, profile:profiles(*), vehicle:vehicle_types(*)')
        .eq('is_online', true)
        .eq('is_on_break', false);
    return List<Map<String, dynamic>>.from(response);
  }

  // Available drivers (online, not on break)
  static Future<List<Map<String, dynamic>>> getAvailableDrivers() async {
    try {
      final response = await client
          .from('drivers')
          .select('*, profile:profiles(*), vehicle:vehicle_types(*)')
          .eq('is_online', true)
          .eq('is_on_break', false);

      // Filter out drivers with inactive vehicles
      final drivers = List<Map<String, dynamic>>.from(response);
      return drivers.where((d) {
        final vehicle = d['vehicle'] as Map<String, dynamic>?;
        if (vehicle == null) return true; // No vehicle assigned, allow
        return vehicle['is_active'] == true;
      }).toList();
    } catch (e) {
      debugPrint('Error getting available drivers: $e');
      return [];
    }
  }

  // Get online driver locations (for map display)
  static Future<List<Map<String, dynamic>>> getOnlineDriverLocations() async {
    try {
      // Use RPC function for reliable join query
      final response = await client.rpc('get_online_driver_locations');
      debugPrint('getOnlineDriverLocations: Got ${response.length} drivers');
      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      debugPrint('Error getting online driver locations: $e');
      return [];
    }
  }

  // Get driver details by driver ID (from drivers table)
  static Future<Map<String, dynamic>?> getDriverDetails(String driverId) async {
    try {
      final response = await client
          .from('drivers')
          .select('*, profile:profiles(*), vehicle:vehicle_types(*)')
          .eq('id', driverId)
          .single();
      return response;
    } catch (e) {
      return null;
    }
  }

  // Get driver details by profile ID
  static Future<Map<String, dynamic>?> getDriverByProfileId(String profileId) async {
    try {
      final response = await client
          .from('drivers')
          .select('*, profile:profiles(*), vehicle:vehicle_types(*)')
          .eq('profile_id', profileId)
          .single();
      return response;
    } catch (e) {
      return null;
    }
  }

  // Transport Schedules
  static Future<List<Map<String, dynamic>>> getTransportTypes() async {
    try {
      final response = await client
          .from('transport_types')
          .select()
          .eq('is_active', true)
          .order('name');
      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      debugPrint('getTransportTypes ERROR: $e');
      return [];
    }
  }

  static Future<List<Map<String, dynamic>>> getRoutes({String? transportType}) async {
    try {
      var query = client.from('transport_routes').select().eq('is_active', true);
      if (transportType != null) {
        query = query.eq('transport_type', transportType);
      }
      final response = await query.order('sort_order').order('route_name');
      debugPrint('getRoutes: Got ${response.length} routes');
      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      debugPrint('getRoutes ERROR: $e');
      return [];
    }
  }

  static Future<List<Map<String, dynamic>>> getSchedules({String? routeId}) async {
    try {
      var query = client.from('route_schedules').select();
      if (routeId != null) {
        query = query.eq('route_id', routeId);
      }
      final response = await query.order('departure_time');
      debugPrint('getSchedules: Got ${response.length} schedules');
      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      debugPrint('getSchedules ERROR: $e');
      return [];
    }
  }

  // Announcements
  static Future<List<Map<String, dynamic>>> getAnnouncements() async {
    try {
      final response = await client
          .from('announcements')
          .select()
          .eq('is_active', true)
          .order('sort_order', ascending: true)
          .limit(10);
      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      return [];
    }
  }

  // Staff Corner
  static Future<List<Map<String, dynamic>>> getStaffCorner() async {
    try {
      final response = await client
          .from('staff_corner')
          .select()
          .eq('is_active', true)
          .order('sort_order', ascending: true)
          .limit(10);
      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      return [];
    }
  }

  // Real-time driver location tracking
  static RealtimeChannel subscribeToDriverLocation(
    String driverId,
    void Function(double lat, double lng, double? heading) onLocationUpdate,
  ) {
    return client
        .channel('driver_location_$driverId')
        .onPostgresChanges(
          event: PostgresChangeEvent.update,
          schema: 'public',
          table: 'drivers',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'id',
            value: driverId,
          ),
          callback: (payload) {
            final data = payload.newRecord;
            final lat = data['current_location_lat'] as double?;
            final lng = data['current_location_lng'] as double?;
            final heading = data['heading'] as double?;
            if (lat != null && lng != null) {
              onLocationUpdate(lat, lng, heading);
            }
          },
        )
        .subscribe();
  }

  static Future<Map<String, dynamic>?> getDriverLocation(String driverId) async {
    try {
      final response = await client
          .from('drivers')
          .select('current_location_lat, current_location_lng, heading')
          .eq('id', driverId)
          .single();
      return response;
    } catch (e) {
      return null;
    }
  }

  // Chat functionality
  static Future<List<Map<String, dynamic>>> getChatMessages(String rideId) async {
    try {
      final response = await client
          .from('chat_messages')
          .select('*')
          .eq('ride_id', rideId)
          .order('created_at', ascending: true);
      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      debugPrint('Error getting chat messages: $e');
      return [];
    }
  }

  static Future<void> sendChatMessage({
    required String rideId,
    required String message,
    String? senderId,
  }) async {
    final id = senderId ?? userId;
    if (id == null) {
      debugPrint('Error sending message: no sender ID available');
      throw Exception('No sender ID available');
    }
    try {
      await client.from('chat_messages').insert({
        'ride_id': rideId,
        'sender_id': id,
        'sender_type': 'customer',
        'message': message,
        'created_at': DateTime.now().toIso8601String(),
      });

      // Queue push notification for driver
      try {
        final ride = await client
            .from('rides')
            .select('driver_id, driver:drivers(profile_id)')
            .eq('id', rideId)
            .maybeSingle();

        final driverProfileId = ride?['driver']?['profile_id'];
        if (driverProfileId != null) {
          await client.from('push_notification_queue').insert({
            'user_id': driverProfileId,
            'title': 'New message from Customer',
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
    final id = userId ?? SupabaseService.userId;
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

  // Push notification token registration
  static Future<void> registerPushToken(String token) async {
    final id = userId;
    if (id == null) return;
    await client.from('push_tokens').upsert({
      'user_id': id,
      'token': token,
      'platform': 'ios',
      'updated_at': DateTime.now().toIso8601String(),
    }, onConflict: 'user_id');
  }

  static Future<void> removePushToken() async {
    final id = userId;
    if (id == null) return;
    await client
        .from('push_tokens')
        .delete()
        .eq('user_id', id);
  }

  // Send push notification request
  static Future<void> sendPushNotification({
    required String userId,
    required String title,
    required String body,
    Map<String, dynamic>? data,
  }) async {
    await client.from('push_notification_queue').insert({
      'user_id': userId,
      'title': title,
      'body': body,
      'data': data,
      'status': 'pending',
    });
  }

  // ========== ADMIN CRUD METHODS ==========

  // Transport Types CRUD
  static Future<void> addTransportType(String name, String color, bool isActive) async {
    await client.from('transport_types').insert({
      'name': name,
      'color': color,
      'is_active': isActive,
    });
  }

  static Future<void> updateTransportType(String id, String name, String color, bool isActive) async {
    await client.from('transport_types').update({
      'name': name,
      'color': color,
      'is_active': isActive,
    }).eq('id', id);
  }

  static Future<void> deleteTransportType(String id) async {
    await client.from('transport_types').delete().eq('id', id);
  }

  // Routes CRUD
  static Future<void> addRoute(String name, String transportType, int duration, List<String> stops, bool isActive) async {
    await client.from('routes').insert({
      'name': name,
      'transport_type': transportType,
      'duration_minutes': duration,
      'stops': stops,
      'is_active': isActive,
    });
  }

  static Future<void> updateRoute(String id, String name, String transportType, int duration, List<String> stops, bool isActive) async {
    await client.from('routes').update({
      'name': name,
      'transport_type': transportType,
      'duration_minutes': duration,
      'stops': stops,
      'is_active': isActive,
    }).eq('id', id);
  }

  static Future<void> deleteRoute(String id) async {
    await client.from('routes').delete().eq('id', id);
  }

  // Schedules CRUD
  static Future<void> addSchedule(String routeId, String departureTime, List<String> daysOfWeek, bool isActive) async {
    await client.from('schedules').insert({
      'route_id': routeId,
      'departure_time': departureTime,
      'days_of_week': daysOfWeek,
      'is_active': isActive,
    });
  }

  static Future<void> updateSchedule(String id, String routeId, String departureTime, List<String> daysOfWeek, bool isActive) async {
    await client.from('schedules').update({
      'route_id': routeId,
      'departure_time': departureTime,
      'days_of_week': daysOfWeek,
      'is_active': isActive,
    }).eq('id', id);
  }

  static Future<void> deleteSchedule(String id) async {
    await client.from('schedules').delete().eq('id', id);
  }

  // Announcements CRUD
  static Future<void> addAnnouncement(String title, String content, String priority) async {
    await client.from('announcements').insert({
      'title': title,
      'content': content,
      'priority': priority,
      'is_active': true,
    });
  }

  static Future<void> updateAnnouncement(String id, String title, String content, String priority) async {
    await client.from('announcements').update({
      'title': title,
      'content': content,
      'priority': priority,
    }).eq('id', id);
  }

  static Future<void> deleteAnnouncement(String id) async {
    await client.from('announcements').delete().eq('id', id);
  }

  // Request destination change (customer sends to driver)
  static Future<bool> requestDestinationChange({
    required String rideId,
    required String newDestinationName,
    required double newLat,
    required double newLng,
  }) async {
    try {
      await client.from('rides').update({
        'pending_dropoff_name': newDestinationName,
        'pending_dropoff_lat': newLat,
        'pending_dropoff_lng': newLng,
        'destination_change_status': 'pending',
      }).eq('id', rideId);
      return true;
    } catch (e) {
      debugPrint('Error requesting destination change: $e');
      return false;
    }
  }

  // Check destination change status (customer polls this)
  static Future<String?> getDestinationChangeStatus(String rideId) async {
    try {
      final response = await client
          .from('rides')
          .select('destination_change_status, dropoff_name, dropoff_lat, dropoff_lng')
          .eq('id', rideId)
          .maybeSingle();
      return response?['destination_change_status'] as String?;
    } catch (e) {
      return null;
    }
  }

  // Get updated ride info after destination change approved
  static Future<Map<String, dynamic>?> getRideDetails(String rideId) async {
    try {
      final response = await client
          .from('rides')
          .select('*')
          .eq('id', rideId)
          .maybeSingle();
      return response;
    } catch (e) {
      return null;
    }
  }

  // Avatar/Profile Photo Storage
  static Future<String?> uploadAvatar(String filePath, String userId) async {
    try {
      final file = File(filePath);
      final fileName = 'avatar_$userId.jpg';

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

  static String getAvatarUrl(String userId) {
    final fileName = 'avatar_$userId.jpg';
    return client.storage.from('avatars').getPublicUrl(fileName);
  }

  static Future<bool> updateProfileAvatarUrl(String userId, String avatarUrl) async {
    try {
      await client.from('profiles').update({
        'avatar_url': avatarUrl,
      }).eq('id', userId);
      return true;
    } catch (e) {
      debugPrint('Error updating profile avatar: $e');
      return false;
    }
  }

  static Future<String?> getProfileAvatarUrl(String profileId) async {
    try {
      final response = await client
          .from('profiles')
          .select('avatar_url')
          .eq('id', profileId)
          .maybeSingle();
      return response?['avatar_url'] as String?;
    } catch (e) {
      return null;
    }
  }

  // Ride History for customer
  static Future<List<Map<String, dynamic>>> getRideHistory(String? customerId) async {
    final userId = customerId ?? currentUser?.id;
    if (userId == null) return [];

    try {
      final response = await client
          .from('rides')
          .select('*, driver:drivers(*, profile:profiles(*), vehicle:vehicle_types(*))')
          .eq('customer_id', userId)
          .inFilter('status', ['completed', 'cancelled'])
          .order('created_at', ascending: false)
          .limit(50);
      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      debugPrint('Error getting ride history: $e');
      return [];
    }
  }

  // Submit rating for a ride
  static Future<bool> submitRideRating({
    required String rideId,
    required String driverId,
    required int rating,
    String? comment,
  }) async {
    debugPrint('submitRideRating called: rideId=$rideId, driverId=$driverId, rating=$rating');
    try {
      final myUserId = userId;
      debugPrint('User ID for rating: $myUserId');
      if (myUserId == null) {
        debugPrint('Error: No current user (userId is null)');
        return false;
      }

      // Get driver's profile_id from drivers table
      final driverRecord = await client
          .from('drivers')
          .select('profile_id')
          .eq('id', driverId)
          .maybeSingle();

      debugPrint('Driver record lookup: $driverRecord');
      final driverProfileId = driverRecord?['profile_id'] as String?;
      if (driverProfileId == null) {
        debugPrint('Error: Could not find driver profile for $driverId');
        return false;
      }

      debugPrint('Inserting rating: ride_id=$rideId, from=$myUserId, to=$driverProfileId, rating=$rating');
      await client.from('ratings').insert({
        'ride_id': rideId,
        'from_user_id': myUserId,
        'to_user_id': driverProfileId,
        'rating': rating,
        'comment': comment,
      });
      debugPrint('Rating inserted successfully');

      // Update ride as rated
      await client.from('rides').update({'is_rated': true}).eq('id', rideId);

      // Calculate and update driver's average rating
      final ratingsResult = await client
          .from('ratings')
          .select('rating')
          .eq('to_user_id', driverProfileId);

      if (ratingsResult.isNotEmpty) {
        final ratings = List<Map<String, dynamic>>.from(ratingsResult);
        final totalRatings = ratings.length;
        final sumRatings = ratings.fold<num>(0, (sum, r) {
          final ratingValue = r['rating'];
          if (ratingValue is int) return sum + ratingValue;
          if (ratingValue is double) return sum + ratingValue;
          return sum;
        });
        final avgRating = sumRatings / totalRatings;

        await client
            .from('drivers')
            .update({'rating': avgRating})
            .eq('id', driverId);

        debugPrint('Updated driver $driverId rating to $avgRating');
      }

      return true;
    } catch (e) {
      debugPrint('Error submitting rating: $e');
      return false;
    }
  }

  // Create scheduled ride
  static Future<Map<String, dynamic>?> createScheduledRide({
    required String pickupName,
    required String dropoffName,
    required double pickupLat,
    required double pickupLng,
    required double dropoffLat,
    required double dropoffLng,
    required DateTime scheduledTime,
    String? customerId,
  }) async {
    final finalCustomerId = customerId ?? currentUser?.id;
    if (finalCustomerId == null) return null;

    try {
      final response = await client.from('rides').insert({
        'customer_id': finalCustomerId,
        'pickup_name': pickupName,
        'dropoff_name': dropoffName,
        'pickup_lat': pickupLat,
        'pickup_lng': pickupLng,
        'dropoff_lat': dropoffLat,
        'dropoff_lng': dropoffLng,
        'scheduled_time': scheduledTime.toUtc().toIso8601String(),
        'status': 'scheduled',
      }).select().single();
      return response;
    } catch (e) {
      debugPrint('Error creating scheduled ride: $e');
      return null;
    }
  }

  // Get scheduled rides (including those waiting for driver)
  static Future<List<Map<String, dynamic>>> getScheduledRides(String? customerId) async {
    final userId = customerId ?? currentUser?.id;
    if (userId == null) return [];

    try {
      final response = await client
          .from('rides')
          .select('*, driver:drivers(*, profile:profiles(*))')
          .eq('customer_id', userId)
          .inFilter('status', ['scheduled', 'pending', 'accepted'])
          .not('scheduled_time', 'is', null)
          .order('scheduled_time', ascending: false)
          .limit(10);
      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      debugPrint('Error getting scheduled rides: $e');
      return [];
    }
  }

  // Cancel scheduled ride
  static Future<bool> cancelScheduledRide(String rideId) async {
    try {
      await client.from('rides').update({
        'status': 'cancelled',
        'cancelled_at': DateTime.now().toIso8601String(),
        'cancel_reason': 'Cancelled by customer',
      }).eq('id', rideId);
      return true;
    } catch (e) {
      debugPrint('Error cancelling scheduled ride: $e');
      return false;
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
        'platform': 'ios',
        'updated_at': DateTime.now().toIso8601String(),
      }, onConflict: 'user_id');
    } catch (e) {
      debugPrint('Error registering FCM token: $e');
    }
  }

  // Queue push notification
  static Future<void> queuePushNotification({
    required String userId,
    required String title,
    required String body,
    Map<String, dynamic>? data,
  }) async {
    try {
      await client.from('push_notification_queue').insert({
        'user_id': userId,
        'title': title,
        'body': body,
        'data': data,
        'status': 'pending',
        'created_at': DateTime.now().toIso8601String(),
      });
    } catch (e) {
      debugPrint('Error queueing notification: $e');
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
    String? rideId,
    String? driverId,
    double? latitude,
    double? longitude,
    String? locationAddress,
  }) async {
    try {
      final uid = userId;
      if (uid == null) {
        debugPrint('SOS Alert failed: No user ID');
        return false;
      }

      await client.from('sos_alerts').insert({
        'user_id': uid,
        'ride_id': rideId,
        'driver_id': driverId,
        'latitude': latitude,
        'longitude': longitude,
        'location_address': locationAddress,
        'status': 'active',
        'created_at': DateTime.now().toIso8601String(),
      });
      debugPrint('SOS Alert sent successfully for user: $uid');
      return true;
    } catch (e) {
      debugPrint('Error triggering SOS alert: $e');
      return false;
    }
  }

  // Favorite Drivers
  static Future<List<Map<String, dynamic>>> getFavoriteDrivers() async {
    final uid = userId;
    if (uid == null) return [];

    try {
      final response = await client
          .from('favorite_drivers')
          .select('''
            id,
            driver_id,
            created_at,
            driver:drivers(
              id,
              rating,
              profile:profiles(full_name, avatar_url, phone)
            )
          ''')
          .eq('customer_id', uid)
          .order('created_at', ascending: false);

      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      debugPrint('Error getting favorite drivers: $e');
      return [];
    }
  }

  static Future<bool> addFavoriteDriver(String driverId) async {
    final uid = userId;
    if (uid == null) return false;

    try {
      await client.from('favorite_drivers').insert({
        'customer_id': uid,
        'driver_id': driverId,
      });
      return true;
    } catch (e) {
      debugPrint('Error adding favorite driver: $e');
      return false;
    }
  }

  static Future<bool> removeFavoriteDriver(String driverId) async {
    final uid = userId;
    if (uid == null) return false;

    try {
      await client
          .from('favorite_drivers')
          .delete()
          .eq('customer_id', uid)
          .eq('driver_id', driverId);
      return true;
    } catch (e) {
      debugPrint('Error removing favorite driver: $e');
      return false;
    }
  }

  static Future<bool> isFavoriteDriver(String driverId) async {
    final uid = userId;
    if (uid == null) return false;

    try {
      final response = await client
          .from('favorite_drivers')
          .select('id')
          .eq('customer_id', uid)
          .eq('driver_id', driverId)
          .maybeSingle();
      return response != null;
    } catch (e) {
      return false;
    }
  }

  // Recurring Rides
  static Future<List<Map<String, dynamic>>> getRecurringRides() async {
    final uid = userId;
    if (uid == null) return [];

    try {
      final response = await client
          .from('recurring_rides')
          .select()
          .eq('customer_id', uid)
          .order('schedule_time');
      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      debugPrint('Error getting recurring rides: $e');
      return [];
    }
  }

  static Future<Map<String, dynamic>?> createRecurringRide({
    required String pickupName,
    required double pickupLat,
    required double pickupLng,
    required String dropoffName,
    required double dropoffLat,
    required double dropoffLng,
    required String scheduleTime,
    required List<String> daysOfWeek,
  }) async {
    final uid = userId;
    if (uid == null) return null;

    try {
      final response = await client.from('recurring_rides').insert({
        'customer_id': uid,
        'pickup_name': pickupName,
        'pickup_lat': pickupLat,
        'pickup_lng': pickupLng,
        'dropoff_name': dropoffName,
        'dropoff_lat': dropoffLat,
        'dropoff_lng': dropoffLng,
        'schedule_time': scheduleTime,
        'days_of_week': daysOfWeek,
        'is_active': true,
      }).select().single();
      return response;
    } catch (e) {
      debugPrint('Error creating recurring ride: $e');
      return null;
    }
  }

  static Future<bool> updateRecurringRide(String id, Map<String, dynamic> updates) async {
    try {
      await client.from('recurring_rides').update(updates).eq('id', id);
      return true;
    } catch (e) {
      debugPrint('Error updating recurring ride: $e');
      return false;
    }
  }

  static Future<bool> deleteRecurringRide(String id) async {
    try {
      await client.from('recurring_rides').delete().eq('id', id);
      return true;
    } catch (e) {
      debugPrint('Error deleting recurring ride: $e');
      return false;
    }
  }

  static Future<bool> toggleRecurringRide(String id, bool isActive) async {
    try {
      await client.from('recurring_rides').update({'is_active': isActive}).eq('id', id);
      return true;
    } catch (e) {
      debugPrint('Error toggling recurring ride: $e');
      return false;
    }
  }

  // ============ Multi-stop Rides ============

  static Future<List<Map<String, dynamic>>> getRideStops(String rideId) async {
    try {
      final response = await client
          .from('ride_stops')
          .select()
          .eq('ride_id', rideId)
          .order('stop_order', ascending: true);
      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      debugPrint('Error getting ride stops: $e');
      return [];
    }
  }

  static Future<bool> addRideStop({
    required String rideId,
    required int stopOrder,
    required String locationName,
    required double latitude,
    required double longitude,
    String? notes,
  }) async {
    try {
      await client.from('ride_stops').insert({
        'ride_id': rideId,
        'stop_order': stopOrder,
        'location_name': locationName,
        'latitude': latitude,
        'longitude': longitude,
        'notes': notes,
        'status': 'pending',
      });
      return true;
    } catch (e) {
      debugPrint('Error adding ride stop: $e');
      return false;
    }
  }

  static Future<bool> updateRideStopStatus(String stopId, String status, {DateTime? time}) async {
    try {
      final updates = <String, dynamic>{'status': status};
      if (status == 'arrived') {
        updates['arrival_time'] = (time ?? DateTime.now()).toIso8601String();
      } else if (status == 'departed') {
        updates['departed_time'] = (time ?? DateTime.now()).toIso8601String();
      }
      await client.from('ride_stops').update(updates).eq('id', stopId);
      return true;
    } catch (e) {
      debugPrint('Error updating ride stop status: $e');
      return false;
    }
  }

  static Future<bool> removeRideStop(String stopId) async {
    try {
      await client.from('ride_stops').delete().eq('id', stopId);
      return true;
    } catch (e) {
      debugPrint('Error removing ride stop: $e');
      return false;
    }
  }

  static Future<bool> reorderRideStops(String rideId, List<String> stopIds) async {
    try {
      for (int i = 0; i < stopIds.length; i++) {
        await client.from('ride_stops').update({'stop_order': i}).eq('id', stopIds[i]);
      }
      return true;
    } catch (e) {
      debugPrint('Error reordering ride stops: $e');
      return false;
    }
  }

  static Future<bool> submitSupportTicket({
    required String category,
    required String description,
    String? driverId,
    String? rideId,
  }) async {
    try {
      final uid = userId;
      if (uid == null) {
        debugPrint('No user ID for support ticket');
        return false;
      }
      await client.from('support_tickets').insert({
        'user_id': uid,
        'category': category,
        'description': description,
        if (driverId != null) 'driver_id': driverId,
        if (rideId != null) 'ride_id': rideId,
      });
      return true;
    } catch (e) {
      debugPrint('Error submitting support ticket: $e');
      return false;
    }
  }

  static Future<List<Map<String, dynamic>>> getRecentDrivers() async {
    try {
      final uid = userId;
      if (uid == null) return [];
      final response = await client
          .from('rides')
          .select('driver_id, driver:drivers!rides_driver_id_fkey(id, profile:profiles(full_name), vehicle_number)')
          .eq('customer_id', uid)
          .not('driver_id', 'is', null)
          .order('created_at', ascending: false)
          .limit(5);
      final seen = <String>{};
      final drivers = <Map<String, dynamic>>[];
      for (final ride in response) {
        final driverId = ride['driver_id'] as String?;
        if (driverId != null && !seen.contains(driverId) && ride['driver'] != null) {
          seen.add(driverId);
          drivers.add(ride['driver'] as Map<String, dynamic>);
        }
      }
      return drivers;
    } catch (e) {
      debugPrint('Error getting recent drivers: $e');
      return [];
    }
  }

  // Support Chat Methods
  static Future<String?> getOrCreateSupportChat() async {
    try {
      final uid = userId;
      if (uid == null) return null;

      // Check for existing open chat
      final existing = await client
          .from('support_chats')
          .select('id')
          .eq('customer_id', uid)
          .inFilter('status', ['open', 'active'])
          .order('created_at', ascending: false)
          .limit(1)
          .maybeSingle();

      if (existing != null) {
        return existing['id'] as String;
      }

      // Create new chat
      final response = await client
          .from('support_chats')
          .insert({'customer_id': uid, 'status': 'open'})
          .select('id')
          .single();

      return response['id'] as String;
    } catch (e) {
      debugPrint('Error getting/creating support chat: $e');
      return null;
    }
  }

  static Future<List<Map<String, dynamic>>> getSupportChatMessages(String chatId) async {
    try {
      final response = await client
          .from('support_chat_messages')
          .select('*')
          .eq('chat_id', chatId)
          .order('created_at', ascending: true);
      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      debugPrint('Error getting support chat messages: $e');
      return [];
    }
  }

  static Future<bool> sendSupportChatMessage({
    required String chatId,
    required String message,
    String? senderId,
  }) async {
    try {
      final uid = senderId ?? userId;
      if (uid == null) return false;

      await client.from('support_chat_messages').insert({
        'chat_id': chatId,
        'sender_id': uid,
        'sender_type': 'customer',
        'message': message,
      });

      // Update chat status to active
      await client.from('support_chats').update({
        'status': 'active',
        'updated_at': DateTime.now().toIso8601String(),
      }).eq('id', chatId);

      return true;
    } catch (e) {
      debugPrint('Error sending support chat message: $e');
      return false;
    }
  }

  static RealtimeChannel subscribeToSupportChat(String chatId, Function(Map<String, dynamic>) onMessage) {
    return client
        .channel('support_chat_$chatId')
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'support_chat_messages',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'chat_id',
            value: chatId,
          ),
          callback: (payload) {
            onMessage(payload.newRecord);
          },
        )
        .subscribe();
  }

  static Future<void> markSupportMessagesAsRead(String chatId) async {
    try {
      await client
          .from('support_chat_messages')
          .update({'is_read': true})
          .eq('chat_id', chatId)
          .eq('sender_type', 'admin');
    } catch (e) {
      debugPrint('Error marking support messages as read: $e');
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

  // Generic file upload to storage
  static Future<String?> uploadFile({
    required String bucket,
    required String path,
    required File file,
  }) async {
    try {
      await client.storage.from(bucket).upload(
        path,
        file,
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
