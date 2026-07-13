import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../theme/app_theme.dart';
import '../services/supabase_service.dart';
import '../services/realtime_service.dart';
import '../widgets/shimmer_loading.dart';
import '../widgets/cached_avatar.dart';
import '../utils/timezone_utils.dart';

class AnnouncementsScreen extends StatefulWidget {
  const AnnouncementsScreen({super.key});

  @override
  State<AnnouncementsScreen> createState() => _AnnouncementsScreenState();
}

class _AnnouncementsScreenState extends State<AnnouncementsScreen> {
  List<Map<String, dynamic>> _announcements = [];
  bool _isLoading = true;
  StreamSubscription<Map<String, dynamic>>? _announcementsSubscription;
  final _realtimeService = RealtimeService();

  @override
  void initState() {
    super.initState();
    _loadAnnouncements();
    _subscribeToAnnouncements();
  }

  @override
  void dispose() {
    _announcementsSubscription?.cancel();
    _realtimeService.unsubscribe('announcements_realtime');
    super.dispose();
  }

  void _subscribeToAnnouncements() {
    _announcementsSubscription = _realtimeService
        .subscribeToAnnouncements()
        .listen((event) {
      debugPrint('Announcement update received: ${event['eventType']}');
      _loadAnnouncements();
    });
  }

  Future<void> _loadAnnouncements() async {
    setState(() => _isLoading = true);
    try {
      final announcements = await SupabaseService.getAnnouncements();
      setState(() {
        _announcements = announcements;
        _isLoading = false;
      });
    } catch (e) {
      debugPrint('Error loading announcements: $e');
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.bgColor,
      body: SafeArea(
        child: Column(
          children: [
            _buildHeader(),
            Expanded(
              child: _isLoading
                  ? const ShimmerList(itemCount: 4)
                  : _announcements.isEmpty
                      ? _buildEmptyState()
                      : _buildAnnouncementsList(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
      child: Row(
        children: [
          GestureDetector(
            onTap: () => Navigator.pop(context),
            child: Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: context.surfaceColor,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: context.borderColor),
              ),
              child: Icon(Icons.arrow_back_ios_new, color: context.textColor, size: 18),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Row(
              children: [
                Text('📢', style: TextStyle(fontSize: 22)),
                const SizedBox(width: 10),
                Text(
                  'Announcements',
                  style: TextStyle(color: context.textColor, fontSize: 22, fontWeight: FontWeight.w700),
                ),
              ],
            ),
          ),
          GestureDetector(
            onTap: _loadAnnouncements,
            child: Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: context.surfaceColor,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: context.borderColor),
              ),
              child: Icon(Icons.refresh, color: context.textColor, size: 20),
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
          Container(
            width: 80,
            height: 80,
            decoration: BoxDecoration(
              color: context.surfaceColor,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Icon(Icons.campaign, color: context.mutedColor, size: 40),
          ),
          const SizedBox(height: 16),
          Text(
            'No announcements',
            style: TextStyle(color: context.textColor, fontSize: 18, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 8),
          Text(
            'Check back later for updates',
            style: TextStyle(color: context.mutedColor, fontSize: 14),
          ),
        ],
      ),
    );
  }

  Widget _buildAnnouncementsList() {
    return RefreshIndicator(
      onRefresh: _loadAnnouncements,
      color: AppColors.yellow,
      child: ListView.builder(
        padding: const EdgeInsets.all(20),
        itemCount: _announcements.length,
        itemBuilder: (context, index) {
          final announcement = _announcements[index];
          return _buildAnnouncementCard(announcement);
        },
      ),
    );
  }

  Widget _buildAnnouncementCard(Map<String, dynamic> announcement) {
    final createdAt = MaldivesTimezone.parse(announcement['created_at']);
    final isNew = createdAt != null && MaldivesTimezone.now().difference(createdAt).inDays < 3;
    final priority = announcement['priority'] ?? 'normal';
    final color = priority == 'high'
        ? AppColors.error
        : priority == 'medium'
            ? AppColors.yellow
            : AppColors.success;

    return GestureDetector(
      onTap: () {
        HapticFeedback.lightImpact();
        _showAnnouncementDetail(announcement);
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: 16),
        decoration: BoxDecoration(
          color: context.surfaceColor,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: color.withValues(alpha: 0.3)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              height: 160,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [color.withValues(alpha: 0.3), color.withValues(alpha: 0.1)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
              ),
              child: Stack(
                children: [
                  if (announcement['image_url'] != null && announcement['image_url'].toString().isNotEmpty)
                    ClipRRect(
                      borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
                      child: CachedImage(
                        imageUrl: announcement['image_url'],
                        width: double.infinity,
                        height: 160,
                        fit: BoxFit.cover,
                        errorWidget: Center(child: Icon(Icons.campaign, color: color.withValues(alpha: 0.5), size: 50)),
                      ),
                    )
                  else
                    Center(child: Icon(Icons.campaign, color: color.withValues(alpha: 0.5), size: 50)),
                  if (isNew)
                    Positioned(
                      top: 12,
                      left: 12,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: AppColors.success,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          'NEW',
                          style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w700),
                        ),
                      ),
                    ),
                  Positioned(
                    top: 12,
                    right: 12,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: color.withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        priority.toUpperCase(),
                        style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w700),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    announcement['title'] ?? 'Untitled',
                    style: TextStyle(
                      color: context.textColor,
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    announcement['content'] ?? announcement['message'] ?? '',
                    style: TextStyle(color: context.mutedColor, fontSize: 14, height: 1.5),
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Icon(Icons.access_time, color: context.mutedColor, size: 14),
                      const SizedBox(width: 6),
                      Text(
                        createdAt != null ? _formatDate(createdAt) : '',
                        style: TextStyle(color: context.mutedColor, fontSize: 12),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _formatDate(DateTime date) {
    final months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${months[date.month - 1]} ${date.day}, ${date.year}';
  }

  void _showAnnouncementDetail(Map<String, dynamic> announcement) {
    final createdAt = MaldivesTimezone.parse(announcement['created_at']);
    final priority = announcement['priority'] ?? 'normal';
    final color = priority == 'high'
        ? AppColors.error
        : priority == 'medium'
            ? AppColors.yellow
            : AppColors.success;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => Container(
        height: MediaQuery.of(context).size.height * 0.75,
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: context.surfaceColor,
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: Column(
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
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                priority.toUpperCase(),
                style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w700),
              ),
            ),
            if (announcement['image_url'] != null && announcement['image_url'].toString().isNotEmpty) ...[
              const SizedBox(height: 16),
              ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: CachedImage(
                  imageUrl: announcement['image_url'],
                  width: double.infinity,
                  height: 180,
                  fit: BoxFit.cover,
                  errorWidget: const SizedBox.shrink(),
                ),
              ),
            ],
            const SizedBox(height: 16),
            Text(
              announcement['title'] ?? 'Untitled',
              style: TextStyle(
                color: context.textColor,
                fontSize: 24,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Icon(Icons.access_time, color: context.mutedColor, size: 14),
                const SizedBox(width: 6),
                Text(
                  createdAt != null ? _formatDate(createdAt) : '',
                  style: TextStyle(color: context.mutedColor, fontSize: 13),
                ),
              ],
            ),
            const SizedBox(height: 24),
            Expanded(
              child: SingleChildScrollView(
                child: Text(
                  announcement['content'] ?? announcement['message'] ?? '',
                  style: TextStyle(
                    color: context.textColor,
                    fontSize: 16,
                    height: 1.7,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () => Navigator.pop(context),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.yellow,
                  foregroundColor: AppColors.bgDark,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                child: Text('Close', style: TextStyle(fontWeight: FontWeight.w600)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
