import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../theme/app_theme.dart';
import '../services/supabase_service.dart';
import '../widgets/shimmer_loading.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  List<Map<String, dynamic>> _notifications = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadNotifications();
  }

  Future<void> _loadNotifications() async {
    setState(() => _isLoading = true);
    try {
      final notifications = await SupabaseService.getInboxMessages();
      setState(() {
        _notifications = notifications;
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final unreadCount = _notifications.where((n) => !(n['is_read'] ?? false)).length;

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
              child: Text('Mark all read', style: TextStyle(color: AppColors.yellow)),
            ),
        ],
      ),
      body: _isLoading
          ? const ShimmerList(itemCount: 5)
          : RefreshIndicator(
              onRefresh: _loadNotifications,
              color: AppColors.yellow,
              child: _notifications.isEmpty
                  ? ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      children: [_buildEmptyState(context)],
                    )
                  : ListView.builder(
                      physics: const AlwaysScrollableScrollPhysics(),
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
    final type = notification['category'] as String? ?? 'system';
    final isRead = notification['is_read'] as bool? ?? false;

    IconData icon;
    Color iconColor;

    switch (type) {
      case 'ride':
      case 'trip':
        icon = Icons.directions_car;
        iconColor = AppColors.yellow;
        break;
      case 'promo':
        icon = Icons.local_offer;
        iconColor = AppColors.success;
        break;
      case 'announcement':
        icon = Icons.campaign;
        iconColor = Colors.blue;
        break;
      case 'safety':
        icon = Icons.shield;
        iconColor = AppColors.error;
        break;
      default:
        icon = Icons.notifications;
        iconColor = context.mutedColor;
    }

    return Dismissible(
      key: Key(notification['id'] as String),
      direction: DismissDirection.endToStart,
      background: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 20),
        color: AppColors.error,
        child: Icon(Icons.delete, color: Colors.white),
      ),
      onDismissed: (_) async {
        final removed = _notifications.removeAt(index);
        setState(() {});
        try {
          await SupabaseService.deleteNotification(notification['id']);
        } catch (e) {
          _notifications.insert(index, removed);
          setState(() {});
        }
      },
      child: GestureDetector(
        onTap: () {
          HapticFeedback.lightImpact();
          _showNotificationDetail(context, notification);
        },
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: isRead ? context.cardColor : AppColors.yellow.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: isRead ? context.borderColor : AppColors.yellow.withValues(alpha: 0.3),
            ),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: iconColor.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(icon, color: iconColor, size: 24),
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
                            notification['title'] as String? ?? 'Notification',
                            style: TextStyle(
                              color: context.textColor,
                              fontSize: 15,
                              fontWeight: isRead ? FontWeight.w500 : FontWeight.w700,
                            ),
                          ),
                        ),
                        if (!isRead)
                          Container(
                            width: 8,
                            height: 8,
                            decoration: BoxDecoration(
                              color: AppColors.yellow,
                              shape: BoxShape.circle,
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      notification['message'] as String? ?? notification['body'] as String? ?? '',
                      style: TextStyle(
                        color: context.mutedColor,
                        fontSize: 13,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      _formatTime(DateTime.parse(notification['created_at'])),
                      style: TextStyle(
                        color: context.mutedColor.withValues(alpha: 0.7),
                        fontSize: 11,
                      ),
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

  void _showNotificationDetail(BuildContext context, Map<String, dynamic> notification) async {
    final notifId = notification['id'];
    await SupabaseService.markMessageRead(notifId);

    final index = _notifications.indexWhere((n) => n['id'] == notifId);
    if (index != -1) {
      setState(() => _notifications[index]['is_read'] = true);
    }

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        padding: const EdgeInsets.fromLTRB(24, 16, 24, 30),
        decoration: BoxDecoration(
          color: context.cardColor,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: context.borderColor,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 24),
            Text(
              notification['title'] as String? ?? 'Notification',
              style: TextStyle(
                color: context.textColor,
                fontSize: 20,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              _formatTime(DateTime.parse(notification['created_at'])),
              style: TextStyle(
                color: context.mutedColor,
                fontSize: 13,
              ),
            ),
            const SizedBox(height: 16),
            Text(
              notification['message'] as String? ?? notification['body'] as String? ?? '',
              style: TextStyle(
                color: context.textColor,
                fontSize: 15,
                height: 1.5,
              ),
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () => Navigator.pop(ctx),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.yellow,
                  foregroundColor: Colors.black,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                child: Text('Got it', style: TextStyle(fontWeight: FontWeight.w600)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _markAllAsRead() async {
    HapticFeedback.mediumImpact();
    await SupabaseService.markAllMessagesRead();
    setState(() {
      for (var notification in _notifications) {
        notification['is_read'] = true;
      }
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('All notifications marked as read'),
        backgroundColor: AppColors.success,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    );
  }

  String _formatTime(DateTime time) {
    final now = DateTime.now();
    final diff = now.difference(time);

    if (diff.inMinutes < 1) {
      return 'Just now';
    } else if (diff.inMinutes < 60) {
      return '${diff.inMinutes}m ago';
    } else if (diff.inHours < 24) {
      return '${diff.inHours}h ago';
    } else if (diff.inDays == 1) {
      return 'Yesterday';
    } else if (diff.inDays < 7) {
      return '${diff.inDays}d ago';
    } else {
      return '${time.day}/${time.month}/${time.year}';
    }
  }
}
