import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
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
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _rideRequests = prefs.getBool('notif_ride_requests') ?? true;
      _tripUpdates = prefs.getBool('notif_trip_updates') ?? true;
      _promotions = prefs.getBool('notif_promotions') ?? false;
      _sounds = prefs.getBool('notif_sounds') ?? true;
      _vibration = prefs.getBool('notif_vibration') ?? true;
      _isLoading = false;
    });
  }

  Future<void> _saveSetting(String key, bool value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(key, value);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.bgColor,
      body: _isLoading
          ? Center(child: CircularProgressIndicator(color: AppColors.yellow))
          : CustomScrollView(
              slivers: [
                SliverAppBar(
                  backgroundColor: context.bgColor,
                  floating: true,
                  snap: true,
                  title: Text(
                    'Notifications',
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
                      _saveSetting('notif_ride_requests', v);
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
                      _saveSetting('notif_trip_updates', v);
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
                      _saveSetting('notif_promotions', v);
                    },
                  ),
                ]),
                const SizedBox(height: 24),
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
                      _saveSetting('notif_sounds', v);
                    },
                  ),
                      _buildSwitchTile(
                        context,
                        icon: Icons.vibration,
                        title: 'Vibration',
                        subtitle: 'Vibrate for notifications',
                        value: _vibration,
                        onChanged: (v) {
                          HapticFeedback.selectionClick();
                          setState(() => _vibration = v);
                          _saveSetting('notif_vibration', v);
                        },
                      ),
                    ]),
                  ]),
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
        Text(
          title,
          style: TextStyle(
            color: context.mutedColor,
            fontSize: 13,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.5,
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

  Widget _buildSwitchTile(
    BuildContext context, {
    required IconData icon,
    required String title,
    required String subtitle,
    required bool value,
    required ValueChanged<bool> onChanged,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
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
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: TextStyle(
                    color: context.mutedColor,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
          Switch.adaptive(
            value: value,
            onChanged: onChanged,
            activeColor: AppColors.yellow,
          ),
        ],
      ),
    );
  }
}
