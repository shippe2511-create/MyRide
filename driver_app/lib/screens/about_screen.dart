import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../theme/app_theme.dart';
import '../services/supabase_service.dart';

const String _defaultTerms = '''MyRide Driver Terms & Conditions

1. SERVICE AGREEMENT
By using the MyRide Driver app, you agree to provide safe, professional transportation services to staff members.

2. DRIVER RESPONSIBILITIES
- Maintain a valid driving license at all times
- Follow all traffic laws and regulations
- Keep your vehicle clean and well-maintained
- Treat all passengers with respect and courtesy
- Complete assigned rides promptly

3. SAFETY REQUIREMENTS
- Complete pre-trip vehicle inspections
- Report any safety concerns immediately
- Use the SOS feature in emergencies
- Never use mobile devices while driving

4. DATA & PRIVACY
- Your location is tracked during active shifts
- Ride data is stored for record-keeping
- Personal information is protected per our privacy policy

5. TERMINATION
MyRide reserves the right to suspend or terminate driver accounts for violations of these terms.

For questions, contact support at itadminsupport@macl.aero''';

const String _defaultPrivacy = '''MyRide Driver Privacy Policy

1. INFORMATION WE COLLECT
- Personal details: name, phone, email, employee ID
- Location data during active shifts
- Vehicle and trip information
- App usage analytics

2. HOW WE USE YOUR DATA
- To facilitate ride assignments and navigation
- To maintain safety and security records
- To improve our services
- To communicate important updates

3. DATA SHARING
- With passengers (name, vehicle info only)
- With administrators for operational purposes
- We never sell your personal information

4. DATA SECURITY
- All data is encrypted in transit and at rest
- Access is restricted to authorized personnel
- Regular security audits are conducted

5. YOUR RIGHTS
- Request access to your data
- Request correction of inaccuracies
- Request deletion of your account

Contact: itadminsupport@macl.aero''';

class AboutScreen extends StatefulWidget {
  const AboutScreen({super.key});

  @override
  State<AboutScreen> createState() => _AboutScreenState();
}

class _AboutScreenState extends State<AboutScreen> {
  String _aboutText = 'MyRide is the official staff transportation app for IT Division employees. As a driver, you help provide free, safe, and comfortable rides for staff members.\n\nThis app allows you to receive ride requests, navigate to pickup locations, and manage your trips efficiently.';

  @override
  void initState() {
    super.initState();
    _loadAboutText();
  }

  Future<void> _loadAboutText() async {
    try {
      final page = await SupabaseService.client
          .from('pages')
          .select('content')
          .eq('slug', 'about-driver-app')
          .eq('is_active', true)
          .maybeSingle();
      if (page != null && page['content'] != null && mounted) {
        setState(() => _aboutText = page['content']);
      }
    } catch (e) {
      debugPrint('Failed to load about text: $e');
    }
  }

  Future<void> _showLegalFromDatabase(String slug, String title, String fallback) async {
    String content = fallback;
    try {
      final page = await SupabaseService.client
          .from('pages')
          .select('content')
          .eq('slug', slug)
          .eq('is_active', true)
          .maybeSingle();
      if (page != null && page['content'] != null) {
        content = page['content'];
      }
    } catch (e) {
      debugPrint('Failed to load legal content: $e');
    }
    if (!mounted) return;
    _showLegalDocument(title, content);
  }

  void _showLegalDocument(String title, String content) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Container(
        padding: const EdgeInsets.all(24),
        constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.85),
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
            const SizedBox(height: 20),
            Text(
              title,
              style: TextStyle(
                color: context.textColor,
                fontSize: 20,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 20),
            Expanded(
              child: SingleChildScrollView(
                child: Text(
                  content,
                  style: TextStyle(
                    color: context.mutedColor,
                    fontSize: 14,
                    height: 1.6,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () => Navigator.pop(ctx),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.yellow,
                  foregroundColor: Colors.black,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                child: const Text('Close', style: TextStyle(fontWeight: FontWeight.w600)),
              ),
            ),
            SizedBox(height: MediaQuery.of(context).padding.bottom),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.bgColor,
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            backgroundColor: context.bgColor,
            floating: true,
            snap: true,
            title: Text(
              'About',
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
                const SizedBox(height: 20),

                // App logo
                Center(
                  child: Container(
                    width: 100,
                    height: 100,
                    decoration: BoxDecoration(
                      color: AppColors.yellow,
                      borderRadius: BorderRadius.circular(24),
                    ),
                    child: const Icon(
                      Icons.local_taxi,
                      size: 56,
                      color: Colors.black,
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // App name
                Center(
                  child: Text(
                    'MyRide Driver',
                    style: TextStyle(
                      color: context.textColor,
                      fontSize: 26,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                const SizedBox(height: 4),
                Center(
                  child: Text(
                    'Version 1.0.0',
                    style: TextStyle(
                      color: context.mutedColor,
                      fontSize: 15,
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                Center(
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: AppColors.success.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Text(
                      'Staff Transport Service',
                      style: TextStyle(
                        color: AppColors.success,
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 40),

                // About text
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: context.cardColor,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: context.borderColor),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'About MyRide',
                        style: TextStyle(
                          color: context.textColor,
                          fontSize: 17,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        _aboutText,
                        style: TextStyle(
                          color: context.mutedColor,
                          fontSize: 15,
                          height: 1.6,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // Links
                _buildLinkTile(
                  context,
                  icon: Icons.description_outlined,
                  title: 'Terms of Service',
                  onTap: () => _showLegalFromDatabase('terms-of-service', 'Terms of Service', _defaultTerms),
                ),
                const SizedBox(height: 8),
                _buildLinkTile(
                  context,
                  icon: Icons.privacy_tip_outlined,
                  title: 'Privacy Policy',
                  onTap: () => _showLegalFromDatabase('privacy-policy', 'Privacy Policy', _defaultPrivacy),
                ),
                                const SizedBox(height: 40),

                // Copyright
                Center(
                  child: Text(
                    '© 2026 IT Division',
                    style: TextStyle(
                      color: context.mutedColor,
                      fontSize: 13,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ),
                const SizedBox(height: 4),
                Center(
                  child: Text(
                    'All rights reserved',
                    style: TextStyle(
                      color: context.mutedColor.withValues(alpha: 0.6),
                      fontSize: 12,
                    ),
                    textAlign: TextAlign.center,
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

  Widget _buildLinkTile(
    BuildContext context, {
    required IconData icon,
    required String title,
    String? subtitle,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: () {
        HapticFeedback.lightImpact();
        onTap();
      },
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: context.cardColor,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: context.borderColor),
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
                      fontSize: 15,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  if (subtitle != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: TextStyle(
                        color: context.mutedColor,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: context.mutedColor),
          ],
        ),
      ),
    );
  }
}
