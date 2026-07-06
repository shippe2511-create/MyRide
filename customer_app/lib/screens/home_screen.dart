import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../config/app_config.dart';
import '../providers/app_state.dart';
import '../theme/app_theme.dart';
import '../services/supabase_service.dart';
import '../services/notification_service.dart';
import '../services/location_service.dart';
import '../widgets/onboarding_tooltip.dart';
import '../widgets/app_snackbar.dart';
import 'search_screen.dart';
import 'activity_screen.dart';
import 'inbox_screen.dart';
import 'profile_screen.dart';
import 'schedule_screen.dart';
import 'announcements_screen.dart';
import 'staff_corner_screen.dart';
import 'trip_tracking_screen.dart';
import '../utils/timezone_utils.dart';

const String _darkMapStyle = '''
[
  {"elementType": "geometry", "stylers": [{"color": "#212121"}]},
  {"elementType": "labels.icon", "stylers": [{"visibility": "off"}]},
  {"elementType": "labels.text.fill", "stylers": [{"color": "#757575"}]},
  {"elementType": "labels.text.stroke", "stylers": [{"color": "#212121"}]},
  {"featureType": "road", "elementType": "geometry.fill", "stylers": [{"color": "#2c2c2c"}]},
  {"featureType": "road.arterial", "elementType": "geometry", "stylers": [{"color": "#373737"}]},
  {"featureType": "road.highway", "elementType": "geometry", "stylers": [{"color": "#3c3c3c"}]},
  {"featureType": "water", "elementType": "geometry", "stylers": [{"color": "#000000"}]}
]
''';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with TickerProviderStateMixin {
  int _currentIndex = 0;
  late PageController _pageController;
  late AnimationController _pulseController;
  DateTime? _scheduledTime;
  String? _scheduledRideId;
  Timer? _scheduledRideTimer;
  List<Map<String, dynamic>> _announcements = [];
  List<Map<String, dynamic>> _staffPosts = [];

  // Ongoing trip data - null by default, set when trip is active
  Map<String, dynamic>? _ongoingTrip;

  // Last used locations for Book Later (persist across modal opens)
  String _lastPickupAddress = '';
  String _lastDropoffAddress = '';
  double? _lastPickupLat;
  double? _lastPickupLng;
  double? _lastDropoffLat;
  double? _lastDropoffLng;

  RealtimeChannel? _announcementsSubscription;
  RealtimeChannel? _rideStatusSubscription;
  String? _subscribedRideId;


  @override
  void initState() {
    super.initState();
    _pageController = PageController();
    _pulseController = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    )..repeat(reverse: true);
    _loadContent();
    _checkForScheduledRides();
    _initNotifications();
    _subscribeToAnnouncements();

    // Listen for account suspension
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final appState = Provider.of<AppState>(context, listen: false);
      appState.addListener(_checkSuspended);
    });
  }

  void _checkSuspended() {
    if (!mounted) return;
    final appState = Provider.of<AppState>(context, listen: false);
    if (appState.isSuspended) {
      Navigator.pushNamedAndRemoveUntil(context, '/suspended', (route) => false);
    }
  }

  void _subscribeToAnnouncements() {
    _announcementsSubscription = SupabaseService.client
        .channel('home_announcements_realtime')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'announcements',
          callback: (payload) {
            debugPrint('Home: Announcement update received');
            if (mounted) _loadContent();
          },
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'staff_corner',
          callback: (payload) {
            debugPrint('Home: Staff corner update received');
            if (mounted) _loadContent();
          },
        )
        .subscribe();
  }

  void _initNotifications() {
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final appState = Provider.of<AppState>(context, listen: false);
      if (appState.profileId != null) {
        NotificationService.subscribeToNotifications(appState.profileId!);
        debugPrint('Subscribed to general notifications for user ${appState.profileId}');

        // Subscribe to support chat notifications if user has an existing chat
        _subscribeToSupportChatNotifications(appState.profileId!);
      }
    });
  }

  Future<void> _subscribeToSupportChatNotifications(String profileId) async {
    try {
      final response = await Supabase.instance.client
          .from('support_chats')
          .select('id')
          .eq('customer_id', profileId)
          .maybeSingle();

      if (response != null && response['id'] != null) {
        final chatId = response['id'] as String;
        NotificationService.subscribeToSupportChat(chatId, profileId);
        debugPrint('Subscribed to support chat notifications for chat $chatId');
      }
    } catch (e) {
      debugPrint('Error subscribing to support chat: $e');
    }
  }

  void _checkForScheduledRides() {
    // Also check immediately on first load
    _doCheckScheduledRides();

    _scheduledRideTimer = Timer.periodic(const Duration(seconds: 2), (_) async {
      _doCheckScheduledRides();
    });
  }

  Future<void> _doCheckScheduledRides() async {
      if (!mounted) return;
      try {
        final appState = Provider.of<AppState>(context, listen: false);
        final profileId = appState.profileId;
        debugPrint('_doCheckScheduledRides: profileId=$profileId');
        if (profileId == null) return;

        final rides = await SupabaseService.getMyScheduledRides(profileId);
        debugPrint('_doCheckScheduledRides: found ${rides.length} rides');

        if (rides.isEmpty) {
          // Unsubscribe from ride status updates
          if (_subscribedRideId != null) {
            _rideStatusSubscription?.unsubscribe();
            _rideStatusSubscription = null;
            _subscribedRideId = null;
          }
          // Clear ongoing trip and scheduled time if no active rides
          if (_ongoingTrip != null || _scheduledTime != null) {
            setState(() {
              _ongoingTrip = null;
              _scheduledTime = null;
            });
          }
          return;
        }

        final ride = rides.first;
        final status = ride['status'] as String?;
        final rideId = ride['id'] as String?;
        final scheduledTimeStr = ride['scheduled_time'] as String?;

        debugPrint('Checking ride $rideId status: $status, scheduledTime: $scheduledTimeStr');

        // Restore scheduled time badge and pickup/dropoff for scheduled/pending rides
        if ((status == 'scheduled' || status == 'pending') && scheduledTimeStr != null) {
          try {
            final scheduledTime = MaldivesTimezone.parse(scheduledTimeStr)!;
            if (_scheduledTime != scheduledTime) {
              setState(() => _scheduledTime = scheduledTime);
            }
            // Also restore pickup/dropoff addresses for the schedule dialog
            final pickupName = ride['pickup_name'] as String?;
            final dropoffName = ride['dropoff_name'] as String?;
            if (pickupName != null && _lastPickupAddress.isEmpty) {
              _lastPickupAddress = pickupName;
              _lastPickupLat = (ride['pickup_lat'] as num?)?.toDouble();
              _lastPickupLng = (ride['pickup_lng'] as num?)?.toDouble();
            }
            if (dropoffName != null && _lastDropoffAddress.isEmpty) {
              _lastDropoffAddress = dropoffName;
              _lastDropoffLat = (ride['dropoff_lat'] as num?)?.toDouble();
              _lastDropoffLng = (ride['dropoff_lng'] as num?)?.toDouble();
            }
          } catch (e) {
            debugPrint('Error parsing scheduled time: $e');
          }
        }

        // Subscribe to realtime updates for this ride
        if (rideId != null && _subscribedRideId != rideId) {
          _rideStatusSubscription?.unsubscribe();
          _subscribedRideId = rideId;
          _rideStatusSubscription = SupabaseService.client
              .channel('home_ride_$rideId')
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
                  if (!mounted) return;
                  final newStatus = payload.newRecord['status'] as String?;
                  debugPrint('Realtime ride status update: $newStatus');

                  // Show notifications for status changes
                  if (newStatus == 'accepted') {
                    NotificationService.showNotification(
                      title: 'Driver Assigned',
                      body: 'Your driver is on the way to pick you up!',
                    );
                    HapticFeedback.heavyImpact();
                  } else if (newStatus == 'arrived') {
                    NotificationService.showNotification(
                      title: 'Driver Arrived',
                      body: 'Your driver has arrived at the pickup location.',
                    );
                    HapticFeedback.heavyImpact();
                  }

                  if (newStatus == 'cancelled' || newStatus == 'completed') {
                    _rideStatusSubscription?.unsubscribe();
                    _subscribedRideId = null;
                    setState(() => _ongoingTrip = null);
                  }
                },
              )
              .subscribe();

          // Subscribe to chat notifications for this active ride
          NotificationService.subscribeToChatMessages(rideId, profileId!);
        }

        // Update ongoing trip for banner display
        // Only show banner for active rides (driver assigned or in progress), not scheduled/pending
        if (status == 'accepted' || status == 'arrived' || status == 'in_progress') {
          // Extract driver info from nested driver.profile and vehicle
          final driver = ride['driver'] as Map<String, dynamic>?;
          final driverProfile = driver?['profile'] as Map<String, dynamic>?;
          final driverVehicle = driver?['vehicle'] as Map<String, dynamic>?;
          debugPrint('Driver data: $driver');
          debugPrint('Driver vehicle: $driverVehicle');
          final driverName = driverProfile?['full_name'] as String? ?? 'Driver';
          final vehicleNumber = driverVehicle?['display_name'] as String?;
          final plateNo = driverVehicle?['plate_no'] as String?;
          final driverPhone = driverProfile?['phone'] as String?;
          final driverRating = driver?['rating'];
          // Get driver photo - prefer driver's own avatar, fallback to profile avatar
          final driverPhoto = driver?['avatar_url'] as String? ?? driverProfile?['avatar_url'] as String?;
          debugPrint('Extracted - driverPhoto: $driverPhoto, plateNo: $plateNo, vehicleNumber: $vehicleNumber');

          setState(() {
            _ongoingTrip = {
              'rideId': rideId,
              'driverName': driverName,
              'driverRating': driverRating,
              'driverPhone': driverPhone,
              'driverPhoto': driverPhoto,
              'vehicleNumber': vehicleNumber,
              'plateNo': plateNo,
              'pickup': ride['pickup_name'] ?? 'Pickup',
              'dropoff': ride['dropoff_name'] ?? 'Dropoff',
              'status': status,
              'pickup_lat': ride['pickup_lat'],
              'pickup_lng': ride['pickup_lng'],
              'dropoff_lat': ride['dropoff_lat'],
              'dropoff_lng': ride['dropoff_lng'],
              'driverId': ride['driver_id'],
              'scheduled_time': ride['scheduled_time'],
            };
          });

          // Auto-navigate only once per ride, and only if we're the top route
          // Only navigate for active rides, not scheduled/pending
          if (_scheduledRideId != rideId && (status == 'accepted' || status == 'arrived' || status == 'in_progress')) {
            _scheduledRideId = rideId;

            if (mounted && ModalRoute.of(context)?.isCurrent == true) {
              HapticFeedback.heavyImpact();
              setState(() => _scheduledTime = null);

              // Navigate to trip tracking
              Navigator.push(context, MaterialPageRoute(
                builder: (_) => TripTrackingScreen(tripData: _ongoingTrip!),
              ));
            }
          }
        }
      } catch (e) {
        debugPrint('Error checking scheduled rides: $e');
      }
  }

  Future<void> _loadContent() async {
    try {
      final announcements = await SupabaseService.getAnnouncements();
      final staffPosts = await SupabaseService.getStaffCorner();
      if (mounted) {
        setState(() {
          _announcements = announcements;
          _staffPosts = staffPosts;
        });
      }
    } catch (e) {
      debugPrint('Error loading content: $e');
    }
  }

  @override
  void dispose() {
    _pageController.dispose();
    _pulseController.dispose();
    _scheduledRideTimer?.cancel();
    _announcementsSubscription?.unsubscribe();
    _rideStatusSubscription?.unsubscribe();
    super.dispose();
  }

  void _onTabTapped(int index) {
    HapticFeedback.lightImpact();
    setState(() => _currentIndex = index);
    _pageController.animateToPage(
      index,
      duration: const Duration(milliseconds: 300),
      curve: Curves.easeOutCubic,
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return OnboardingOverlay(
      steps: const [
        OnboardingStep(
          key: 'customer_welcome',
          title: 'Welcome to MyRide',
          description: 'Your free corporate transport service. Book rides to anywhere within the company network.',
          icon: Icons.local_taxi_rounded,
        ),
        OnboardingStep(
          key: 'customer_book',
          title: 'Book a Ride',
          description: 'Tap the search bar to enter your destination and request a ride instantly.',
          icon: Icons.search_rounded,
        ),
        OnboardingStep(
          key: 'customer_schedule',
          title: 'Schedule Ahead',
          description: 'Use the quick actions to schedule rides in advance or set up recurring trips.',
          icon: Icons.schedule_rounded,
        ),
        OnboardingStep(
          key: 'customer_track',
          title: 'Track Your Ride',
          description: 'Once matched with a driver, track their location in real-time until arrival.',
          icon: Icons.my_location_rounded,
        ),
      ],
      child: Scaffold(
        backgroundColor: isDark ? AppColors.bgDark : AppColors.bgLight,
        extendBody: true,
        extendBodyBehindAppBar: true,
        body: PageView(
          controller: _pageController,
          physics: const NeverScrollableScrollPhysics(),
          onPageChanged: (index) => setState(() => _currentIndex = index),
          children: [
            _buildHomeTab(context),
            const ActivityScreen(),
            const InboxScreen(),
            const ProfileScreen(),
          ],
        ),
        bottomNavigationBar: _buildBottomNav(context),
      ),
    );
  }

  Widget _buildHomeTab(BuildContext context) {
    final topPadding = MediaQuery.of(context).padding.top;
    return SingleChildScrollView(
      physics: const BouncingScrollPhysics(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(height: topPadding),
          _buildHeader(context),
            const SizedBox(height: 20),
            if (_ongoingTrip != null) _buildOngoingTripBanner(context),
            _buildSearchBar(context),
            const SizedBox(height: 24),
            _buildTransportSchedules(context),
            const SizedBox(height: 24),
            _buildAnnouncementCorner(context),
            const SizedBox(height: 24),
            _buildStaffCorner(context),
            SizedBox(height: MediaQuery.of(context).padding.bottom + 100), // Extra space for floating nav
          ],
        ),
      );
  }

  Widget _buildHeader(BuildContext context) {
    return Consumer<AppState>(
      builder: (context, appState, _) {
        return Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
          child: Row(
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  gradient: (appState.profilePhotoPath == null && appState.avatarUrl == null)
                      ? const LinearGradient(
                          colors: [AppColors.yellow, AppColors.yellow2],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        )
                      : null,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: _buildProfileAvatar(appState),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Good ${_getGreeting()}',
                      style: TextStyle(color: context.mutedColor, fontSize: 13),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      appState.userName.isNotEmpty ? appState.userName : 'Guest User',
                      style: TextStyle(
                        color: context.textColor,
                        fontSize: 20,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              GestureDetector(
                onTap: () {
                  HapticFeedback.lightImpact();
                  Navigator.pushNamed(context, '/notifications');
                },
                child: Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: context.surfaceColor,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: context.borderColor),
                  ),
                  child: Stack(
                    children: [
                      Center(
                        child: Icon(Icons.notifications_outlined, color: context.textColor, size: 22),
                      ),
                      Positioned(
                        top: 10,
                        right: 10,
                        child: Container(
                          width: 8,
                          height: 8,
                          decoration: BoxDecoration(
                            color: AppColors.error,
                            shape: BoxShape.circle,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildProfileAvatar(AppState appState) {
    // Priority: avatarUrl (cloud) > profilePhotoPath (local) > icon
    if (appState.avatarUrl != null && appState.avatarUrl!.isNotEmpty) {
      // Use avatar cache key for immediate refresh on change
      final avatarUrlWithCache = appState.avatarUrl!.contains('?')
          ? '${appState.avatarUrl!}&t=${appState.avatarCacheKey}'
          : '${appState.avatarUrl!}?t=${appState.avatarCacheKey}';
      return ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: Image.network(
          avatarUrlWithCache,
          width: 52,
          height: 52,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) {
            // Fall back to local file or icon
            if (appState.profilePhotoPath != null) {
              final file = File(appState.profilePhotoPath!);
              if (file.existsSync()) {
                return Image.file(
                  file,
                  width: 52,
                  height: 52,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Icon(Icons.person, color: Colors.black, size: 28),
                );
              }
            }
            return Icon(Icons.person, color: Colors.black, size: 28);
          },
        ),
      );
    } else if (appState.profilePhotoPath != null) {
      final file = File(appState.profilePhotoPath!);
      if (file.existsSync()) {
        return ClipRRect(
          borderRadius: BorderRadius.circular(14),
          child: Image.file(
            file,
            width: 52,
            height: 52,
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) => Icon(Icons.person, color: Colors.black, size: 28),
          ),
        );
      }
    }

    // Default icon
    return Icon(Icons.person, color: Colors.black, size: 28);
  }

  String _getGreeting() {
    final hour = DateTime.now().hour;
    if (hour < 12) return 'Morning';
    if (hour < 17) return 'Afternoon';
    return 'Evening';
  }

  Widget _buildSearchBar(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: GestureDetector(
        onTap: () {
          HapticFeedback.mediumImpact();
          Navigator.push(
            context,
            PageRouteBuilder(
              pageBuilder: (context, animation, secondaryAnimation) => const SearchScreen(),
              transitionDuration: const Duration(milliseconds: 300),
              reverseTransitionDuration: const Duration(milliseconds: 250),
              transitionsBuilder: (context, animation, secondaryAnimation, child) {
                final curve = CurvedAnimation(parent: animation, curve: Curves.easeOutCubic);
                return FadeTransition(
                  opacity: curve,
                  child: SlideTransition(
                    position: Tween<Offset>(
                      begin: const Offset(0, 0.05),
                      end: Offset.zero,
                    ).animate(curve),
                    child: child,
                  ),
                );
              },
            ),
          );
        },
        child: Hero(
          tag: 'search_bar',
          child: Material(
            color: Colors.transparent,
            child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: context.surfaceColor,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: context.borderColor),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: context.isDark ? 0.2 : 0.08),
                blurRadius: 20,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: AppColors.yellow.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(Icons.search, color: AppColors.yellow, size: 22),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Where to?',
                      style: TextStyle(
                        color: context.textColor,
                        fontSize: 17,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Search destination',
                      style: TextStyle(color: context.mutedColor, fontSize: 13),
                    ),
                  ],
                ),
              ),
              GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () {
                  HapticFeedback.lightImpact();
                  _showSchedulePicker(context);
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: _scheduledTime != null ? AppColors.yellow.withValues(alpha: 0.15) : (context.isDark ? AppColors.bgDark : const Color(0xFFE8E8E8)),
                    borderRadius: BorderRadius.circular(20),
                    border: _scheduledTime != null ? Border.all(color: AppColors.yellow.withValues(alpha: 0.5)) : null,
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(_scheduledTime != null ? Icons.event : Icons.schedule, color: AppColors.yellow, size: 14),
                      const SizedBox(width: 4),
                      Text(
                        _scheduledTime != null ? _formatScheduledTime(_scheduledTime!) : 'Later',
                        style: TextStyle(color: _scheduledTime != null ? AppColors.yellow : context.textColor, fontSize: 12, fontWeight: FontWeight.w500),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildTransportSchedules(BuildContext context) {
    final cardBg = context.surfaceColor;
    final scheduleTypes = [
      {
        'name': 'Internal Bus',
        'subtitle': 'Staff transport',
        'icon': Icons.directions_bus_rounded,
        'color': AppColors.yellow,
        'iconColor': AppColors.yellow,
        'textColor': AppColors.yellow,
        'cardColor': cardBg,
        'type': 'internal_bus',
      },
      {
        'name': 'MTCC Bus',
        'subtitle': 'Public transport',
        'icon': Icons.airport_shuttle_rounded,
        'color': const Color(0xFF4DA6FF),
        'iconColor': const Color(0xFF4DA6FF),
        'textColor': const Color(0xFF4DA6FF),
        'cardColor': cardBg,
        'type': 'mtcc_bus',
      },
      {
        'name': 'Ferry',
        'subtitle': 'Staff ferry',
        'icon': Icons.directions_boat_rounded,
        'color': const Color(0xFF00CED1),
        'iconColor': const Color(0xFF00CED1),
        'textColor': const Color(0xFF00CED1),
        'cardColor': cardBg,
        'type': 'ferry',
      },
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Transport Schedules',
                style: TextStyle(
                  color: context.textColor,
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                ),
              ),
              GestureDetector(
                onTap: () {
                  HapticFeedback.lightImpact();
                  Navigator.push(context, MaterialPageRoute(builder: (_) => const ScheduleScreen()));
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.yellow.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text('View All', style: TextStyle(color: AppColors.yellow, fontSize: 12, fontWeight: FontWeight.w600)),
                      const SizedBox(width: 2),
                      Icon(Icons.arrow_forward_ios, color: AppColors.yellow, size: 10),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: SizedBox(
            height: 120,
            child: Row(
              children: scheduleTypes.map((schedule) {
                return Expanded(
                  child: GestureDetector(
                    onTap: () {
                      HapticFeedback.mediumImpact();
                      Navigator.push(context, MaterialPageRoute(
                        builder: (_) => ScheduleScreen(initialTransportType: schedule['type'] as String),
                      ));
                    },
                    child: Container(
                      margin: const EdgeInsets.symmetric(horizontal: 4),
                      padding: const EdgeInsets.fromLTRB(8, 14, 8, 12),
                      decoration: BoxDecoration(
                        color: schedule['cardColor'] as Color,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Container(
                            width: 52,
                            height: 52,
                            decoration: BoxDecoration(
                              color: (schedule['color'] as Color).withValues(alpha: 0.2),
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: Icon(
                              schedule['icon'] as IconData,
                              color: schedule['iconColor'] as Color,
                              size: 30,
                            ),
                          ),
                          const SizedBox(height: 10),
                          Text(
                            schedule['name'] as String,
                            style: TextStyle(color: schedule['textColor'] as Color, fontSize: 12, fontWeight: FontWeight.w700),
                            textAlign: TextAlign.center,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildOngoingTripBanner(BuildContext context) {
    final status = _ongoingTrip!['status'] as String;
    final isInProgress = status == 'in_progress';
    final isArrived = status == 'arrived';
    final statusColor = isInProgress ? AppColors.success : (isArrived ? const Color(0xFF2196F3) : AppColors.yellow);

    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.0, end: 1.0),
      duration: const Duration(milliseconds: 500),
      curve: Curves.elasticOut,
      builder: (context, value, child) {
        return Transform.scale(
          scale: 0.9 + (value.clamp(0.0, 1.0) * 0.1),
          child: Opacity(opacity: value.clamp(0.0, 1.0), child: child),
        );
      },
      child: GestureDetector(
        onTap: () {
          HapticFeedback.mediumImpact();
          Navigator.push(context, MaterialPageRoute(builder: (_) => TripTrackingScreen(tripData: _ongoingTrip!)));
        },
        child: Container(
          margin: const EdgeInsets.fromLTRB(20, 0, 20, 16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(24),
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [statusColor, statusColor.withValues(alpha: 0.8)],
            ),
            boxShadow: [
              BoxShadow(color: statusColor.withValues(alpha: 0.4), blurRadius: 20, offset: const Offset(0, 10)),
              BoxShadow(color: Colors.black.withValues(alpha: 0.1), blurRadius: 10, offset: const Offset(0, 5)),
            ],
          ),
          child: Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(24),
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Colors.white.withValues(alpha: 0.15), Colors.transparent],
              ),
            ),
            child: Row(
              children: [
                // Animated icon
                Stack(
                  children: [
                    Container(
                      width: 56,
                      height: 56,
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(18),
                      ),
                      child: Icon(
                        isInProgress ? Icons.navigation_rounded : (isArrived ? Icons.person_pin_circle_rounded : Icons.local_taxi_rounded),
                        color: Colors.white,
                        size: 30,
                      ),
                    ),
                    // Pulsing dot
                    Positioned(
                      right: 0,
                      top: 0,
                      child: Container(
                        width: 16,
                        height: 16,
                        decoration: BoxDecoration(
                          color: Colors.white,
                          shape: BoxShape.circle,
                          border: Border.all(color: statusColor, width: 3),
                          boxShadow: [BoxShadow(color: Colors.white.withValues(alpha: 0.5), blurRadius: 6)],
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Status badge
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.2),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              width: 6,
                              height: 6,
                              decoration: BoxDecoration(color: Colors.white, shape: BoxShape.circle),
                            ),
                            const SizedBox(width: 6),
                            Text(
                              status == 'accepted' ? 'Driver on the way' :
                              status == 'arrived' ? 'Driver arrived' :
                              'On trip',
                              style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.3),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'To ${_ongoingTrip!['dropoff']}',
                        style: TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w800),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                // View button
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(14),
                    boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.1), blurRadius: 8, offset: const Offset(0, 2))],
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text('View', style: TextStyle(color: statusColor, fontSize: 14, fontWeight: FontWeight.w800)),
                      const SizedBox(width: 4),
                      Icon(Icons.arrow_forward_ios_rounded, color: statusColor, size: 14),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildAnnouncementCorner(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      color: AppColors.error.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Icon(Icons.campaign, color: AppColors.error, size: 18),
                  ),
                  const SizedBox(width: 10),
                  Text(
                    'Announcement Corner',
                    style: TextStyle(
                      color: context.textColor,
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
              GestureDetector(
                onTap: () {
                  HapticFeedback.lightImpact();
                  Navigator.push(context, MaterialPageRoute(builder: (_) => const AnnouncementsScreen()));
                },
                child: Text('See All', style: TextStyle(color: AppColors.yellow, fontSize: 12, fontWeight: FontWeight.w600)),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        if (_announcements.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 40),
            child: Center(
              child: Text(
                'No announcements',
                style: TextStyle(color: context.mutedColor, fontSize: 14),
              ),
            ),
          )
        else
          SizedBox(
            height: 200,
            child: ListView.builder(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  physics: const BouncingScrollPhysics(),
                  itemCount: _announcements.length,
                  itemBuilder: (context, index) {
                    final a = _announcements[index];
                    final createdAt = MaldivesTimezone.parse(a['created_at']);
                    final isNew = createdAt != null && MaldivesTimezone.now().difference(createdAt).inDays < 3;
                    return _buildAnnouncementCard(
                      context,
                      title: a['title'] ?? '',
                      subtitle: a['message'] ?? '',
                      imageUrl: a['image_url'] ?? '',
                      date: createdAt != null ? '${_monthName(createdAt.month)} ${createdAt.day}, ${createdAt.year}' : '',
                      isNew: isNew,
                    );
                  },
                ),
          ),
      ],
    );
  }

  String _monthName(int month) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[month - 1];
  }

  Widget _buildAnnouncementCard(
    BuildContext context, {
    required String title,
    required String subtitle,
    required String imageUrl,
    required String date,
    required bool isNew,
  }) {
    return GestureDetector(
      onTap: () {
        HapticFeedback.lightImpact();
        _showAnnouncementDetail(context, title: title, subtitle: subtitle, imageUrl: imageUrl, date: date);
      },
      child: Container(
        width: 280,
        margin: const EdgeInsets.only(right: 12),
        decoration: BoxDecoration(
          color: context.surfaceColor,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: context.borderColor),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              height: 90,
              decoration: BoxDecoration(
                color: AppColors.yellow.withValues(alpha: 0.2),
                borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
              ),
              child: Stack(
                children: [
                  ClipRRect(
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
                    child: Image.network(
                      imageUrl,
                      width: double.infinity,
                      height: 90,
                      fit: BoxFit.cover,
                      errorBuilder: (context, error, stackTrace) => const Center(
                        child: Icon(Icons.campaign, color: AppColors.yellow, size: 32),
                      ),
                    ),
                  ),
                  if (isNew)
                    Positioned(
                      top: 8,
                      left: 8,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: AppColors.error,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text('NEW', style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w700)),
                      ),
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w600), maxLines: 1, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 4),
                  Text(subtitle, style: TextStyle(color: context.mutedColor, fontSize: 11), maxLines: 2, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 6),
                  Text(date, style: TextStyle(color: context.mutedColor.withValues(alpha: 0.7), fontSize: 10)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStaffCorner(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      color: const Color(0xFF007AFF).withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Icon(Icons.people, color: const Color(0xFF007AFF), size: 18),
                  ),
                  const SizedBox(width: 10),
                  Text(
                    'Staff Corner',
                    style: TextStyle(
                      color: context.textColor,
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
              GestureDetector(
                onTap: () {
                  HapticFeedback.lightImpact();
                  Navigator.push(context, MaterialPageRoute(builder: (_) => const StaffCornerScreen()));
                },
                child: Text('See All', style: TextStyle(color: AppColors.yellow, fontSize: 12, fontWeight: FontWeight.w600)),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        if (_staffPosts.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 40),
            child: Center(
              child: Text(
                'No staff posts',
                style: TextStyle(color: context.mutedColor, fontSize: 14),
              ),
            ),
          )
        else
          SizedBox(
            height: 210,
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              physics: const BouncingScrollPhysics(),
              itemCount: _staffPosts.length,
              itemBuilder: (context, index) {
                final post = _staffPosts[index];
                return _buildStaffCard(
                  context,
                  title: post['title'] ?? '',
                  subtitle: post['subtitle'] ?? '',
                  imageUrl: post['image_url'] ?? '',
                  category: post['category'] ?? 'General',
                  categoryColor: _parseColor(post['category_color']),
                );
              },
            ),
        ),
      ],
    );
  }

  Color _parseColor(String? colorStr) {
    if (colorStr == null) return const Color(0xFF007AFF);
    try {
      return Color(int.parse(colorStr.replaceFirst('#', '0xFF')));
    } catch (_) {
      return const Color(0xFF007AFF);
    }
  }

  Widget _buildStaffCard(
    BuildContext context, {
    required String title,
    required String subtitle,
    required String imageUrl,
    required String category,
    required Color categoryColor,
  }) {
    return GestureDetector(
      onTap: () {
        HapticFeedback.lightImpact();
        _showStaffCornerDetail(context, title: title, subtitle: subtitle, imageUrl: imageUrl, category: category, categoryColor: categoryColor);
      },
      child: Container(
        width: 200,
        margin: const EdgeInsets.only(right: 12),
        decoration: BoxDecoration(
          color: context.surfaceColor,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: context.borderColor),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              height: 100,
              decoration: BoxDecoration(
                color: categoryColor.withValues(alpha: 0.2),
                borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
              ),
              child: Stack(
                children: [
                  ClipRRect(
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
                    child: Image.network(
                      imageUrl,
                      width: double.infinity,
                      height: 100,
                      fit: BoxFit.cover,
                      errorBuilder: (context, error, stackTrace) => Center(
                        child: Icon(Icons.people, color: categoryColor, size: 32),
                      ),
                    ),
                  ),
                  Positioned(
                    top: 8,
                    left: 8,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: categoryColor,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(category, style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w600)),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: TextStyle(color: context.textColor, fontSize: 13, fontWeight: FontWeight.w600), maxLines: 1, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 4),
                  Text(subtitle, style: TextStyle(color: context.mutedColor, fontSize: 11), maxLines: 2, overflow: TextOverflow.ellipsis),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBottomNav(BuildContext context) {
    final isDark = context.isDark;
    final navBgColor = isDark
        ? const Color(0xFF1A1A1A).withValues(alpha: 0.85)
        : Colors.white.withValues(alpha: 0.9);
    final navBorderColor = isDark
        ? Colors.white.withValues(alpha: 0.08)
        : Colors.black.withValues(alpha: 0.08);
    final bottomPadding = MediaQuery.of(context).padding.bottom;

    return Padding(
      padding: EdgeInsets.fromLTRB(24, 8, 24, bottomPadding + 12),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(40),
        child: BackdropFilter(
          filter: ui.ImageFilter.blur(sigmaX: 25, sigmaY: 25),
          child: Container(
            height: 64,
            decoration: BoxDecoration(
              color: navBgColor,
              borderRadius: BorderRadius.circular(40),
              border: Border.all(
                color: navBorderColor,
                width: 1,
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: isDark ? 0.3 : 0.1),
                  blurRadius: 20,
                  offset: const Offset(0, 10),
                  spreadRadius: -5,
                ),
              ],
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                _buildNavItem(0, Icons.home_rounded, Icons.home_outlined),
                _buildNavItem(1, Icons.history_rounded, Icons.history_outlined),
                _buildNavItem(2, Icons.send_rounded, Icons.send_outlined),
                _buildNavItem(3, Icons.person_rounded, Icons.person_outline_rounded),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildNavItem(int index, IconData activeIcon, IconData inactiveIcon) {
    final isActive = _currentIndex == index;
    final isDark = context.isDark;
    final activeColor = isDark ? Colors.white : Colors.black;
    final inactiveColor = isDark ? Colors.white.withValues(alpha: 0.5) : Colors.black.withValues(alpha: 0.4);
    final activeBgColor = isDark ? Colors.white.withValues(alpha: 0.15) : Colors.black.withValues(alpha: 0.08);

    return GestureDetector(
      onTap: () => _onTabTapped(index),
      behavior: HitTestBehavior.opaque,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOutCubic,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: isActive ? activeBgColor : Colors.transparent,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Icon(
          isActive ? activeIcon : inactiveIcon,
          color: isActive ? activeColor : inactiveColor,
          size: 26,
        ),
      ),
    );
  }

  Widget _buildQuickActionChip({required IconData icon, required String label, required VoidCallback onTap, bool isActive = false}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: isActive ? AppColors.yellow.withValues(alpha: 0.2) : context.isDark ? Colors.white.withValues(alpha: 0.06) : Colors.grey.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(12),
          border: isActive ? Border.all(color: AppColors.yellow.withValues(alpha: 0.5)) : null,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 16, color: isActive ? AppColors.yellow : context.mutedColor),
            const SizedBox(width: 6),
            Text(label, style: TextStyle(color: isActive ? AppColors.yellow : context.textColor, fontSize: 13, fontWeight: FontWeight.w500)),
          ],
        ),
      ),
    );
  }

  String _formatScheduledTime(DateTime time) {
    final now = DateTime.now();
    final isToday = time.day == now.day && time.month == now.month && time.year == now.year;
    final isTomorrow = time.day == now.day + 1 && time.month == now.month && time.year == now.year;

    final hour = time.hour.toString().padLeft(2, '0');
    final minute = time.minute.toString().padLeft(2, '0');

    if (isToday) {
      return 'Today $hour:$minute';
    } else if (isTomorrow) {
      return 'Tomorrow $hour:$minute';
    } else {
      final months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return '${time.day} ${months[time.month - 1]} $hour:$minute';
    }
  }

  String _formatScheduledTimeFromString(String? timeStr) {
    if (timeStr == null) return '';
    final time = MaldivesTimezone.parse(timeStr);
    if (time == null) return timeStr;
    return _formatScheduledTime(time);
  }

  void _showStaffCornerDetail(BuildContext context, {required String title, required String subtitle, required String imageUrl, required String category, required Color categoryColor}) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Container(
        constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.8),
        decoration: BoxDecoration(
          color: context.surfaceColor,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              height: 180,
              width: double.infinity,
              decoration: BoxDecoration(
                color: categoryColor.withValues(alpha: 0.2),
                borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
              ),
              child: Stack(
                children: [
                  ClipRRect(
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
                    child: Image.network(imageUrl, width: double.infinity, height: 180, fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => Center(child: Icon(Icons.people, color: categoryColor, size: 48))),
                  ),
                  Positioned(
                    top: 16, left: 16,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(color: categoryColor, borderRadius: BorderRadius.circular(8)),
                      child: Text(category, style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600)),
                    ),
                  ),
                  Positioned(
                    top: 16, right: 16,
                    child: GestureDetector(
                      onTap: () => Navigator.pop(ctx),
                      child: Container(
                        width: 36, height: 36,
                        decoration: BoxDecoration(color: Colors.black54, shape: BoxShape.circle),
                        child: Icon(Icons.close, color: Colors.white, size: 20),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: TextStyle(color: context.textColor, fontSize: 20, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 16),
                  Text(subtitle, style: TextStyle(color: context.textColor, fontSize: 15, height: 1.5)),
                  const SizedBox(height: 24),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: () => Navigator.pop(ctx),
                      style: ElevatedButton.styleFrom(backgroundColor: AppColors.yellow, foregroundColor: Colors.black, padding: const EdgeInsets.symmetric(vertical: 14), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
                      child: Text('Got it', style: TextStyle(fontWeight: FontWeight.w600)),
                    ),
                  ),
                  SizedBox(height: MediaQuery.of(ctx).padding.bottom),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showAnnouncementDetail(BuildContext context, {required String title, required String subtitle, required String imageUrl, required String date}) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Container(
        constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.8),
        decoration: BoxDecoration(
          color: context.surfaceColor,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              height: 180,
              width: double.infinity,
              decoration: BoxDecoration(
                color: AppColors.yellow.withValues(alpha: 0.2),
                borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
              ),
              child: Stack(
                children: [
                  ClipRRect(
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
                    child: Image.network(imageUrl, width: double.infinity, height: 180, fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => Center(child: Icon(Icons.campaign, color: AppColors.yellow, size: 48))),
                  ),
                  Positioned(
                    top: 16,
                    right: 16,
                    child: GestureDetector(
                      onTap: () => Navigator.pop(ctx),
                      child: Container(
                        width: 36, height: 36,
                        decoration: BoxDecoration(color: Colors.black54, shape: BoxShape.circle),
                        child: Icon(Icons.close, color: Colors.white, size: 20),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: TextStyle(color: context.textColor, fontSize: 20, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 8),
                  Text(date, style: TextStyle(color: context.mutedColor, fontSize: 13)),
                  const SizedBox(height: 16),
                  Text(subtitle, style: TextStyle(color: context.textColor, fontSize: 15, height: 1.5)),
                  const SizedBox(height: 24),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: () => Navigator.pop(ctx),
                      style: ElevatedButton.styleFrom(backgroundColor: AppColors.yellow, foregroundColor: Colors.black, padding: const EdgeInsets.symmetric(vertical: 14), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
                      child: Text('Got it', style: TextStyle(fontWeight: FontWeight.w600)),
                    ),
                  ),
                  SizedBox(height: MediaQuery.of(ctx).padding.bottom),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showSchedulePicker(BuildContext context) {
    DateTime selectedDate = _scheduledTime ?? DateTime.now().add(const Duration(hours: 1));
    TimeOfDay selectedTime = TimeOfDay.fromDateTime(selectedDate);
    // Pre-fill with last used locations
    String pickupAddress = _lastPickupAddress;
    String dropoffAddress = _lastDropoffAddress;
    double? pickupLat = _lastPickupLat;
    double? pickupLng = _lastPickupLng;
    double? dropoffLat = _lastDropoffLat;
    double? dropoffLng = _lastDropoffLng;

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setModalState) => Container(
          constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.9),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: context.isDark
                  ? [const Color(0xFF1E1E1E), const Color(0xFF121212)]
                  : [Colors.white, const Color(0xFFF5F5F5)],
            ),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
            boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.3), blurRadius: 20, offset: const Offset(0, -5))],
          ),
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 16, 24, 0),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Handle
                Center(
                  child: Container(
                    width: 48,
                    height: 5,
                    decoration: BoxDecoration(
                      color: context.isDark ? Colors.white24 : Colors.black12,
                      borderRadius: BorderRadius.circular(3),
                    ),
                  ),
                ),
                const SizedBox(height: 24),

                // Header with icon
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        gradient: LinearGradient(colors: [AppColors.yellow, AppColors.yellow.withValues(alpha: 0.7)]),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: const Icon(Icons.schedule_rounded, color: Colors.black, size: 22),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Schedule Ride', style: TextStyle(color: context.textColor, fontSize: 20, fontWeight: FontWeight.w800)),
                          Text('Book your ride in advance', style: TextStyle(color: context.mutedColor, fontSize: 13)),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),

                // Quick Actions Row
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _buildQuickActionChip(
                        icon: Icons.my_location,
                        label: 'Current Location',
                        onTap: () async {
                          final position = await LocationService.getCurrentLocation();
                          setModalState(() {
                            pickupAddress = 'Current Location';
                            pickupLat = position.latitude;
                            pickupLng = position.longitude;
                          });
                          _lastPickupAddress = pickupAddress;
                          _lastPickupLat = pickupLat;
                          _lastPickupLng = pickupLng;
                        },
                        isActive: pickupAddress == 'Current Location',
                      ),
                      const SizedBox(width: 8),
                      _buildQuickActionChip(
                        icon: Icons.swap_horiz,
                        label: 'Swap',
                        onTap: () {
                          HapticFeedback.mediumImpact();
                          setModalState(() {
                            final tempAddr = pickupAddress;
                            final tempLat = pickupLat;
                            final tempLng = pickupLng;
                            pickupAddress = dropoffAddress;
                            pickupLat = dropoffLat;
                            pickupLng = dropoffLng;
                            dropoffAddress = tempAddr;
                            dropoffLat = tempLat;
                            dropoffLng = tempLng;
                          });
                        },
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),

                // Route Card
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: context.isDark ? Colors.white.withValues(alpha: 0.05) : Colors.white,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: context.isDark ? Colors.white10 : Colors.black.withValues(alpha: 0.05)),
                  ),
                  child: Column(
                    children: [
                      // Pickup
                      GestureDetector(
                        onTap: () async {
                          final result = await _showLocationPicker(context, 'Select Pickup', AppColors.success);
                          if (result != null) {
                            setModalState(() {
                              final name = result['name'] as String? ?? '';
                              pickupAddress = name.isNotEmpty && name != 'Pinned Location' ? name : (result['address'] as String);
                              pickupLat = result['lat'] as double?;
                              pickupLng = result['lng'] as double?;
                            });
                            _lastPickupAddress = pickupAddress;
                            _lastPickupLat = pickupLat;
                            _lastPickupLng = pickupLng;
                          }
                        },
                        child: Row(
                          children: [
                            Container(
                              width: 40,
                              height: 40,
                              decoration: BoxDecoration(
                                gradient: pickupAddress.isNotEmpty
                                    ? LinearGradient(colors: [AppColors.success, AppColors.success.withValues(alpha: 0.7)])
                                    : null,
                                color: pickupAddress.isEmpty ? (context.isDark ? Colors.white.withValues(alpha: 0.08) : Colors.grey.withValues(alpha: 0.1)) : null,
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Icon(Icons.trip_origin_rounded, color: pickupAddress.isNotEmpty ? Colors.white : context.mutedColor, size: 18),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('PICKUP', style: TextStyle(color: context.mutedColor, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 0.5)),
                                  const SizedBox(height: 2),
                                  Text(
                                    pickupAddress.isEmpty ? 'Select pickup location' : pickupAddress,
                                    style: TextStyle(color: pickupAddress.isEmpty ? context.mutedColor : context.textColor, fontSize: 14, fontWeight: FontWeight.w600),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ],
                              ),
                            ),
                            Icon(Icons.arrow_forward_ios_rounded, color: context.mutedColor, size: 16),
                          ],
                        ),
                      ),

                      // Connector with Swap Button
                      Padding(
                        padding: const EdgeInsets.only(left: 19),
                        child: Row(
                          children: [
                            Container(
                              width: 2,
                              height: 20,
                              decoration: BoxDecoration(
                                gradient: LinearGradient(
                                  begin: Alignment.topCenter,
                                  end: Alignment.bottomCenter,
                                  colors: [AppColors.success.withValues(alpha: 0.5), AppColors.error.withValues(alpha: 0.5)],
                                ),
                                borderRadius: BorderRadius.circular(1),
                              ),
                            ),
                            const Spacer(),
                            if (pickupAddress.isNotEmpty || dropoffAddress.isNotEmpty)
                              GestureDetector(
                                onTap: () {
                                  HapticFeedback.mediumImpact();
                                  setModalState(() {
                                    final tempAddr = pickupAddress;
                                    final tempLat = pickupLat;
                                    final tempLng = pickupLng;
                                    pickupAddress = dropoffAddress;
                                    pickupLat = dropoffLat;
                                    pickupLng = dropoffLng;
                                    dropoffAddress = tempAddr;
                                    dropoffLat = tempLat;
                                    dropoffLng = tempLng;
                                  });
                                },
                                child: Container(
                                  padding: const EdgeInsets.all(6),
                                  decoration: BoxDecoration(
                                    color: AppColors.yellow.withValues(alpha: 0.15),
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Icon(Icons.swap_vert_rounded, color: AppColors.yellow, size: 16),
                                ),
                              ),
                          ],
                        ),
                      ),

                      // Dropoff
                      GestureDetector(
                        onTap: () async {
                          final result = await _showLocationPicker(context, 'Select Dropoff', AppColors.error);
                          if (result != null) {
                            debugPrint('Location picker returned: $result');
                            setModalState(() {
                              final name = result['name'] as String? ?? '';
                              dropoffAddress = name.isNotEmpty && name != 'Pinned Location' ? name : (result['address'] as String);
                              dropoffLat = result['lat'] as double?;
                              dropoffLng = result['lng'] as double?;
                              debugPrint('Set dropoffLat=$dropoffLat, dropoffLng=$dropoffLng');
                            });
                            _lastDropoffAddress = dropoffAddress;
                            _lastDropoffLat = dropoffLat;
                            _lastDropoffLng = dropoffLng;
                          }
                        },
                        child: Row(
                          children: [
                            Container(
                              width: 40,
                              height: 40,
                              decoration: BoxDecoration(
                                gradient: dropoffAddress.isNotEmpty
                                    ? LinearGradient(colors: [AppColors.error, AppColors.error.withValues(alpha: 0.7)])
                                    : null,
                                color: dropoffAddress.isEmpty ? (context.isDark ? Colors.white.withValues(alpha: 0.08) : Colors.grey.withValues(alpha: 0.1)) : null,
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Icon(Icons.location_on_rounded, color: dropoffAddress.isNotEmpty ? Colors.white : context.mutedColor, size: 18),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('DROPOFF', style: TextStyle(color: context.mutedColor, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 0.5)),
                                  const SizedBox(height: 2),
                                  Text(
                                    dropoffAddress.isEmpty ? 'Select dropoff location' : dropoffAddress,
                                    style: TextStyle(color: dropoffAddress.isEmpty ? context.mutedColor : context.textColor, fontSize: 14, fontWeight: FontWeight.w600),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ],
                              ),
                            ),
                            Icon(Icons.arrow_forward_ios_rounded, color: context.mutedColor, size: 16),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 20),

                // Date & Time Section
                Row(
                  children: [
                    // Date picker
                    Expanded(
                      child: GestureDetector(
                        onTap: () async {
                          final date = await showDatePicker(
                            context: context,
                            initialDate: selectedDate,
                            firstDate: DateTime.now(),
                            lastDate: DateTime.now().add(const Duration(days: 30)),
                            builder: (ctx, child) => Theme(
                              data: ThemeData.dark().copyWith(colorScheme: const ColorScheme.dark(primary: AppColors.yellow, onPrimary: Colors.black, surface: Color(0xFF1E1E1E))),
                              child: child!,
                            ),
                          );
                          if (date != null) {
                            setModalState(() => selectedDate = DateTime(date.year, date.month, date.day, selectedTime.hour, selectedTime.minute));
                          }
                        },
                        child: Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: context.isDark ? Colors.white.withValues(alpha: 0.06) : Colors.grey.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.all(8),
                                decoration: BoxDecoration(color: AppColors.yellow.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(10)),
                                child: Icon(Icons.calendar_month_rounded, color: AppColors.yellow, size: 18),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text('DATE', style: TextStyle(color: context.mutedColor, fontSize: 9, fontWeight: FontWeight.w700, letterSpacing: 0.5)),
                                    Text('${selectedDate.day}/${selectedDate.month}/${selectedDate.year}', style: TextStyle(color: context.textColor, fontSize: 13, fontWeight: FontWeight.w700)),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 14),
                    // Time picker
                    Expanded(
                      child: GestureDetector(
                        onTap: () async {
                          final time = await showTimePicker(
                            context: context,
                            initialTime: selectedTime,
                            builder: (ctx, child) => Theme(
                              data: ThemeData.dark().copyWith(colorScheme: const ColorScheme.dark(primary: AppColors.yellow, onPrimary: Colors.black, surface: Color(0xFF1E1E1E))),
                              child: child!,
                            ),
                          );
                          if (time != null) {
                            setModalState(() {
                              selectedTime = time;
                              selectedDate = DateTime(selectedDate.year, selectedDate.month, selectedDate.day, time.hour, time.minute);
                            });
                          }
                        },
                        child: Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: context.isDark ? Colors.white.withValues(alpha: 0.06) : Colors.grey.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.all(8),
                                decoration: BoxDecoration(color: AppColors.yellow.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(10)),
                                child: Icon(Icons.access_time_rounded, color: AppColors.yellow, size: 18),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text('TIME', style: TextStyle(color: context.mutedColor, fontSize: 9, fontWeight: FontWeight.w700, letterSpacing: 0.5)),
                                    Text(
                                      '${selectedTime.hour.toString().padLeft(2, '0')}:${selectedTime.minute.toString().padLeft(2, '0')}',
                                      style: TextStyle(color: context.textColor, fontSize: 13, fontWeight: FontWeight.w700),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 20),

                // Buttons
                Row(
                  children: [
                    if (_scheduledTime != null)
                      Expanded(
                        child: Container(
                          height: 50,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: AppColors.error.withValues(alpha: 0.5), width: 1.5),
                          ),
                          child: TextButton(
                            onPressed: () {
                              setState(() {
                                _scheduledTime = null;
                                _lastPickupAddress = '';
                                _lastDropoffAddress = '';
                                _lastPickupLat = null;
                                _lastPickupLng = null;
                                _lastDropoffLat = null;
                                _lastDropoffLng = null;
                              });
                              Navigator.pop(context);
                            },
                            style: TextButton.styleFrom(foregroundColor: AppColors.error, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(Icons.cancel_rounded, size: 20),
                                const SizedBox(width: 8),
                                Text('Cancel', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                              ],
                            ),
                          ),
                        ),
                      ),
                    if (_scheduledTime != null) const SizedBox(width: 14),
                    Expanded(
                      flex: _scheduledTime != null ? 1 : 2,
                      child: Container(
                        height: 50,
                        decoration: BoxDecoration(
                          gradient: (pickupAddress.isNotEmpty && dropoffAddress.isNotEmpty)
                              ? LinearGradient(colors: [AppColors.yellow, AppColors.yellow.withValues(alpha: 0.85)])
                              : null,
                          color: (pickupAddress.isEmpty || dropoffAddress.isEmpty) ? (context.isDark ? Colors.white12 : Colors.black12) : null,
                          borderRadius: BorderRadius.circular(16),
                          boxShadow: (pickupAddress.isNotEmpty && dropoffAddress.isNotEmpty)
                              ? [BoxShadow(color: AppColors.yellow.withValues(alpha: 0.4), blurRadius: 16, offset: const Offset(0, 6))]
                              : null,
                        ),
                        child: ElevatedButton(
                          onPressed: (pickupAddress.isNotEmpty && dropoffAddress.isNotEmpty)
                              ? () async {
                                  final minTime = DateTime.now().add(const Duration(minutes: 5));
                                  if (selectedDate.isBefore(minTime)) {
                                    AppSnackbar.warning(context, 'Select a time at least 5 minutes from now');
                                    return;
                                  }
                                  Navigator.pop(context);
                                  HapticFeedback.mediumImpact();
                                  try {
                                    final appState = Provider.of<AppState>(context, listen: false);
                                    final scheduledUtc = selectedDate.toUtc();
                                    // Use GPS location if pickup not set
                                    double finalPickupLat = pickupLat ?? 4.1755;
                                    double finalPickupLng = pickupLng ?? 73.5093;
                                    if (pickupLat == null) {
                                      final gpsLoc = await LocationService.getCurrentLocation();
                                      finalPickupLat = gpsLoc.latitude;
                                      finalPickupLng = gpsLoc.longitude;
                                    }
                                    await SupabaseService.createRide(
                                      pickupName: pickupAddress, dropoffName: dropoffAddress,
                                      pickupLat: finalPickupLat, pickupLng: finalPickupLng,
                                      dropoffLat: dropoffLat ?? 4.1918, dropoffLng: dropoffLng ?? 73.5290,
                                      scheduledTime: scheduledUtc, customerId: appState.profileId,
                                    );
                                    setState(() => _scheduledTime = selectedDate);
                                    if (mounted) {
                                      AppSnackbar.success(context, 'Ride scheduled for ${_formatScheduledTime(selectedDate)}');
                                    }
                                  } catch (e) {
                                    if (mounted) AppSnackbar.error(context, 'Failed to schedule');
                                  }
                                }
                              : null,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.transparent, foregroundColor: Colors.black, shadowColor: Colors.transparent,
                            disabledBackgroundColor: Colors.transparent, disabledForegroundColor: context.mutedColor,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                          ),
                          child: Text('Confirm', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                        ),
                      ),
                    ),
                  ],
                ),
                SizedBox(height: MediaQuery.of(context).padding.bottom + 8),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<LatLng> _getCurrentLocation() async {
    final loc = await LocationService.getCurrentLocation();
    return LatLng(loc.latitude, loc.longitude);
  }

  Future<Map<String, dynamic>?> _showLocationPicker(BuildContext context, String title, Color accentColor) async {
    LatLng selectedLocation = await _getCurrentLocation();
    GoogleMapController? googleMapController;
    final searchController = TextEditingController();
    String addressText = '';
    String selectedName = '';
    bool showSearchResults = false;
    bool isSearching = false;
    List<Map<String, dynamic>> searchResults = [];
    LatLng? userLocation = selectedLocation;
    Timer? debounceTimer;
    MapType mapType = MapType.normal;

    Future<void> searchPlaces(String query, void Function(void Function()) setModalState) async {
      if (query.length < 2) {
        setModalState(() {
          showSearchResults = false;
          searchResults = [];
          isSearching = false;
        });
        return;
      }

      setModalState(() {
        isSearching = true;
        showSearchResults = true;
      });

      try {
        // Search admin-defined locations first
        List<Map<String, dynamic>> adminLocations = [];
        try {
          final locations = await SupabaseService.getLocations();
          adminLocations = locations
              .where((loc) =>
                (loc['name'] as String? ?? '').toLowerCase().contains(query.toLowerCase()) ||
                (loc['address'] as String? ?? '').toLowerCase().contains(query.toLowerCase()))
              .map((loc) {
                // Parse lat/lng - handle both string and num types from database
                double? lat;
                double? lng;
                if (loc['lat'] != null) {
                  lat = loc['lat'] is num ? (loc['lat'] as num).toDouble() : double.tryParse(loc['lat'].toString());
                }
                if (loc['lng'] != null) {
                  lng = loc['lng'] is num ? (loc['lng'] as num).toDouble() : double.tryParse(loc['lng'].toString());
                }
                debugPrint('Admin location ${loc['name']}: lat=$lat, lng=$lng');
                return {
                  'name': loc['name'] ?? '',
                  'address': loc['address'] ?? 'Saved Location',
                  'icon': Icons.star_rounded,
                  'lat': lat,
                  'lng': lng,
                  'isAdminLocation': true,
                };
              })
              .toList();
        } catch (e) {
          debugPrint('Admin locations search error: $e');
        }

        // Then search Google Places
        final url = Uri.parse(
          'https://maps.googleapis.com/maps/api/place/autocomplete/json'
          '?input=${Uri.encodeComponent(query)}'
          '&location=${userLocation?.latitude ?? 4.1755},${userLocation?.longitude ?? 73.5093}'
          '&radius=50000'
          '&components=country:mv'
          '&key=${AppConfig.googleMapsApiKey}'
        );

        final response = await http.get(url);
        if (response.statusCode == 200) {
          final data = json.decode(response.body);
          if (data['status'] == 'OK') {
            final predictions = data['predictions'] as List;
            final googleResults = predictions.map((p) => {
              'place_id': p['place_id'],
              'name': p['structured_formatting']?['main_text'] ?? p['description'],
              'address': p['description'],
              'icon': Icons.location_on,
            }).toList();
            setModalState(() {
              // Admin locations first, then Google results
              searchResults = [...adminLocations, ...googleResults];
              isSearching = false;
            });
          } else {
            setModalState(() {
              searchResults = adminLocations.isNotEmpty ? adminLocations : [];
              isSearching = false;
            });
          }
        } else {
          setModalState(() {
            searchResults = adminLocations.isNotEmpty ? adminLocations : [];
            isSearching = false;
          });
        }
      } catch (e) {
        debugPrint('Places search error: $e');
        setModalState(() {
          isSearching = false;
        });
      }
    }

    Future<LatLng?> getPlaceDetails(String placeId) async {
      try {
        final url = Uri.parse(
          'https://maps.googleapis.com/maps/api/place/details/json'
          '?place_id=$placeId'
          '&fields=geometry'
          '&key=${AppConfig.googleMapsApiKey}'
        );

        final response = await http.get(url);
        debugPrint('Place details response for $placeId: ${response.body}');
        if (response.statusCode == 200) {
          final data = json.decode(response.body);
          if (data['status'] == 'OK') {
            final location = data['result']['geometry']['location'];
            debugPrint('Place coordinates: lat=${location['lat']}, lng=${location['lng']}');
            return LatLng(location['lat'], location['lng']);
          }
        }
      } catch (e) {
        debugPrint('Place details error: $e');
      }
      return null;
    }

    Future<String> reverseGeocode(LatLng point) async {
      try {
        final url = Uri.parse(
          'https://maps.googleapis.com/maps/api/geocode/json'
          '?latlng=${point.latitude},${point.longitude}'
          '&key=${AppConfig.googleMapsApiKey}'
        );

        final response = await http.get(url);
        if (response.statusCode == 200) {
          final data = json.decode(response.body);
          if (data['status'] == 'OK' && (data['results'] as List).isNotEmpty) {
            return data['results'][0]['formatted_address'] ?? 'Pinned Location';
          }
        }
      } catch (e) {
        debugPrint('Reverse geocode error: $e');
      }
      return 'Pinned Location';
    }

    return await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setModalState) {
          void performSearch(String query) {
            debounceTimer?.cancel();
            if (query.isEmpty) {
              setModalState(() {
                showSearchResults = false;
                searchResults = [];
                isSearching = false;
              });
            } else {
              debounceTimer = Timer(const Duration(milliseconds: 400), () {
                searchPlaces(query, setModalState);
              });
            }
          }

          return Container(
            height: MediaQuery.of(context).size.height * 0.92,
            decoration: BoxDecoration(
              color: context.isDark ? AppColors.bgDark : Colors.white,
              borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
            ),
            child: Column(
              children: [
                // Header
                Container(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                  decoration: BoxDecoration(
                    color: context.surfaceColor,
                    borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
                  ),
                  child: Column(
                    children: [
                      Container(
                        width: 40,
                        height: 4,
                        decoration: BoxDecoration(color: context.borderColor, borderRadius: BorderRadius.circular(2)),
                      ),
                      const SizedBox(height: 16),
                      Row(
                        children: [
                          GestureDetector(
                            onTap: () => Navigator.pop(context),
                            child: Container(
                              width: 40,
                              height: 40,
                              decoration: BoxDecoration(
                                color: context.isDark ? AppColors.bgDark : Colors.white,
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Icon(Icons.arrow_back, color: context.textColor, size: 20),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              title,
                              style: TextStyle(color: context.textColor, fontSize: 18, fontWeight: FontWeight.w700),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      // Search Bar
                      Container(
                        decoration: BoxDecoration(
                          color: context.isDark ? AppColors.bgDark : Colors.white,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: context.borderColor),
                        ),
                        child: Row(
                          children: [
                            Padding(
                              padding: const EdgeInsets.only(left: 14),
                              child: Icon(Icons.search, color: accentColor, size: 22),
                            ),
                            Expanded(
                              child: TextField(
                                controller: searchController,
                                style: TextStyle(color: context.textColor, fontSize: 15),
                                decoration: InputDecoration(
                                  hintText: 'Search by name or address...',
                                  hintStyle: TextStyle(color: context.mutedColor, fontSize: 15),
                                  border: InputBorder.none,
                                  contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
                                ),
                                onChanged: performSearch,
                              ),
                            ),
                            if (searchController.text.isNotEmpty)
                              GestureDetector(
                                onTap: () {
                                  searchController.clear();
                                  performSearch('');
                                },
                                child: Padding(
                                  padding: const EdgeInsets.only(right: 12),
                                  child: Icon(Icons.close, color: context.mutedColor, size: 20),
                                ),
                              ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],
                  ),
                ),

                // Content
                Expanded(
                  child: showSearchResults
                      ? // Search Results
                        Container(
                          color: context.surfaceColor,
                          child: isSearching
                              ? Center(
                                  child: Column(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      CircularProgressIndicator(color: accentColor),
                                      const SizedBox(height: 12),
                                      Text('Searching...', style: TextStyle(color: context.mutedColor, fontSize: 16)),
                                    ],
                                  ),
                                )
                              : searchResults.isEmpty
                              ? Center(
                                  child: Column(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Icon(Icons.search_off, color: context.mutedColor, size: 48),
                                      const SizedBox(height: 12),
                                      Text('No results found', style: TextStyle(color: context.mutedColor, fontSize: 16)),
                                    ],
                                  ),
                                )
                              : ListView.builder(
                                  padding: const EdgeInsets.symmetric(horizontal: 16),
                                  itemCount: searchResults.length,
                                  itemBuilder: (context, index) {
                                    final place = searchResults[index];
                                    final isSelected = addressText == place['address'];
                                    return GestureDetector(
                                      onTap: () async {
                                        final placeId = place['place_id'] as String?;
                                        final isAdminLocation = place['isAdminLocation'] == true;
                                        debugPrint('Place selected: ${place['name']}, placeId: $placeId, isAdminLocation: $isAdminLocation');

                                        // Admin locations already have coordinates
                                        if (isAdminLocation && place['lat'] != null && place['lng'] != null) {
                                          final lat = place['lat'] as double;
                                          final lng = place['lng'] as double;
                                          debugPrint('Using admin location coords: lat=$lat, lng=$lng');
                                          setModalState(() {
                                            selectedLocation = LatLng(lat, lng);
                                            addressText = place['address'] as String? ?? place['name'] as String;
                                            selectedName = place['name'] as String;
                                            showSearchResults = false;
                                            isSearching = false;
                                            searchController.text = place['name'] as String;
                                          });
                                          googleMapController?.animateCamera(CameraUpdate.newLatLngZoom(selectedLocation, 16));
                                        } else if (placeId != null) {
                                          setModalState(() => isSearching = true);
                                          final coords = await getPlaceDetails(placeId);
                                          debugPrint('Got coords for ${place['name']}: $coords');
                                          if (coords != null) {
                                            setModalState(() {
                                              selectedLocation = coords;
                                              addressText = place['address'] as String;
                                              selectedName = place['name'] as String;
                                              showSearchResults = false;
                                              isSearching = false;
                                              searchController.text = place['name'] as String;
                                            });
                                            debugPrint('selectedLocation updated to: ${selectedLocation.latitude}, ${selectedLocation.longitude}');
                                            googleMapController?.animateCamera(CameraUpdate.newLatLngZoom(selectedLocation, 16));
                                          } else {
                                            debugPrint('coords is null, keeping old selectedLocation');
                                            setModalState(() => isSearching = false);
                                          }
                                        }
                                      },
                                      child: Container(
                                        margin: const EdgeInsets.only(bottom: 8),
                                        padding: const EdgeInsets.all(14),
                                        decoration: BoxDecoration(
                                          color: isSelected ? accentColor.withValues(alpha: 0.15) : (context.isDark ? AppColors.bgDark : Colors.white),
                                          borderRadius: BorderRadius.circular(14),
                                          border: Border.all(color: isSelected ? accentColor : context.borderColor),
                                        ),
                                        child: Row(
                                          children: [
                                            Container(
                                              width: 44,
                                              height: 44,
                                              decoration: BoxDecoration(
                                                color: accentColor.withValues(alpha: 0.15),
                                                borderRadius: BorderRadius.circular(12),
                                              ),
                                              child: Icon(place['icon'] as IconData, color: accentColor, size: 22),
                                            ),
                                            const SizedBox(width: 14),
                                            Expanded(
                                              child: Column(
                                                crossAxisAlignment: CrossAxisAlignment.start,
                                                children: [
                                                  Text(
                                                    place['name'] as String,
                                                    style: TextStyle(color: context.textColor, fontSize: 15, fontWeight: FontWeight.w600),
                                                  ),
                                                  const SizedBox(height: 2),
                                                  Text(
                                                    place['address'] as String,
                                                    style: TextStyle(color: context.mutedColor, fontSize: 13),
                                                  ),
                                                ],
                                              ),
                                            ),
                                            if (isSelected)
                                              Icon(Icons.check_circle, color: accentColor, size: 22),
                                          ],
                                        ),
                                      ),
                                    );
                                  },
                                ),
                        )
                      : // Map View
                        Stack(
                          children: [
                            GoogleMap(
                              initialCameraPosition: CameraPosition(target: selectedLocation, zoom: 14),
                              mapType: mapType,
                              onMapCreated: (controller) => googleMapController = controller,
                              onTap: (point) async {
                                setModalState(() {
                                  selectedLocation = point;
                                  addressText = 'Loading...';
                                  selectedName = 'Pinned Location';
                                  searchController.text = '';
                                });
                                final address = await reverseGeocode(point);
                                setModalState(() {
                                  addressText = address;
                                  selectedName = 'Pinned Location';
                                });
                              },
                              markers: {
                                if (userLocation != null)
                                  Marker(
                                    markerId: const MarkerId('user'),
                                    position: userLocation!,
                                    icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueAzure),
                                  ),
                                Marker(
                                  markerId: const MarkerId('selected'),
                                  position: selectedLocation,
                                  icon: BitmapDescriptor.defaultMarkerWithHue(
                                    accentColor == AppColors.success ? BitmapDescriptor.hueGreen : BitmapDescriptor.hueRed,
                                  ),
                                ),
                              },
                              myLocationEnabled: true,
                              myLocationButtonEnabled: false,
                              zoomControlsEnabled: false,
                              mapToolbarEnabled: false,
                              style: mapType == MapType.normal && context.isDark ? _darkMapStyle : null,
                            ),
                            // Map type button (normal/satellite/terrain)
                            Positioned(
                              top: 16,
                              right: 16,
                              child: GestureDetector(
                                onTap: () => setModalState(() {
                                  if (mapType == MapType.normal) {
                                    mapType = MapType.satellite;
                                  } else if (mapType == MapType.satellite) {
                                    mapType = MapType.terrain;
                                  } else {
                                    mapType = MapType.normal;
                                  }
                                }),
                                child: Container(
                                  width: 44,
                                  height: 44,
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFFFD60A),
                                    borderRadius: BorderRadius.circular(12),
                                    boxShadow: [
                                      BoxShadow(
                                        color: Colors.black.withValues(alpha: 0.2),
                                        blurRadius: 8,
                                        offset: const Offset(0, 2),
                                      ),
                                    ],
                                  ),
                                  child: Icon(
                                    mapType == MapType.satellite ? Icons.satellite_alt :
                                    mapType == MapType.terrain ? Icons.terrain : Icons.map,
                                    color: Colors.black,
                                    size: 24,
                                  ),
                                ),
                              ),
                            ),
                            // Map Controls
                            Positioned(
                              bottom: 20,
                              right: 16,
                              child: Column(
                                children: [
                                  GestureDetector(
                                    onTap: () => googleMapController?.animateCamera(CameraUpdate.zoomIn()),
                                    child: Container(
                                      width: 48,
                                      height: 48,
                                      decoration: BoxDecoration(
                                        color: context.surfaceColor,
                                        borderRadius: BorderRadius.circular(14),
                                        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.4), blurRadius: 10)],
                                      ),
                                      child: Icon(Icons.add, color: context.textColor, size: 24),
                                    ),
                                  ),
                                  const SizedBox(height: 10),
                                  GestureDetector(
                                    onTap: () => googleMapController?.animateCamera(CameraUpdate.zoomOut()),
                                    child: Container(
                                      width: 48,
                                      height: 48,
                                      decoration: BoxDecoration(
                                        color: context.surfaceColor,
                                        borderRadius: BorderRadius.circular(14),
                                        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.4), blurRadius: 10)],
                                      ),
                                      child: Icon(Icons.remove, color: context.textColor, size: 24),
                                    ),
                                  ),
                                  const SizedBox(height: 10),
                                  GestureDetector(
                                    onTap: () async {
                                      final currentPos = await _getCurrentLocation();
                                      setModalState(() {
                                        userLocation = currentPos;
                                        selectedLocation = currentPos;
                                      });
                                      googleMapController?.animateCamera(CameraUpdate.newLatLngZoom(currentPos, 16));
                                    },
                                    child: Container(
                                      width: 48,
                                      height: 48,
                                      decoration: BoxDecoration(
                                        color: context.surfaceColor,
                                        borderRadius: BorderRadius.circular(14),
                                        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.4), blurRadius: 10)],
                                      ),
                                      child: Icon(Icons.my_location, color: accentColor, size: 22),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            // Hint overlay
                            if (addressText.isEmpty)
                              Positioned(
                                top: 20,
                                left: 16,
                                right: 16,
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                                  decoration: BoxDecoration(
                                    color: context.surfaceColor.withValues(alpha: 0.95),
                                    borderRadius: BorderRadius.circular(12),
                                    boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.3), blurRadius: 10)],
                                  ),
                                  child: Row(
                                    children: [
                                      Icon(Icons.touch_app, color: accentColor, size: 20),
                                      const SizedBox(width: 10),
                                      Expanded(
                                        child: Text(
                                          'Tap on the map to pin location or search above',
                                          style: TextStyle(color: context.textColor, fontSize: 13),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                          ],
                        ),
                ),

                // Bottom Panel
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: context.surfaceColor,
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
                    boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.3), blurRadius: 15, offset: const Offset(0, -5))],
                  ),
                  child: Column(
                    children: [
                      if (addressText.isNotEmpty)
                        Container(
                          width: double.infinity,
                          margin: const EdgeInsets.only(bottom: 14),
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: accentColor.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: accentColor.withValues(alpha: 0.3)),
                          ),
                          child: Row(
                            children: [
                              Container(
                                width: 40,
                                height: 40,
                                decoration: BoxDecoration(
                                  color: accentColor,
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Icon(Icons.check, color: Colors.white, size: 22),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      selectedName.isEmpty ? 'Selected Location' : selectedName,
                                      style: TextStyle(color: context.textColor, fontSize: 15, fontWeight: FontWeight.w600),
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      addressText,
                                      style: TextStyle(color: context.mutedColor, fontSize: 12),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: addressText.isNotEmpty
                              ? () => Navigator.pop(context, {'address': addressText, 'name': selectedName, 'lat': selectedLocation.latitude, 'lng': selectedLocation.longitude})
                              : null,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: accentColor,
                            foregroundColor: Colors.white,
                            disabledBackgroundColor: context.borderColor,
                            disabledForegroundColor: context.mutedColor,
                            padding: const EdgeInsets.symmetric(vertical: 16),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                            elevation: 0,
                          ),
                          child: Text(
                            addressText.isEmpty ? 'Select a location' : 'Confirm Location',
                            style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
                          ),
                        ),
                      ),
                      SizedBox(height: MediaQuery.of(context).padding.bottom),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

}
