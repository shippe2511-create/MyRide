import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import '../theme/app_theme.dart';

class HelpScreen extends StatelessWidget {
  const HelpScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.bgColor,
      appBar: AppBar(
        backgroundColor: context.bgColor,
        title: Text(
          'Help Center',
          style: TextStyle(color: context.textColor),
        ),
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: context.textColor),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          // Contact support
          _buildSection(context, 'Contact Support', [
            _buildContactTile(
              context,
              icon: Icons.phone,
              title: 'Call Support',
              subtitle: '+960 3001234',
              onTap: () => _launchPhone('+9603001234'),
            ),
            _buildContactTile(
              context,
              icon: Icons.email,
              title: 'Email Support',
              subtitle: 'support@myride.mv',
              onTap: () => _launchEmail('support@myride.mv'),
            ),
            _buildContactTile(
              context,
              icon: Icons.chat,
              title: 'WhatsApp',
              subtitle: '+960 7001234',
              onTap: () => _launchWhatsApp('+9607001234'),
            ),
          ]),
          const SizedBox(height: 24),

          // FAQs
          _buildSection(context, 'Frequently Asked Questions', [
            _buildFaqTile(
              context,
              question: 'How do I accept a ride request?',
              answer:
                  'When you\'re online and a ride request comes in, tap "Accept Ride" to take the trip. You\'ll see customer details and can navigate to pickup.',
            ),
            _buildFaqTile(
              context,
              question: 'What if a customer doesn\'t show up?',
              answer:
                  'Wait at the pickup location for 5 minutes. If the customer doesn\'t arrive, you can cancel the trip. Contact support if issues persist.',
            ),
            _buildFaqTile(
              context,
              question: 'How do I update my vehicle info?',
              answer:
                  'Contact the admin to update your vehicle information. This ensures accurate records in the system.',
            ),
            _buildFaqTile(
              context,
              question: 'My app is not receiving ride requests?',
              answer:
                  'Make sure you\'re online (green toggle), have a stable internet connection, and location services are enabled.',
            ),
          ]),
          const SizedBox(height: 24),

          // Emergency
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
                    size: 26,
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Emergency?',
                        style: TextStyle(
                          color: context.textColor,
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'Call emergency services: 119',
                        style: TextStyle(
                          color: context.mutedColor,
                          fontSize: 14,
                        ),
                      ),
                    ],
                  ),
                ),
                GestureDetector(
                  onTap: () {
                    HapticFeedback.heavyImpact();
                    _launchPhone('119');
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.error,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Text(
                      'Call 119',
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSection(
      BuildContext context, String title, List<Widget> children) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 12),
          child: Text(
            title,
            style: TextStyle(
              color: context.mutedColor,
              fontSize: 13,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.5,
            ),
          ),
        ),
        Container(
          decoration: BoxDecoration(
            color: context.cardColor,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: context.borderColor),
          ),
          child: Column(
            children: children,
          ),
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
    return ListTile(
      onTap: () {
        HapticFeedback.lightImpact();
        onTap();
      },
      leading: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: AppColors.yellow.withValues(alpha: 0.15),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(icon, color: AppColors.yellow, size: 22),
      ),
      title: Text(
        title,
        style: TextStyle(
          color: context.textColor,
          fontSize: 15,
          fontWeight: FontWeight.w500,
        ),
      ),
      subtitle: Text(
        subtitle,
        style: TextStyle(
          color: context.mutedColor,
          fontSize: 13,
        ),
      ),
      trailing: Icon(Icons.chevron_right, color: context.mutedColor),
    );
  }

  Widget _buildFaqTile(
    BuildContext context, {
    required String question,
    required String answer,
  }) {
    return ExpansionTile(
      tilePadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      title: Text(
        question,
        style: TextStyle(
          color: context.textColor,
          fontSize: 15,
          fontWeight: FontWeight.w500,
        ),
      ),
      iconColor: AppColors.yellow,
      collapsedIconColor: context.mutedColor,
      children: [
        Text(
          answer,
          style: TextStyle(
            color: context.mutedColor,
            fontSize: 14,
            height: 1.5,
          ),
        ),
      ],
    );
  }

  Future<void> _launchPhone(String phone) async {
    final uri = Uri.parse('tel:$phone');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }

  Future<void> _launchEmail(String email) async {
    final uri = Uri.parse('mailto:$email');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }

  Future<void> _launchWhatsApp(String phone) async {
    final uri = Uri.parse('https://wa.me/$phone');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }
}
