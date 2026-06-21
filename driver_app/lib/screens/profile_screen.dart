import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import '../providers/driver_state.dart';
import '../theme/app_theme.dart';
import '../services/supabase_service.dart';
import '../widgets/floating_nav_bar.dart';
import 'stats_screen.dart';
import 'vehicle_logs_screen.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final ImagePicker _picker = ImagePicker();

  Future<void> _showImagePickerOptions(DriverState state) async {
    HapticFeedback.mediumImpact();
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        decoration: BoxDecoration(
          color: context.cardColor,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 30),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: context.borderColor,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 20),
              Text(
                'Change Profile Photo',
                style: TextStyle(
                  color: context.textColor,
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 20),
              Row(
                children: [
                  Expanded(
                    child: _buildImageOption(
                      icon: Icons.camera_alt,
                      label: 'Camera',
                      color: AppColors.yellow,
                      onTap: () {
                        Navigator.pop(ctx);
                        _pickImage(ImageSource.camera, state);
                      },
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _buildImageOption(
                      icon: Icons.photo_library,
                      label: 'Gallery',
                      color: AppColors.success,
                      onTap: () {
                        Navigator.pop(ctx);
                        _pickImage(ImageSource.gallery, state);
                      },
                    ),
                  ),
                  if (state.profileImagePath.isNotEmpty) ...[
                    const SizedBox(width: 12),
                    Expanded(
                      child: _buildImageOption(
                        icon: Icons.delete,
                        label: 'Remove',
                        color: AppColors.error,
                        onTap: () {
                          Navigator.pop(ctx);
                          state.updateProfileImage('');
                        },
                      ),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 16),
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: Text(
                  'Cancel',
                  style: TextStyle(color: context.mutedColor, fontSize: 15),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildImageOption({
    required IconData icon,
    required String label,
    required Color color,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: () {
        HapticFeedback.mediumImpact();
        onTap();
      },
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 20),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: color.withValues(alpha: 0.3)),
        ),
        child: Column(
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                color: color,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(icon, color: Colors.white, size: 28),
            ),
            const SizedBox(height: 10),
            Text(
              label,
              style: TextStyle(
                color: context.textColor,
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _pickImage(ImageSource source, DriverState state) async {
    try {
      final XFile? image = await _picker.pickImage(
        source: source,
        maxWidth: 512,
        maxHeight: 512,
        imageQuality: 80,
      );

      if (image != null) {
        // Save to app documents directory
        final directory = await getApplicationDocumentsDirectory();
        final fileName = 'profile_${DateTime.now().millisecondsSinceEpoch}.jpg';
        final savedPath = '${directory.path}/$fileName';

        // Copy the image to app directory
        await File(image.path).copy(savedPath);

        // Upload to cloud storage
        if (state.driverId.isNotEmpty) {
          final avatarUrl = await SupabaseService.uploadAvatar(savedPath, state.driverId);
          if (avatarUrl != null) {
            await SupabaseService.updateDriverAvatarUrl(state.driverId, avatarUrl);
            await state.updateAvatarUrl(avatarUrl);
          }
        }

        // Update local state immediately
        await state.updateProfileImage(savedPath);

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: const Text('Profile photo saved!'),
              backgroundColor: AppColors.success,
              behavior: SnackBarBehavior.floating,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: ${e.toString()}'),
            backgroundColor: AppColors.error,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
            ),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.bgColor,
      body: SafeArea(
        child: Consumer<DriverState>(
          builder: (context, state, _) {
            return SingleChildScrollView(
              padding: EdgeInsets.fromLTRB(20, 20, 20, getNavBarHeight(context) + 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Header
                  Text(
                    'Profile',
                    style: TextStyle(
                      color: context.textColor,
                      fontSize: 24,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Profile header with photo
                  _buildProfileHeader(context, state),
                  const SizedBox(height: 24),

                  // Stats card
                  _buildStatsCard(context, state),
                  const SizedBox(height: 24),

                  // Settings section
                  _buildSection(context, 'Settings', [
                    _buildSettingTile(
                      context,
                      icon: Icons.dark_mode,
                      title: 'Dark Mode',
                      trailing: Switch(
                        value: state.isDarkMode,
                        onChanged: (_) {
                          HapticFeedback.selectionClick();
                          state.toggleDarkMode();
                        },
                        activeColor: AppColors.yellow,
                      ),
                    ),
                  _buildSettingTile(
                    context,
                    icon: Icons.notifications_outlined,
                    title: 'Notifications',
                    trailing: Icon(
                      Icons.chevron_right,
                      color: context.mutedColor,
                    ),
                    onTap: () {
                      HapticFeedback.lightImpact();
                      Navigator.pushNamed(context, '/notifications');
                    },
                  ),
                ]),
                const SizedBox(height: 16),

                // Quick Actions section
                _buildSection(context, 'Quick Actions', [
                  _buildSettingTile(
                    context,
                    icon: Icons.bar_chart,
                    title: 'My Stats',
                    trailing: Icon(Icons.chevron_right, color: context.mutedColor),
                    onTap: () {
                      HapticFeedback.lightImpact();
                      Navigator.push(
                        context,
                        MaterialPageRoute(builder: (_) => DriverStatsScreen(driverId: state.driverId)),
                      );
                    },
                  ),
                  _buildSettingTile(
                    context,
                    icon: Icons.local_gas_station,
                    title: 'Vehicle Logs',
                    trailing: Icon(Icons.chevron_right, color: context.mutedColor),
                    iconColor: Colors.orange,
                    onTap: () {
                      HapticFeedback.lightImpact();
                      Navigator.push(
                        context,
                        MaterialPageRoute(builder: (_) => const VehicleLogsScreen()),
                      );
                    },
                  ),
                  _buildSettingTile(
                    context,
                    icon: Icons.star_outline,
                    title: 'Ratings & Feedback',
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          '${state.rating}',
                          style: TextStyle(
                            color: AppColors.yellow,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        Icon(Icons.star, color: AppColors.yellow, size: 16),
                        const SizedBox(width: 4),
                        Icon(Icons.chevron_right, color: context.mutedColor),
                      ],
                    ),
                    onTap: () {
                      HapticFeedback.lightImpact();
                      Navigator.pushNamed(context, '/ratings');
                    },
                  ),
                  _buildSettingTile(
                    context,
                    icon: Icons.folder_outlined,
                    title: 'Documents',
                    trailing: Icon(Icons.chevron_right, color: context.mutedColor),
                    onTap: () {
                      HapticFeedback.lightImpact();
                      Navigator.pushNamed(context, '/documents');
                    },
                  ),
                  _buildSettingTile(
                    context,
                    icon: Icons.schedule_outlined,
                    title: 'Shift Schedule',
                    trailing: Icon(Icons.chevron_right, color: context.mutedColor),
                    onTap: () {
                      HapticFeedback.lightImpact();
                      Navigator.pushNamed(context, '/shift-schedule');
                    },
                  ),
                  _buildSettingTile(
                    context,
                    icon: Icons.notifications_outlined,
                    title: 'Notifications',
                    trailing: Icon(Icons.chevron_right, color: context.mutedColor),
                    onTap: () {
                      HapticFeedback.lightImpact();
                      Navigator.pushNamed(context, '/notifications-list');
                    },
                  ),
                ]),
                const SizedBox(height: 16),

                // Emergency section
                _buildSection(context, 'Emergency', [
                  _buildSettingTile(
                    context,
                    icon: Icons.sos,
                    title: 'SOS / Emergency',
                    trailing: Icon(Icons.chevron_right, color: context.mutedColor),
                    iconColor: AppColors.error,
                    onTap: () {
                      HapticFeedback.lightImpact();
                      Navigator.pushNamed(context, '/sos');
                    },
                  ),
                ]),
                const SizedBox(height: 16),

                // Vehicle info section
                _buildSection(context, 'Vehicle Info', [
                  _buildInfoTile(
                    context,
                    icon: Icons.directions_car_outlined,
                    title: state.vehicleNumber.isNotEmpty ? state.vehicleNumber : 'Not Assigned',
                    value: state.vehicleModel.isNotEmpty ? state.vehicleModel : 'No vehicle assigned',
                  ),
                  _buildInfoTile(
                    context,
                    icon: Icons.badge_outlined,
                    title: 'Employee ID',
                    value:
                        state.employeeId.isNotEmpty ? state.employeeId : 'Not set',
                  ),
                  _buildInfoTile(
                    context,
                    icon: Icons.phone_outlined,
                    title: 'Phone',
                    value: state.phoneNumber.isNotEmpty
                        ? state.phoneNumber
                        : 'Not set',
                  ),
                ]),
                const SizedBox(height: 16),

                // Support section
                _buildSection(context, 'Support', [
                  _buildSettingTile(
                    context,
                    icon: Icons.help_outline,
                    title: 'Help Center',
                    trailing: Icon(
                      Icons.chevron_right,
                      color: context.mutedColor,
                    ),
                    onTap: () {
                      HapticFeedback.lightImpact();
                      Navigator.pushNamed(context, '/help');
                    },
                  ),
                  _buildSettingTile(
                    context,
                    icon: Icons.info_outline,
                    title: 'About',
                    trailing: Icon(
                      Icons.chevron_right,
                      color: context.mutedColor,
                    ),
                    onTap: () {
                      HapticFeedback.lightImpact();
                      Navigator.pushNamed(context, '/about');
                    },
                  ),
                ]),
                const SizedBox(height: 32),

                // Logout button
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: () => _showLogoutDialog(context, state),
                    icon: const Icon(Icons.logout, color: AppColors.error),
                    label: const Text(
                      'Logout',
                      style: TextStyle(color: AppColors.error),
                    ),
                    style: OutlinedButton.styleFrom(
                      side: const BorderSide(color: AppColors.error),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // Version
                Text(
                  'MyRide Driver v1.0.0',
                  style: TextStyle(
                    color: context.mutedColor,
                    fontSize: 13,
                  ),
                ),
                  const SizedBox(height: 40),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _buildProfileHeader(BuildContext context, DriverState state) {
    return Column(
      children: [
        // Profile photo with edit button
        GestureDetector(
          onTap: () => _showImagePickerOptions(state),
          child: Stack(
            children: [
              Container(
                width: 110,
                height: 110,
                decoration: BoxDecoration(
                  color: AppColors.yellow,
                  borderRadius: BorderRadius.circular(28),
                  border: Border.all(
                    color: AppColors.yellow,
                    width: 3,
                  ),
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(25),
                  child: _buildProfileImage(state),
                ),
              ),
              // Edit badge
              Positioned(
                bottom: 0,
                right: 0,
                child: Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: context.cardColor,
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: AppColors.yellow,
                      width: 2,
                    ),
                  ),
                  child: const Icon(
                    Icons.camera_alt,
                    color: AppColors.yellow,
                    size: 18,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        Text(
          state.driverName.isNotEmpty ? state.driverName : 'Driver',
          style: TextStyle(
            color: context.textColor,
            fontSize: 24,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 4),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.star, color: AppColors.warning, size: 20),
            const SizedBox(width: 4),
            Text(
              state.rating.toStringAsFixed(1),
              style: TextStyle(
                color: context.textColor,
                fontSize: 16,
                fontWeight: FontWeight.w600,
              ),
            ),
            Text(
              ' rating',
              style: TextStyle(
                color: context.mutedColor,
                fontSize: 16,
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildProfileImage(DriverState state) {
    // Priority: avatarUrl > local file > initials
    if (state.avatarUrl.isNotEmpty) {
      return Image.network(
        state.avatarUrl,
        width: 110,
        height: 110,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => _buildFallbackImage(state),
      );
    } else if (state.profileImagePath.isNotEmpty) {
      return Image.file(
        File(state.profileImagePath),
        width: 110,
        height: 110,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => _buildInitialsAvatar(state.driverName),
      );
    }
    return _buildInitialsAvatar(state.driverName);
  }

  Widget _buildFallbackImage(DriverState state) {
    if (state.profileImagePath.isNotEmpty) {
      return Image.file(
        File(state.profileImagePath),
        width: 110,
        height: 110,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => _buildInitialsAvatar(state.driverName),
      );
    }
    return _buildInitialsAvatar(state.driverName);
  }

  Widget _buildInitialsAvatar(String name) {
    final initials = name.isNotEmpty
        ? name.split(' ').map((n) => n.isNotEmpty ? n[0] : '').take(2).join().toUpperCase()
        : 'DR';
    return Container(
      width: 110,
      height: 110,
      color: AppColors.yellow,
      child: Center(
        child: Text(
          initials,
          style: const TextStyle(
            color: Colors.black,
            fontSize: 36,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }

  Widget _buildStatsCard(BuildContext context, DriverState state) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: context.cardColor,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: context.borderColor),
      ),
      child: Row(
        children: [
          _buildStatItem(
            context,
            label: 'Today',
            value: '${state.todayTrips}',
            color: AppColors.yellow,
          ),
          Container(width: 1, height: 50, color: context.borderColor),
          _buildStatItem(
            context,
            label: 'Total Trips',
            value: '${state.totalTrips}',
            color: AppColors.success,
          ),
          Container(width: 1, height: 50, color: context.borderColor),
          _buildStatItem(
            context,
            label: 'Rating',
            value: state.rating.toStringAsFixed(1),
            color: AppColors.warning,
          ),
        ],
      ),
    );
  }

  Widget _buildStatItem(
    BuildContext context, {
    required String label,
    required String value,
    required Color color,
  }) {
    return Expanded(
      child: Column(
        children: [
          Text(
            value,
            style: TextStyle(
              color: color,
              fontSize: 28,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: TextStyle(
              color: context.mutedColor,
              fontSize: 13,
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

  Widget _buildSettingTile(
    BuildContext context, {
    required IconData icon,
    required String title,
    required Widget trailing,
    VoidCallback? onTap,
    Color? iconColor,
  }) {
    final color = iconColor ?? AppColors.yellow;
    return ListTile(
      leading: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.15),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(icon, color: color, size: 22),
      ),
      title: Text(
        title,
        style: TextStyle(
          color: context.textColor,
          fontSize: 15,
          fontWeight: FontWeight.w500,
        ),
      ),
      trailing: trailing,
      onTap: onTap,
    );
  }

  Widget _buildInfoTile(
    BuildContext context, {
    required IconData icon,
    required String title,
    required String value,
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
          color: context.mutedColor,
          fontSize: 13,
        ),
      ),
      subtitle: Text(
        value,
        style: TextStyle(
          color: context.textColor,
          fontSize: 15,
          fontWeight: FontWeight.w500,
        ),
      ),
    );
  }

  void _showLogoutDialog(BuildContext context, DriverState state) {
    HapticFeedback.mediumImpact();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.cardColor,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        contentPadding: const EdgeInsets.all(24),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: AppColors.error.withValues(alpha: 0.15),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.logout,
                color: AppColors.error,
                size: 32,
              ),
            ),
            const SizedBox(height: 20),
            Text(
              'Logout',
              style: TextStyle(
                color: context.textColor,
                fontSize: 22,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              'Are you sure you want to logout?',
              style: TextStyle(
                color: context.mutedColor,
                fontSize: 15,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.pop(ctx),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: context.textColor,
                      side: BorderSide(color: context.borderColor, width: 2),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: const Text(
                      'Cancel',
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton(
                    onPressed: () {
                      Navigator.pop(ctx);
                      state.logout();
                      Navigator.pushNamedAndRemoveUntil(
                        context,
                        '/login',
                        (route) => false,
                      );
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.error,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: const Text(
                      'Logout',
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
