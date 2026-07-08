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
    final type = notification['type'] as String? ?? 'system';
    final title = notification['title'] as String? ?? 'Notification';
    final message = notification['message'] as String? ?? '';
    final timeStr = notification['created_at'] as String?;
    final time = MaldivesTimezone.parse(timeStr);

    IconData icon;
    Color iconColor;
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
        onTap: () => _markAsRead(index),
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: context.cardColor,
            borderRadius: BorderRadius.circular(18),
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
