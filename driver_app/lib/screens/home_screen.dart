import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/ride_request.dart';
import '../providers/driver_state.dart';
import '../theme/app_theme.dart';
import '../widgets/status_toggle.dart';
import '../widgets/ride_request_popup.dart';
import '../widgets/break_timer.dart';
import '../widgets/app_snackbar.dart';
import 'vehicle_checklist_screen.dart';
import 'history_screen.dart';
import 'profile_screen.dart';
import 'ride_screen.dart';
import 'chat_screen.dart';
import '../services/supabase_service.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _selectedTab = 0;
  bool _isPopupMinimized = false;
  bool _hasNavigatedToActiveRide = false;
  bool _isNavVisible = true;
  final ScrollController _scrollController = ScrollController();
  double _lastScrollOffset = 0;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    // Mark that we're on home screen and listen for active ride
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final state = context.read<DriverState>();
      state.setOnHomeScreen(true);
      state.addListener(_onDriverStateChanged);

      // Load today's checklist from DB (may have been completed earlier)
      await state.loadTodayChecklist();

      _checkForActiveRide();

      // If driver was online from previous session, re-initialize subscriptions
      if (state.isOnline) {
        debugPrint('Driver was online, re-initializing subscriptions...');
        state.goOnline();
      }
    });
  }

  @override
  void dispose() {
    _scrollController.dispose();
    // Remove listener
    try {
      context.read<DriverState>().removeListener(_onDriverStateChanged);
    } catch (_) {}
    super.dispose();
  }

  void _onScroll() {
    final currentOffset = _scrollController.offset;
    if (currentOffset > _lastScrollOffset && currentOffset > 50) {
      // Scrolling down - hide nav
      if (_isNavVisible) {
        setState(() => _isNavVisible = false);
      }
    } else if (currentOffset < _lastScrollOffset) {
      // Scrolling up - show nav
      if (!_isNavVisible) {
        setState(() => _isNavVisible = true);
      }
    }
    _lastScrollOffset = currentOffset;
  }

  void _onDriverStateChanged() {
    if (!mounted) return;
    final state = context.read<DriverState>();
    debugPrint('Driver state changed: hasActiveRide=${state.hasActiveRide}, hasNavigated=$_hasNavigatedToActiveRide');
    _checkForActiveRide();
  }

  void _checkForActiveRide() {
    // Driver accepts rides via popup - no auto-navigation needed
  }

  void _onTabChanged(int index) {
    setState(() {
      _selectedTab = index;
    });
    // Update home screen flag based on tab
    context.read<DriverState>().setOnHomeScreen(index == 0);
  }

  Future<void> _handleGoOnline(DriverState state) async {
    if (state.isOnline) {
      state.goOffline();
      return;
    }

    if (!state.checklistCompleted) {
      final result = await Navigator.push<dynamic>(
        context,
        MaterialPageRoute(
          builder: (_) => const VehicleChecklistScreen(),
          fullscreenDialog: true,
        ),
      );

      if (result != null && result is Map && result['completed'] == true && mounted) {
        final hasIssues = result['hasIssues'] ?? false;
        final issues = result['issues'] as Map<String, String>? ?? {};
        state.completeChecklist(hasIssues: hasIssues, issues: issues);
        state.goOnline();
      }
    } else {
      state.goOnline();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.bgColor,
      extendBody: true,
      body: IndexedStack(
        index: _selectedTab,
        children: [
          _buildHomeContent(),
          const HistoryScreen(),
          const ProfileScreen(),
        ],
      ),
      bottomNavigationBar: _buildBottomNav(context),
    );
  }

  Widget _buildHomeContent() {
    final topPadding = MediaQuery.of(context).padding.top;
    return Consumer<DriverState>(
      builder: (context, state, _) {
        // For active ride: use flex layout (no ScrollView) so Center works
        if (state.hasActiveRide) {
          return Stack(
            children: [
              Column(
                children: [
                  SizedBox(height: topPadding),
                  _buildHeader(context, state),
                  Expanded(
                    child: _buildActiveRideView(context, state),
                  ),
                  SizedBox(height: 100), // Space for nav bar
                ],
              ),
              // Ride request popup during active ride
              if (state.incomingRequests.isNotEmpty)
                Positioned.fill(
                  child: Container(
                    color: Colors.black.withValues(alpha: 0.7),
                    child: Center(
                      child: RideRequestPopup(
                        key: ValueKey(state.incomingRequests.first.id),
                        request: state.incomingRequests.first,
                        onAccept: () async {
                          final result = await state.acceptRide(state.incomingRequests.first);
                          if (result['success'] != true && mounted) {
                            AppSnackbar.warning(context, result['error'] ?? 'Ride was taken');
                          }
                        },
                        onDecline: () => state.expireRide(state.incomingRequests.first),
                      ),
                    ),
                  ),
                ),
            ],
          );
        }

        // For other states: use ScrollView as before
        return Stack(
          children: [
            SingleChildScrollView(
              controller: _scrollController,
              physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
              child: Column(
                children: [
                  SizedBox(height: topPadding),
                  _buildHeader(context, state),

                  if (state.isOnBreak)
                    _buildBreakView(context, state)
                  else if (state.isOnline)
                    _buildOnlineView(context, state)
                  else
                    _buildOfflineView(context, state),

                  SizedBox(height: MediaQuery.of(context).padding.bottom + 120),
                ],
              ),
            ),

              // Show ride request popup when there's an incoming request
              if (state.incomingRequests.isNotEmpty && !state.hasActiveRide && !_isPopupMinimized)
                Builder(
                  builder: (context) {
                    final request = state.incomingRequests.first;
                    return Positioned.fill(
                      child: Container(
                        color: Colors.black.withValues(alpha: 0.7),
                        child: Center(
                          child: RideRequestPopup(
                            key: ValueKey(request.id),
                            request: request,
                            onAccept: () async {
                              setState(() => _isPopupMinimized = false);
                              final result = await state.acceptRide(request);
                              if (result['success'] == true) {
                                if (mounted) {
                                  Navigator.push(
                                    context,
                                    MaterialPageRoute(builder: (_) => const RideScreen()),
                                  );
                                }
                              } else {
                                // Another driver got it first
                                if (mounted) {
                                  AppSnackbar.warning(context, result['error'] ?? 'This ride was taken by another driver');
                                }
                              }
                            },
                            onDecline: () {
                              setState(() => _isPopupMinimized = false);
                              state.expireRide(request);
                            },
                          ),
                        ),
                      ),
                    );
                  },
                ),

              // Minimized ride request badge - Modern pulsing design
              if (state.incomingRequests.isNotEmpty && !state.hasActiveRide && _isPopupMinimized)
                Positioned(
                  bottom: 100,
                  left: 20,
                  right: 20,
                  child: TweenAnimationBuilder<double>(
                    tween: Tween(begin: 0.0, end: 1.0),
                    duration: const Duration(milliseconds: 400),
                    curve: Curves.elasticOut,
                    builder: (context, value, child) {
                      return Transform.scale(
                        scale: 0.8 + (value.clamp(0.0, 1.0) * 0.2),
                        child: Opacity(opacity: value.clamp(0.0, 1.0), child: child),
                      );
                    },
                    child: GestureDetector(
                      onTap: () => setState(() => _isPopupMinimized = false),
                      child: Container(
                        padding: const EdgeInsets.all(4),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(22),
                          gradient: LinearGradient(
                            colors: [AppColors.yellow, const Color(0xFFFFC107)],
                          ),
                          boxShadow: [
                            BoxShadow(color: AppColors.yellow.withValues(alpha: 0.5), blurRadius: 20, offset: const Offset(0, 8)),
                            BoxShadow(color: Colors.black.withValues(alpha: 0.2), blurRadius: 10, offset: const Offset(0, 4)),
                          ],
                        ),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.08),
                            borderRadius: BorderRadius.circular(18),
                          ),
                          child: Row(
                            children: [
                              Stack(
                                children: [
                                  Container(
                                    width: 50,
                                    height: 50,
                                    decoration: BoxDecoration(
                                      color: Colors.black.withValues(alpha: 0.15),
                                      borderRadius: BorderRadius.circular(15),
                                    ),
                                    child: const Icon(Icons.local_taxi_rounded, color: Colors.black, size: 26),
                                  ),
                                  // Notification dot
                                  Positioned(
                                    right: 0,
                                    top: 0,
                                    child: Container(
                                      width: 14,
                                      height: 14,
                                      decoration: BoxDecoration(
                                        color: AppColors.error,
                                        shape: BoxShape.circle,
                                        border: Border.all(color: AppColors.yellow, width: 2),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(width: 14),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                      decoration: BoxDecoration(
                                        color: Colors.black.withValues(alpha: 0.1),
                                        borderRadius: BorderRadius.circular(6),
                                      ),
                                      child: Text(
                                        'TAP TO VIEW',
                                        style: TextStyle(color: Colors.black.withValues(alpha: 0.7), fontSize: 9, fontWeight: FontWeight.w800, letterSpacing: 0.5),
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      state.incomingRequests.first.customerName,
                                      style: const TextStyle(color: Colors.black, fontSize: 18, fontWeight: FontWeight.w800),
                                    ),
                                  ],
                                ),
                              ),
                              Container(
                                padding: const EdgeInsets.all(10),
                                decoration: BoxDecoration(
                                  color: Colors.black.withValues(alpha: 0.12),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: const Icon(Icons.keyboard_arrow_up_rounded, color: Colors.black, size: 24),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          );
      },
    );
  }

  Widget _buildHeader(BuildContext context, DriverState state) {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Row(
        children: [
          // Profile avatar
          GestureDetector(
            onTap: () => Navigator.pushNamed(context, '/profile'),
            child: Container(
              width: 50,
              height: 50,
              decoration: BoxDecoration(
                color: AppColors.yellow,
                borderRadius: BorderRadius.circular(14),
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(14),
                child: _buildProfileAvatar(state, 50),
              ),
            ),
          ),
          const SizedBox(width: 14),

          // Welcome text
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Welcome back,',
                  style: TextStyle(
                    color: context.mutedColor,
                    fontSize: 13,
                  ),
                ),
                Text(
                  state.driverName.isNotEmpty ? state.driverName : 'Driver',
                  style: TextStyle(
                    color: context.textColor,
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),

          // Status indicator (display only)
          StatusToggle(
            isOnline: state.isOnline,
            isOnBreak: state.isOnBreak,
          ),
        ],
      ),
    );
  }

  Widget _buildProfileAvatar(DriverState state, double size) {
    // Priority: avatarUrl (cloud) > profileImagePath (local) > initials
    if (state.avatarUrl.isNotEmpty) {
      // Use avatar cache key for immediate refresh on change
      final avatarUrlWithCache = state.avatarUrl.contains('?')
          ? '${state.avatarUrl}&t=${state.avatarCacheKey}'
          : '${state.avatarUrl}?t=${state.avatarCacheKey}';
      return Image.network(
        avatarUrlWithCache,
        width: size,
        height: size,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) {
          if (state.profileImagePath.isNotEmpty) {
            return Image.file(
              File(state.profileImagePath),
              width: size,
              height: size,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => _buildInitialsAvatar(state.driverName, size),
            );
          }
          return _buildInitialsAvatar(state.driverName, size);
        },
      );
    } else if (state.profileImagePath.isNotEmpty) {
      return Image.file(
        File(state.profileImagePath),
        width: size,
        height: size,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => _buildInitialsAvatar(state.driverName, size),
      );
    }
    return _buildInitialsAvatar(state.driverName, size);
  }

  Widget _buildInitialsAvatar(String name, [double size = 50]) {
    final initials = name.isNotEmpty
        ? name.split(' ').map((n) => n.isNotEmpty ? n[0] : '').take(2).join().toUpperCase()
        : 'DR';
    return Container(
      width: size,
      height: size,
      color: AppColors.yellow,
      child: Center(
        child: Text(
          initials,
          style: TextStyle(
            color: Colors.black,
            fontSize: size * 0.36,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }

  Widget _buildOfflineView(BuildContext context, DriverState state) {
    return Column(
      children: [
        // Stats card
        _buildStatsCard(context, state),

          // Checklist status
          if (state.checklistCompleted)
            Container(
              margin: const EdgeInsets.fromLTRB(20, 16, 20, 0),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: state.checklistHasIssues
                    ? AppColors.warning.withValues(alpha: 0.1)
                    : AppColors.success.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: state.checklistHasIssues
                      ? AppColors.warning.withValues(alpha: 0.3)
                      : AppColors.success.withValues(alpha: 0.3),
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    state.checklistHasIssues ? Icons.warning : Icons.check_circle,
                    color: state.checklistHasIssues ? AppColors.warning : AppColors.success,
                    size: 20,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      state.checklistHasIssues
                          ? 'Checklist done with ${state.checklistIssues.length} issue${state.checklistIssues.length > 1 ? 's' : ''} reported'
                          : 'Vehicle checklist completed for today',
                      style: TextStyle(
                        color: context.textColor,
                        fontSize: 14,
                      ),
                    ),
                  ),
                ],
              ),
            ),

          // Go online prompt
          Padding(
            padding: const EdgeInsets.all(30),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                  Container(
                    width: 100,
                    height: 100,
                    decoration: BoxDecoration(
                      color: context.cardColor,
                      borderRadius: BorderRadius.circular(24),
                      border: Border.all(color: context.borderColor, width: 2),
                    ),
                    child: Icon(
                      Icons.power_settings_new,
                      size: 48,
                      color: context.mutedColor,
                    ),
                  ),
                  const SizedBox(height: 24),
                  Text(
                    'You\'re Offline',
                    style: TextStyle(
                      color: context.textColor,
                      fontSize: 24,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    state.checklistCompleted
                        ? 'Tap below to start receiving ride requests'
                        : 'Complete vehicle checklist to go online',
                    style: TextStyle(
                      color: context.mutedColor,
                      fontSize: 15,
                      height: 1.5,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 32),
                  ElevatedButton.icon(
                    onPressed: () {
                      HapticFeedback.heavyImpact();
                      _handleGoOnline(state);
                    },
                    icon: Icon(
                      state.checklistCompleted
                          ? Icons.wifi
                          : Icons.checklist,
                    ),
                    label: Text(
                      state.checklistCompleted
                          ? 'Go Online'
                          : 'Start Checklist',
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.success,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 32,
                        vertical: 16,
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        );
  }

  Widget _buildOnlineView(BuildContext context, DriverState state) {
    return Column(
      children: [
        // Stats card
        _buildStatsCard(context, state),

        // Quick Actions
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: context.cardColor,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: context.borderColor),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Quick Actions',
                  style: TextStyle(
                    color: context.mutedColor,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0.5,
                  ),
                ),
                const SizedBox(height: 14),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    _buildActionButton(
                      context,
                      icon: Icons.mic,
                      label: 'PTT',
                      color: AppColors.success,
                      onTap: () {
                        HapticFeedback.lightImpact();
                        Navigator.pushNamed(context, '/push-to-talk');
                      },
                    ),
                    _buildActionButton(
                      context,
                      icon: Icons.coffee,
                      label: 'Break',
                      color: AppColors.warning,
                      onTap: () {
                        HapticFeedback.lightImpact();
                        _showBreakOptions(context, state);
                      },
                    ),
                    _buildActionButton(
                      context,
                      icon: Icons.history,
                      label: 'History',
                      color: AppColors.info,
                      onTap: () {
                        HapticFeedback.lightImpact();
                        _onTabChanged(1);
                      },
                    ),
                    _buildActionButton(
                      context,
                      icon: Icons.warning_rounded,
                      label: 'SOS',
                      color: AppColors.error,
                      onTap: () {
                        HapticFeedback.heavyImpact();
                        _showSOSDialog(context);
                      },
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),

        // Waiting for rides view
        ...[
          const SizedBox(height: 24),
          Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 64,
                  height: 64,
                  decoration: BoxDecoration(
                    color: AppColors.success.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: const Icon(
                    Icons.search,
                    size: 32,
                    color: AppColors.success,
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  'Looking for Rides',
                  style: TextStyle(
                    color: context.textColor,
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 4),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 40),
                  child: Text(
                    'You\'ll be notified when a staff member requests a ride',
                    style: TextStyle(
                      color: context.mutedColor,
                      fontSize: 13,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
        ],

        // End Shift Button
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
          child: SizedBox(
            width: double.infinity,
            height: 52,
            child: OutlinedButton.icon(
              onPressed: () => _showEndShiftDialog(context, state),
              icon: const Icon(Icons.logout_rounded, size: 20),
              label: const Text('End Shift', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.error,
                side: const BorderSide(color: AppColors.error, width: 1.5),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildBreakView(BuildContext context, DriverState state) {
    return SingleChildScrollView(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).padding.bottom + 20),
      child: Column(
        children: [
          // Stats card
          _buildStatsCard(context, state),

          const SizedBox(height: 16),

          // Break timer widget with animation
          if (state.breakStartTime != null)
            BreakTimerWidget(
              startTime: state.breakStartTime!,
              breakType: state.breakType,
              onEndBreak: () {
                HapticFeedback.heavyImpact();
                state.endBreak();
              },
            ),

          // Additional info
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: context.cardColor,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: context.borderColor),
              ),
              child: Row(
                children: [
                  Icon(Icons.info_outline, color: context.mutedColor, size: 20),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'You won\'t receive ride requests while on break',
                      style: TextStyle(
                        color: context.mutedColor,
                        fontSize: 13,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Break Tips Section
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Break Tips',
                  style: TextStyle(
                    color: context.textColor,
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 12),
                _buildBreakTip(context, Icons.directions_walk_rounded, 'Stretch your legs', 'Take a short walk to refresh'),
                const SizedBox(height: 10),
                _buildBreakTip(context, Icons.water_drop_rounded, 'Stay hydrated', 'Drink water to stay alert'),
                const SizedBox(height: 10),
                _buildBreakTip(context, Icons.visibility_rounded, 'Rest your eyes', 'Look away from screen for a moment'),
              ],
            ),
          ),

          // Motivational Quote
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 0),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    AppColors.warning.withValues(alpha: 0.1),
                    AppColors.warning.withValues(alpha: 0.05),
                  ],
                ),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.warning.withValues(alpha: 0.2)),
              ),
              child: Column(
                children: [
                  Icon(Icons.format_quote_rounded, color: AppColors.warning, size: 28),
                  const SizedBox(height: 12),
                  Text(
                    '"A moment of rest today leads to safer journeys tomorrow."',
                    style: TextStyle(
                      color: context.textColor,
                      fontSize: 15,
                      fontStyle: FontStyle.italic,
                      height: 1.5,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBreakTip(BuildContext context, IconData icon, String title, String subtitle) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.cardColor,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: context.borderColor),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: AppColors.info.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: AppColors.info, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    color: context.textColor,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: TextStyle(
                    color: context.mutedColor,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _showEndShiftDialog(BuildContext context, DriverState state) {
    HapticFeedback.mediumImpact();
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Container(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(ctx).size.height * 0.7,
        ),
        decoration: BoxDecoration(
          color: context.cardColor,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(20, 16, 20, MediaQuery.of(ctx).padding.bottom + 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Handle
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: context.borderColor,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 20),
              // Warning icon
              Container(
                width: 70,
                height: 70,
                decoration: BoxDecoration(
                  color: AppColors.error.withValues(alpha: 0.15),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.logout_rounded, color: AppColors.error, size: 35),
              ),
              const SizedBox(height: 20),
              Text(
                'End Your Shift?',
                style: TextStyle(
                  color: context.textColor,
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                'You will go offline and won\'t receive any more ride requests until your next shift.',
                style: TextStyle(
                  color: context.mutedColor,
                  fontSize: 15,
                  height: 1.5,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              // Shift summary
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: context.bgColor,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: context.borderColor),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    _buildShiftStat('Rides', '${state.todayTrips}', AppColors.success),
                    Container(width: 1, height: 40, color: context.borderColor),
                    _buildShiftStat('Hours', '${(state.todayTrips * 0.5).toStringAsFixed(1)}', AppColors.info),
                    Container(width: 1, height: 40, color: context.borderColor),
                    _buildShiftStat('Rating', state.rating.toStringAsFixed(1), AppColors.warning),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              // Buttons
              Row(
                children: [
                  Expanded(
                    child: SizedBox(
                      height: 52,
                      child: OutlinedButton(
                        onPressed: () => Navigator.pop(ctx),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: context.textColor,
                          side: BorderSide(color: context.borderColor),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                        ),
                        child: const Text('Cancel', style: TextStyle(fontWeight: FontWeight.w600)),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: SizedBox(
                      height: 52,
                      child: ElevatedButton(
                        onPressed: () {
                          Navigator.pop(ctx);
                          state.goOffline();
                          state.resetChecklist();
                          HapticFeedback.heavyImpact();
                          AppSnackbar.success(context, 'Shift ended', subtitle: 'Have a great day!');
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.error,
                          foregroundColor: Colors.white,
                          elevation: 0,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                        ),
                        child: const Text('End Shift', style: TextStyle(fontWeight: FontWeight.w600)),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildShiftStat(String label, String value, Color color) {
    return Column(
      children: [
        Text(
          value,
          style: TextStyle(
            color: color,
            fontSize: 20,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          label,
          style: TextStyle(
            color: context.mutedColor,
            fontSize: 12,
          ),
        ),
      ],
    );
  }

  void _showBreakOptions(BuildContext context, DriverState state) {
    HapticFeedback.mediumImpact();
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        decoration: BoxDecoration(
          color: context.cardColor,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Handle
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: context.borderColor,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                'Take a Break',
                style: TextStyle(
                  color: context.textColor,
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 16),
              // Break options in a single row
              Row(
                children: [
                  _buildBreakOptionSmall(ctx, state, Icons.coffee, 'Tea', AppColors.warning),
                  const SizedBox(width: 10),
                  _buildBreakOptionSmall(ctx, state, Icons.restaurant, 'Lunch', AppColors.error),
                  const SizedBox(width: 10),
                  _buildBreakOptionSmall(ctx, state, Icons.mosque, 'Prayer', AppColors.success),
                  const SizedBox(width: 10),
                  _buildBreakOptionSmall(ctx, state, Icons.person, 'Personal', Colors.purple),
                ],
              ),
              const SizedBox(height: 16),
              // Cancel button
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: Text(
                  'Cancel',
                  style: TextStyle(
                    color: context.mutedColor,
                    fontSize: 15,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildBreakOptionSmall(
    BuildContext ctx,
    DriverState state,
    IconData icon,
    String label,
    Color color,
  ) {
    return Expanded(
      child: GestureDetector(
        onTap: () {
          HapticFeedback.mediumImpact();
          Navigator.pop(ctx);
          state.startBreak(label);
        },
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 16),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: color.withValues(alpha: 0.3)),
          ),
          child: Column(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: color,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: Colors.white, size: 24),
              ),
              const SizedBox(height: 8),
              Text(
                label,
                style: TextStyle(
                  color: ctx.textColor,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildActiveRideView(BuildContext context, DriverState state) {
    final ride = state.currentRide!;

    return LayoutBuilder(
      builder: (context, constraints) {
        return SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: constraints.maxHeight),
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
          // Tap to open full ride screen
          GestureDetector(
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const RideScreen()),
            ),
            child: Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    AppColors.yellow.withValues(alpha: 0.15),
                    AppColors.yellow.withValues(alpha: 0.05),
                  ],
                ),
                borderRadius: BorderRadius.circular(24),
                border: Border.all(color: AppColors.yellow.withValues(alpha: 0.3), width: 2),
              ),
              child: Column(
                children: [
                  // Status badge
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    decoration: BoxDecoration(
                      color: _getStatusColor(ride.status),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(_getStatusIcon(ride.status), color: Colors.black, size: 18),
                        const SizedBox(width: 8),
                        Text(
                          _getStatusText(ride.status),
                          style: const TextStyle(color: Colors.black, fontSize: 13, fontWeight: FontWeight.w700),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Customer info
                  Row(
                    children: [
                      Container(
                        width: 60,
                        height: 60,
                        decoration: BoxDecoration(
                          color: AppColors.yellow,
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: const Icon(Icons.person, color: Colors.black, size: 32),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              ride.customerName,
                              style: TextStyle(color: context.textColor, fontSize: 20, fontWeight: FontWeight.w700),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              ride.customerPhone,
                              style: TextStyle(color: context.mutedColor, fontSize: 14),
                            ),
                          ],
                        ),
                      ),
                      Column(
                        children: [
                          _buildQuickAction(Icons.chat, Colors.blue, () => _openChat(ride.customerName, ride.customerPhone)),
                          const SizedBox(height: 8),
                          _buildQuickAction(Icons.call, AppColors.success, () => _makeCall(ride.customerPhone)),
                        ],
                      ),
                    ],
                  ),

                  const SizedBox(height: 20),

                  // Route summary
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: context.bgColor,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Column(
                      children: [
                        _buildRouteRow(Icons.radio_button_checked, AppColors.success, ride.pickupLocation),
                        Padding(
                          padding: const EdgeInsets.only(left: 9),
                          child: Container(width: 2, height: 20, color: context.borderColor),
                        ),
                        _buildRouteRow(Icons.location_on, AppColors.error, ride.dropoffLocation),
                      ],
                    ),
                  ),

                  const SizedBox(height: 16),

                  // Open map button
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    decoration: BoxDecoration(
                      color: AppColors.yellow,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.map, color: Colors.black, size: 22),
                        SizedBox(width: 10),
                        Text(
                          'Open Full Map View',
                          style: TextStyle(color: Colors.black, fontSize: 16, fontWeight: FontWeight.w700),
                        ),
                        SizedBox(width: 6),
                        Icon(Icons.arrow_forward, color: Colors.black, size: 20),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Queue section
          if (state.queuedRequests.isNotEmpty) ...[
            const SizedBox(height: 16),
            _buildQueueSection(context, state),
          ],

          // Incoming requests during trip
          if (state.incomingRequests.isNotEmpty && state.hasAvailableSeats) ...[
            const SizedBox(height: 16),
            _buildIncomingDuringTrip(context, state),
          ],
        ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildActionButton(
    BuildContext context, {
    required IconData icon,
    required String label,
    required Color color,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        children: [
          Container(
            width: 54,
            height: 54,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: color.withValues(alpha: 0.3)),
            ),
            child: Icon(icon, color: color, size: 26),
          ),
          const SizedBox(height: 8),
          Text(
            label,
            style: TextStyle(
              color: context.textColor,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  void _showSOSDialog(BuildContext context) {
    showDialog(
      context: context,
      barrierColor: Colors.black87,
      builder: (ctx) => Dialog(
        backgroundColor: Colors.transparent,
        child: Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: context.cardColor,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: AppColors.error.withValues(alpha: 0.3), width: 2),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Pulsing SOS icon
              TweenAnimationBuilder<double>(
                tween: Tween(begin: 1.0, end: 1.15),
                duration: const Duration(milliseconds: 800),
                curve: Curves.easeInOut,
                builder: (context, scale, child) {
                  return Transform.scale(
                    scale: scale,
                    child: Container(
                      width: 80,
                      height: 80,
                      decoration: BoxDecoration(
                        color: AppColors.error,
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(
                            color: AppColors.error.withValues(alpha: 0.5),
                            blurRadius: 20,
                            spreadRadius: 5,
                          ),
                        ],
                      ),
                      child: const Icon(Icons.sos, color: Colors.white, size: 40),
                    ),
                  );
                },
                onEnd: () {},
              ),
              const SizedBox(height: 20),
              Text(
                'Emergency SOS',
                style: TextStyle(
                  color: context.textColor,
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Calling 119',
                style: TextStyle(
                  color: AppColors.error,
                  fontSize: 28,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 2,
                ),
              ),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.error.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    Icon(Icons.location_on, color: AppColors.error, size: 20),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Your live location will be shared with support team',
                        style: TextStyle(
                          color: context.textColor,
                          fontSize: 13,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.pop(ctx),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: context.mutedColor,
                        side: BorderSide(color: context.borderColor),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      child: const Text('Cancel', style: TextStyle(fontWeight: FontWeight.w600)),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: ElevatedButton.icon(
                      onPressed: () async {
                        Navigator.pop(ctx);
                        HapticFeedback.heavyImpact();
                        final uri = Uri.parse('tel:119');
                        if (await canLaunchUrl(uri)) {
                          await launchUrl(uri);
                        }
                      },
                      icon: const Icon(Icons.phone, size: 20),
                      label: const Text('Call Emergency', style: TextStyle(fontWeight: FontWeight.w700)),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.error,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildQuickAction(IconData icon, Color color, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Icon(icon, color: Colors.white, size: 22),
      ),
    );
  }

  Widget _buildRouteRow(IconData icon, Color color, String text) {
    return Row(
      children: [
        Icon(icon, color: color, size: 20),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            text,
            style: TextStyle(color: context.textColor, fontSize: 15, fontWeight: FontWeight.w500),
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }

  Color _getStatusColor(RideStatus status) {
    switch (status) {
      case RideStatus.accepted:
        return AppColors.warning;
      case RideStatus.arrivedAtPickup:
        return AppColors.yellow;
      case RideStatus.inProgress:
        return AppColors.success;
      default:
        return Colors.grey;
    }
  }

  IconData _getStatusIcon(RideStatus status) {
    switch (status) {
      case RideStatus.accepted:
        return Icons.directions_car;
      case RideStatus.arrivedAtPickup:
        return Icons.person_pin_circle;
      case RideStatus.inProgress:
        return Icons.navigation;
      default:
        return Icons.circle;
    }
  }

  String _getStatusText(RideStatus status) {
    switch (status) {
      case RideStatus.accepted:
        return 'HEADING TO PICKUP';
      case RideStatus.arrivedAtPickup:
        return 'WAITING FOR CUSTOMER';
      case RideStatus.inProgress:
        return 'TRIP IN PROGRESS';
      default:
        return 'ACTIVE';
    }
  }

  void _openChat(String customerName, String customerPhone) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => ChatScreen(
          customerName: customerName,
          customerPhone: customerPhone,
        ),
      ),
    );
  }

  Future<void> _makeCall(String phone) async {
    final uri = Uri.parse('tel:$phone');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }

  Widget _buildIncomingDuringTrip(BuildContext context, DriverState state) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.cardColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.warning.withValues(alpha: 0.5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(
                  color: AppColors.warning,
                  shape: BoxShape.circle,
                  boxShadow: [BoxShadow(color: AppColors.warning.withValues(alpha: 0.5), blurRadius: 8)],
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Rides on the Way',
                  style: TextStyle(color: context.textColor, fontSize: 16, fontWeight: FontWeight.w600),
                ),
              ),
              // Seat availability
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: state.hasAvailableSeats
                      ? AppColors.success.withValues(alpha: 0.15)
                      : AppColors.error.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.event_seat,
                      size: 14,
                      color: state.hasAvailableSeats ? AppColors.success : AppColors.error,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      '${state.availableSeats} seats',
                      style: TextStyle(
                        color: state.hasAvailableSeats ? AppColors.success : AppColors.error,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ...state.incomingRequests.take(2).map((request) => Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: context.bgColor,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: context.borderColor),
            ),
            child: Column(
              children: [
                Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: AppColors.yellow.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Icon(Icons.person, color: AppColors.yellow, size: 24),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(request.customerName, style: TextStyle(color: context.textColor, fontSize: 15, fontWeight: FontWeight.w600)),
                          const SizedBox(height: 2),
                          Text('${request.pickupLocation} → ${request.dropoffLocation}', style: TextStyle(color: context.mutedColor, fontSize: 13)),
                        ],
                      ),
                    ),
                    Text('${request.estimatedDistance} km', style: TextStyle(color: context.mutedColor, fontSize: 12)),
                  ],
                ),
                const SizedBox(height: 10),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: state.hasAvailableSeats
                        ? () {
                            HapticFeedback.heavyImpact();
                            state.addToQueue(request);
                            AppSnackbar.success(context, '${request.customerName} added', subtitle: '${state.availableSeats} seats left');
                          }
                        : null,
                    icon: Icon(state.hasAvailableSeats ? Icons.add_circle : Icons.block, size: 18),
                    label: Text(
                      state.hasAvailableSeats ? 'Add to Queue' : 'Vehicle Full',
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: state.hasAvailableSeats ? AppColors.yellow : context.borderColor,
                      foregroundColor: state.hasAvailableSeats ? Colors.black : context.mutedColor,
                      disabledBackgroundColor: context.borderColor,
                      disabledForegroundColor: context.mutedColor,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                  ),
                ),
              ],
            ),
          )),
        ],
      ),
    );
  }

  Widget _buildQueueSection(BuildContext context, DriverState state) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.cardColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.queue, color: AppColors.info, size: 20),
              const SizedBox(width: 8),
              Text(
                'Up Next',
                style: TextStyle(color: context.textColor, fontSize: 16, fontWeight: FontWeight.w600),
              ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.info.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  '${state.queuedRequests.length} in queue',
                  style: TextStyle(color: AppColors.info, fontSize: 12, fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ...state.queuedRequests.take(2).map((request) => Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: context.bgColor,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: AppColors.yellow.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.person, color: AppColors.yellow, size: 22),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(request.customerName, style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w600)),
                      Text('${request.pickupLocation} → ${request.dropoffLocation}', style: TextStyle(color: context.mutedColor, fontSize: 12)),
                    ],
                  ),
                ),
                Text('${request.estimatedDistance} km', style: TextStyle(color: context.mutedColor, fontSize: 12)),
              ],
            ),
          )),
        ],
      ),
    );
  }

  Widget _buildStatsCard(BuildContext context, DriverState state) {
    return Column(
      children: [
        // Main stats row
        Container(
          margin: const EdgeInsets.symmetric(horizontal: 20),
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: context.cardColor,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: context.borderColor),
          ),
          child: Row(
            children: [
              _buildStatItem(
                context,
                icon: Icons.today,
                label: 'Today',
                value: '${state.todayTrips}',
                color: AppColors.yellow,
              ),
              Container(
                width: 1,
                height: 50,
                color: context.borderColor,
              ),
              _buildStatItem(
                context,
                icon: Icons.bar_chart,
                label: 'Total',
                value: '${state.totalTrips}',
                color: AppColors.success,
              ),
              Container(
                width: 1,
                height: 50,
                color: context.borderColor,
              ),
              _buildStatItem(
                context,
                icon: Icons.star,
                label: 'Rating',
                value: state.rating.toStringAsFixed(1),
                color: AppColors.warning,
              ),
            ],
          ),
        ),

        // Shift info & distance
        if (state.hasActiveShift || state.isOnline)
          Container(
            margin: const EdgeInsets.fromLTRB(20, 12, 20, 0),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: AppColors.info.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.info.withValues(alpha: 0.3)),
            ),
            child: Row(
              children: [
                Icon(Icons.access_time, color: AppColors.info, size: 20),
                const SizedBox(width: 10),
                Expanded(
                  child: StreamBuilder(
                    stream: Stream.periodic(const Duration(seconds: 30)),
                    builder: (context, snapshot) {
                      final minutes = state.shiftDurationMinutes;
                      final hours = minutes ~/ 60;
                      final mins = minutes % 60;
                      return Text(
                        'Shift: ${hours}h ${mins}m',
                        style: TextStyle(
                          color: context.textColor,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      );
                    },
                  ),
                ),
                Container(
                  width: 1,
                  height: 24,
                  color: AppColors.info.withValues(alpha: 0.3),
                ),
                const SizedBox(width: 12),
                Icon(Icons.straighten, color: AppColors.info, size: 20),
                const SizedBox(width: 6),
                Text(
                  '${state.todayDistance.toStringAsFixed(1)} km',
                  style: TextStyle(
                    color: context.textColor,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }

  Widget _buildStatItem(
    BuildContext context, {
    required IconData icon,
    required String label,
    required String value,
    required Color color,
  }) {
    return Expanded(
      child: Column(
        children: [
          Icon(icon, color: color, size: 24),
          const SizedBox(height: 8),
          Text(
            value,
            style: TextStyle(
              color: context.textColor,
              fontSize: 22,
              fontWeight: FontWeight.w700,
            ),
          ),
          Text(
            label,
            style: TextStyle(
              color: context.mutedColor,
              fontSize: 12,
            ),
          ),
        ],
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
        borderRadius: BorderRadius.circular(35),
        child: BackdropFilter(
          filter: ui.ImageFilter.blur(sigmaX: 25, sigmaY: 25),
          child: Container(
            height: 65,
            decoration: BoxDecoration(
              color: navBgColor,
              borderRadius: BorderRadius.circular(35),
              border: Border.all(color: navBorderColor, width: 1),
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
                _buildNavItem(context, Icons.home_rounded, Icons.home_outlined, 0),
                _buildNavItem(context, Icons.history_rounded, Icons.history_outlined, 1),
                _buildNavItem(context, Icons.person_rounded, Icons.person_outline_rounded, 2),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildNavItem(
    BuildContext context,
    IconData activeIcon,
    IconData inactiveIcon,
    int index,
  ) {
    final isActive = _selectedTab == index;
    return GestureDetector(
      onTap: () {
        if (_selectedTab != index) {
          HapticFeedback.selectionClick();
          _onTabChanged(index);
        }
      },
      behavior: HitTestBehavior.opaque,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOutCubic,
        width: 65,
        height: 45,
        decoration: BoxDecoration(
          color: isActive ? context.bgColor : Colors.transparent,
          borderRadius: BorderRadius.circular(14),
        ),
        child: Icon(
          isActive ? activeIcon : inactiveIcon,
          color: isActive ? context.textColor : context.mutedColor,
          size: 24,
        ),
      ),
    );
  }
}
