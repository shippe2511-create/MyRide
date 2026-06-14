import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../providers/driver_state.dart';
import '../theme/app_theme.dart';

class NotificationsSettingsScreen extends StatefulWidget {
  const NotificationsSettingsScreen({super.key});

  @override
  State<NotificationsSettingsScreen> createState() =>
      _NotificationsSettingsScreenState();
}

class _NotificationsSettingsScreenState
    extends State<NotificationsSettingsScreen> {
  bool _rideRequests = true;
  bool _tripUpdates = true;
  bool _promotions = false;
  bool _sounds = true;
  bool _vibration = true;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.bgColor,
      appBar: AppBar(
        backgroundColor: context.bgColor,
        title: Text(
          'Notifications',
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
          // Push notifications section
          _buildSection(context, 'Push Notifications', [
            _buildSwitchTile(
              context,
              icon: Icons.local_taxi,
              title: 'Ride Requests',
              subtitle: 'Get notified when a new ride request comes in',
              value: _rideRequests,
              onChanged: (v) {
                HapticFeedback.selectionClick();
                setState(() => _rideRequests = v);
              },
            ),
            _buildSwitchTile(
              context,
              icon: Icons.update,
              title: 'Trip Updates',
              subtitle: 'Updates about your ongoing trips',
              value: _tripUpdates,
              onChanged: (v) {
                HapticFeedback.selectionClick();
                setState(() => _tripUpdates = v);
              },
            ),
            _buildSwitchTile(
              context,
              icon: Icons.campaign,
              title: 'Promotions',
              subtitle: 'News and special announcements',
              value: _promotions,
              onChanged: (v) {
                HapticFeedback.selectionClick();
                setState(() => _promotions = v);
              },
            ),
          ]),
          const SizedBox(height: 24),

          // Alert preferences
          _buildSection(context, 'Alert Preferences', [
            _buildSwitchTile(
              context,
              icon: Icons.volume_up,
              title: 'Sounds',
              subtitle: 'Play sound for notifications',
              value: _sounds,
              onChanged: (v) {
                HapticFeedback.selectionClick();
                setState(() => _sounds = v);
              },
            ),
            _buildSwitchTile(
              context,
              icon: Icons.vibration,
              title: 'Vibration',
              subtitle: 'Vibrate on notifications',
              value: _vibration,
              onChanged: (v) {
                HapticFeedback.selectionClick();
                setState(() => _vibration = v);
              },
            ),
          ]),
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

  Widget _buildSwitchTile(
    BuildContext context, {
    required IconData icon,
    required String title,
    required String subtitle,
    required bool value,
    required ValueChanged<bool> onChanged,
  }) {
    return ListTile(
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
      trailing: Switch(
        value: value,
        onChanged: onChanged,
        activeColor: AppColors.yellow,
      ),
    );
  }
}
