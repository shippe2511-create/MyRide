import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../theme/app_theme.dart';
import '../services/supabase_service.dart';
import '../providers/driver_state.dart';

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
    final driverState = Provider.of<DriverState>(context, listen: false);
    final profileId = driverState.profileId;

    if (profileId.isEmpty) {
      setState(() => _isLoading = false);
      return;
    }

    try {
      final settings = await SupabaseService.getNotificationSettings(profileId);
      setState(() {
        _rideRequests = settings['ride_requests'] ?? true;
        _tripUpdates = settings['trip_updates'] ?? true;
        _promotions = settings['promotions'] ?? false;
        _sounds = settings['sounds'] ?? true;
        _vibration = settings['vibration'] ?? true;
        _isLoading = false;
      });
    } catch (e) {
      debugPrint('Error loading notification settings: $e');
      setState(() => _isLoading = false);
    }
  }

  Future<void> _saveSettings() async {
    final driverState = Provider.of<DriverState>(context, listen: false);
    final profileId = driverState.profileId;

    debugPrint('Saving notification settings for profileId: $profileId');

    if (profileId.isEmpty) {
      debugPrint('ProfileId is empty, cannot save settings');
      return;
    }

    try {
      await SupabaseService.updateNotificationSettings(profileId, {
        'ride_requests': _rideRequests,
        'trip_updates': _tripUpdates,
        'promotions': _promotions,
        'sounds': _sounds,
        'vibration': _vibration,
      });
    } catch (e) {
      debugPrint('Error saving notification settings: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text('Failed to save settings'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    }
  }

  void _updateSetting(String key, bool value) {
    HapticFeedback.selectionClick();
    setState(() {
      switch (key) {
        case 'ride_requests':
          _rideRequests = value;
          break;
        case 'trip_updates':
          _tripUpdates = value;
          break;
        case 'promotions':
          _promotions = value;
          break;
        case 'sounds':
          _sounds = value;
          break;
        case 'vibration':
          _vibration = value;
          break;
      }
    });
    _saveSettings();
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
                              onChanged: (v) => _updateSetting('ride_requests', v),
                            ),
                            _buildSwitchTile(
                              context,
                              icon: Icons.update,
                              title: 'Trip Updates',
                              subtitle: 'Updates about your ongoing trips',
                              value: _tripUpdates,
                              onChanged: (v) => _updateSetting('trip_updates', v),
                            ),
                            _buildSwitchTile(
                              context,
                              icon: Icons.campaign,
                              title: 'Promotions',
                              subtitle: 'News and special announcements',
                              value: _promotions,
                              onChanged: (v) => _updateSetting('promotions', v),
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
                              onChanged: (v) => _updateSetting('sounds', v),
                            ),
                            _buildSwitchTile(
                              context,
                              icon: Icons.vibration,
                              title: 'Vibration',
                              subtitle: 'Vibrate for notifications',
                              value: _vibration,
                              onChanged: (v) => _updateSetting('vibration', v),
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
