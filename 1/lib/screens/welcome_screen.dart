import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../widgets/brand_mark.dart';
import '../widgets/primary_button.dart';

class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.bgColor,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              const Spacer(flex: 2),
              const BrandMark(size: 72),
              const SizedBox(height: 24),
              Text(
                'MyRide',
                style: TextStyle(
                  color: context.textColor,
                  fontSize: 38,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -1.2,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'PREMIUM · ON DEMAND',
                style: TextStyle(
                  color: context.mutedColor,
                  fontSize: 13,
                  letterSpacing: 2,
                ),
              ),
              const Spacer(flex: 1),
              _buildFeatureRow(
                context,
                Icons.location_on_outlined,
                'Go anywhere',
                'Request a ride and get picked up in minutes',
              ),
              const SizedBox(height: 20),
              _buildFeatureRow(
                context,
                Icons.access_time,
                'Save time',
                'Skip the wait — your driver is always nearby',
              ),
              const SizedBox(height: 20),
              _buildFeatureRow(
                context,
                Icons.shield_outlined,
                'Stay safe',
                'Real-time tracking and verified drivers',
              ),
              const Spacer(flex: 2),
              PrimaryButton(
                text: 'Get Started',
                onPressed: () => Navigator.pushNamed(context, '/login'),
              ),
              const SizedBox(height: 12),
              TextButton(
                onPressed: () => Navigator.pushNamed(context, '/login'),
                child: RichText(
                  text: TextSpan(
                    text: 'Already have an account? ',
                    style: TextStyle(color: context.mutedColor, fontSize: 14),
                    children: const [
                      TextSpan(
                        text: 'Sign in',
                        style: TextStyle(
                          color: AppColors.yellow,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildFeatureRow(BuildContext context, IconData icon, String title, String subtitle) {
    return Row(
      children: [
        Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            color: AppColors.yellowSoft,
            borderRadius: BorderRadius.circular(14),
          ),
          child: Icon(icon, color: AppColors.yellow, size: 24),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: TextStyle(
                  color: context.textColor,
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 2),
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
      ],
    );
  }
}
