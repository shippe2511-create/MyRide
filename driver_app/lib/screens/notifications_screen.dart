import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../theme/app_theme.dart';
import '../services/supabase_service.dart';
import '../services/realtime_service.dart';
import '../providers/driver_state.dart';
import '../widgets/shimmer_loading.dart';
import '../utils/timezone_utils.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  List<Map<String, dynamic>> _notifications = [];
  bool _isLoading = true;
  StreamSubscription<Map<String, dynamic>>? _notificationsSubscription;
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    _loadNotifications();
    _subscribeToNotifications();
    // Poll every 5 seconds as fallback
    _pollTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      if (mounted) _loadNotificationsSilent();
    });
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _notificationsSubscription?.cancel();
    final driverState = Provider.of<DriverState>(context, listen: false);
    if (driverState.profileId.isNotEmpty) {
      RealtimeService().unsubscribeFromNotifications(driverState.profileId);
    }
    super.dispose();
  }

  void _subscribeToNotifications() {
    final driverState = Provider.of<DriverState>(context, listen: false);
    final profileId = driverState.profileId;
    if (profileId.isEmpty) return;

    _notificationsSubscription = RealtimeService().subscribeToNotifications(profileId).listen((data) {
      debugPrint('Notifications realtime update: ${data['event']}');
      // Only reload on INSERT (new notifications), not on DELETE/UPDATE
      final event = data['event'];
      if (event == 'INSERT' && mounted) {
        _loadNotifications();
      }
    });
  }

  Future<void> _loadNotifications() async {
    setState(() => _isLoading = true);
    try {
      final driverState = Provider.of<DriverState>(context, listen: false);
      final profileId = driverState.profileId;
      if (profileId.isNotEmpty) {
        final notifications = await SupabaseService.getDriverNotifications(profileId);
        setState(() {
          _notifications = notifications;
          _isLoading = false;
        });
      } else {
        setState(() => _isLoading = false);
      }
    } catch (e) {
      debugPrint('Error loading notifications: $e');
      setState(() => _isLoading = false);
    }
  }

  Future<void> _loadNotificationsSilent() async {
    try {
      final driverState = Provider.of<DriverState>(context, listen: false);
      final profileId = driverState.profileId;
      if (profileId.isNotEmpty) {
        final notifications = await SupabaseService.getDriverNotifications(profileId);
        if (mounted) {
          setState(() {
            _notifications = notifications;
          });
        }
      }
    } catch (e) {
      debugPrint('Error loading notifications: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final unreadCount = _notifications.where((n) => n['is_read'] != true).length;

    return Scaffold(
      backgroundColor: context.bgColor,
      body: _isLoading
          ? const ShimmerList(itemCount: 6)
          : _notifications.isEmpty
              ? CustomScrollView(
                  slivers: [
                    SliverAppBar(
                      backgroundColor: context.bgColor,
                      floating: true,
                      snap: true,
                      leading: IconButton(
                        icon: Icon(Icons.arrow_back, color: context.textColor),
                        onPressed: () => Navigator.pop(context),
                      ),
                      title: Text('Notifications', style: TextStyle(color: context.textColor)),
                    ),
                    SliverFillRemaining(child: _buildEmptyState(context)),
                  ],
                )
              : RefreshIndicator(
                  onRefresh: _loadNotifications,
                  color: AppColors.yellow,
                  child: CustomScrollView(
                    slivers: [
                      SliverAppBar(
                        backgroundColor: context.bgColor,
                        floating: true,
                        snap: true,
                        leading: IconButton(
                          icon: Icon(Icons.arrow_back, color: context.textColor),
                          onPressed: () => Navigator.pop(context),
                        ),
                        title: Text('Notifications', style: TextStyle(color: context.textColor)),
                        actions: [
                          if (unreadCount > 0)
                            TextButton(
                              onPressed: _markAllAsRead,
                              child: const Text('Mark all read', style: TextStyle(color: AppColors.yellow)),
                            ),
                        ],
                      ),
                      SliverPadding(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        sliver: SliverList(
                          delegate: SliverChildBuilderDelegate(
                            (context, index) {
                              final notification = _notifications[index];
                              return _buildNotificationCard(context, notification, index);
                            },
                            childCount: _notifications.length,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
    );
  }

  Widget _buildEmptyState(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(height: 100),
          Container(
            width: 100,
            height: 100,
            decoration: BoxDecoration(
              color: context.cardColor,
              borderRadius: BorderRadius.circular(24),
            ),
            child: Icon(Icons.notifications_off_outlined, size: 48, color: context.mutedColor),
          ),
          const SizedBox(height: 20),
          Text(
            'No Notifications',
            style: TextStyle(
              color: context.textColor,
              fontSize: 20,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'You\'re all caught up!',
            style: TextStyle(
              color: context.mutedColor,
              fontSize: 14,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildNotificationCard(BuildContext context, Map<String, dynamic> notification, int index) {
    final isRead = notification['is_read'] == true;
    final type = notification['notification_type'] as String? ?? notification['type'] as String? ?? 'system';
    final title = notification['title'] as String? ?? 'Notification';
    final message = notification['message'] as String? ?? '';
    final timeStr = notification['created_at'] as String?;
    final time = MaldivesTimezone.parse(timeStr);

    IconData icon;
    Color iconColor;
    bool isUrgent = type == 'urgent_backup';
    switch (type) {
      case 'ride':
        icon = Icons.local_taxi;
        iconColor = AppColors.yellow;
        break;
      case 'rating':
        icon = Icons.star;
        iconColor = Colors.amber;
        break;
      case 'announcement':
        icon = Icons.campaign;
        iconColor = AppColors.info;
        break;
      case 'urgent_backup':
        icon = Icons.warning_amber_rounded;
        iconColor = Colors.red;
        break;
      default:
        icon = Icons.notifications;
        iconColor = context.mutedColor;
    }

    return Dismissible(
      key: Key(notification['id']?.toString() ?? index.toString()),
      direction: DismissDirection.endToStart,
      onDismissed: (_) => _deleteNotification(index),
      background: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 20),
        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        decoration: BoxDecoration(
          color: AppColors.error,
          borderRadius: BorderRadius.circular(18),
        ),
        child: const Icon(Icons.delete, color: Colors.white),
      ),
      child: GestureDetector(
        onTap: () => _handleNotificationTap(notification, index),
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: isUrgent ? Colors.red.withValues(alpha: 0.15) : context.cardColor,
            borderRadius: BorderRadius.circular(18),
            border: isUrgent ? Border.all(color: Colors.red.withValues(alpha: 0.5), width: 2) : null,
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  color: iconColor.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(icon, color: iconColor, size: 22),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            title,
                            style: TextStyle(
                              color: context.textColor,
                              fontSize: 15,
                              fontWeight: isRead ? FontWeight.w600 : FontWeight.w700,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (!isRead)
                          Container(
                            width: 8,
                            height: 8,
                            decoration: const BoxDecoration(
                              color: AppColors.yellow,
                              shape: BoxShape.circle,
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      message,
                      style: TextStyle(color: context.mutedColor, fontSize: 13),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      time != null ? _formatTime(time) : '',
                      style: TextStyle(color: context.mutedColor.withValues(alpha: 0.7), fontSize: 11),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _formatTime(DateTime time) {
    final now = MaldivesTimezone.now();
    final diff = now.difference(time);

    if (diff.isNegative) return 'Just now';
    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return '${time.day}/${time.month}/${time.year}';
  }

  void _handleNotificationTap(Map<String, dynamic> notification, int index) async {
    final type = notification['notification_type'] as String? ?? notification['type'] as String? ?? 'system';

    // Mark as read first
    _markAsRead(index);

    // Handle urgent backup - show action dialog
    if (type == 'urgent_backup') {
      final data = notification['data'] as Map<String, dynamic>? ?? {};
      _showUrgentBackupDialog(data);
    }
  }

  void _showUrgentBackupDialog(Map<String, dynamic> data) {
    final routeName = data['route_name'] as String? ?? 'Unknown Route';
    final startStop = data['start_stop'] as String? ?? 'Unknown Stop';
    final vehicleNumber = data['vehicle_number'] as String? ?? 'Unknown Vehicle';
    final vehicleCapacity = data['vehicle_capacity'] as int? ?? 0;

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Container(
        decoration: BoxDecoration(
          color: context.cardColor,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        padding: EdgeInsets.only(
          left: 24,
          right: 24,
          top: 24,
          bottom: MediaQuery.of(ctx).padding.bottom + 24,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: context.mutedColor.withValues(alpha: 0.3),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 24),
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                color: Colors.red.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Icon(Icons.warning_amber_rounded, color: Colors.red, size: 40),
            ),
            const SizedBox(height: 16),
            Text(
              'Urgent Backup Required',
              style: TextStyle(
                color: context.textColor,
                fontSize: 22,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Passengers are waiting!',
              style: TextStyle(
                color: Colors.red,
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 24),

            // Route info
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: context.bgColor,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                children: [
                  _buildInfoRow(Icons.route_rounded, 'Route', routeName),
                  const SizedBox(height: 12),
                  _buildInfoRow(Icons.location_on, 'Start From', startStop),
                  const SizedBox(height: 12),
                  _buildInfoRow(Icons.directions_bus, 'Vehicle', '$vehicleNumber ($vehicleCapacity seats)'),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // Start button
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () {
                  Navigator.pop(ctx);
                  // Navigate to bus mode / schedule screen
                  Navigator.pushReplacementNamed(context, '/home');
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('Go to Bus Schedule to start the backup trip'),
                      backgroundColor: AppColors.yellow,
                      behavior: SnackBarBehavior.floating,
                    ),
                  );
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.red,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  elevation: 0,
                ),
                child: const Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.play_arrow_rounded, size: 24),
                    SizedBox(width: 8),
                    Text('Go to Schedule', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: Text(
                'Dismiss',
                style: TextStyle(color: context.mutedColor, fontSize: 14),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildInfoRow(IconData icon, String label, String value) {
    return Row(
      children: [
        Icon(icon, color: context.mutedColor, size: 20),
        const SizedBox(width: 12),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: TextStyle(color: context.mutedColor, fontSize: 12),
            ),
            Text(
              value,
              style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w600),
            ),
          ],
        ),
      ],
    );
  }

  void _markAsRead(int index) async {
    if (_notifications[index]['is_read'] == true) return;

    final notificationId = _notifications[index]['id']?.toString();
    if (notificationId != null) {
      try {
        await SupabaseService.markNotificationAsRead(notificationId);
        setState(() {
          _notifications[index] = {..._notifications[index], 'is_read': true};
        });
      } catch (e) {
        debugPrint('Error marking notification as read: $e');
      }
    }
  }

  void _markAllAsRead() async {
    final driverState = Provider.of<DriverState>(context, listen: false);
    final profileId = driverState.profileId;
    if (profileId.isNotEmpty) {
      try {
        await SupabaseService.markAllNotificationsAsRead(profileId);
        setState(() {
          _notifications = _notifications.map((n) => {...n, 'is_read': true}).toList();
        });
        HapticFeedback.lightImpact();
      } catch (e) {
        debugPrint('Error marking all notifications as read: $e');
      }
    }
  }

  void _deleteNotification(int index) async {
    final notificationId = _notifications[index]['id']?.toString();
    HapticFeedback.mediumImpact();
    setState(() {
      _notifications.removeAt(index);
    });

    if (notificationId != null) {
      try {
        await SupabaseService.deleteNotification(notificationId);
      } catch (e) {
        debugPrint('Error deleting notification: $e');
      }
    }
  }
}
