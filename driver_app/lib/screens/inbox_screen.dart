import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../theme/app_theme.dart';
import '../services/supabase_service.dart';
import '../providers/driver_state.dart';
import '../utils/timezone_utils.dart';
import '../widgets/shimmer_loading.dart';

class InboxMessage {
  final String id;
  final String title;
  final String subtitle;
  final DateTime time;
  final bool isRead;
  final MessageCategory category;

  InboxMessage({
    required this.id,
    required this.title,
    required this.subtitle,
    required this.time,
    required this.isRead,
    required this.category,
  });

  factory InboxMessage.fromJson(Map<String, dynamic> json) {
    return InboxMessage(
      id: json['id'],
      title: json['title'] ?? 'Notification',
      subtitle: json['message'] ?? json['body'] ?? '',
      time: MaldivesTimezone.parse(json['created_at']) ?? DateTime.now(),
      isRead: json['is_read'] ?? false,
      category: _parseCategory(json['notification_type'] ?? json['category']),
    );
  }

  static MessageCategory _parseCategory(String? cat) {
    switch (cat) {
      case 'promo':
        return MessageCategory.promo;
      case 'trip':
      case 'ride':
        return MessageCategory.trip;
      case 'safety':
        return MessageCategory.safety;
      default:
        return MessageCategory.system;
    }
  }
}

enum MessageCategory { promo, trip, safety, system }

class InboxScreen extends StatefulWidget {
  const InboxScreen({super.key});

  @override
  State<InboxScreen> createState() => _InboxScreenState();
}

class _InboxScreenState extends State<InboxScreen> {
  List<InboxMessage> _messages = [];
  bool _isLoading = true;
  RealtimeChannel? _subscription;
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    _initAndLoad();
  }

  Future<void> _initAndLoad() async {
    _loadMessages();
    _subscribeToNotifications();
    _pollTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      if (mounted) _loadMessages();
    });
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _subscription?.unsubscribe();
    super.dispose();
  }

  String? get _profileId {
    try {
      return Provider.of<DriverState>(context, listen: false).profileId;
    } catch (e) {
      return null;
    }
  }

  void _subscribeToNotifications() {
    final userId = _profileId;
    if (userId == null || userId.isEmpty) {
      debugPrint('Inbox: No profileId for subscription');
      return;
    }

    _subscription = SupabaseService.client
        .channel('driver_inbox_$userId')
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'notifications',
          callback: (payload) {
            final newUserId = payload.newRecord['user_id'];
            if (newUserId == userId) {
              _loadMessages();
            }
          },
        )
        .subscribe();
  }

  Future<void> _loadMessages() async {
    final userId = _profileId;
    if (userId == null || userId.isEmpty) {
      if (mounted) setState(() => _isLoading = false);
      return;
    }

    try {
      final response = await SupabaseService.client
          .from('notifications')
          .select()
          .eq('user_id', userId)
          .order('created_at', ascending: false)
          .limit(50);

      if (mounted) {
        setState(() {
          _messages = (response as List).map((m) => InboxMessage.fromJson(m)).toList();
          _isLoading = false;
        });
      }
    } catch (e) {
      debugPrint('Inbox: Error loading messages: $e');
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _onRefresh() async {
    HapticFeedback.lightImpact();
    await _loadMessages();
  }

  Future<void> _markAllRead() async {
    final userId = _profileId;
    if (userId == null || userId.isEmpty) return;

    HapticFeedback.lightImpact();
    try {
      await SupabaseService.markAllNotificationsAsRead(userId);
      setState(() {
        _messages = _messages.map((m) => InboxMessage(
          id: m.id,
          title: m.title,
          subtitle: m.subtitle,
          time: m.time,
          isRead: true,
          category: m.category,
        )).toList();
      });
    } catch (e) {
      debugPrint('Error marking all as read: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final topPadding = MediaQuery.of(context).padding.top;
    return Scaffold(
      backgroundColor: context.bgColor,
      body: RefreshIndicator(
        onRefresh: _onRefresh,
        color: AppColors.yellow,
        child: _isLoading
            ? const ShimmerList(itemCount: 5)
            : CustomScrollView(
                physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
                slivers: [
                  SliverToBoxAdapter(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SizedBox(height: topPadding),
                        _buildHeader(context),
                      ],
                    ),
                  ),
                  if (_messages.isEmpty)
                    SliverFillRemaining(
                      hasScrollBody: false,
                      child: _buildEmptyState(),
                    )
                  else
                    SliverPadding(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      sliver: SliverList(
                        delegate: SliverChildBuilderDelegate(
                          (context, index) => _buildMessageCard(_messages[index]),
                          childCount: _messages.length,
                        ),
                      ),
                    ),
                  SliverToBoxAdapter(
                    child: SizedBox(height: MediaQuery.of(context).padding.bottom + 100),
                  ),
                ],
              ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
    final unreadCount = _messages.where((m) => !m.isRead).length;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Inbox',
                style: TextStyle(
                  color: context.textColor,
                  fontSize: 28,
                  fontWeight: FontWeight.w800,
                ),
              ),
              if (unreadCount > 0)
                Text(
                  '$unreadCount unread message${unreadCount > 1 ? 's' : ''}',
                  style: TextStyle(color: context.mutedColor, fontSize: 13),
                ),
            ],
          ),
          if (unreadCount > 0)
            GestureDetector(
              onTap: _markAllRead,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: context.cardColor,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: context.borderColor),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.done_all, color: AppColors.yellow, size: 16),
                    const SizedBox(width: 6),
                    Text('Mark all read', style: TextStyle(color: context.textColor, fontSize: 12, fontWeight: FontWeight.w500)),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const SizedBox(height: 100),
          Container(
            width: 80,
            height: 80,
            decoration: BoxDecoration(
              color: context.cardColor,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Icon(Icons.inbox_rounded, color: context.mutedColor, size: 40),
          ),
          const SizedBox(height: 16),
          Text(
            'No messages',
            style: TextStyle(color: context.textColor, fontSize: 18, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 8),
          Text(
            'You\'re all caught up!',
            style: TextStyle(color: context.mutedColor, fontSize: 14),
          ),
        ],
      ),
    );
  }

  Widget _buildMessageCard(InboxMessage message) {
    final categoryData = _getCategoryData(message.category);

    return Dismissible(
      key: Key('inbox_${message.id}'),
      direction: DismissDirection.endToStart,
      background: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 20),
        margin: const EdgeInsets.only(bottom: 12),
        decoration: BoxDecoration(
          color: AppColors.error,
          borderRadius: BorderRadius.circular(18),
        ),
        child: const Icon(Icons.delete, color: Colors.white),
      ),
      onDismissed: (_) async {
        HapticFeedback.mediumImpact();
        setState(() {
          _messages.removeWhere((m) => m.id == message.id);
        });
        try {
          await SupabaseService.deleteNotification(message.id);
        } catch (e) {
          debugPrint('Error deleting notification: $e');
        }
      },
      child: GestureDetector(
        onTap: () {
          HapticFeedback.lightImpact();
          _showMessageDetail(message);
        },
        child: Container(
          margin: const EdgeInsets.only(bottom: 12),
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
                  color: categoryData['color'].withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(categoryData['icon'] as IconData, color: categoryData['color'] as Color, size: 22),
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
                            message.title,
                            style: TextStyle(
                              color: context.textColor,
                              fontSize: 15,
                              fontWeight: message.isRead ? FontWeight.w600 : FontWeight.w700,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (!message.isRead)
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
                      message.subtitle,
                      style: TextStyle(color: context.mutedColor, fontSize: 13),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      _formatTime(message.time),
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

  Map<String, dynamic> _getCategoryData(MessageCategory category) {
    switch (category) {
      case MessageCategory.promo:
        return {'icon': Icons.local_offer, 'color': AppColors.yellow};
      case MessageCategory.trip:
        return {'icon': Icons.directions_car, 'color': AppColors.success};
      case MessageCategory.safety:
        return {'icon': Icons.shield, 'color': AppColors.error};
      case MessageCategory.system:
        return {'icon': Icons.info_outline, 'color': context.mutedColor};
    }
  }

  String _formatTime(DateTime time) {
    final now = MaldivesTimezone.now();
    final diff = now.difference(time);

    if (diff.isNegative) return 'Just now';

    if (diff.inMinutes < 1) {
      return 'Just now';
    } else if (diff.inMinutes < 60) {
      return '${diff.inMinutes}m ago';
    } else if (diff.inHours < 24) {
      return '${diff.inHours}h ago';
    } else if (diff.inDays < 7) {
      return '${diff.inDays}d ago';
    } else {
      return '${time.day}/${time.month}/${time.year}';
    }
  }

  void _showMessageDetail(InboxMessage message) async {
    try {
      await SupabaseService.markNotificationAsRead(message.id);
    } catch (e) {
      debugPrint('Error marking as read: $e');
    }

    setState(() {
      final index = _messages.indexWhere((m) => m.id == message.id);
      if (index != -1) {
        _messages[index] = InboxMessage(
          id: message.id,
          title: message.title,
          subtitle: message.subtitle,
          time: message.time,
          isRead: true,
          category: message.category,
        );
      }
    });

    final categoryData = _getCategoryData(message.category);

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: context.cardColor,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
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
            Row(
              children: [
                Container(
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(
                    color: (categoryData['color'] as Color).withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Icon(categoryData['icon'] as IconData, color: categoryData['color'] as Color, size: 26),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        message.title,
                        style: TextStyle(
                          color: context.textColor,
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _formatTime(message.time),
                        style: TextStyle(color: context.mutedColor, fontSize: 13),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
            Text(
              message.subtitle,
              style: TextStyle(color: context.textColor, fontSize: 15, height: 1.5),
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () => Navigator.pop(context),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.yellow,
                  foregroundColor: Colors.black,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                child: const Text('Got it', style: TextStyle(fontWeight: FontWeight.w600)),
              ),
            ),
            SizedBox(height: MediaQuery.of(context).padding.bottom + 8),
          ],
        ),
      ),
    );
  }
}
