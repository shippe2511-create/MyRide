import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import '../theme/app_theme.dart';
import '../services/supabase_service.dart';
import '../widgets/shimmer_loading.dart';

class HelpScreen extends StatefulWidget {
  const HelpScreen({super.key});

  @override
  State<HelpScreen> createState() => _HelpScreenState();
}

class _HelpScreenState extends State<HelpScreen> {
  List<Map<String, dynamic>> _contacts = [];
  List<Map<String, dynamic>> _faqs = [];
  Map<String, dynamic>? _emergency;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadContent();
  }

  Future<void> _loadContent() async {
    try {
      final data = await SupabaseService.client
          .from('help_content')
          .select()
          .eq('app_type', 'driver')
          .eq('is_active', true)
          .order('sort_order');

      final items = List<Map<String, dynamic>>.from(data);

      setState(() {
        _contacts = items.where((i) => i['content_type'] == 'contact').toList();
        _faqs = items.where((i) => i['content_type'] == 'faq').toList();
        _emergency = items.firstWhere(
          (i) => i['content_type'] == 'emergency',
          orElse: () => <String, dynamic>{},
        );
        if (_emergency!.isEmpty) _emergency = null;
        _loading = false;
      });
    } catch (e) {
      debugPrint('Error loading help content: $e');
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.bgColor,
      body: _loading
          ? const ShimmerList(itemCount: 5)
          : CustomScrollView(
              slivers: [
                SliverAppBar(
                  backgroundColor: context.bgColor,
                  floating: true,
                  snap: true,
                  title: Text(
                    'Help Center',
                    style: TextStyle(color: context.textColor),
                  ),
                  leading: IconButton(
                    icon: Icon(Icons.arrow_back, color: context.textColor),
                    onPressed: () => Navigator.pop(context),
                  ),
                ),
                SliverPadding(
                  padding: const EdgeInsets.all(20),
                  sliver: SliverList(
                    delegate: SliverChildListDelegate([
                // Live Chat with Support
                _buildSection(context, 'Live Support', [
                  _buildContactTile(
                    context,
                    icon: Icons.chat_bubble_outline_rounded,
                    title: 'Chat with Support',
                    subtitle: 'Get help from our support team',
                    onTap: () => Navigator.pushNamed(context, '/support-chat'),
                  ),
                ]),
                const SizedBox(height: 24),

                if (_contacts.isNotEmpty) ...[
                  _buildSection(context, 'Contact Support', [
                    for (final contact in _contacts)
                      _buildContactTile(
                        context,
                        icon: _getIcon(contact['icon']),
                        title: contact['title'] ?? '',
                        subtitle: contact['subtitle'] ?? '',
                        onTap: () => _handleContactTap(contact),
                      ),
                  ]),
                  const SizedBox(height: 24),
                ],

                if (_faqs.isNotEmpty) ...[
                  _buildSection(context, 'Frequently Asked Questions', [
                    for (final faq in _faqs)
                      _buildFaqTile(
                        context,
                        question: faq['title'] ?? '',
                        answer: faq['subtitle'] ?? '',
                      ),
                  ]),
                  const SizedBox(height: 24),
                ],

                if (_emergency != null)
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: AppColors.error.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: AppColors.error.withValues(alpha: 0.3)),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 48,
                          height: 48,
                          decoration: BoxDecoration(
                            color: AppColors.error,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Icon(
                            Icons.emergency,
                            color: Colors.white,
                            size: 24,
                          ),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                _emergency!['title'] ?? 'Emergency?',
                                style: TextStyle(
                                  color: context.textColor,
                                  fontWeight: FontWeight.bold,
                                  fontSize: 16,
                                ),
                              ),
                              Text(
                                _emergency!['subtitle'] ?? '',
                                style: TextStyle(
                                  color: context.mutedColor,
                                  fontSize: 14,
                                ),
                              ),
                            ],
                          ),
                        ),
                        ElevatedButton(
                          onPressed: () => _launchPhone(_emergency!['value'] ?? '119'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.error,
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          child: Text('Call ${_emergency!['value'] ?? '119'}'),
                        ),
                      ],
                    ),
                  ),
                const SizedBox(height: 40),
                    ]),
                  ),
                ),
              ],
            ),
    );
  }

  IconData _getIcon(String? iconName) {
    switch (iconName) {
      case 'phone':
        return Icons.phone;
      case 'email':
        return Icons.email;
      case 'whatsapp':
        return Icons.chat;
      case 'emergency':
        return Icons.emergency;
      default:
        return Icons.help;
    }
  }

  void _handleContactTap(Map<String, dynamic> contact) {
    final value = contact['value'] as String? ?? '';
    final icon = contact['icon'] as String? ?? '';

    switch (icon) {
      case 'phone':
        _launchPhone(value);
        break;
      case 'email':
        _launchEmail(value);
        break;
      case 'whatsapp':
        _launchWhatsApp(value);
        break;
    }
  }

  Widget _buildSection(BuildContext context, String title, List<Widget> children) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: TextStyle(
            color: context.mutedColor,
            fontSize: 13,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 12),
        Container(
          decoration: BoxDecoration(
            color: context.cardColor,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: context.borderColor),
          ),
          child: Column(children: children),
        ),
      ],
    );
  }

  Widget _buildContactTile(
    BuildContext context, {
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () {
          HapticFeedback.lightImpact();
          onTap();
        },
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: AppColors.yellow.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: AppColors.yellow, size: 22),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: TextStyle(
                        color: context.textColor,
                        fontWeight: FontWeight.w600,
                        fontSize: 15,
                      ),
                    ),
                    Text(
                      subtitle,
                      style: TextStyle(
                        color: context.mutedColor,
                        fontSize: 13,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, color: context.mutedColor, size: 22),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildFaqTile(
    BuildContext context, {
    required String question,
    required String answer,
  }) {
    return Theme(
      data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
      child: ExpansionTile(
        tilePadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        title: Text(
          question,
          style: TextStyle(
            color: context.textColor,
            fontWeight: FontWeight.w500,
            fontSize: 15,
          ),
        ),
        iconColor: context.mutedColor,
        collapsedIconColor: context.mutedColor,
        children: [
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: context.bgColor,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              answer,
              style: TextStyle(
                color: context.mutedColor,
                fontSize: 14,
                height: 1.5,
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _launchPhone(String phone) async {
    final uri = Uri.parse('tel:$phone');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }

  void _launchEmail(String email) async {
    final uri = Uri.parse('mailto:$email');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }

  void _launchWhatsApp(String phone) async {
    final cleanPhone = phone.replaceAll(RegExp(r'[^0-9]'), '');
    final uri = Uri.parse('https://wa.me/$cleanPhone');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }
}
