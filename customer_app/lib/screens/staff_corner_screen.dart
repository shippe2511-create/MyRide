import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../theme/app_theme.dart';
import '../services/supabase_service.dart';
import '../utils/timezone_utils.dart';
import '../widgets/cached_avatar.dart';

class StaffCornerScreen extends StatefulWidget {
  const StaffCornerScreen({super.key});

  @override
  State<StaffCornerScreen> createState() => _StaffCornerScreenState();
}

class _StaffCornerScreenState extends State<StaffCornerScreen> {
  List<Map<String, dynamic>> _posts = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadPosts();
  }

  Future<void> _loadPosts() async {
    setState(() => _isLoading = true);
    try {
      final posts = await SupabaseService.getStaffCorner();
      setState(() {
        _posts = posts;
        _isLoading = false;
      });
    } catch (e) {
      debugPrint('Error loading staff corner: $e');
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
                  ? Center(child: CircularProgressIndicator(color: AppColors.yellow))
                  : _posts.isEmpty
                      ? _buildEmptyState()
                      : _buildPostsList(),
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
                Text('👥', style: TextStyle(fontSize: 22)),
                const SizedBox(width: 10),
                Text(
                  'Staff Corner',
                  style: TextStyle(color: context.textColor, fontSize: 22, fontWeight: FontWeight.w700),
                ),
              ],
            ),
          ),
          GestureDetector(
            onTap: _loadPosts,
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
            child: Icon(Icons.people, color: context.mutedColor, size: 40),
          ),
          const SizedBox(height: 16),
          Text(
            'No posts yet',
            style: TextStyle(color: context.textColor, fontSize: 18, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 8),
          Text(
            'Check back later for staff updates',
            style: TextStyle(color: context.mutedColor, fontSize: 14),
          ),
        ],
      ),
    );
  }

  Widget _buildPostsList() {
    return RefreshIndicator(
      onRefresh: _loadPosts,
      color: AppColors.yellow,
      child: ListView.builder(
        padding: const EdgeInsets.all(20),
        itemCount: _posts.length,
        itemBuilder: (context, index) {
          final post = _posts[index];
          return _buildPostCard(post);
        },
      ),
    );
  }

  Widget _buildPostCard(Map<String, dynamic> post) {
    final createdAt = MaldivesTimezone.parse(post['created_at']);
    final category = post['category'] ?? 'General';
    final imageUrl = post['image_url'] ?? '';

    return GestureDetector(
      onTap: () {
        HapticFeedback.lightImpact();
        _showPostDetail(post);
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: 16),
        decoration: BoxDecoration(
          color: context.surfaceColor,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: context.borderColor),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (imageUrl.isNotEmpty)
              ClipRRect(
                borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
                child: CachedImage(
                  imageUrl: imageUrl,
                  height: 180,
                  width: double.infinity,
                  fit: BoxFit.cover,
                  errorWidget: Container(
                    height: 180,
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [const Color(0xFF007AFF).withValues(alpha: 0.3), const Color(0xFF007AFF).withValues(alpha: 0.1)],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
                    ),
                    child: Center(
                      child: Icon(Icons.image, color: Color(0xFF007AFF), size: 50),
                    ),
                  ),
                ),
              )
            else
              Container(
                height: 120,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [const Color(0xFF007AFF).withValues(alpha: 0.3), const Color(0xFF007AFF).withValues(alpha: 0.1)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
                ),
                child: Stack(
                  children: [
                    Center(child: Icon(Icons.article, color: const Color(0xFF007AFF).withValues(alpha: 0.5), size: 50)),
                    Positioned(
                      top: 12,
                      left: 12,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: const Color(0xFF007AFF).withValues(alpha: 0.2),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          category,
                          style: TextStyle(color: Color(0xFF007AFF), fontSize: 10, fontWeight: FontWeight.w700),
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
                    post['title'] ?? 'Untitled',
                    style: TextStyle(
                      color: context.textColor,
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    post['content'] ?? '',
                    style: TextStyle(color: context.mutedColor, fontSize: 14, height: 1.5),
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      if (post['author'] != null) ...[
                        CircleAvatar(
                          radius: 12,
                          backgroundColor: AppColors.yellow.withValues(alpha: 0.2),
                          child: Text(
                            (post['author'] as String).substring(0, 1).toUpperCase(),
                            style: TextStyle(color: AppColors.yellow, fontSize: 10, fontWeight: FontWeight.w700),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          post['author'],
                          style: TextStyle(color: context.mutedColor, fontSize: 12, fontWeight: FontWeight.w500),
                        ),
                        const SizedBox(width: 12),
                      ],
                      Icon(Icons.access_time, color: context.mutedColor, size: 14),
                      const SizedBox(width: 4),
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
    final now = MaldivesTimezone.now();
    final diff = now.difference(date);

    // Handle negative differences
    if (diff.isNegative) return 'Just now';

    if (diff.inHours < 24) {
      if (diff.inMinutes < 1) return 'Just now';
      if (diff.inHours < 1) return '${diff.inMinutes}m ago';
      return '${diff.inHours}h ago';
    } else if (diff.inDays < 7) {
      return '${diff.inDays}d ago';
    } else {
      final months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return '${months[date.month - 1]} ${date.day}, ${date.year}';
    }
  }

  void _showPostDetail(Map<String, dynamic> post) {
    final createdAt = MaldivesTimezone.parse(post['created_at']);
    final imageUrl = post['image_url'] ?? '';

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => Container(
        height: MediaQuery.of(context).size.height * 0.85,
        decoration: BoxDecoration(
          color: context.surfaceColor,
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: Column(
          children: [
            const SizedBox(height: 12),
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: context.borderColor,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            Expanded(
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (imageUrl.isNotEmpty)
                      CachedImage(
                        imageUrl: imageUrl,
                        height: 250,
                        width: double.infinity,
                        fit: BoxFit.cover,
                        errorWidget: Container(
                          height: 200,
                          color: context.isDark ? AppColors.bgDark : Colors.white,
                          child: Center(child: Icon(Icons.image, color: context.mutedColor, size: 50)),
                        ),
                      ),
                    Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (post['category'] != null)
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                              margin: const EdgeInsets.only(bottom: 16),
                              decoration: BoxDecoration(
                                color: const Color(0xFF007AFF).withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Text(
                                post['category'],
                                style: TextStyle(color: Color(0xFF007AFF), fontSize: 11, fontWeight: FontWeight.w700),
                              ),
                            ),
                          Text(
                            post['title'] ?? 'Untitled',
                            style: TextStyle(
                              color: context.textColor,
                              fontSize: 24,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(height: 12),
                          Row(
                            children: [
                              if (post['author'] != null) ...[
                                CircleAvatar(
                                  radius: 14,
                                  backgroundColor: AppColors.yellow.withValues(alpha: 0.2),
                                  child: Text(
                                    (post['author'] as String).substring(0, 1).toUpperCase(),
                                    style: TextStyle(color: AppColors.yellow, fontSize: 12, fontWeight: FontWeight.w700),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Text(
                                  post['author'],
                                  style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w500),
                                ),
                                const SizedBox(width: 12),
                              ],
                              Icon(Icons.access_time, color: context.mutedColor, size: 14),
                              const SizedBox(width: 4),
                              Text(
                                createdAt != null ? _formatDate(createdAt) : '',
                                style: TextStyle(color: context.mutedColor, fontSize: 13),
                              ),
                            ],
                          ),
                          const SizedBox(height: 24),
                          Text(
                            post['content'] ?? '',
                            style: TextStyle(
                              color: context.textColor,
                              fontSize: 16,
                              height: 1.7,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(24),
              child: SizedBox(
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
            ),
          ],
        ),
      ),
    );
  }
}
