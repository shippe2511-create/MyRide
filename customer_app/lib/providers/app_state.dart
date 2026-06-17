import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/supabase_service.dart';

class AppState extends ChangeNotifier {
  bool _isInitialized = false;
  bool get isInitialized => _isInitialized;

  AppState() {
    _initializeAll();
  }

  Future<void> _initializeAll() async {
    await Future.wait([
      _loadFavorites(),
      _loadReminders(),
      _loadProfilePhoto(),
      _loadFavoriteDrivers(),
      _loadOnboardingStatus(),
      _loadLanguage(),
      _loadUserRegistration(),
      _loadTheme(),
      _loadProfileId(),
    ]);
    _isInitialized = true;
    notifyListeners();
  }

  Future<void> waitForInitialization() async {
    if (_isInitialized) return;
    while (!_isInitialized) {
      await Future.delayed(const Duration(milliseconds: 50));
    }
  }
  // Theme
  bool _isDarkMode = true;
  bool get isDarkMode => _isDarkMode;

  Future<void> _loadTheme() async {
    final prefs = await SharedPreferences.getInstance();
    _isDarkMode = prefs.getBool('isDarkMode') ?? true;
    notifyListeners();
  }

  Future<void> toggleDarkMode(bool value) async {
    _isDarkMode = value;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('isDarkMode', value);
    notifyListeners();
  }

  // Notifications
  bool _notificationsEnabled = true;
  bool get notificationsEnabled => _notificationsEnabled;

  void toggleNotifications(bool value) {
    _notificationsEnabled = value;
    notifyListeners();
  }

  // Location services
  bool _locationEnabled = true;
  bool get locationEnabled => _locationEnabled;

  void toggleLocation(bool value) {
    _locationEnabled = value;
    notifyListeners();
  }

  // Face ID / Biometrics
  bool _faceIdEnabled = false;
  bool get faceIdEnabled => _faceIdEnabled;

  void toggleFaceId(bool value) {
    _faceIdEnabled = value;
    notifyListeners();
  }

  // Additional notification settings
  bool _rideUpdatesEnabled = true;
  bool _promotionsEnabled = false;
  bool _emailNotificationsEnabled = true;

  bool get rideUpdatesEnabled => _rideUpdatesEnabled;
  bool get promotionsEnabled => _promotionsEnabled;
  bool get emailNotificationsEnabled => _emailNotificationsEnabled;

  void toggleRideUpdates(bool value) {
    _rideUpdatesEnabled = value;
    notifyListeners();
  }

  void togglePromotions(bool value) {
    _promotionsEnabled = value;
    notifyListeners();
  }

  void toggleEmailNotifications(bool value) {
    _emailNotificationsEnabled = value;
    notifyListeners();
  }

  // Two-Factor Authentication
  bool _twoFactorEnabled = false;
  bool get twoFactorEnabled => _twoFactorEnabled;

  void toggleTwoFactor(bool value) {
    _twoFactorEnabled = value;
    notifyListeners();
  }

  // Blocked Users
  final List<String> _blockedUsers = [];
  List<String> get blockedUsers => _blockedUsers;

  void blockUser(String userName) {
    if (!_blockedUsers.contains(userName)) {
      _blockedUsers.add(userName);
      notifyListeners();
    }
  }

  void unblockUser(String userName) {
    _blockedUsers.remove(userName);
    notifyListeners();
  }

  // Emergency contacts
  final List<Map<String, String>> _emergencyContacts = [];
  List<Map<String, String>> get emergencyContacts => _emergencyContacts;

  void addEmergencyContact(Map<String, String> contact) {
    _emergencyContacts.add(contact);
    notifyListeners();
  }

  void removeEmergencyContact(String phone) {
    _emergencyContacts.removeWhere((c) => c['phone'] == phone);
    notifyListeners();
  }

  Future<void> loadEmergencyContactsFromProfile() async {
    if (_profileId == null) return;
    try {
      final profile = await SupabaseService.getProfile();
      if (profile != null && profile['emergency_contacts'] != null) {
        _emergencyContacts.clear();
        final contacts = profile['emergency_contacts'] as List<dynamic>;
        for (final c in contacts) {
          _emergencyContacts.add({
            'name': c['name']?.toString() ?? '',
            'phone': c['phone']?.toString() ?? '',
            'relation': c['relation']?.toString() ?? '',
          });
        }
        notifyListeners();
      }
    } catch (e) {
      debugPrint('Error loading emergency contacts: $e');
    }
  }

  // Language
  String _language = 'English';
  String get language => _language;

  void setLanguage(String lang) {
    _language = lang;
    notifyListeners();
  }

  // User profile
  String _userName = '';
  String _userInitials = '';
  String _staffId = '';
  String _userPhone = '';
  String _userEmail = '';
  final double _userRating = 4.92;
  int _totalTrips = 142;
  String? _profilePhotoPath;
  String? _profileId; // Supabase profile UUID
  String? _avatarUrl; // Cloud avatar URL

  String get userName => _userName;
  String get userInitials => _userInitials;
  String get staffId => _staffId;
  String get userPhone => _userPhone;
  String get userEmail => _userEmail;
  double get userRating => _userRating;
  int get totalTrips => _totalTrips;
  String? get profilePhotoPath => _profilePhotoPath;
  String? get profileId => _profileId;
  String? get avatarUrl => _avatarUrl;

  void updateAvatarUrl(String? url) async {
    _avatarUrl = url;
    final prefs = await SharedPreferences.getInstance();
    if (url != null) {
      await prefs.setString('avatar_url', url);
    } else {
      await prefs.remove('avatar_url');
    }
    notifyListeners();
  }

  void setUserData({
    required String name,
    required String email,
    required String phone,
    String? staffId,
    String? profileId,
  }) {
    _userName = name;
    _userEmail = email;
    _userPhone = phone;
    if (staffId != null) _staffId = staffId;
    if (profileId != null) _profileId = profileId;
    _userInitials = name.isNotEmpty
        ? name.split(' ').map((n) => n.isNotEmpty ? n[0] : '').take(2).join().toUpperCase()
        : 'U';
    _saveProfileId();
    notifyListeners();
  }

  void setProfileId(String? id) {
    _profileId = id;
    SupabaseService.setProfileId(id);
    _saveProfileId();
    if (id != null) {
      loadEmergencyContactsFromProfile();
      loadTripHistory();
    }
    notifyListeners();
  }

  Future<void> _saveProfileId() async {
    final prefs = await SharedPreferences.getInstance();
    if (_profileId != null) {
      await prefs.setString('profile_id', _profileId!);
    }
    if (_userPhone.isNotEmpty) {
      await prefs.setString('user_phone', _userPhone);
    }
    if (_userName.isNotEmpty) {
      await prefs.setString('user_name', _userName);
    }
    if (_userEmail.isNotEmpty) {
      await prefs.setString('user_email', _userEmail);
    }
  }

  Future<void> _loadProfileId() async {
    final prefs = await SharedPreferences.getInstance();
    _profileId = prefs.getString('profile_id');
    _userPhone = prefs.getString('user_phone') ?? '';
    _userName = prefs.getString('user_name') ?? '';
    _userEmail = prefs.getString('user_email') ?? '';
    if (_userName.isNotEmpty) {
      _userInitials = _userName.split(' ').map((n) => n.isNotEmpty ? n[0] : '').take(2).join().toUpperCase();
    }
    if (_profileId != null) {
      SupabaseService.setProfileId(_profileId);
      loadEmergencyContactsFromProfile();
      loadTripHistory();
    }
    notifyListeners();
  }

  void updateProfilePhoto(String? path) {
    _profilePhotoPath = path;
    _saveProfilePhoto();
    notifyListeners();
  }

  Future<void> _loadProfilePhoto() async {
    final prefs = await SharedPreferences.getInstance();
    _profilePhotoPath = prefs.getString('profile_photo');
    _avatarUrl = prefs.getString('avatar_url');
    notifyListeners();
  }

  Future<void> _saveProfilePhoto() async {
    final prefs = await SharedPreferences.getInstance();
    if (_profilePhotoPath != null) {
      await prefs.setString('profile_photo', _profilePhotoPath!);
    } else {
      await prefs.remove('profile_photo');
    }
  }

  void updateUserName(String name) {
    _userName = name;
    _userInitials = name.split(' ').map((e) => e.isNotEmpty ? e[0] : '').join().toUpperCase();
    notifyListeners();
  }

  void updateUserPhone(String phone) {
    _userPhone = phone;
    notifyListeners();
  }

  void updateUserEmail(String email) {
    _userEmail = email;
    notifyListeners();
  }

  // Saved addresses
  String _homeAddress = '21 Marina Walk, Block C';
  String _workAddress = 'One Central Tower, 14F';

  String get homeAddress => _homeAddress;
  String get workAddress => _workAddress;

  void updateHomeAddress(String address) {
    _homeAddress = address;
    notifyListeners();
  }

  void updateWorkAddress(String address) {
    _workAddress = address;
    notifyListeners();
  }

  // Trip history (loaded from database)
  List<Map<String, dynamic>> _tripHistory = [];
  bool _tripHistoryLoading = false;

  List<Map<String, dynamic>> get tripHistory => _tripHistory;
  bool get tripHistoryLoading => _tripHistoryLoading;

  Future<void> loadTripHistory() async {
    if (_profileId == null) return;
    _tripHistoryLoading = true;
    notifyListeners();
    try {
      final rides = await SupabaseService.getRideHistory(_profileId);
      _tripHistory = rides.map((ride) {
        final createdAt = DateTime.tryParse(ride['created_at'] ?? '') ?? DateTime.now();
        final driver = ride['driver'];
        final driverProfile = driver?['profile'];
        final vehicle = driver?['vehicle'];
        return {
          'id': ride['id'],
          'date': _formatDate(createdAt),
          'departTime': _formatTime(createdAt),
          'from': ride['pickup_name'] ?? 'Unknown',
          'to': ride['dropoff_name'] ?? 'Unknown',
          'time': ride['duration_minutes'] != null ? '${ride['duration_minutes']} min' : '-',
          'type': vehicle?['display_name'] ?? vehicle?['name'] ?? 'Vehicle',
          'driver': driverProfile?['full_name'] ?? 'Driver',
          'vehicle': vehicle?['plate_no'] ?? '-',
          'rating': 0,
          'status': ride['status'] ?? 'completed',
          'distance_km': ride['distance_km'],
        };
      }).toList();
    } catch (e) {
      debugPrint('Error loading trip history: $e');
    }
    _tripHistoryLoading = false;
    notifyListeners();
  }

  String _formatDate(DateTime date) {
    final now = DateTime.now();
    final diff = now.difference(date).inDays;
    if (diff == 0) return 'Today';
    if (diff == 1) return 'Yesterday';
    return '${_monthName(date.month)} ${date.day}';
  }

  String _monthName(int month) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[month - 1];
  }

  String _formatTime(DateTime date) {
    final hour = date.hour > 12 ? date.hour - 12 : (date.hour == 0 ? 12 : date.hour);
    final period = date.hour >= 12 ? 'PM' : 'AM';
    return '$hour:${date.minute.toString().padLeft(2, '0')} $period';
  }

  void addTrip(Map<String, dynamic> trip) {
    _tripHistory.insert(0, trip);
    _totalTrips++;
    notifyListeners();
  }

  // Saved locations
  final List<Map<String, dynamic>> _savedLocations = [
    {'icon': 'home', 'title': 'Home', 'address': '21 Marina Walk, Block C'},
    {'icon': 'work', 'title': 'Work', 'address': 'One Central Tower, 14F'},
  ];

  List<Map<String, dynamic>> get savedLocations => _savedLocations;

  void addSavedLocation(Map<String, dynamic> location) {
    _savedLocations.add(location);
    notifyListeners();
  }

  void removeSavedLocation(int index) {
    if (index >= 2) {
      _savedLocations.removeAt(index);
      notifyListeners();
    }
  }

  // Trusted contacts
  final List<Map<String, String>> _trustedContacts = [
    {'name': 'Emergency Contact 1', 'phone': '+960 777 1234'},
    {'name': 'Emergency Contact 2', 'phone': '+960 777 5678'},
  ];

  List<Map<String, String>> get trustedContacts => _trustedContacts;

  void addTrustedContact(Map<String, String> contact) {
    _trustedContacts.add(contact);
    notifyListeners();
  }

  void removeTrustedContact(int index) {
    _trustedContacts.removeAt(index);
    notifyListeners();
  }

  // Notifications list
  final List<Map<String, dynamic>> _notifications = [
    {'icon': 'sailing', 'title': 'Ferry 9:00 AM confirmed', 'subtitle': 'Seat 07 · Malé → Hulhulé', 'time': '8m', 'unread': true},
    {'icon': 'shield', 'title': 'Trip shared with Facilities', 'subtitle': 'Your live location is visible', 'time': '1h', 'unread': false},
    {'icon': 'gift', 'title': 'New staff route added', 'subtitle': 'Express bus from Hulhumalé at 7:30 AM', 'time': '1d', 'unread': false},
    {'icon': 'star', 'title': 'Rate your last trip', 'subtitle': 'with Marcus K. · MV 88', 'time': '2d', 'unread': false},
  ];

  List<Map<String, dynamic>> get notifications => _notifications;

  void markAllNotificationsRead() {
    for (var notif in _notifications) {
      notif['unread'] = false;
    }
    notifyListeners();
  }

  void clearNotification(int index) {
    _notifications.removeAt(index);
    notifyListeners();
  }

  int get unreadNotificationCount => _notifications.where((n) => n['unread'] == true).length;

  // Scheduled trips
  final List<Map<String, dynamic>> _scheduledTrips = [];

  List<Map<String, dynamic>> get scheduledTrips => _scheduledTrips;

  void addScheduledTrip(Map<String, dynamic> trip) {
    _scheduledTrips.add(trip);
    notifyListeners();
  }

  void removeScheduledTrip(int index) {
    _scheduledTrips.removeAt(index);
    notifyListeners();
  }

  // Current trip state
  bool _isOnTrip = false;
  Map<String, dynamic>? _currentTrip;

  bool get isOnTrip => _isOnTrip;
  Map<String, dynamic>? get currentTrip => _currentTrip;

  void startTrip(Map<String, dynamic> trip) {
    _isOnTrip = true;
    _currentTrip = trip;
    notifyListeners();
  }

  void endTrip() {
    if (_currentTrip != null) {
      addTrip({
        'date': 'Today',
        'from': _currentTrip!['from'] ?? 'Unknown',
        'to': _currentTrip!['to'] ?? 'Unknown',
        'time': _currentTrip!['duration'] ?? '-- min',
        'type': _currentTrip!['type'] ?? 'Taxi',
        'status': 'completed',
      });
    }
    _isOnTrip = false;
    _currentTrip = null;
    notifyListeners();
  }

  // Driver rating
  void rateDriver(int rating, String? feedback) {
    // In a real app, this would send to a server
    notifyListeners();
  }

  // Favorite stops
  Set<String> _favoriteStops = {};
  Set<String> get favoriteStops => _favoriteStops;

  bool isFavoriteStop(String stop) => _favoriteStops.contains(stop);

  void toggleFavoriteStop(String stop) {
    if (_favoriteStops.contains(stop)) {
      _favoriteStops.remove(stop);
    } else {
      _favoriteStops.add(stop);
    }
    _saveFavorites();
    notifyListeners();
  }

  Future<void> _loadFavorites() async {
    final prefs = await SharedPreferences.getInstance();
    final stops = prefs.getStringList('favorite_stops') ?? [];
    _favoriteStops = stops.toSet();
    notifyListeners();
  }

  Future<void> _saveFavorites() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList('favorite_stops', _favoriteStops.toList());
  }

  // Scheduled ride reminders
  final List<Map<String, dynamic>> _reminders = [];
  List<Map<String, dynamic>> get reminders => _reminders;

  void addReminder(Map<String, dynamic> reminder) {
    _reminders.add(reminder);
    _saveReminders();
    notifyListeners();
  }

  void removeReminder(dynamic reminderOrIndex) {
    if (reminderOrIndex is int) {
      _reminders.removeAt(reminderOrIndex);
    } else if (reminderOrIndex is Map) {
      _reminders.removeWhere((r) =>
        r['route'] == reminderOrIndex['route'] &&
        r['time'] == reminderOrIndex['time'] &&
        r['period'] == reminderOrIndex['period']
      );
    }
    _saveReminders();
    notifyListeners();
  }

  void clearExpiredReminders() {
    final now = DateTime.now();
    _reminders.removeWhere((r) {
      final time = r['datetime'] as DateTime?;
      return time != null && time.isBefore(now);
    });
    _saveReminders();
    notifyListeners();
  }

  Future<void> _loadReminders() async {
    final prefs = await SharedPreferences.getInstance();
    final data = prefs.getStringList('reminders') ?? [];
    _reminders.clear();
    for (final item in data) {
      final parts = item.split('|||');
      if (parts.length >= 4) {
        _reminders.add({
          'route': parts[0],
          'time': parts[1],
          'period': parts[2],
          'datetime': DateTime.tryParse(parts[3]),
          'stops': parts.length > 4 ? parts[4] : '',
        });
      }
    }
    notifyListeners();
  }

  Future<void> _saveReminders() async {
    final prefs = await SharedPreferences.getInstance();
    final data = _reminders.map((r) {
      final dt = r['datetime'] as DateTime?;
      return '${r['route']}|||${r['time']}|||${r['period']}|||${dt?.toIso8601String() ?? ''}|||${r['stops'] ?? ''}';
    }).toList();
    await prefs.setStringList('reminders', data);
  }

  // Favorite Drivers
  List<Map<String, dynamic>> _favoriteDrivers = [];
  List<Map<String, dynamic>> get favoriteDrivers => _favoriteDrivers;

  bool isDriverFavorite(String driverId) {
    return _favoriteDrivers.any((d) => d['id'] == driverId);
  }

  void addFavoriteDriver(Map<String, dynamic> driver) {
    if (!isDriverFavorite(driver['id'])) {
      _favoriteDrivers.add(driver);
      _saveFavoriteDrivers();
      notifyListeners();
    }
  }

  void removeFavoriteDriver(String driverId) {
    _favoriteDrivers.removeWhere((d) => d['id'] == driverId);
    _saveFavoriteDrivers();
    notifyListeners();
  }

  Future<void> _loadFavoriteDrivers() async {
    final prefs = await SharedPreferences.getInstance();
    final data = prefs.getStringList('favorite_drivers') ?? [];
    _favoriteDrivers = data.map((item) {
      final parts = item.split('|||');
      return {
        'id': parts[0],
        'name': parts.length > 1 ? parts[1] : '',
        'initials': parts.length > 2 ? parts[2] : '',
        'vehicle': parts.length > 3 ? parts[3] : '',
        'rating': parts.length > 4 ? double.tryParse(parts[4]) ?? 5.0 : 5.0,
      };
    }).toList();
    notifyListeners();
  }

  Future<void> _saveFavoriteDrivers() async {
    final prefs = await SharedPreferences.getInstance();
    final data = _favoriteDrivers.map((d) {
      return '${d['id']}|||${d['name']}|||${d['initials']}|||${d['vehicle']}|||${d['rating']}';
    }).toList();
    await prefs.setStringList('favorite_drivers', data);
  }

  // Onboarding
  bool _hasCompletedOnboarding = false;
  bool get hasCompletedOnboarding => _hasCompletedOnboarding;

  void completeOnboarding() {
    _hasCompletedOnboarding = true;
    _saveOnboardingStatus();
    notifyListeners();
  }

  Future<void> _loadOnboardingStatus() async {
    final prefs = await SharedPreferences.getInstance();
    _hasCompletedOnboarding = prefs.getBool('onboarding_complete') ?? false;
    notifyListeners();
  }

  Future<void> _saveOnboardingStatus() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('onboarding_complete', _hasCompletedOnboarding);
  }

  // Language / Localization
  String _currentLanguage = 'en';
  String get currentLanguage => _currentLanguage;

  void setCurrentLanguage(String lang) {
    _currentLanguage = lang;
    _language = lang == 'dv' ? 'Dhivehi' : 'English';
    _saveLanguagePreference();
    notifyListeners();
  }

  Future<void> _loadLanguage() async {
    final prefs = await SharedPreferences.getInstance();
    _currentLanguage = prefs.getString('app_language') ?? 'en';
    _language = _currentLanguage == 'dv' ? 'Dhivehi' : 'English';
    notifyListeners();
  }

  Future<void> _saveLanguagePreference() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('app_language', _currentLanguage);
  }

  // Trip Sharing
  bool _isSharingTrip = false;
  List<String> _sharingWithContacts = [];

  bool get isSharingTrip => _isSharingTrip;
  List<String> get sharingWithContacts => _sharingWithContacts;

  void startTripSharing(List<String> contacts) {
    _isSharingTrip = true;
    _sharingWithContacts = contacts;
    notifyListeners();
  }

  void stopTripSharing() {
    _isSharingTrip = false;
    _sharingWithContacts = [];
    notifyListeners();
  }

  // User Registration & Approval System
  // Status: 'none', 'pending', 'approved', 'rejected'
  String _registrationStatus = 'none';
  Map<String, String> _registrationData = {};
  String? _rejectionReason;
  DateTime? _registrationDate;

  String get registrationStatus => _registrationStatus;
  Map<String, String> get registrationData => _registrationData;
  String? get rejectionReason => _rejectionReason;
  DateTime? get registrationDate => _registrationDate;

  bool get isRegistered => _registrationStatus != 'none';
  bool get isPendingApproval => _registrationStatus == 'pending';
  bool get isApproved => _registrationStatus == 'approved';
  bool get isRejected => _registrationStatus == 'rejected';

  void setRegistrationData({
    required String fullName,
    required String staffId,
    required String department,
    String? phone,
  }) {
    _registrationData = {
      'fullName': fullName,
      'staffId': staffId,
      'department': department,
      if (phone != null) 'phone': phone,
    };
    _registrationStatus = 'pending';
    _registrationDate = DateTime.now();
    _userName = fullName;
    _staffId = staffId;
    if (phone != null) _userPhone = phone;
    _saveUserRegistration();
    notifyListeners();
  }

  Future<void> submitRegistration({
    required String fullName,
    required String staffId,
    required String department,
    required String email,
    required String phone,
  }) async {
    _registrationData = {
      'fullName': fullName,
      'staffId': staffId,
      'department': department,
      'email': email,
      'phone': phone,
    };
    _registrationStatus = 'pending';
    _registrationDate = DateTime.now();
    _rejectionReason = null;

    // Update user profile with registration data
    _userName = fullName;
    _staffId = staffId;
    _userEmail = email;
    _userPhone = phone;
    _userInitials = fullName.split(' ').map((e) => e.isNotEmpty ? e[0] : '').join().toUpperCase();

    await _saveUserRegistration();
    notifyListeners();
  }

  void updateApprovalStatus(String status, {String? reason}) {
    _registrationStatus = status;
    if (status == 'rejected') {
      _rejectionReason = reason ?? 'Your registration was not approved.';
    }
    _saveUserRegistration();
    notifyListeners();
  }

  void resetRegistration() {
    _registrationStatus = 'none';
    _registrationData = {};
    _rejectionReason = null;
    _registrationDate = null;
    _saveUserRegistration();
    notifyListeners();
  }

  Future<void> _loadUserRegistration() async {
    final prefs = await SharedPreferences.getInstance();
    _registrationStatus = prefs.getString('registration_status') ?? 'none';
    _rejectionReason = prefs.getString('rejection_reason');

    final regDateStr = prefs.getString('registration_date');
    if (regDateStr != null) {
      _registrationDate = DateTime.tryParse(regDateStr);
    }

    _registrationData = {
      'fullName': prefs.getString('reg_fullName') ?? '',
      'staffId': prefs.getString('reg_staffId') ?? '',
      'department': prefs.getString('reg_department') ?? '',
      'email': prefs.getString('reg_email') ?? '',
      'phone': prefs.getString('reg_phone') ?? '',
    };

    // Sync with user profile
    if (_registrationData['fullName']?.isNotEmpty == true) {
      _userName = _registrationData['fullName']!;
      _userInitials = _userName.split(' ').map((e) => e.isNotEmpty ? e[0] : '').join().toUpperCase();
    }
    if (_registrationData['staffId']?.isNotEmpty == true) {
      _staffId = _registrationData['staffId']!;
    }
    if (_registrationData['email']?.isNotEmpty == true) {
      _userEmail = _registrationData['email']!;
    }
    if (_registrationData['phone']?.isNotEmpty == true) {
      _userPhone = _registrationData['phone']!;
    }

    notifyListeners();
  }

  Future<void> _saveUserRegistration() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('registration_status', _registrationStatus);

    if (_rejectionReason != null) {
      await prefs.setString('rejection_reason', _rejectionReason!);
    } else {
      await prefs.remove('rejection_reason');
    }

    if (_registrationDate != null) {
      await prefs.setString('registration_date', _registrationDate!.toIso8601String());
    }

    for (final entry in _registrationData.entries) {
      await prefs.setString('reg_${entry.key}', entry.value);
    }
  }

  // For testing - simulate admin approval (remove in production)
  void simulateApproval() {
    updateApprovalStatus('approved');
  }

  void simulateRejection(String reason) {
    updateApprovalStatus('rejected', reason: reason);
  }
}
