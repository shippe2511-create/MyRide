import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:share_plus/share_plus.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import '../providers/app_state.dart';
import '../theme/app_theme.dart';
import '../services/supabase_service.dart';
import 'chat_screen.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: isDark ? context.isDark ? AppColors.bgDark : const Color(0xFFF5F5F5) : AppColors.bgLight,
      body: SafeArea(
        child: SingleChildScrollView(
          physics: const BouncingScrollPhysics(),
          child: Column(
            children: [
              _buildHeader(context),
              const SizedBox(height: 24),
              _buildUserCard(context),
              const SizedBox(height: 24),
              _buildQuickActions(context),
              const SizedBox(height: 24),
              _buildSettingsSection(context),
              const SizedBox(height: 24),
              _buildSupportSection(context),
              const SizedBox(height: 24),
              _buildLogoutButton(context),
              const SizedBox(height: 40),
              _buildVersionInfo(context),
              const SizedBox(height: 40),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            'Profile',
            style: TextStyle(
              color: context.textColor,
              fontSize: 28,
              fontWeight: FontWeight.w800,
            ),
          ),
          GestureDetector(
            onTap: () {
              HapticFeedback.lightImpact();
              _showEditProfile(context);
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: context.surfaceColor,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: context.borderColor),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.edit, color: AppColors.yellow, size: 16),
                  const SizedBox(width: 6),
                  Text('Edit', style: TextStyle(color: context.textColor, fontSize: 13, fontWeight: FontWeight.w500)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildUserCard(BuildContext context) {
    return Consumer<AppState>(
      builder: (context, appState, _) {
        return Container(
          margin: const EdgeInsets.symmetric(horizontal: 20),
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: context.isDark
                  ? [AppColors.yellow.withValues(alpha: 0.15), AppColors.yellow.withValues(alpha: 0.05)]
                  : [AppColors.yellow.withValues(alpha: 0.3), AppColors.yellow.withValues(alpha: 0.1)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: AppColors.yellow.withValues(alpha: 0.3)),
          ),
          child: Row(
            children: [
              Container(
                width: 72,
                height: 72,
                decoration: BoxDecoration(
                  gradient: (appState.profilePhotoPath == null && appState.avatarUrl == null)
                      ? const LinearGradient(
                          colors: [AppColors.yellow, AppColors.yellow2],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        )
                      : null,
                  borderRadius: BorderRadius.circular(20),
                  border: (appState.profilePhotoPath != null || appState.avatarUrl != null)
                      ? Border.all(color: AppColors.yellow, width: 2)
                      : null,
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.yellow.withValues(alpha: 0.4),
                      blurRadius: 16,
                      offset: const Offset(0, 6),
                    ),
                  ],
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(18),
                  child: _buildProfileAvatar(appState, 72, 36),
                ),
              ),
              const SizedBox(width: 18),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      appState.userName.isNotEmpty ? appState.userName : 'Guest User',
                      style: TextStyle(
                        color: context.textColor,
                        fontSize: 20,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      appState.userPhone.isNotEmpty ? appState.userPhone : '+960 000 0000',
                      style: TextStyle(color: context.mutedColor, fontSize: 14),
                    ),
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: AppColors.success.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.verified, color: AppColors.success, size: 14),
                          const SizedBox(width: 4),
                          Text('Verified', style: TextStyle(color: AppColors.success, fontSize: 11, fontWeight: FontWeight.w600)),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildQuickActions(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Row(
        children: [
          Expanded(child: _buildQuickActionCard(Icons.bookmark, 'Saved\nPlaces', AppColors.yellow, () => _showSavedPlaces(context))),
          const SizedBox(width: 12),
          Expanded(child: _buildQuickActionCard(Icons.family_restroom, 'Emergency\nContacts', AppColors.error, () => _showEmergencyContacts(context))),
          const SizedBox(width: 12),
          Expanded(child: _buildQuickActionCard(Icons.card_giftcard, 'Invite\nFriends', AppColors.success, () => _showInviteFriends(context))),
        ],
      ),
    );
  }

  Widget _buildQuickActionCard(IconData icon, String label, Color color, VoidCallback onTap) {
    return GestureDetector(
      onTap: () {
        HapticFeedback.lightImpact();
        onTap();
      },
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 18),
        decoration: BoxDecoration(
          color: context.surfaceColor,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: context.borderColor),
        ),
        child: Column(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(icon, color: color, size: 22),
            ),
            const SizedBox(height: 10),
            Text(
              label,
              style: TextStyle(color: context.textColor, fontSize: 12, fontWeight: FontWeight.w500),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSettingsSection(BuildContext context) {
    return Consumer<AppState>(
      builder: (context, appState, _) {
        return Container(
          margin: const EdgeInsets.symmetric(horizontal: 20),
          decoration: BoxDecoration(
            color: context.surfaceColor,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: context.borderColor),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 18, 18, 8),
                child: Text(
                  'Settings',
                  style: TextStyle(color: context.mutedColor, fontSize: 12, fontWeight: FontWeight.w600),
                ),
              ),
              _buildSettingItem(Icons.person_outline, 'Personal Information', () => _showPersonalInfo(context)),
              _buildSettingItem(Icons.repeat, 'Recurring Rides', () => Navigator.pushNamed(context, '/recurring-rides'), showDivider: true),
              _buildSettingItem(Icons.notifications_outlined, 'Notifications', () => _showNotificationSettings(context), showDivider: true),
              _buildSettingItem(Icons.shield_outlined, 'Privacy & Safety', () => _showPrivacySettings(context), showDivider: true),
              _buildSettingItem(Icons.language, 'Language', () => _showLanguageSettings(context), trailing: 'English', showDivider: true),
              _buildAppearanceToggle(context, appState),
            ],
          ),
        );
      },
    );
  }

  Widget _buildAppearanceToggle(BuildContext context, AppState appState) {
    return Container(
      padding: const EdgeInsets.fromLTRB(18, 14, 18, 18),
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: context.borderColor)),
      ),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: context.isDark ? context.isDark ? AppColors.bgDark : const Color(0xFFF5F5F5) : const Color(0xFFF0F0F0),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(
              appState.isDarkMode ? Icons.dark_mode : Icons.light_mode,
              color: appState.isDarkMode ? context.textColor : AppColors.yellow,
              size: 20,
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Dark Mode',
                  style: TextStyle(color: context.textColor, fontSize: 15, fontWeight: FontWeight.w500),
                ),
                Text(
                  appState.isDarkMode ? 'On' : 'Off',
                  style: TextStyle(color: context.mutedColor, fontSize: 12),
                ),
              ],
            ),
          ),
          GestureDetector(
            onTap: () {
              HapticFeedback.mediumImpact();
              appState.toggleDarkMode(!appState.isDarkMode);
            },
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 250),
              width: 52,
              height: 30,
              decoration: BoxDecoration(
                color: appState.isDarkMode ? AppColors.yellow : const Color(0xFF3A3A3C),
                borderRadius: BorderRadius.circular(15),
              ),
              child: AnimatedAlign(
                duration: const Duration(milliseconds: 250),
                curve: Curves.easeOutCubic,
                alignment: appState.isDarkMode ? Alignment.centerRight : Alignment.centerLeft,
                child: Container(
                  width: 24,
                  height: 24,
                  margin: const EdgeInsets.symmetric(horizontal: 3),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    shape: BoxShape.circle,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSupportSection(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 20),
      decoration: BoxDecoration(
        color: context.surfaceColor,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: context.borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 18, 18, 8),
            child: Text(
              'Support',
              style: TextStyle(color: context.mutedColor, fontSize: 12, fontWeight: FontWeight.w600),
            ),
          ),
          _buildSettingItem(Icons.help_outline, 'Help Center', () => _showHelpCenter(context)),
          _buildSettingItem(Icons.chat_bubble_outline, 'Contact Support', () => _showContactSupport(context), showDivider: true),
          _buildSettingItem(Icons.info_outline, 'About MyRide', () => _showAbout(context), showDivider: true),
          _buildSettingItem(Icons.description_outlined, 'Terms & Conditions', () => _showTerms(context), showDivider: true, isLast: true),
        ],
      ),
    );
  }

  Widget _buildSettingItem(IconData icon, String title, VoidCallback onTap, {String? trailing, bool showDivider = false, bool isLast = false}) {
    return GestureDetector(
      onTap: () {
        HapticFeedback.lightImpact();
        onTap();
      },
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: EdgeInsets.fromLTRB(18, 14, 18, isLast ? 18 : 14),
        decoration: showDivider
            ? BoxDecoration(
                border: Border(top: BorderSide(color: context.borderColor)),
              )
            : null,
        child: Row(
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: context.isDark ? context.isDark ? AppColors.bgDark : const Color(0xFFF5F5F5) : const Color(0xFFF0F0F0),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, color: context.textColor, size: 20),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Text(
                title,
                style: TextStyle(color: context.textColor, fontSize: 15, fontWeight: FontWeight.w500),
              ),
            ),
            if (trailing != null)
              Text(
                trailing,
                style: TextStyle(color: context.mutedColor, fontSize: 13),
              ),
            const SizedBox(width: 8),
            Icon(Icons.chevron_right, color: context.mutedColor, size: 20),
          ],
        ),
      ),
    );
  }

  Widget _buildLogoutButton(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: GestureDetector(
        onTap: () {
          HapticFeedback.mediumImpact();
          _showLogoutConfirmation(context);
        },
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 16),
          decoration: BoxDecoration(
            color: AppColors.error.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.error.withValues(alpha: 0.3)),
          ),
          child: const Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.logout, color: AppColors.error, size: 20),
              SizedBox(width: 10),
              Text(
                'Log Out',
                style: TextStyle(color: AppColors.error, fontSize: 15, fontWeight: FontWeight.w600),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildVersionInfo(BuildContext context) {
    return Column(
      children: [
        Text('MyRide', style: TextStyle(color: context.mutedColor, fontSize: 14, fontWeight: FontWeight.w600)),
        const SizedBox(height: 4),
        Text('Version 1.0.0 (Beta)', style: TextStyle(color: context.faintColor, fontSize: 12)),
      ],
    );
  }

  void _showEditProfile(BuildContext context) {
    final appState = Provider.of<AppState>(context, listen: false);
    final nameController = TextEditingController(text: appState.userName);
    final emailController = TextEditingController(text: appState.userEmail);

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) => Container(
          padding: EdgeInsets.fromLTRB(24, 24, 24, MediaQuery.of(ctx).viewInsets.bottom + 24),
          decoration: BoxDecoration(
            color: context.surfaceColor,
            borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
          ),
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
              const SizedBox(height: 24),
              Text(
                'Edit Profile',
                style: TextStyle(color: context.textColor, fontSize: 20, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 24),
              Center(
                child: GestureDetector(
                  onTap: () => _showPhotoOptions(ctx, appState, setModalState),
                  child: Stack(
                    children: [
                      Container(
                        width: 100,
                        height: 100,
                        decoration: BoxDecoration(
                          gradient: (appState.profilePhotoPath == null && appState.avatarUrl == null)
                              ? const LinearGradient(colors: [AppColors.yellow, AppColors.yellow2])
                              : null,
                          borderRadius: BorderRadius.circular(28),
                          border: (appState.profilePhotoPath != null || appState.avatarUrl != null)
                              ? Border.all(color: AppColors.yellow, width: 3)
                              : null,
                        ),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(25),
                          child: _buildProfileAvatar(appState, 100, 50),
                        ),
                      ),
                      Positioned(
                        bottom: 0,
                        right: 0,
                        child: Container(
                          width: 32,
                          height: 32,
                          decoration: BoxDecoration(
                            color: AppColors.yellow,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: context.surfaceColor, width: 2),
                          ),
                          child: Icon(Icons.camera_alt, color: Colors.black, size: 16),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Text('Tap to change photo', style: TextStyle(color: context.mutedColor, fontSize: 12)),
              const SizedBox(height: 24),
              _buildEditTextField('Full Name', 'Enter your name', nameController),
              const SizedBox(height: 16),
              _buildEditTextField('Email', 'Enter your email', emailController),
              const SizedBox(height: 24),
              StatefulBuilder(
                builder: (context, setSaveState) {
                  bool isSaving = false;
                  return SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: isSaving ? null : () async {
                        setSaveState(() => isSaving = true);
                        try {
                          await SupabaseService.updateProfile({
                            'full_name': nameController.text,
                            'email': emailController.text.isNotEmpty ? emailController.text : null,
                          });
                          appState.updateUserName(nameController.text);
                          appState.updateUserEmail(emailController.text);
                          Navigator.pop(ctx);
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text('Profile updated'),
                              backgroundColor: AppColors.success,
                              behavior: SnackBarBehavior.floating,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                            ),
                          );
                        } catch (e) {
                          setSaveState(() => isSaving = false);
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text('Failed to save: $e'),
                              backgroundColor: AppColors.error,
                              behavior: SnackBarBehavior.floating,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                            ),
                          );
                        }
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.yellow,
                        foregroundColor: Colors.black,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      ),
                      child: isSaving
                          ? SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black))
                          : Text('Save Changes', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
                    ),
                  );
                },
              ),
              SizedBox(height: MediaQuery.of(ctx).padding.bottom),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildEditTextField(String label, String hint, TextEditingController controller) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(color: context.mutedColor, fontSize: 13, fontWeight: FontWeight.w500)),
        const SizedBox(height: 8),
        Container(
          decoration: BoxDecoration(
            color: context.isDark ? AppColors.bgDark : const Color(0xFFF5F5F5),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: context.borderColor),
          ),
          child: TextField(
            controller: controller,
            style: TextStyle(color: context.textColor),
            decoration: InputDecoration(
              hintText: hint,
              hintStyle: TextStyle(color: context.faintColor),
              border: InputBorder.none,
              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            ),
          ),
        ),
      ],
    );
  }

  void _showPhotoOptions(BuildContext ctx, AppState appState, StateSetter setModalState) {
    HapticFeedback.mediumImpact();
    showModalBottomSheet(
      context: ctx,
      backgroundColor: Colors.transparent,
      builder: (sheetCtx) => Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: context.surfaceColor,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: context.borderColor,
                borderRadius: BorderRadius.circular(99),
              ),
            ),
            const SizedBox(height: 20),
            Text('Change Profile Photo', style: TextStyle(color: context.textColor, fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 20),
            _buildPhotoOption(Icons.camera_alt, 'Take Photo', () => _pickImage(ImageSource.camera, appState, sheetCtx, setModalState)),
            _buildPhotoOption(Icons.photo_library, 'Choose from Gallery', () => _pickImage(ImageSource.gallery, appState, sheetCtx, setModalState)),
            if (appState.profilePhotoPath != null)
              _buildPhotoOption(Icons.delete_outline, 'Remove Photo', () {
                appState.updateProfilePhoto(null);
                setModalState(() {});
                setState(() {});
                Navigator.pop(sheetCtx);
              }, isDestructive: true),
            const SizedBox(height: 10),
          ],
        ),
      ),
    );
  }

  Widget _buildPhotoOption(IconData icon, String label, VoidCallback onTap, {bool isDestructive = false}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 14),
        margin: const EdgeInsets.only(bottom: 8),
        decoration: BoxDecoration(
          color: (context.isDark ? Colors.white : Colors.black).withValues(alpha: 0.05),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: isDestructive ? AppColors.error : AppColors.yellow, size: 22),
            const SizedBox(width: 12),
            Text(
              label,
              style: TextStyle(
                color: isDestructive ? AppColors.error : context.textColor,
                fontSize: 15,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _pickImage(ImageSource source, AppState appState, BuildContext sheetCtx, StateSetter setModalState) async {
    Navigator.pop(sheetCtx);
    try {
      final picker = ImagePicker();
      final pickedFile = await picker.pickImage(
        source: source,
        maxWidth: 512,
        maxHeight: 512,
        imageQuality: 80,
      );

      if (pickedFile != null) {
        // Save locally first
        final directory = await getApplicationDocumentsDirectory();
        final fileName = 'profile_${DateTime.now().millisecondsSinceEpoch}.jpg';
        final savedPath = '${directory.path}/$fileName';
        await File(pickedFile.path).copy(savedPath);

        // Upload to cloud storage
        if (appState.profileId != null) {
          final avatarUrl = await SupabaseService.uploadAvatar(savedPath, appState.profileId!);
          if (avatarUrl != null) {
            await SupabaseService.updateProfileAvatarUrl(appState.profileId!, avatarUrl);
            appState.updateAvatarUrl(avatarUrl);
          }
        }

        appState.updateProfilePhoto(savedPath);
        setModalState(() {});
        setState(() {});
        HapticFeedback.lightImpact();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Could not access camera/gallery'),
            backgroundColor: AppColors.error,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        );
      }
    }
  }

  Widget _buildProfileAvatar(AppState appState, double size, double iconSize) {
    // Priority: avatarUrl (cloud) > profilePhotoPath (local) > icon
    if (appState.avatarUrl != null && appState.avatarUrl!.isNotEmpty) {
      return Image.network(
        appState.avatarUrl!,
        width: size,
        height: size,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) {
          // Fall back to local file or icon
          if (appState.profilePhotoPath != null) {
            return Image.file(
              File(appState.profilePhotoPath!),
              width: size,
              height: size,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => Icon(Icons.person, color: Colors.black, size: iconSize),
            );
          }
          return Icon(Icons.person, color: Colors.black, size: iconSize);
        },
      );
    } else if (appState.profilePhotoPath != null) {
      return Image.file(
        File(appState.profilePhotoPath!),
        width: size,
        height: size,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => Icon(Icons.person, color: Colors.black, size: iconSize),
      );
    }
    return Icon(Icons.person, color: Colors.black, size: iconSize);
  }

  void _showSavedPlaces(BuildContext context) {
    final appState = Provider.of<AppState>(context, listen: false);
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Container(
        padding: const EdgeInsets.all(24),
        constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.7),
        decoration: BoxDecoration(color: context.surfaceColor, borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: context.borderColor, borderRadius: BorderRadius.circular(2)))),
            const SizedBox(height: 24),
            Text('Saved Places', style: TextStyle(color: context.textColor, fontSize: 20, fontWeight: FontWeight.w700)),
            const SizedBox(height: 20),
            _buildSavedPlaceEditable('Home', appState.homeAddress, Icons.home, () => _editPlace(context, 'Home', appState.homeAddress, appState)),
            _buildSavedPlaceEditable('Work', appState.workAddress, Icons.work, () => _editPlace(context, 'Work', appState.workAddress, appState)),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: () {
                  Navigator.pop(ctx);
                  _addNewPlace(context, appState);
                },
                icon: Icon(Icons.add, size: 18),
                label: Text('Add New Place'),
                style: OutlinedButton.styleFrom(foregroundColor: AppColors.yellow, side: BorderSide(color: AppColors.yellow), padding: const EdgeInsets.symmetric(vertical: 14), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
              ),
            ),
            SizedBox(height: MediaQuery.of(context).padding.bottom),
          ],
        ),
      ),
    );
  }

  Widget _buildSavedPlaceEditable(String name, String address, IconData icon, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: context.isDark ? AppColors.bgDark : const Color(0xFFF5F5F5), borderRadius: BorderRadius.circular(14), border: Border.all(color: context.borderColor)),
        child: Row(
          children: [
            Container(width: 44, height: 44, decoration: BoxDecoration(color: AppColors.yellow.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(12)), child: Icon(icon, color: AppColors.yellow, size: 22)),
            const SizedBox(width: 14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(name, style: TextStyle(color: context.textColor, fontSize: 15, fontWeight: FontWeight.w600)),
                const SizedBox(height: 2),
                Text(address, style: TextStyle(color: context.mutedColor, fontSize: 13)),
              ]),
            ),
            Icon(Icons.edit, color: context.mutedColor, size: 18),
          ],
        ),
      ),
    );
  }

  void _editPlace(BuildContext context, String name, String currentAddress, AppState appState) {
    final controller = TextEditingController(text: currentAddress);
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
        child: Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(color: context.surfaceColor, borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(width: 40, height: 4, decoration: BoxDecoration(color: context.borderColor, borderRadius: BorderRadius.circular(2))),
              const SizedBox(height: 24),
              Text('Edit $name Address', style: TextStyle(color: context.textColor, fontSize: 20, fontWeight: FontWeight.w700)),
              const SizedBox(height: 20),
              Container(
                decoration: BoxDecoration(color: context.isDark ? AppColors.bgDark : const Color(0xFFF5F5F5), borderRadius: BorderRadius.circular(14), border: Border.all(color: context.borderColor)),
                child: TextField(
                  controller: controller,
                  style: TextStyle(color: context.textColor),
                  decoration: InputDecoration(hintText: 'Enter address', hintStyle: TextStyle(color: context.faintColor), border: InputBorder.none, contentPadding: EdgeInsets.all(16)),
                ),
              ),
              const SizedBox(height: 20),
              StatefulBuilder(
                builder: (context, setSaveState) {
                  bool isSaving = false;
                  return SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: isSaving ? null : () async {
                        setSaveState(() => isSaving = true);
                        final success = await SupabaseService.upsertSavedPlace(
                          name: name,
                          address: controller.text,
                          icon: name == 'Home' ? 'home' : 'work',
                          color: name == 'Home' ? 'blue' : 'green',
                        );
                        if (success) {
                          if (name == 'Home') appState.updateHomeAddress(controller.text);
                          if (name == 'Work') appState.updateWorkAddress(controller.text);
                          Navigator.pop(ctx);
                          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$name address updated'), backgroundColor: AppColors.success, behavior: SnackBarBehavior.floating, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))));
                        } else {
                          setSaveState(() => isSaving = false);
                          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to save $name address'), backgroundColor: AppColors.error, behavior: SnackBarBehavior.floating, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))));
                        }
                      },
                      style: ElevatedButton.styleFrom(backgroundColor: AppColors.yellow, foregroundColor: Colors.black, padding: const EdgeInsets.symmetric(vertical: 14), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
                      child: isSaving
                          ? SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black))
                          : Text('Save', style: TextStyle(fontWeight: FontWeight.w600)),
                    ),
                  );
                },
              ),
              SizedBox(height: MediaQuery.of(context).padding.bottom),
            ],
          ),
        ),
      ),
    );
  }

  void _addNewPlace(BuildContext context, AppState appState) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => _AddPlaceScreen(
          onSave: (name, address, lat, lng) {
            appState.addSavedLocation({
              'title': name,
              'address': address,
              'icon': 'place',
              'lat': lat,
              'lng': lng,
            });
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text('$name added'),
                backgroundColor: AppColors.success,
                behavior: SnackBarBehavior.floating,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
            );
          },
        ),
      ),
    );
  }

  void _showEmergencyContacts(BuildContext context) {
    final appState = Provider.of<AppState>(context, listen: false);
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Container(
        padding: const EdgeInsets.all(24),
        constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.7),
        decoration: BoxDecoration(color: context.surfaceColor, borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: context.borderColor, borderRadius: BorderRadius.circular(2)))),
            const SizedBox(height: 24),
            Text('Emergency Contacts', style: TextStyle(color: context.textColor, fontSize: 20, fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            Text('These contacts will be notified in an emergency', style: TextStyle(color: context.mutedColor, fontSize: 13)),
            const SizedBox(height: 20),
            if (appState.emergencyContacts.isEmpty)
              Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    children: [
                      Icon(Icons.contact_phone_outlined, color: context.mutedColor, size: 48),
                      const SizedBox(height: 12),
                      Text('No emergency contacts', style: TextStyle(color: context.mutedColor, fontSize: 14)),
                    ],
                  ),
                ),
              )
            else
              ...appState.emergencyContacts.map((contact) => _buildContactItemDeletable(
                contact['name'] ?? '',
                contact['phone'] ?? '',
                contact['relation'] ?? '',
                () async {
                  final phone = contact['phone'] ?? '';
                  final updatedContacts = appState.emergencyContacts.where((c) => c['phone'] != phone).toList();
                  try {
                    await SupabaseService.updateProfile({
                      'emergency_contacts': updatedContacts,
                    });
                    appState.removeEmergencyContact(phone);
                    Navigator.pop(ctx);
                    _showEmergencyContacts(context);
                  } catch (e) {
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to remove contact'), backgroundColor: AppColors.error, behavior: SnackBarBehavior.floating, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))));
                  }
                },
              )),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: () {
                  Navigator.pop(ctx);
                  _addEmergencyContact(context, appState);
                },
                icon: Icon(Icons.add, size: 18),
                label: Text('Add Contact'),
                style: OutlinedButton.styleFrom(foregroundColor: AppColors.yellow, side: BorderSide(color: AppColors.yellow), padding: const EdgeInsets.symmetric(vertical: 14), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
              ),
            ),
            SizedBox(height: MediaQuery.of(context).padding.bottom),
          ],
        ),
      ),
    );
  }

  Widget _buildContactItemDeletable(String name, String phone, String relation, VoidCallback onDelete) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: context.isDark ? AppColors.bgDark : const Color(0xFFF5F5F5), borderRadius: BorderRadius.circular(14), border: Border.all(color: context.borderColor)),
      child: Row(
        children: [
          Container(width: 44, height: 44, decoration: BoxDecoration(color: AppColors.error.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(12)), child: Center(child: Text(name.isNotEmpty ? name[0] : '?', style: TextStyle(color: AppColors.error, fontSize: 18, fontWeight: FontWeight.w700)))),
          const SizedBox(width: 14),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(name, style: TextStyle(color: context.textColor, fontSize: 15, fontWeight: FontWeight.w600)),
              const SizedBox(height: 2),
              Text('$phone • $relation', style: TextStyle(color: context.mutedColor, fontSize: 13)),
            ]),
          ),
          GestureDetector(
            onTap: onDelete,
            child: Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(color: AppColors.error.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)),
              child: Icon(Icons.delete_outline, color: AppColors.error, size: 18),
            ),
          ),
        ],
      ),
    );
  }

  void _addEmergencyContact(BuildContext context, AppState appState) {
    final nameController = TextEditingController();
    final phoneController = TextEditingController();
    String selectedRelation = 'Family';
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) => Padding(
          padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
          child: Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(color: context.surfaceColor, borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(width: 40, height: 4, decoration: BoxDecoration(color: context.borderColor, borderRadius: BorderRadius.circular(2))),
                const SizedBox(height: 24),
                Text('Add Emergency Contact', style: TextStyle(color: context.textColor, fontSize: 20, fontWeight: FontWeight.w700)),
                const SizedBox(height: 20),
                Container(
                  decoration: BoxDecoration(color: context.isDark ? AppColors.bgDark : const Color(0xFFF5F5F5), borderRadius: BorderRadius.circular(14), border: Border.all(color: context.borderColor)),
                  child: TextField(controller: nameController, style: TextStyle(color: context.textColor), decoration: InputDecoration(hintText: 'Contact name', hintStyle: TextStyle(color: context.faintColor), border: InputBorder.none, contentPadding: EdgeInsets.all(16))),
                ),
                const SizedBox(height: 12),
                Container(
                  decoration: BoxDecoration(color: context.isDark ? AppColors.bgDark : const Color(0xFFF5F5F5), borderRadius: BorderRadius.circular(14), border: Border.all(color: context.borderColor)),
                  child: TextField(controller: phoneController, keyboardType: TextInputType.phone, style: TextStyle(color: context.textColor), decoration: InputDecoration(hintText: 'Phone number', hintStyle: TextStyle(color: context.faintColor), border: InputBorder.none, contentPadding: EdgeInsets.all(16))),
                ),
                const SizedBox(height: 12),
                Row(
                  children: ['Family', 'Friend', 'Colleague'].map((rel) => Expanded(
                    child: GestureDetector(
                      onTap: () => setSheetState(() => selectedRelation = rel),
                      child: Container(
                        margin: EdgeInsets.only(right: rel != 'Colleague' ? 8 : 0),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        decoration: BoxDecoration(
                          color: selectedRelation == rel ? AppColors.yellow.withValues(alpha: 0.15) : context.isDark ? AppColors.bgDark : const Color(0xFFF5F5F5),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: selectedRelation == rel ? AppColors.yellow : context.borderColor),
                        ),
                        child: Center(child: Text(rel, style: TextStyle(color: selectedRelation == rel ? AppColors.yellow : context.textColor, fontSize: 13, fontWeight: FontWeight.w500))),
                      ),
                    ),
                  )).toList(),
                ),
                const SizedBox(height: 20),
                StatefulBuilder(
                  builder: (context, setSaveState) {
                    bool isSaving = false;
                    return SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: isSaving ? null : () async {
                          if (nameController.text.isEmpty || phoneController.text.isEmpty) return;
                          setSaveState(() => isSaving = true);
                          try {
                            final newContact = {'name': nameController.text, 'phone': phoneController.text, 'relation': selectedRelation};
                            final updatedContacts = [...appState.emergencyContacts, newContact];
                            await SupabaseService.updateProfile({
                              'emergency_contacts': updatedContacts,
                            });
                            appState.addEmergencyContact(newContact);
                            Navigator.pop(ctx);
                            ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${nameController.text} added as emergency contact'), backgroundColor: AppColors.success, behavior: SnackBarBehavior.floating, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))));
                          } catch (e) {
                            setSaveState(() => isSaving = false);
                            ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to save contact'), backgroundColor: AppColors.error, behavior: SnackBarBehavior.floating, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))));
                          }
                        },
                        style: ElevatedButton.styleFrom(backgroundColor: AppColors.yellow, foregroundColor: Colors.black, padding: const EdgeInsets.symmetric(vertical: 14), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
                        child: isSaving
                            ? SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black))
                            : Text('Add Contact', style: TextStyle(fontWeight: FontWeight.w600)),
                      ),
                    );
                  },
                ),
                SizedBox(height: MediaQuery.of(context).padding.bottom),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _showInviteFriends(BuildContext context) {
    const referralCode = 'MYRIDE2024';
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(color: context.surfaceColor, borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(width: 40, height: 4, decoration: BoxDecoration(color: context.borderColor, borderRadius: BorderRadius.circular(2))),
            const SizedBox(height: 24),
            Container(
              width: 80, height: 80,
              decoration: BoxDecoration(color: AppColors.success.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(20)),
              child: Icon(Icons.card_giftcard, color: AppColors.success, size: 40),
            ),
            const SizedBox(height: 20),
            Text('Invite Friends', style: TextStyle(color: context.textColor, fontSize: 20, fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            Text('Share your referral code with colleagues!', style: TextStyle(color: context.mutedColor, fontSize: 14), textAlign: TextAlign.center),
            const SizedBox(height: 24),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(color: context.isDark ? AppColors.bgDark : const Color(0xFFF5F5F5), borderRadius: BorderRadius.circular(14), border: Border.all(color: context.borderColor)),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(referralCode, style: TextStyle(color: AppColors.yellow, fontSize: 24, fontWeight: FontWeight.w800, letterSpacing: 2)),
                  const SizedBox(width: 12),
                  GestureDetector(
                    onTap: () {
                      HapticFeedback.mediumImpact();
                      Clipboard.setData(const ClipboardData(text: referralCode));
                      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Code copied!'), backgroundColor: AppColors.success, behavior: SnackBarBehavior.floating));
                    },
                    child: Icon(Icons.copy, color: AppColors.yellow, size: 20),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: () {
                  Navigator.pop(ctx);
                  Share.share(
                    'Join MyRide for free staff transportation! Use my referral code: $referralCode\n\nDownload the app now!',
                    subject: 'Join MyRide',
                  );
                },
                icon: Icon(Icons.share, size: 18),
                label: Text('Share Invite Link'),
                style: ElevatedButton.styleFrom(backgroundColor: AppColors.yellow, foregroundColor: Colors.black, padding: const EdgeInsets.symmetric(vertical: 14), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
              ),
            ),
            SizedBox(height: MediaQuery.of(context).padding.bottom),
          ],
        ),
      ),
    );
  }

  void _showPersonalInfo(BuildContext context) {
    final appState = Provider.of<AppState>(context, listen: false);
    _showBottomSheet(context, 'Personal Information', [
      _buildInfoItem('Full Name', appState.userName),
      _buildInfoItem('Phone', appState.userPhone),
      _buildInfoItem('Email', appState.userEmail.isNotEmpty ? appState.userEmail : 'Not set'),
      _buildInfoItem('Staff ID', appState.staffId),
      _buildInfoItem('Gender', 'Not set'),
    ]);
  }

  void _showNotificationSettings(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Consumer<AppState>(
        builder: (context, appState, _) => Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(color: context.surfaceColor, borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: context.borderColor, borderRadius: BorderRadius.circular(2)))),
              const SizedBox(height: 24),
              Text('Notifications', style: TextStyle(color: context.textColor, fontSize: 20, fontWeight: FontWeight.w700)),
              const SizedBox(height: 20),
              _buildSwitchItem('Push Notifications', appState.notificationsEnabled, (v) => appState.toggleNotifications(v)),
              _buildSwitchItem('Ride Updates', appState.rideUpdatesEnabled, (v) => appState.toggleRideUpdates(v)),
              _buildSwitchItem('Promotions', appState.promotionsEnabled, (v) => appState.togglePromotions(v)),
              _buildSwitchItem('Email Notifications', appState.emailNotificationsEnabled, (v) => appState.toggleEmailNotifications(v)),
              SizedBox(height: MediaQuery.of(context).padding.bottom),
            ],
          ),
        ),
      ),
    );
  }

  void _showPrivacySettings(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Container(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
        decoration: BoxDecoration(
          color: context.isDark ? AppColors.bgDark : const Color(0xFFF5F5F5),
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
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
            const SizedBox(height: 24),
            Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [AppColors.yellow.withValues(alpha: 0.2), AppColors.yellow.withValues(alpha: 0.1)],
                    ),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(Icons.shield_outlined, color: AppColors.yellow, size: 24),
                ),
                const SizedBox(width: 14),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Privacy & Safety', style: TextStyle(color: context.textColor, fontSize: 22, fontWeight: FontWeight.w700)),
                    Text('Manage your security settings', style: TextStyle(color: context.mutedColor, fontSize: 13)),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 24),
            _buildModernPrivacyItem(
              icon: Icons.lock_outline,
              title: 'Change Password',
              subtitle: 'Update your account password',
              color: AppColors.yellow,
              onTap: () {
                Navigator.pop(ctx);
                _showChangePassword(context);
              },
            ),
            _buildModernPrivacyItem(
              icon: Icons.security,
              title: 'Two-Factor Authentication',
              subtitle: 'Add extra security to your account',
              color: const Color(0xFF4DA6FF),
              onTap: () {
                Navigator.pop(ctx);
                _showTwoFactorAuth(context);
              },
            ),
            _buildModernPrivacyItem(
              icon: Icons.block,
              title: 'Blocked Users',
              subtitle: 'Manage blocked accounts',
              color: const Color(0xFFFF9500),
              onTap: () {
                Navigator.pop(ctx);
                _showBlockedUsers(context);
              },
            ),
            _buildModernPrivacyItem(
              icon: Icons.privacy_tip_outlined,
              title: 'Data & Privacy',
              subtitle: 'Control your data and privacy',
              color: const Color(0xFF34C759),
              onTap: () {
                Navigator.pop(ctx);
                _showDataPrivacy(context);
              },
            ),
            _buildModernPrivacyItem(
              icon: Icons.delete_outline,
              title: 'Delete Account',
              subtitle: 'Permanently remove your account',
              color: AppColors.error,
              isDestructive: true,
              onTap: () {
                Navigator.pop(ctx);
                _showDeleteAccount(context);
              },
            ),
            SizedBox(height: MediaQuery.of(context).padding.bottom + 16),
          ],
        ),
      ),
    );
  }

  Widget _buildModernPrivacyItem({
    required IconData icon,
    required String title,
    required String subtitle,
    required Color color,
    required VoidCallback onTap,
    bool isDestructive = false,
  }) {
    return GestureDetector(
      onTap: () {
        HapticFeedback.lightImpact();
        onTap();
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: context.surfaceColor,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: isDestructive ? color.withValues(alpha: 0.3) : context.borderColor),
        ),
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(icon, color: color, size: 24),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      color: isDestructive ? color : context.textColor,
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: TextStyle(color: context.mutedColor, fontSize: 13),
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: context.mutedColor, size: 22),
          ],
        ),
      ),
    );
  }

  void _showChangePassword(BuildContext context) {
    final currentController = TextEditingController();
    final newController = TextEditingController();
    final confirmController = TextEditingController();
    bool obscureCurrent = true;
    bool obscureNew = true;
    bool obscureConfirm = true;

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) => Padding(
          padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
          child: Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(color: context.surfaceColor, borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(width: 40, height: 4, decoration: BoxDecoration(color: context.borderColor, borderRadius: BorderRadius.circular(2))),
                const SizedBox(height: 24),
                Text('Change Password', style: TextStyle(color: context.textColor, fontSize: 20, fontWeight: FontWeight.w700)),
                const SizedBox(height: 20),
                _buildPasswordField('Current Password', currentController, obscureCurrent, () => setSheetState(() => obscureCurrent = !obscureCurrent)),
                const SizedBox(height: 12),
                _buildPasswordField('New Password', newController, obscureNew, () => setSheetState(() => obscureNew = !obscureNew)),
                const SizedBox(height: 12),
                _buildPasswordField('Confirm Password', confirmController, obscureConfirm, () => setSheetState(() => obscureConfirm = !obscureConfirm)),
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () {
                      if (currentController.text.isEmpty || newController.text.isEmpty || confirmController.text.isEmpty) {
                        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Please fill all fields'), backgroundColor: AppColors.error));
                        return;
                      }
                      if (newController.text != confirmController.text) {
                        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Passwords do not match'), backgroundColor: AppColors.error));
                        return;
                      }
                      if (newController.text.length < 6) {
                        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Password must be at least 6 characters'), backgroundColor: AppColors.error));
                        return;
                      }
                      Navigator.pop(ctx);
                      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Password changed successfully'), backgroundColor: AppColors.success));
                    },
                    style: ElevatedButton.styleFrom(backgroundColor: AppColors.yellow, foregroundColor: Colors.black, padding: const EdgeInsets.symmetric(vertical: 14), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
                    child: Text('Update Password', style: TextStyle(fontWeight: FontWeight.w600)),
                  ),
                ),
                SizedBox(height: MediaQuery.of(context).padding.bottom),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildPasswordField(String hint, TextEditingController controller, bool obscure, VoidCallback toggleObscure) {
    return Container(
      decoration: BoxDecoration(color: context.isDark ? AppColors.bgDark : const Color(0xFFF5F5F5), borderRadius: BorderRadius.circular(14), border: Border.all(color: context.borderColor)),
      child: TextField(
        controller: controller,
        obscureText: obscure,
        style: TextStyle(color: context.textColor),
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: TextStyle(color: context.mutedColor),
          border: InputBorder.none,
          contentPadding: const EdgeInsets.all(16),
          suffixIcon: IconButton(
            icon: Icon(obscure ? Icons.visibility_off : Icons.visibility, color: context.mutedColor),
            onPressed: toggleObscure,
          ),
        ),
      ),
    );
  }

  void _showTwoFactorAuth(BuildContext context) {
    final appState = Provider.of<AppState>(context, listen: false);
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) {
          bool is2FAEnabled = appState.twoFactorEnabled;
          return Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(color: context.surfaceColor, borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(width: 40, height: 4, decoration: BoxDecoration(color: context.borderColor, borderRadius: BorderRadius.circular(2))),
                const SizedBox(height: 24),
                Container(
                  width: 72, height: 72,
                  decoration: BoxDecoration(color: AppColors.yellow.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(20)),
                  child: Icon(Icons.security, color: AppColors.yellow, size: 36),
                ),
                const SizedBox(height: 20),
                Text('Two-Factor Authentication', style: TextStyle(color: context.textColor, fontSize: 20, fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                Text(
                  'Add an extra layer of security to your account by requiring a verification code.',
                  style: TextStyle(color: context.mutedColor, fontSize: 14),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 24),
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(color: context.isDark ? AppColors.bgDark : const Color(0xFFF5F5F5), borderRadius: BorderRadius.circular(14), border: Border.all(color: context.borderColor)),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Enable 2FA', style: TextStyle(color: context.textColor, fontSize: 15, fontWeight: FontWeight.w500)),
                      Switch(
                        value: is2FAEnabled,
                        onChanged: (v) {
                          setSheetState(() => is2FAEnabled = v);
                          appState.toggleTwoFactor(v);
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text(v ? '2FA enabled' : '2FA disabled'),
                              backgroundColor: v ? AppColors.success : AppColors.mutedDark,
                            ),
                          );
                        },
                        activeColor: AppColors.yellow,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                if (is2FAEnabled) ...[
                  _buildActionItem('SMS Verification', Icons.sms, () {
                    Navigator.pop(ctx);
                    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('SMS verification is active'), backgroundColor: AppColors.success));
                  }),
                ],
                SizedBox(height: MediaQuery.of(context).padding.bottom),
              ],
            ),
          );
        },
      ),
    );
  }

  void _showBlockedUsers(BuildContext context) {
    final appState = Provider.of<AppState>(context, listen: false);
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Container(
        padding: const EdgeInsets.all(24),
        constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.6),
        decoration: BoxDecoration(color: context.surfaceColor, borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: context.borderColor, borderRadius: BorderRadius.circular(2)))),
            const SizedBox(height: 24),
            Text('Blocked Users', style: TextStyle(color: context.textColor, fontSize: 20, fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            Text('Users you have blocked cannot contact you', style: TextStyle(color: context.mutedColor, fontSize: 13)),
            const SizedBox(height: 20),
            if (appState.blockedUsers.isEmpty)
              Center(
                child: Padding(
                  padding: const EdgeInsets.all(32),
                  child: Column(
                    children: [
                      Icon(Icons.block, color: context.mutedColor, size: 48),
                      const SizedBox(height: 12),
                      Text('No blocked users', style: TextStyle(color: context.mutedColor, fontSize: 14)),
                    ],
                  ),
                ),
              )
            else
              ...appState.blockedUsers.map((user) => _buildBlockedUserItem(user, () {
                appState.unblockUser(user);
                Navigator.pop(ctx);
                _showBlockedUsers(context);
              })),
            SizedBox(height: MediaQuery.of(context).padding.bottom),
          ],
        ),
      ),
    );
  }

  Widget _buildBlockedUserItem(String name, VoidCallback onUnblock) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: context.isDark ? AppColors.bgDark : const Color(0xFFF5F5F5), borderRadius: BorderRadius.circular(14), border: Border.all(color: context.borderColor)),
      child: Row(
        children: [
          Container(
            width: 44, height: 44,
            decoration: BoxDecoration(color: AppColors.error.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(12)),
            child: Center(child: Text(name[0], style: TextStyle(color: AppColors.error, fontSize: 18, fontWeight: FontWeight.w700))),
          ),
          const SizedBox(width: 14),
          Expanded(child: Text(name, style: TextStyle(color: context.textColor, fontSize: 15, fontWeight: FontWeight.w600))),
          GestureDetector(
            onTap: onUnblock,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(color: AppColors.yellow.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(8)),
              child: Text('Unblock', style: TextStyle(color: AppColors.yellow, fontSize: 12, fontWeight: FontWeight.w600)),
            ),
          ),
        ],
      ),
    );
  }

  void _showDataPrivacy(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(color: context.surfaceColor, borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: context.borderColor, borderRadius: BorderRadius.circular(2)))),
            const SizedBox(height: 24),
            Text('Data & Privacy', style: TextStyle(color: context.textColor, fontSize: 20, fontWeight: FontWeight.w700)),
            const SizedBox(height: 20),
            _buildActionItem('Download My Data', Icons.download, () {
              Navigator.pop(ctx);
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Data export request sent. You will receive an email.'), backgroundColor: AppColors.success));
            }),
            _buildActionItem('Clear Search History', Icons.history, () {
              Navigator.pop(ctx);
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Search history cleared'), backgroundColor: AppColors.success));
            }),
            _buildActionItem('Manage Permissions', Icons.admin_panel_settings, () {
              Navigator.pop(ctx);
              _showPermissions(context);
            }),
            SizedBox(height: MediaQuery.of(context).padding.bottom),
          ],
        ),
      ),
    );
  }

  void _showPermissions(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) {
          bool locationEnabled = true;
          bool cameraEnabled = false;
          bool contactsEnabled = false;
          return Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(color: context.surfaceColor, borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: context.borderColor, borderRadius: BorderRadius.circular(2)))),
                const SizedBox(height: 24),
                Text('App Permissions', style: TextStyle(color: context.textColor, fontSize: 20, fontWeight: FontWeight.w700)),
                const SizedBox(height: 20),
                _buildSwitchItem('Location Access', locationEnabled, (v) => setSheetState(() => locationEnabled = v)),
                _buildSwitchItem('Camera Access', cameraEnabled, (v) => setSheetState(() => cameraEnabled = v)),
                _buildSwitchItem('Contacts Access', contactsEnabled, (v) => setSheetState(() => contactsEnabled = v)),
                SizedBox(height: MediaQuery.of(context).padding.bottom),
              ],
            ),
          );
        },
      ),
    );
  }

  void _showDeleteAccount(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(color: context.surfaceColor, borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(width: 40, height: 4, decoration: BoxDecoration(color: context.borderColor, borderRadius: BorderRadius.circular(2))),
            const SizedBox(height: 24),
            Container(
              width: 72, height: 72,
              decoration: BoxDecoration(color: AppColors.error.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(20)),
              child: Icon(Icons.warning_amber_rounded, color: AppColors.error, size: 40),
            ),
            const SizedBox(height: 20),
            Text('Delete Account?', style: TextStyle(color: context.textColor, fontSize: 20, fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            Text(
              'This action is permanent and cannot be undone. All your data including ride history, saved places, and payment methods will be deleted.',
              style: TextStyle(color: context.mutedColor, fontSize: 14),
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
                      side: BorderSide(color: context.borderColor),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                    child: Text('Cancel', style: TextStyle(fontWeight: FontWeight.w600)),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton(
                    onPressed: () {
                      Navigator.pop(ctx);
                      showDialog(
                        context: context,
                        builder: (dialogCtx) => AlertDialog(
                          backgroundColor: context.surfaceColor,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                          title: Text('Confirm Deletion', style: TextStyle(color: AppColors.error, fontWeight: FontWeight.w700)),
                          content: Text('Type "DELETE" to confirm account deletion.', style: TextStyle(color: context.mutedColor)),
                          actions: [
                            TextField(
                              style: TextStyle(color: context.textColor),
                              decoration: InputDecoration(
                                hintText: 'Type DELETE',
                                hintStyle: TextStyle(color: context.faintColor),
                                filled: true,
                                fillColor: context.isDark ? AppColors.bgDark : const Color(0xFFF5F5F5),
                                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                              ),
                              onSubmitted: (value) {
                                if (value.toUpperCase() == 'DELETE') {
                                  Navigator.pop(dialogCtx);
                                  Navigator.of(context).pushNamedAndRemoveUntil('/welcome', (route) => false);
                                }
                              },
                            ),
                          ],
                        ),
                      );
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.error,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                    child: Text('Delete', style: TextStyle(fontWeight: FontWeight.w600)),
                  ),
                ),
              ],
            ),
            SizedBox(height: MediaQuery.of(context).padding.bottom),
          ],
        ),
      ),
    );
  }

  void _showLanguageSettings(BuildContext context) {
    final appState = Provider.of<AppState>(context, listen: false);
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) {
          String selectedLang = 'English';
          return Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(color: context.surfaceColor, borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: context.borderColor, borderRadius: BorderRadius.circular(2)))),
                const SizedBox(height: 24),
                Text('Language', style: TextStyle(color: context.textColor, fontSize: 20, fontWeight: FontWeight.w700)),
                const SizedBox(height: 20),
                _buildSelectableOption('English', true, () {
                  appState.setCurrentLanguage('en');
                  Navigator.pop(ctx);
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Language set to English'), backgroundColor: AppColors.success));
                }),
                SizedBox(height: MediaQuery.of(context).padding.bottom),
              ],
            ),
          );
        },
      ),
    );
  }

  void _showAppearanceSettings(BuildContext context) {
    final appState = Provider.of<AppState>(context, listen: false);
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) {
          String selectedTheme = appState.isDarkMode ? 'Dark Mode' : 'Light Mode';
          return Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(color: context.surfaceColor, borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: context.borderColor, borderRadius: BorderRadius.circular(2)))),
                const SizedBox(height: 24),
                Text('Appearance', style: TextStyle(color: context.textColor, fontSize: 20, fontWeight: FontWeight.w700)),
                const SizedBox(height: 20),
                _buildSelectableOption('Dark Mode', selectedTheme == 'Dark Mode', () {
                  setSheetState(() => selectedTheme = 'Dark Mode');
                  appState.toggleDarkMode(true);
                  Navigator.pop(ctx);
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Dark mode enabled'), backgroundColor: AppColors.success));
                }),
                _buildSelectableOption('Light Mode', selectedTheme == 'Light Mode', () {
                  setSheetState(() => selectedTheme = 'Light Mode');
                  appState.toggleDarkMode(false);
                  Navigator.pop(ctx);
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Light mode enabled (dark UI in this version)'), backgroundColor: AppColors.success));
                }),
                _buildSelectableOption('System Default', false, () {
                  Navigator.pop(ctx);
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('System default enabled'), backgroundColor: AppColors.success));
                }),
                SizedBox(height: MediaQuery.of(context).padding.bottom),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildSelectableOption(String label, bool selected, VoidCallback onTap) {
    return GestureDetector(
      onTap: () {
        HapticFeedback.lightImpact();
        onTap();
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: selected ? AppColors.yellow.withValues(alpha: 0.15) : (context.isDark ? context.isDark ? AppColors.bgDark : const Color(0xFFF5F5F5) : const Color(0xFFF5F5F5)),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: selected ? AppColors.yellow : context.borderColor),
        ),
        child: Row(
          children: [
            Expanded(child: Text(label, style: TextStyle(color: context.textColor, fontSize: 15, fontWeight: selected ? FontWeight.w600 : FontWeight.normal))),
            if (selected) Icon(Icons.check_circle, color: AppColors.yellow, size: 22),
          ],
        ),
      ),
    );
  }

  void _showHelpCenter(BuildContext context) {
    _showBottomSheet(context, 'Help Center', [
      _buildActionItem('FAQs', Icons.help_outline, () {
        Navigator.pop(context);
        _showFAQs(context);
      }),
      _buildActionItem('How to Book a Ride', Icons.local_taxi, () {
        Navigator.pop(context);
        _showHowToBook(context);
      }),
      _buildActionItem('Safety Guidelines', Icons.shield, () {
        Navigator.pop(context);
        _showSafetyGuidelines(context);
      }),
      _buildActionItem('Report an Issue', Icons.flag_outlined, () {
        Navigator.pop(context);
        _showReportIssue(context);
      }),
    ]);
  }

  void _showFAQs(BuildContext context) async {
    List<Map<String, dynamic>> faqs = [];
    try {
      final data = await SupabaseService.client
          .from('help_content')
          .select()
          .eq('app_type', 'customer')
          .eq('content_type', 'faq')
          .eq('is_active', true)
          .order('sort_order');
      faqs = List<Map<String, dynamic>>.from(data);
    } catch (e) {
      debugPrint('Error loading FAQs: $e');
    }

    if (!mounted) return;

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Container(
        padding: const EdgeInsets.all(24),
        constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.8),
        decoration: BoxDecoration(color: context.surfaceColor, borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: context.borderColor, borderRadius: BorderRadius.circular(2)))),
            const SizedBox(height: 24),
            Text('FAQs', style: TextStyle(color: context.textColor, fontSize: 20, fontWeight: FontWeight.w700)),
            const SizedBox(height: 20),
            Expanded(
              child: SingleChildScrollView(
                child: Column(
                  children: faqs.isEmpty
                      ? [
                          _buildFAQItem('How do I book a ride?', 'Open the app, enter your destination, and tap "Book Ride". A driver will be automatically assigned.'),
                          _buildFAQItem('Is the service free?', 'Yes! MyRide is a free staff transportation service provided by your organization.'),
                          _buildFAQItem('How do I cancel a ride?', 'You can cancel before the driver arrives by tapping "Cancel" on the tracking screen.'),
                        ]
                      : faqs.map((faq) => _buildFAQItem(faq['title'] ?? '', faq['subtitle'] ?? '')).toList(),
                ),
              ),
            ),
            SizedBox(height: MediaQuery.of(context).padding.bottom),
          ],
        ),
      ),
    );
  }

  Widget _buildFAQItem(String question, String answer) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(color: context.isDark ? AppColors.bgDark : const Color(0xFFF5F5F5), borderRadius: BorderRadius.circular(14), border: Border.all(color: context.borderColor)),
      child: ExpansionTile(
        title: Text(question, style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w600)),
        iconColor: AppColors.yellow,
        collapsedIconColor: context.mutedColor,
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        children: [Text(answer, style: TextStyle(color: context.mutedColor, fontSize: 13))],
      ),
    );
  }

  void _showHowToBook(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(color: context.surfaceColor, borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: context.borderColor, borderRadius: BorderRadius.circular(2)))),
            const SizedBox(height: 24),
            Text('How to Book a Ride', style: TextStyle(color: context.textColor, fontSize: 20, fontWeight: FontWeight.w700)),
            const SizedBox(height: 20),
            _buildStepItem('1', 'Open the app and ensure location is enabled'),
            _buildStepItem('2', 'Enter your pickup location or use current location'),
            _buildStepItem('3', 'Enter your destination'),
            _buildStepItem('4', 'Tap "Book Ride" to confirm'),
            _buildStepItem('5', 'Wait for driver assignment'),
            _buildStepItem('6', 'Track your driver in real-time'),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () {
                  Navigator.pop(ctx);
                  Navigator.of(context).pushReplacementNamed('/home');
                },
                style: ElevatedButton.styleFrom(backgroundColor: AppColors.yellow, foregroundColor: Colors.black, padding: const EdgeInsets.symmetric(vertical: 14), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
                child: Text('Book a Ride Now', style: TextStyle(fontWeight: FontWeight.w600)),
              ),
            ),
            SizedBox(height: MediaQuery.of(context).padding.bottom),
          ],
        ),
      ),
    );
  }

  Widget _buildStepItem(String number, String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Container(
            width: 32, height: 32,
            decoration: BoxDecoration(color: AppColors.yellow.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(10)),
            child: Center(child: Text(number, style: TextStyle(color: AppColors.yellow, fontSize: 14, fontWeight: FontWeight.w700))),
          ),
          const SizedBox(width: 14),
          Expanded(child: Text(text, style: TextStyle(color: context.textColor, fontSize: 14))),
        ],
      ),
    );
  }

  void _showPaymentHelp(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(color: context.surfaceColor, borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(width: 40, height: 4, decoration: BoxDecoration(color: context.borderColor, borderRadius: BorderRadius.circular(2))),
            const SizedBox(height: 24),
            Container(
              width: 72, height: 72,
              decoration: BoxDecoration(color: AppColors.success.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(20)),
              child: Icon(Icons.check_circle, color: AppColors.success, size: 40),
            ),
            const SizedBox(height: 20),
            Text('No Payment Required!', style: TextStyle(color: context.textColor, fontSize: 20, fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            Text(
              'MyRide is a free staff transportation service. All rides are complimentary - no payment or wallet setup needed.',
              style: TextStyle(color: context.mutedColor, fontSize: 14),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () => Navigator.pop(ctx),
                style: ElevatedButton.styleFrom(backgroundColor: AppColors.yellow, foregroundColor: Colors.black, padding: const EdgeInsets.symmetric(vertical: 14), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
                child: Text('Got it!', style: TextStyle(fontWeight: FontWeight.w600)),
              ),
            ),
            SizedBox(height: MediaQuery.of(context).padding.bottom),
          ],
        ),
      ),
    );
  }

  void _showSafetyGuidelines(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Container(
        padding: const EdgeInsets.all(24),
        constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.75),
        decoration: BoxDecoration(color: context.surfaceColor, borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: context.borderColor, borderRadius: BorderRadius.circular(2)))),
            const SizedBox(height: 24),
            Text('Safety Guidelines', style: TextStyle(color: context.textColor, fontSize: 20, fontWeight: FontWeight.w700)),
            const SizedBox(height: 20),
            Expanded(
              child: SingleChildScrollView(
                child: Column(
                  children: [
                    _buildSafetyTip(Icons.verified_user, 'Verify Your Driver', 'Check the vehicle number and driver photo before entering.'),
                    _buildSafetyTip(Icons.share_location, 'Share Your Trip', 'Use the share button to let friends/family track your ride.'),
                    _buildSafetyTip(Icons.sos, 'Use SOS Feature', 'In emergencies, tap SOS to alert authorities and contacts.'),
                    _buildSafetyTip(Icons.airline_seat_recline_normal, 'Wear Seatbelt', 'Always buckle up for your safety.'),
                    _buildSafetyTip(Icons.star, 'Rate Your Driver', 'Your feedback helps maintain service quality.'),
                  ],
                ),
              ),
            ),
            SizedBox(height: MediaQuery.of(context).padding.bottom),
          ],
        ),
      ),
    );
  }

  Widget _buildSafetyTip(IconData icon, String title, String description) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: context.isDark ? AppColors.bgDark : const Color(0xFFF5F5F5), borderRadius: BorderRadius.circular(14), border: Border.all(color: context.borderColor)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 44, height: 44,
            decoration: BoxDecoration(color: AppColors.yellow.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(12)),
            child: Icon(icon, color: AppColors.yellow, size: 22),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: TextStyle(color: context.textColor, fontSize: 15, fontWeight: FontWeight.w600)),
                const SizedBox(height: 4),
                Text(description, style: TextStyle(color: context.mutedColor, fontSize: 13)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _showReportIssue(BuildContext context) {
    final descriptionController = TextEditingController();
    String selectedCategory = 'Driver Issue';
    final categories = ['Driver Issue', 'App Bug', 'Lost Item', 'Safety Concern', 'Other'];

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) => Padding(
          padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
          child: Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(color: context.surfaceColor, borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: context.borderColor, borderRadius: BorderRadius.circular(2)))),
                const SizedBox(height: 24),
                Text('Report an Issue', style: TextStyle(color: context.textColor, fontSize: 20, fontWeight: FontWeight.w700)),
                const SizedBox(height: 20),
                Text('Category', style: TextStyle(color: context.mutedColor, fontSize: 13)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: categories.map((cat) => GestureDetector(
                    onTap: () => setSheetState(() => selectedCategory = cat),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(
                        color: selectedCategory == cat ? AppColors.yellow.withValues(alpha: 0.15) : context.isDark ? AppColors.bgDark : const Color(0xFFF5F5F5),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: selectedCategory == cat ? AppColors.yellow : context.borderColor),
                      ),
                      child: Text(cat, style: TextStyle(color: selectedCategory == cat ? AppColors.yellow : context.textColor, fontSize: 12, fontWeight: FontWeight.w500)),
                    ),
                  )).toList(),
                ),
                const SizedBox(height: 16),
                Text('Description', style: TextStyle(color: context.mutedColor, fontSize: 13)),
                const SizedBox(height: 8),
                Container(
                  height: 100,
                  decoration: BoxDecoration(color: context.isDark ? AppColors.bgDark : const Color(0xFFF5F5F5), borderRadius: BorderRadius.circular(14), border: Border.all(color: context.borderColor)),
                  child: TextField(
                    controller: descriptionController,
                    maxLines: 4,
                    style: TextStyle(color: context.textColor),
                    decoration: InputDecoration(hintText: 'Describe your issue...', hintStyle: TextStyle(color: context.faintColor), border: InputBorder.none, contentPadding: EdgeInsets.all(16)),
                  ),
                ),
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () {
                      if (descriptionController.text.isEmpty) {
                        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Please describe your issue'), backgroundColor: AppColors.error));
                        return;
                      }
                      Navigator.pop(ctx);
                      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Issue reported. We\'ll get back to you soon.'), backgroundColor: AppColors.success));
                    },
                    style: ElevatedButton.styleFrom(backgroundColor: AppColors.yellow, foregroundColor: Colors.black, padding: const EdgeInsets.symmetric(vertical: 14), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
                    child: Text('Submit Report', style: TextStyle(fontWeight: FontWeight.w600)),
                  ),
                ),
                SizedBox(height: MediaQuery.of(context).padding.bottom),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _showContactSupport(BuildContext context) async {
    // Fetch support info from database
    String supportPhone = '+960 333-3333';
    String supportEmail = 'itadminsupport@macl.aero';

    try {
      final settings = await SupabaseService.client
          .from('app_settings')
          .select('support_phone, support_email')
          .eq('id', 'default')
          .maybeSingle();
      if (settings != null) {
        supportPhone = settings['support_phone'] ?? supportPhone;
        supportEmail = settings['support_email'] ?? supportEmail;
      }
    } catch (e) {
      debugPrint('Failed to load support settings: $e');
    }

    if (!mounted) return;

    _showBottomSheet(context, 'Contact Support', [
      _buildActionItem('Call Support', Icons.phone, () async {
        Navigator.pop(context);
        final phone = supportPhone.replaceAll(RegExp(r'[^0-9+]'), '');
        final uri = Uri.parse('tel:$phone');
        if (await canLaunchUrl(uri)) {
          await launchUrl(uri);
        }
      }, subtitle: supportPhone),
      _buildActionItem('Email Support', Icons.email, () async {
        Navigator.pop(context);
        final uri = Uri.parse('mailto:$supportEmail?subject=Support%20Request');
        if (await canLaunchUrl(uri)) {
          await launchUrl(uri);
        }
      }, subtitle: supportEmail),
      _buildActionItem('Live Chat', Icons.chat, () {
        Navigator.pop(context);
        Navigator.push(context, MaterialPageRoute(builder: (_) => ChatScreen(
          driverName: 'MyRide Support',
          driverPhone: supportPhone,
          vehicleNumber: 'Support',
        )));
      }),
    ]);
  }

  void _showAbout(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => SingleChildScrollView(
        child: Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(color: context.surfaceColor, borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(width: 40, height: 4, decoration: BoxDecoration(color: context.borderColor, borderRadius: BorderRadius.circular(2))),
              const SizedBox(height: 24),
              Container(
                width: 80, height: 80,
                decoration: BoxDecoration(color: AppColors.yellow, borderRadius: BorderRadius.circular(20)),
                child: Icon(Icons.local_taxi, color: Colors.black, size: 40),
              ),
              const SizedBox(height: 16),
              Text('MyRide', style: TextStyle(color: context.textColor, fontSize: 24, fontWeight: FontWeight.w800)),
              const SizedBox(height: 4),
              Text('Version 1.0.0 (Beta)', style: TextStyle(color: context.mutedColor, fontSize: 14)),
              const SizedBox(height: 20),
              Text('Your trusted transportation partner in Maldives.', style: TextStyle(color: context.mutedColor, fontSize: 14), textAlign: TextAlign.center),
              const SizedBox(height: 24),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  _buildSocialIcon(Icons.language),
                  const SizedBox(width: 16),
                  _buildSocialIcon(Icons.facebook),
                  const SizedBox(width: 16),
                  _buildSocialIcon(Icons.camera_alt),
                ],
              ),
              const SizedBox(height: 20),
              Text('© 2024 MyRide. All rights reserved.', style: TextStyle(color: context.faintColor, fontSize: 12)),
              SizedBox(height: MediaQuery.of(context).padding.bottom + 16),
            ],
          ),
        ),
      ),
    );
  }

  void _showTerms(BuildContext context) {
    _showBottomSheet(context, 'Legal', [
      _buildActionItem('Terms of Service', Icons.description_outlined, () async {
        Navigator.pop(context);
        await _showLegalFromDatabase(context, 'terms-of-service', 'Terms of Service', _termsOfService);
      }),
      _buildActionItem('Privacy Policy', Icons.privacy_tip_outlined, () async {
        Navigator.pop(context);
        await _showLegalFromDatabase(context, 'privacy-policy', 'Privacy Policy', _privacyPolicy);
      }),
      _buildActionItem('Licenses', Icons.article_outlined, () {
        Navigator.pop(context);
        _showLicenses(context);
      }),
    ]);
  }

  Future<void> _showLegalFromDatabase(BuildContext context, String slug, String title, String fallback) async {
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
    _showLegalDocument(context, title, content);
  }

  void _showLegalDocument(BuildContext context, String title, String content) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Container(
        padding: const EdgeInsets.all(24),
        constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.85),
        decoration: BoxDecoration(color: context.surfaceColor, borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(width: 40, height: 4, decoration: BoxDecoration(color: context.borderColor, borderRadius: BorderRadius.circular(2))),
            const SizedBox(height: 24),
            Text(title, style: TextStyle(color: context.textColor, fontSize: 20, fontWeight: FontWeight.w700)),
            const SizedBox(height: 20),
            Expanded(
              child: SingleChildScrollView(
                child: Text(content, style: TextStyle(color: context.mutedColor, fontSize: 14, height: 1.6)),
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () => Navigator.pop(ctx),
                style: ElevatedButton.styleFrom(backgroundColor: AppColors.yellow, foregroundColor: Colors.black, padding: const EdgeInsets.symmetric(vertical: 14), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
                child: Text('Close', style: TextStyle(fontWeight: FontWeight.w600)),
              ),
            ),
            SizedBox(height: MediaQuery.of(context).padding.bottom),
          ],
        ),
      ),
    );
  }

  void _showLicenses(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Container(
        height: MediaQuery.of(context).size.height * 0.7,
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(color: context.surfaceColor, borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
        child: Column(
          children: [
            Container(width: 40, height: 4, decoration: BoxDecoration(color: context.borderColor, borderRadius: BorderRadius.circular(2))),
            const SizedBox(height: 24),
            Text('Open Source Licenses', style: TextStyle(color: context.textColor, fontSize: 20, fontWeight: FontWeight.w700)),
            const SizedBox(height: 16),
            Expanded(
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'This app is built using Flutter and includes the following open source packages:\n\n'
                      '• Flutter SDK - BSD License\n'
                      '• Provider - MIT License\n'
                      '• Supabase Flutter - MIT License\n'
                      '• Google Maps Flutter - Apache 2.0\n'
                      '• Flutter Local Notifications - BSD License\n'
                      '• Image Picker - Apache 2.0\n'
                      '• Geolocator - MIT License\n'
                      '• Share Plus - BSD License\n'
                      '• URL Launcher - BSD License\n'
                      '• Connectivity Plus - BSD License\n\n'
                      'Full license texts are available in the respective package repositories.',
                      style: TextStyle(color: context.mutedColor, fontSize: 14, height: 1.6),
                    ),
                  ],
                ),
              ),
            ),
            SizedBox(height: MediaQuery.of(context).padding.bottom),
          ],
        ),
      ),
    );
  }

  static const String _termsOfService = '''
TERMS OF SERVICE

Last updated: June 2024

1. ACCEPTANCE OF TERMS
By accessing and using the MyRide application, you agree to be bound by these Terms of Service.

2. DESCRIPTION OF SERVICE
MyRide provides free staff transportation services within designated areas. The service is exclusively available to authorized employees.

3. USER RESPONSIBILITIES
- You must provide accurate information when registering
- You are responsible for maintaining the confidentiality of your account
- You agree not to misuse the service or engage in prohibited conduct

4. SERVICE AVAILABILITY
MyRide operates during designated hours and routes may be subject to change. We do not guarantee uninterrupted service availability.

5. SAFETY GUIDELINES
Users must follow all safety guidelines including wearing seatbelts and treating drivers with respect.

6. LIMITATION OF LIABILITY
MyRide shall not be liable for any indirect, incidental, or consequential damages arising from use of the service.

7. CHANGES TO TERMS
We reserve the right to modify these terms at any time. Continued use of the service constitutes acceptance of modified terms.

8. CONTACT
For questions about these terms, contact support@myride.mv
''';

  static const String _privacyPolicy = '''
PRIVACY POLICY

Last updated: June 2024

1. INFORMATION WE COLLECT
- Personal information: Name, phone number, email, staff ID
- Location data: Pickup and dropoff locations
- Usage data: Trip history, app interactions

2. HOW WE USE YOUR INFORMATION
- To provide and improve our transportation service
- To communicate with you about your trips
- To ensure safety and security
- For analytics and service optimization

3. DATA SHARING
We do not sell your personal information. Data may be shared with:
- Drivers assigned to your trips
- Emergency services when necessary
- Service providers who assist our operations

4. DATA SECURITY
We implement industry-standard security measures to protect your data.

5. YOUR RIGHTS
You may request access to, correction of, or deletion of your personal data.

6. DATA RETENTION
We retain your data for the duration of your account and as required by law.

7. CONTACT
For privacy concerns, contact privacy@myride.mv
''';

  static const String _cookiePolicy = '''
COOKIE POLICY

Last updated: June 2024

1. WHAT ARE COOKIES?
Cookies are small data files stored on your device when you use our app.

2. HOW WE USE COOKIES
- Essential cookies: Required for app functionality
- Analytics cookies: Help us understand app usage
- Preference cookies: Remember your settings

3. MANAGING COOKIES
You can manage cookie preferences in your device settings.

4. THIRD-PARTY COOKIES
We may use third-party analytics services that set their own cookies.

5. CHANGES TO THIS POLICY
We may update this policy periodically. Check back for updates.

6. CONTACT
For questions about cookies, contact support@myride.mv
''';

  Widget _buildSocialIcon(IconData icon) {
    return Container(
      width: 44, height: 44,
      decoration: BoxDecoration(color: context.isDark ? AppColors.bgDark : const Color(0xFFF5F5F5), borderRadius: BorderRadius.circular(12)),
      child: Icon(icon, color: context.mutedColor, size: 20),
    );
  }

  void _showBottomSheet(BuildContext context, String title, List<Widget> children, {String? addButton}) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Container(
        padding: const EdgeInsets.all(24),
        constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.7),
        decoration: BoxDecoration(color: context.surfaceColor, borderRadius: const BorderRadius.vertical(top: Radius.circular(28))),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: context.borderColor, borderRadius: BorderRadius.circular(2)))),
            const SizedBox(height: 24),
            Text(title, style: TextStyle(color: context.textColor, fontSize: 20, fontWeight: FontWeight.w700)),
            const SizedBox(height: 20),
            Flexible(
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: children,
                ),
              ),
            ),
            if (addButton != null) ...[
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: () {},
                  icon: Icon(Icons.add, size: 18),
                  label: Text(addButton),
                  style: OutlinedButton.styleFrom(foregroundColor: AppColors.yellow, side: BorderSide(color: AppColors.yellow), padding: const EdgeInsets.symmetric(vertical: 14), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
                ),
              ),
            ],
            SizedBox(height: MediaQuery.of(context).padding.bottom),
          ],
        ),
      ),
    );
  }

  Widget _buildInfoItem(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(color: context.mutedColor, fontSize: 14)),
          Text(value, style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }

  Widget _buildSwitchItem(String label, bool value, Function(bool) onChanged) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(color: context.textColor, fontSize: 15)),
          Switch(value: value, onChanged: onChanged, activeColor: AppColors.yellow),
        ],
      ),
    );
  }

  Widget _buildActionItem(String label, IconData icon, VoidCallback onTap, {String? subtitle, bool isDestructive = false}) {
    return GestureDetector(
      onTap: () {
        HapticFeedback.lightImpact();
        onTap();
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: context.isDark ? context.isDark ? AppColors.bgDark : const Color(0xFFF5F5F5) : const Color(0xFFF5F5F5), borderRadius: BorderRadius.circular(14), border: Border.all(color: context.borderColor)),
        child: Row(
          children: [
            Container(
              width: 40, height: 40,
              decoration: BoxDecoration(color: (isDestructive ? AppColors.error : AppColors.yellow).withValues(alpha: 0.15), borderRadius: BorderRadius.circular(12)),
              child: Icon(icon, color: isDestructive ? AppColors.error : AppColors.yellow, size: 20),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(label, style: TextStyle(color: isDestructive ? AppColors.error : context.textColor, fontSize: 15, fontWeight: FontWeight.w500)),
                if (subtitle != null) Text(subtitle, style: TextStyle(color: context.mutedColor, fontSize: 12)),
              ]),
            ),
            Icon(Icons.chevron_right, color: context.mutedColor, size: 20),
          ],
        ),
      ),
    );
  }

  void _showLogoutConfirmation(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: context.surfaceColor,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text('Log Out', style: TextStyle(color: context.textColor, fontWeight: FontWeight.w700)),
        content: Text(
          'Are you sure you want to log out of your account?',
          style: TextStyle(color: context.mutedColor),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text('Cancel', style: TextStyle(color: context.mutedColor)),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              Navigator.of(context).pushNamedAndRemoveUntil('/welcome', (route) => false);
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.error,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            child: Text('Log Out'),
          ),
        ],
      ),
    );
  }
}

class _AddPlaceScreen extends StatefulWidget {
  final Function(String name, String address, double lat, double lng) onSave;

  const _AddPlaceScreen({required this.onSave});

  @override
  State<_AddPlaceScreen> createState() => _AddPlaceScreenState();
}

class _AddPlaceScreenState extends State<_AddPlaceScreen> {
  final _nameController = TextEditingController();
  final _searchController = TextEditingController();
  final _mapController = MapController();

  LatLng _selectedLocation = const LatLng(4.1755, 73.5093); // Male, Maldives
  String _selectedAddress = '';
  bool _isSearching = false;
  List<Map<String, dynamic>> _searchResults = [];

  final List<Map<String, dynamic>> _popularPlaces = [
    {'name': 'Velana International Airport', 'address': 'Hulhulé Island', 'lat': 4.1918, 'lng': 73.5290},
    {'name': 'Male Ferry Terminal', 'address': 'Male City', 'lat': 4.1749, 'lng': 73.5094},
    {'name': 'Hulhumale Ferry Terminal', 'address': 'Hulhumale', 'lat': 4.2108, 'lng': 73.5403},
    {'name': 'IGMH Hospital', 'address': 'Male City', 'lat': 4.1720, 'lng': 73.5127},
    {'name': 'Artificial Beach', 'address': 'Male City', 'lat': 4.1703, 'lng': 73.5210},
    {'name': 'Republic Square', 'address': 'Male City', 'lat': 4.1754, 'lng': 73.5093},
    {'name': 'Majeedhee Magu', 'address': 'Male City', 'lat': 4.1756, 'lng': 73.5088},
    {'name': 'Ameenee Magu', 'address': 'Male City', 'lat': 4.1725, 'lng': 73.5105},
  ];

  @override
  void dispose() {
    _nameController.dispose();
    _searchController.dispose();
    _mapController.dispose();
    super.dispose();
  }

  void _searchPlaces(String query) {
    if (query.isEmpty) {
      setState(() {
        _searchResults = [];
        _isSearching = false;
      });
      return;
    }

    setState(() => _isSearching = true);

    final results = _popularPlaces.where((place) {
      final name = place['name'].toString().toLowerCase();
      final address = place['address'].toString().toLowerCase();
      final q = query.toLowerCase();
      return name.contains(q) || address.contains(q);
    }).toList();

    setState(() {
      _searchResults = results;
      _isSearching = false;
    });
  }

  void _selectPlace(Map<String, dynamic> place) {
    final lat = place['lat'] as double;
    final lng = place['lng'] as double;
    setState(() {
      _selectedLocation = LatLng(lat, lng);
      _selectedAddress = '${place['name']}, ${place['address']}';
      _searchController.text = place['name'];
      _searchResults = [];
    });
    _mapController.move(_selectedLocation, 16);
    HapticFeedback.lightImpact();
  }

  void _onMapTap(TapPosition tapPosition, LatLng point) {
    setState(() {
      _selectedLocation = point;
      _selectedAddress = 'Lat: ${point.latitude.toStringAsFixed(4)}, Lng: ${point.longitude.toStringAsFixed(4)}';
    });
    HapticFeedback.lightImpact();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.isDark ? AppColors.bgDark : const Color(0xFFF5F5F5),
      body: Stack(
        children: [
          // Map
          FlutterMap(
            mapController: _mapController,
            options: MapOptions(
              initialCenter: _selectedLocation,
              initialZoom: 14,
              onTap: _onMapTap,
            ),
            children: [
              TileLayer(
                urlTemplate: context.isDark ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
                subdomains: const ['a', 'b', 'c', 'd'],
              ),
              MarkerLayer(
                markers: [
                  Marker(
                    point: _selectedLocation,
                    width: 50,
                    height: 50,
                    child: Column(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: AppColors.yellow,
                            borderRadius: BorderRadius.circular(12),
                            boxShadow: [
                              BoxShadow(
                                color: AppColors.yellow.withValues(alpha: 0.4),
                                blurRadius: 12,
                                offset: const Offset(0, 4),
                              ),
                            ],
                          ),
                          child: Icon(Icons.place, color: Colors.black, size: 20),
                        ),
                        Container(
                          width: 3,
                          height: 10,
                          decoration: BoxDecoration(
                            color: AppColors.yellow,
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),

          // Top bar with search
          SafeArea(
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    children: [
                      GestureDetector(
                        onTap: () => Navigator.pop(context),
                        child: Container(
                          width: 48,
                          height: 48,
                          decoration: BoxDecoration(
                            color: context.surfaceColor,
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: Icon(Icons.arrow_back, color: context.textColor),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Container(
                          height: 48,
                          decoration: BoxDecoration(
                            color: context.surfaceColor,
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: TextField(
                            controller: _searchController,
                            style: TextStyle(color: context.textColor),
                            onChanged: _searchPlaces,
                            decoration: InputDecoration(
                              hintText: 'Search location...',
                              hintStyle: TextStyle(color: context.mutedColor),
                              prefixIcon: Icon(Icons.search, color: context.mutedColor),
                              border: InputBorder.none,
                              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),

                // Search results
                if (_searchResults.isNotEmpty)
                  Container(
                    margin: const EdgeInsets.symmetric(horizontal: 16),
                    constraints: const BoxConstraints(maxHeight: 250),
                    decoration: BoxDecoration(
                      color: context.surfaceColor,
                      borderRadius: BorderRadius.circular(14),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.3),
                          blurRadius: 12,
                          offset: const Offset(0, 4),
                        ),
                      ],
                    ),
                    child: ListView.builder(
                      shrinkWrap: true,
                      padding: EdgeInsets.zero,
                      itemCount: _searchResults.length,
                      itemBuilder: (context, index) {
                        final place = _searchResults[index];
                        return GestureDetector(
                          onTap: () => _selectPlace(place),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                            decoration: BoxDecoration(
                              border: index < _searchResults.length - 1
                                  ? Border(bottom: BorderSide(color: context.borderColor))
                                  : null,
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
                                  child: Icon(Icons.place, color: AppColors.yellow, size: 20),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        place['name'],
                                        style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w600),
                                      ),
                                      Text(
                                        place['address'],
                                        style: TextStyle(color: context.mutedColor, fontSize: 12),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
                  ),

                // Popular places when search is empty
                if (_searchResults.isEmpty && _searchController.text.isEmpty)
                  Container(
                    margin: const EdgeInsets.symmetric(horizontal: 16),
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: context.surfaceColor,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Popular Places', style: TextStyle(color: context.mutedColor, fontSize: 12, fontWeight: FontWeight.w600)),
                        const SizedBox(height: 12),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: _popularPlaces.take(4).map((place) => GestureDetector(
                            onTap: () => _selectPlace(place),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                              decoration: BoxDecoration(
                                color: context.isDark ? AppColors.bgDark : const Color(0xFFF5F5F5),
                                borderRadius: BorderRadius.circular(20),
                                border: Border.all(color: context.borderColor),
                              ),
                              child: Text(place['name'], style: TextStyle(color: context.textColor, fontSize: 12)),
                            ),
                          )).toList(),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),

          // Bottom panel
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: Container(
              padding: EdgeInsets.fromLTRB(24, 24, 24, MediaQuery.of(context).padding.bottom + 24),
              decoration: BoxDecoration(
                color: context.surfaceColor,
                borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.3),
                    blurRadius: 20,
                    offset: const Offset(0, -4),
                  ),
                ],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(width: 40, height: 4, decoration: BoxDecoration(color: context.borderColor, borderRadius: BorderRadius.circular(2))),
                  const SizedBox(height: 20),

                  // Selected location
                  if (_selectedAddress.isNotEmpty) ...[
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: context.isDark ? AppColors.bgDark : const Color(0xFFF5F5F5),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: AppColors.yellow.withValues(alpha: 0.3)),
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 44,
                            height: 44,
                            decoration: BoxDecoration(
                              color: AppColors.yellow.withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Icon(Icons.place, color: AppColors.yellow, size: 22),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('Selected Location', style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w600)),
                                const SizedBox(height: 2),
                                Text(_selectedAddress, style: TextStyle(color: context.mutedColor, fontSize: 12), maxLines: 1, overflow: TextOverflow.ellipsis),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                  ],

                  // Place name input
                  Container(
                    decoration: BoxDecoration(
                      color: context.isDark ? AppColors.bgDark : const Color(0xFFF5F5F5),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: context.borderColor),
                    ),
                    child: TextField(
                      controller: _nameController,
                      style: TextStyle(color: context.textColor),
                      decoration: InputDecoration(
                        hintText: 'Place name (e.g. Gym, Office)',
                        hintStyle: TextStyle(color: context.faintColor),
                        prefixIcon: Icon(Icons.label_outline, color: context.mutedColor),
                        border: InputBorder.none,
                        contentPadding: const EdgeInsets.all(16),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Save button
                  SizedBox(
                    width: double.infinity,
                    height: 52,
                    child: ElevatedButton(
                      onPressed: () {
                        if (_nameController.text.isEmpty) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('Please enter a place name'), backgroundColor: AppColors.error),
                          );
                          return;
                        }
                        if (_selectedAddress.isEmpty) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('Please select a location on the map'), backgroundColor: AppColors.error),
                          );
                          return;
                        }
                        widget.onSave(
                          _nameController.text,
                          _selectedAddress,
                          _selectedLocation.latitude,
                          _selectedLocation.longitude,
                        );
                        Navigator.pop(context);
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.yellow,
                        foregroundColor: Colors.black,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                        elevation: 0,
                      ),
                      child: Text('Save Place', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Center crosshair hint
          Center(
            child: IgnorePointer(
              child: Opacity(
                opacity: 0.5,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: context.surfaceColor,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text('Tap map to select location', style: TextStyle(color: context.textColor, fontSize: 12)),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
