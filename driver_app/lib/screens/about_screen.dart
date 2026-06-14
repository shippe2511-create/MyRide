import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import '../theme/app_theme.dart';

class AboutScreen extends StatelessWidget {
  const AboutScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.bgColor,
      appBar: AppBar(
        backgroundColor: context.bgColor,
        title: Text(
          'About',
          style: TextStyle(color: context.textColor),
        ),
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: context.textColor),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            const SizedBox(height: 20),

            // App logo
            Container(
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
            const SizedBox(height: 16),

            // App name
            Text(
              'MyRide Driver',
              style: TextStyle(
                color: context.textColor,
                fontSize: 26,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Version 1.0.0',
              style: TextStyle(
                color: context.mutedColor,
                fontSize: 15,
              ),
            ),
            const SizedBox(height: 8),
            Container(
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
                    'MyRide is the official staff transportation app for IT Division employees. As a driver, you help provide free, safe, and comfortable rides for staff members.\n\nThis app allows you to receive ride requests, navigate to pickup locations, and manage your trips efficiently.',
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
              onTap: () => _launchUrl('https://myride.mv/terms'),
            ),
            const SizedBox(height: 8),
            _buildLinkTile(
              context,
              icon: Icons.privacy_tip_outlined,
              title: 'Privacy Policy',
              onTap: () => _launchUrl('https://myride.mv/privacy'),
            ),
            const SizedBox(height: 8),
            _buildLinkTile(
              context,
              icon: Icons.code_outlined,
              title: 'Open Source Libraries',
              subtitle: 'View third-party licenses',
              onTap: () => showLicensePage(
                context: context,
                applicationName: 'MyRide Driver',
                applicationVersion: '1.0.0',
                applicationIcon: Container(
                  margin: const EdgeInsets.all(16),
                  width: 60,
                  height: 60,
                  decoration: BoxDecoration(
                    color: AppColors.yellow,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: const Icon(Icons.local_taxi, color: Colors.black),
                ),
              ),
            ),
            const SizedBox(height: 40),

            // Copyright
            Text(
              '© 2026 IT Division',
              style: TextStyle(
                color: context.mutedColor,
                fontSize: 13,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'All rights reserved',
              style: TextStyle(
                color: context.mutedColor.withValues(alpha: 0.6),
                fontSize: 12,
              ),
            ),
            const SizedBox(height: 40),
          ],
        ),
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

  Future<void> _launchUrl(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }
}
