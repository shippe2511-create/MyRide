import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../providers/app_state.dart';
import '../theme/app_theme.dart';
import '../services/supabase_service.dart';
import '../services/notification_service.dart';
import '../services/location_service.dart';
import 'search_screen.dart';
import 'activity_screen.dart';
import 'inbox_screen.dart';
import 'profile_screen.dart';
import 'schedule_screen.dart';
import 'announcements_screen.dart';
import 'staff_corner_screen.dart';
import 'trip_tracking_screen.dart';

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
            _loadContent();
          },
        )
        .subscribe();
  }

  void _initNotifications() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final appState = Provider.of<AppState>(context, listen: false);
      if (appState.profileId != null) {
        NotificationService.subscribeToNotifications(appState.profileId!);
        debugPrint('Subscribed to general notifications for user ${appState.profileId}');
      }
    });
  }

  void _checkForScheduledRides() {
    _scheduledRideTimer = Timer.periodic(const Duration(seconds: 3), (_) async {
      if (!mounted) return;
      try {
        final appState = Provider.of<AppState>(context, listen: false);
        final rides = await SupabaseService.getMyScheduledRides(appState.profileId);

        if (rides.isEmpty) {
          // Clear ongoing trip if no active rides
          if (_ongoingTrip != null) {
            setState(() => _ongoingTrip = null);
          }
          return;
        }

        final ride = rides.first;
        final status = ride['status'] as String?;
        final rideId = ride['id'] as String?;

        debugPrint('Checking ride $rideId status: $status');

        // Update ongoing trip for banner display
        if (status == 'accepted' || status == 'arrived' || status == 'in_progress') {
          setState(() {
            _ongoingTrip = {
              'rideId': rideId,
              'driverName': 'Driver',
              'pickup': ride['pickup_name'] ?? 'Pickup',
              'dropoff': ride['dropoff_name'] ?? 'Dropoff',
              'status': status,
            };
          });

          // Auto-navigate only once per ride
          if (_scheduledRideId != rideId) {
            _scheduledRideId = rideId;

            if (mounted) {
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
    });
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

    return Scaffold(
      backgroundColor: isDark ? AppColors.bgDark : AppColors.bgLight,
      extendBody: true,
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
    );
  }

  Widget _buildHomeTab(BuildContext context) {
    return SafeArea(
      child: SingleChildScrollView(
        physics: const BouncingScrollPhysics(),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildHeader(context),
            const SizedBox(height: 20),
            if (_ongoingTrip != null) _buildOngoingTripBanner(context),
            _buildSearchBar(context),
            const SizedBox(height: 16),
            _buildQuickActions(context),
            const SizedBox(height: 24),
            _buildTransportSchedules(context),
            const SizedBox(height: 24),
            _buildAnnouncementCorner(context),
            const SizedBox(height: 24),
            _buildStaffCorner(context),
            const SizedBox(height: 100),
          ],
        ),
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
                  border: (appState.profilePhotoPath != null || appState.avatarUrl != null)
                      ? Border.all(color: AppColors.yellow, width: 2)
                      : null,
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.yellow.withValues(alpha: 0.3),
                      blurRadius: 12,
                      offset: const Offset(0, 4),
                    ),
                  ],
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
    // Try local file first
    if (appState.profilePhotoPath != null) {
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

    // Fallback to cloud URL
    if (appState.avatarUrl != null) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: Image.network(
          appState.avatarUrl!,
          width: 52,
          height: 52,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => Icon(Icons.person, color: Colors.black, size: 28),
        ),
      );
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

  Widget _buildQuickActions(BuildContext context) {
    final actions = [
      {
        'icon': Icons.local_taxi_rounded,
        'label': 'Book Now',
        'color': AppColors.yellow,
        'onTap': () {
          HapticFeedback.mediumImpact();
          Navigator.push(context, MaterialPageRoute(builder: (_) => const SearchScreen()));
        },
      },
      {
        'icon': Icons.schedule_rounded,
        'label': 'Schedule',
        'color': const Color(0xFF4DA6FF),
        'onTap': () {
          HapticFeedback.mediumImpact();
          _showSchedulePicker(context);
        },
      },
      {
        'icon': Icons.repeat_rounded,
        'label': 'Recurring',
        'color': const Color(0xFF34C759),
        'onTap': () {
          HapticFeedback.mediumImpact();
          Navigator.pushNamed(context, '/recurring-rides');
        },
      },
      {
        'icon': Icons.warning_rounded,
        'label': 'SOS',
        'color': AppColors.error,
        'onTap': () {
          HapticFeedback.heavyImpact();
          Navigator.pushNamed(context, '/sos');
        },
      },
    ];

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: actions.map((action) {
          return Expanded(
            child: GestureDetector(
              onTap: action['onTap'] as VoidCallback,
              child: Container(
                margin: const EdgeInsets.symmetric(horizontal: 4),
                padding: const EdgeInsets.symmetric(vertical: 12),
                decoration: BoxDecoration(
                  color: (action['color'] as Color).withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: (action['color'] as Color).withValues(alpha: 0.2),
                  ),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      action['icon'] as IconData,
                      color: action['color'] as Color,
                      size: 24,
                    ),
                    const SizedBox(height: 6),
                    Text(
                      action['label'] as String,
                      style: TextStyle(
                        color: context.textColor,
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        }).toList(),
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
                        border: Border.all(color: (schedule['color'] as Color).withValues(alpha: 0.4), width: 2),
                        boxShadow: [
                          BoxShadow(
                            color: (schedule['color'] as Color).withValues(alpha: 0.15),
                            blurRadius: 12,
                            offset: const Offset(0, 4),
                          ),
                        ],
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
        SizedBox(
          height: 200,
          child: _announcements.isEmpty
              ? ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  physics: const BouncingScrollPhysics(),
                  children: [
                    _buildAnnouncementCard(context, title: 'Holiday Schedule Update', subtitle: 'Check the updated ferry timings for the upcoming public holiday.', imageUrl: '', date: 'Jun 3, 2026', isNew: true),
                    _buildAnnouncementCard(context, title: 'New Route Added', subtitle: 'We have added a new express route to Velana International Airport.', imageUrl: '', date: 'Jun 1, 2026', isNew: false),
                  ],
                )
              : ListView.builder(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  physics: const BouncingScrollPhysics(),
                  itemCount: _announcements.length,
                  itemBuilder: (context, index) {
                    final a = _announcements[index];
                    final createdAt = DateTime.tryParse(a['created_at'] ?? '');
                    final isNew = createdAt != null && DateTime.now().difference(createdAt).inDays < 3;
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
      onTap: () => HapticFeedback.lightImpact(),
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
        SizedBox(
          height: 210,
          child: _staffPosts.isEmpty
              ? ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  physics: const BouncingScrollPhysics(),
                  children: [
                    _buildStaffCard(context, title: 'Employee of the Month', subtitle: 'Congratulations to Ahmed for his outstanding performance!', imageUrl: '', category: 'Recognition', categoryColor: AppColors.success),
                    _buildStaffCard(context, title: 'Team Building Event', subtitle: 'Join us for the annual team building event.', imageUrl: '', category: 'Events', categoryColor: AppColors.yellow),
                  ],
                )
              : ListView.builder(
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
      onTap: () => HapticFeedback.lightImpact(),
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

    return Container(
      color: Colors.transparent,
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 20),
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

  String _formatScheduledTime(DateTime time) {
    final now = DateTime.now();
    final isToday = time.day == now.day && time.month == now.month && time.year == now.year;
    final isTomorrow = time.day == now.day + 1 && time.month == now.month && time.year == now.year;

    final hour = time.hour > 12 ? time.hour - 12 : time.hour;
    final period = time.hour >= 12 ? 'PM' : 'AM';
    final minute = time.minute.toString().padLeft(2, '0');

    if (isToday) {
      return 'Today $hour:$minute $period';
    } else if (isTomorrow) {
      return 'Tomorrow $hour:$minute $period';
    } else {
      final months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return '${time.day} ${months[time.month - 1]} $hour:$minute $period';
    }
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
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        gradient: LinearGradient(colors: [AppColors.yellow, AppColors.yellow.withValues(alpha: 0.7)]),
                        borderRadius: BorderRadius.circular(18),
                        boxShadow: [BoxShadow(color: AppColors.yellow.withValues(alpha: 0.4), blurRadius: 16, offset: const Offset(0, 6))],
                      ),
                      child: const Icon(Icons.schedule_rounded, color: Colors.black, size: 28),
                    ),
                    const SizedBox(width: 18),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Schedule Ride', style: TextStyle(color: context.textColor, fontSize: 26, fontWeight: FontWeight.w800, letterSpacing: -0.5)),
                          const SizedBox(height: 4),
                          Text('Book your ride in advance', style: TextStyle(color: context.mutedColor, fontSize: 15)),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 32),

                // Route Card
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: context.isDark ? Colors.white.withValues(alpha: 0.05) : Colors.white,
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(color: context.isDark ? Colors.white10 : Colors.black.withValues(alpha: 0.05)),
                    boxShadow: context.isDark ? null : [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 20, offset: const Offset(0, 4))],
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
                              width: 48,
                              height: 48,
                              decoration: BoxDecoration(
                                gradient: pickupAddress.isNotEmpty
                                    ? LinearGradient(colors: [AppColors.success, AppColors.success.withValues(alpha: 0.7)])
                                    : null,
                                color: pickupAddress.isEmpty ? (context.isDark ? Colors.white.withValues(alpha: 0.08) : Colors.grey.withValues(alpha: 0.1)) : null,
                                borderRadius: BorderRadius.circular(14),
                              ),
                              child: Icon(Icons.trip_origin_rounded, color: pickupAddress.isNotEmpty ? Colors.white : context.mutedColor, size: 22),
                            ),
                            const SizedBox(width: 16),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('PICKUP', style: TextStyle(color: context.mutedColor, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1)),
                                  const SizedBox(height: 4),
                                  Text(
                                    pickupAddress.isEmpty ? 'Select pickup location' : pickupAddress,
                                    style: TextStyle(color: pickupAddress.isEmpty ? context.mutedColor : context.textColor, fontSize: 16, fontWeight: FontWeight.w600),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ],
                              ),
                            ),
                            Icon(pickupAddress.isNotEmpty ? Icons.check_circle_rounded : Icons.arrow_forward_ios_rounded,
                                color: pickupAddress.isNotEmpty ? AppColors.success : context.mutedColor, size: 20),
                          ],
                        ),
                      ),

                      // Connector
                      Padding(
                        padding: const EdgeInsets.only(left: 23),
                        child: Row(
                          children: [
                            Container(
                              width: 2,
                              height: 30,
                              decoration: BoxDecoration(
                                gradient: LinearGradient(
                                  begin: Alignment.topCenter,
                                  end: Alignment.bottomCenter,
                                  colors: [AppColors.success.withValues(alpha: 0.5), AppColors.error.withValues(alpha: 0.5)],
                                ),
                                borderRadius: BorderRadius.circular(1),
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
                            setModalState(() {
                              final name = result['name'] as String? ?? '';
                              dropoffAddress = name.isNotEmpty && name != 'Pinned Location' ? name : (result['address'] as String);
                              dropoffLat = result['lat'] as double?;
                              dropoffLng = result['lng'] as double?;
                            });
                            _lastDropoffAddress = dropoffAddress;
                            _lastDropoffLat = dropoffLat;
                            _lastDropoffLng = dropoffLng;
                          }
                        },
                        child: Row(
                          children: [
                            Container(
                              width: 48,
                              height: 48,
                              decoration: BoxDecoration(
                                gradient: dropoffAddress.isNotEmpty
                                    ? LinearGradient(colors: [AppColors.error, AppColors.error.withValues(alpha: 0.7)])
                                    : null,
                                color: dropoffAddress.isEmpty ? (context.isDark ? Colors.white.withValues(alpha: 0.08) : Colors.grey.withValues(alpha: 0.1)) : null,
                                borderRadius: BorderRadius.circular(14),
                              ),
                              child: Icon(Icons.location_on_rounded, color: dropoffAddress.isNotEmpty ? Colors.white : context.mutedColor, size: 22),
                            ),
                            const SizedBox(width: 16),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('DROPOFF', style: TextStyle(color: context.mutedColor, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1)),
                                  const SizedBox(height: 4),
                                  Text(
                                    dropoffAddress.isEmpty ? 'Select dropoff location' : dropoffAddress,
                                    style: TextStyle(color: dropoffAddress.isEmpty ? context.mutedColor : context.textColor, fontSize: 16, fontWeight: FontWeight.w600),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ],
                              ),
                            ),
                            Icon(dropoffAddress.isNotEmpty ? Icons.check_circle_rounded : Icons.arrow_forward_ios_rounded,
                                color: dropoffAddress.isNotEmpty ? AppColors.error : context.mutedColor, size: 20),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 24),

                // Date & Time Section
                Text('When?', style: TextStyle(color: context.textColor, fontSize: 18, fontWeight: FontWeight.w700)),
                const SizedBox(height: 14),
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
                          padding: const EdgeInsets.all(18),
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              colors: context.isDark
                                  ? [Colors.white.withValues(alpha: 0.08), Colors.white.withValues(alpha: 0.04)]
                                  : [Colors.white, const Color(0xFFFAFAFA)],
                            ),
                            borderRadius: BorderRadius.circular(18),
                            border: Border.all(color: context.isDark ? Colors.white12 : Colors.black.withValues(alpha: 0.06)),
                          ),
                          child: Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.all(10),
                                decoration: BoxDecoration(color: AppColors.yellow.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(12)),
                                child: Icon(Icons.calendar_month_rounded, color: AppColors.yellow, size: 20),
                              ),
                              const SizedBox(width: 14),
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('DATE', style: TextStyle(color: context.mutedColor, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 0.5)),
                                  const SizedBox(height: 2),
                                  Text('${selectedDate.day}/${selectedDate.month}/${selectedDate.year}', style: TextStyle(color: context.textColor, fontSize: 15, fontWeight: FontWeight.w700)),
                                ],
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
                          padding: const EdgeInsets.all(18),
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              colors: context.isDark
                                  ? [Colors.white.withValues(alpha: 0.08), Colors.white.withValues(alpha: 0.04)]
                                  : [Colors.white, const Color(0xFFFAFAFA)],
                            ),
                            borderRadius: BorderRadius.circular(18),
                            border: Border.all(color: context.isDark ? Colors.white12 : Colors.black.withValues(alpha: 0.06)),
                          ),
                          child: Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.all(10),
                                decoration: BoxDecoration(color: AppColors.yellow.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(12)),
                                child: Icon(Icons.access_time_rounded, color: AppColors.yellow, size: 20),
                              ),
                              const SizedBox(width: 14),
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('TIME', style: TextStyle(color: context.mutedColor, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 0.5)),
                                  const SizedBox(height: 2),
                                  Text(
                                    '${selectedTime.hour > 12 ? selectedTime.hour - 12 : (selectedTime.hour == 0 ? 12 : selectedTime.hour)}:${selectedTime.minute.toString().padLeft(2, '0')} ${selectedTime.hour >= 12 ? 'PM' : 'AM'}',
                                    style: TextStyle(color: context.textColor, fontSize: 15, fontWeight: FontWeight.w700),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 32),

                // Buttons
                Row(
                  children: [
                    if (_scheduledTime != null)
                      Expanded(
                        child: Container(
                          height: 58,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: AppColors.error.withValues(alpha: 0.5), width: 2),
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
                        height: 58,
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
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(content: Text('Select a time at least 5 minutes from now'), backgroundColor: Colors.orange, behavior: SnackBarBehavior.floating, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                                    );
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
                                      ScaffoldMessenger.of(context).showSnackBar(
                                        SnackBar(
                                          content: Row(children: [Icon(Icons.check_circle_rounded, color: Colors.white), const SizedBox(width: 12), Expanded(child: Text('Ride scheduled for ${_formatScheduledTime(selectedDate)}'))]),
                                          backgroundColor: AppColors.success, behavior: SnackBarBehavior.floating, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                        ),
                                      );
                                    }
                                  } catch (e) {
                                    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to schedule'), backgroundColor: Colors.red));
                                  }
                                }
                              : null,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.transparent, foregroundColor: Colors.black, shadowColor: Colors.transparent,
                            disabledBackgroundColor: Colors.transparent, disabledForegroundColor: context.mutedColor,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(pickupAddress.isNotEmpty && dropoffAddress.isNotEmpty ? Icons.check_rounded : Icons.location_off_rounded, size: 22),
                              const SizedBox(width: 10),
                              Text(pickupAddress.isEmpty || dropoffAddress.isEmpty ? 'Select locations' : 'Confirm Booking', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, letterSpacing: 0.3)),
                            ],
                          ),
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
    return await LocationService.getCurrentLocation();
  }

  Future<Map<String, dynamic>?> _showLocationPicker(BuildContext context, String title, Color accentColor) async {
    LatLng selectedLocation = await _getCurrentLocation();
    final mapController = MapController();
    final searchController = TextEditingController();
    String addressText = '';
    String selectedName = '';
    bool showSearchResults = false;
    List<Map<String, dynamic>> searchResults = [];
    LatLng? userLocation = selectedLocation;

    final List<Map<String, dynamic>> allPlaces = [
      {'name': 'Current Location', 'address': 'Use your GPS location', 'lat': userLocation.latitude, 'lng': userLocation.longitude, 'icon': Icons.my_location, 'isGps': true},
      {'name': 'Hulhumale Phase 2', 'address': 'Hulhumale Phase 2, Flat Area', 'lat': 4.2286, 'lng': 73.5400, 'icon': Icons.location_city},
      {'name': 'Hulhumale Phase 1', 'address': 'Hulhumale Phase 1, Housing', 'lat': 4.2116, 'lng': 73.5380, 'icon': Icons.location_city},
      {'name': 'Velana Airport', 'address': 'Velana International Airport', 'lat': 4.1918, 'lng': 73.5290, 'icon': Icons.flight},
      {'name': 'Male City Center', 'address': 'Male City, Republic Square', 'lat': 4.1755, 'lng': 73.5093, 'icon': Icons.location_city},
      {'name': 'Ferry Terminal', 'address': 'Hulhumale Ferry Terminal', 'lat': 4.2106, 'lng': 73.5400, 'icon': Icons.directions_boat},
      {'name': 'Central Park', 'address': 'Hulhumale Central Park', 'lat': 4.2200, 'lng': 73.5380, 'icon': Icons.park},
      {'name': 'Tree Top Hospital', 'address': 'Tree Top Hospital, Hulhumale', 'lat': 4.2250, 'lng': 73.5420, 'icon': Icons.local_hospital},
      {'name': 'ADK Hospital', 'address': 'ADK Hospital, Male City', 'lat': 4.1740, 'lng': 73.5100, 'icon': Icons.local_hospital},
      {'name': 'Artificial Beach', 'address': 'Artificial Beach, Male', 'lat': 4.1720, 'lng': 73.5050, 'icon': Icons.beach_access},
      {'name': 'Fish Market', 'address': 'Male Fish Market', 'lat': 4.1760, 'lng': 73.5070, 'icon': Icons.store},
      {'name': 'Islamic Centre', 'address': 'Islamic Centre, Male', 'lat': 4.1750, 'lng': 73.5090, 'icon': Icons.mosque},
      {'name': 'Dharubaaruge', 'address': 'Dharubaaruge Convention Center', 'lat': 4.1730, 'lng': 73.5110, 'icon': Icons.business},
    ];

    return await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setModalState) {
          void performSearch(String query) {
            if (query.isEmpty) {
              setModalState(() {
                showSearchResults = false;
                searchResults = [];
              });
            } else {
              final results = allPlaces.where((place) {
                final name = (place['name'] as String).toLowerCase();
                final address = (place['address'] as String).toLowerCase();
                return name.contains(query.toLowerCase()) || address.contains(query.toLowerCase());
              }).toList();
              setModalState(() {
                showSearchResults = true;
                searchResults = results;
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
                          child: searchResults.isEmpty
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
                                      onTap: () {
                                        final lat = place['lat'] as double;
                                        final lng = place['lng'] as double;
                                        setModalState(() {
                                          selectedLocation = LatLng(lat, lng);
                                          addressText = place['address'] as String;
                                          selectedName = place['name'] as String;
                                          showSearchResults = false;
                                          searchController.text = place['name'] as String;
                                        });
                                        mapController.move(selectedLocation, 16);
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
                            FlutterMap(
                              mapController: mapController,
                              options: MapOptions(
                                initialCenter: selectedLocation,
                                initialZoom: 14,
                                onTap: (tapPosition, point) {
                                  // Find nearest known place
                                  String nearestName = 'Custom Location';
                                  double minDist = double.infinity;
                                  for (final place in allPlaces) {
                                    final pLat = place['lat'] as double;
                                    final pLng = place['lng'] as double;
                                    final dist = (point.latitude - pLat).abs() + (point.longitude - pLng).abs();
                                    if (dist < minDist && dist < 0.01) { // Within ~1km
                                      minDist = dist;
                                      nearestName = 'Near ${place['name']}';
                                    }
                                  }
                                  setModalState(() {
                                    selectedLocation = point;
                                    addressText = nearestName;
                                    selectedName = nearestName;
                                    searchController.text = '';
                                  });
                                },
                              ),
                              children: [
                                TileLayer(
                                  urlTemplate: context.isDark
                                    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
                                    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
                                  subdomains: const ['a', 'b', 'c', 'd'],
                                  userAgentPackageName: 'com.myride.app',
                                ),
                                MarkerLayer(
                                  markers: [
                                    // User's current location (blue dot)
                                    if (userLocation != null)
                                      Marker(
                                        point: userLocation!,
                                        width: 24,
                                        height: 24,
                                        child: Container(
                                          decoration: BoxDecoration(
                                            color: Colors.blue,
                                            shape: BoxShape.circle,
                                            border: Border.all(color: Colors.white, width: 3),
                                            boxShadow: [
                                              BoxShadow(
                                                color: Colors.blue.withValues(alpha: 0.4),
                                                blurRadius: 8,
                                                spreadRadius: 2,
                                              ),
                                            ],
                                          ),
                                        ),
                                      ),
                                    // Selected location marker
                                    Marker(
                                      point: selectedLocation,
                                      width: 60,
                                      height: 70,
                                      child: Column(
                                        children: [
                                          Container(
                                            padding: const EdgeInsets.all(10),
                                            decoration: BoxDecoration(
                                              gradient: LinearGradient(
                                                colors: [accentColor, accentColor.withValues(alpha: 0.8)],
                                                begin: Alignment.topCenter,
                                                end: Alignment.bottomCenter,
                                              ),
                                              borderRadius: BorderRadius.circular(14),
                                              boxShadow: [
                                                BoxShadow(
                                                  color: accentColor.withValues(alpha: 0.5),
                                                  blurRadius: 12,
                                                  spreadRadius: 2,
                                                  offset: const Offset(0, 4),
                                                ),
                                              ],
                                            ),
                                            child: Icon(Icons.location_on, color: Colors.white, size: 24),
                                          ),
                                          Container(
                                            width: 3,
                                            height: 12,
                                            decoration: BoxDecoration(
                                              color: accentColor,
                                              borderRadius: const BorderRadius.vertical(bottom: Radius.circular(2)),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                            // Map Controls
                            Positioned(
                              bottom: 20,
                              right: 16,
                              child: Column(
                                children: [
                                  GestureDetector(
                                    onTap: () => mapController.move(mapController.camera.center, mapController.camera.zoom + 1),
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
                                    onTap: () => mapController.move(mapController.camera.center, mapController.camera.zoom - 1),
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
                                      mapController.move(currentPos, 16);
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
