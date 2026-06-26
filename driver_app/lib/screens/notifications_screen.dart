import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../theme/app_theme.dart';
import '../services/supabase_service.dart';
import '../services/realtime_service.dart';
import '../providers/driver_state.dart';
import '../widgets/shimmer_loading.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  List<Map<String, dynamic>> _notifications = [];
  bool _isLoading = true;
  StreamSubscription<Map<String, dynamic>>? _notificationsSubscription;

  @override
  void initState() {
    super.initState();
    _loadNotifications();
    _subscribeToNotifications();
  }

  @override
  void dispose() {
    _notificationsSubscription?.cancel();
    final driverState = Provider.of<DriverState>(context, listen: false);
    if (driverState.driverId.isNotEmpty) {
      RealtimeService().unsubscribeFromNotifications(driverState.driverId);
    }
    super.dispose();
  }

  void _subscribeToNotifications() {
    final driverState = Provider.of<DriverState>(context, listen: false);
    final driverId = driverState.driverId;
    if (driverId.isEmpty) return;

    _notificationsSubscription = RealtimeService().subscribeToNotifications(driverId).listen((data) {
      debugPrint('Notifications realtime update: ${data['event']}');
      // Reload notifications when there's any change
      _loadNotifications();
    });
  }

  Future<void> _loadNotifications() async {
    setState(() => _isLoading = true);
    try {
      final driverState = Provider.of<DriverState>(context, listen: false);
      final driverId = driverState.driverId;
      if (driverId.isNotEmpty) {
        final notifications = await SupabaseService.getDriverNotifications(driverId);
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

  @override
  Widget build(BuildContext context) {
    final unreadCount = _notifications.where((n) => n['read'] != true).length;

    return Scaffold(
      backgroundColor: context.bgColor,
      appBar: AppBar(
        backgroundColor: context.bgColor,
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
      body: _isLoading
          ? const ShimmerList(itemCount: 6)
          : _notifications.isEmpty
              ? _buildEmptyState(context)
              : RefreshIndicator(
                  onRefresh: _loadNotifications,
                  color: AppColors.yellow,
                  child: ListView.builder(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    itemCount: _notifications.length,
                    itemBuilder: (context, index) {
                      final notification = _notifications[index];
                      return _buildNotificationCard(context, notification, index);
                    },
                  ),
                ),
    );
  }

  Widget _buildEmptyState(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.notifications_none, size: 80, color: context.mutedColor),
          const SizedBox(height: 16),
          Text('No notifications', style: TextStyle(color: context.mutedColor, fontSize: 18)),
          const SizedBox(height: 8),
          Text('You\'re all caught up!', style: TextStyle(color: context.mutedColor, fontSize: 14)),
        ],
      ),
    );
  }

  Widget _buildNotificationCard(BuildContext context, Map<String, dynamic> notification, int index) {
    final isRead = notification['read'] == true;
    final type = notification['type'] as String? ?? 'system';
    final title = notification['title'] as String? ?? 'Notification';
    final message = notification['message'] as String? ?? '';
    final timeStr = notification['created_at'] as String?;
    final time = timeStr != null ? DateTime.tryParse(timeStr)?.toLocal() : null;

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
        color: AppColors.error,
        child: const Icon(Icons.delete, color: Colors.white),
      ),
      child: InkWell(
        onTap: () => _markAsRead(index),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: isRead ? context.cardColor : AppColors.yellow.withValues(alpha: 0.1),
            border: Border(bottom: BorderSide(color: context.borderColor, width: 0.5)),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: iconColor.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: iconColor, size: 24),
              ),
              const SizedBox(width: 12),
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
                              fontWeight: isRead ? FontWeight.w500 : FontWeight.w600,
                            ),
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
                    const SizedBox(height: 6),
                    Text(
                      time != null ? _formatTime(time) : '',
                      style: TextStyle(color: context.mutedColor.withValues(alpha: 0.7), fontSize: 12),
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
    final now = DateTime.now();
    final diff = now.difference(time);

    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return '${time.day}/${time.month}/${time.year}';
  }

  void _markAsRead(int index) async {
    if (_notifications[index]['read'] == true) return;

    final notificationId = _notifications[index]['id']?.toString();
    if (notificationId != null) {
      try {
        await SupabaseService.markNotificationAsRead(notificationId);
        setState(() {
          _notifications[index] = {..._notifications[index], 'read': true};
        });
      } catch (e) {
        debugPrint('Error marking notification as read: $e');
      }
    }
  }

  void _markAllAsRead() async {
    final driverState = Provider.of<DriverState>(context, listen: false);
    final driverId = driverState.driverId;
    if (driverId.isNotEmpty) {
      try {
        await SupabaseService.markAllNotificationsAsRead(driverId);
        setState(() {
          _notifications = _notifications.map((n) => {...n, 'read': true}).toList();
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
