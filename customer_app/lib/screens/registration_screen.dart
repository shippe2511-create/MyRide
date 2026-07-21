import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../providers/app_state.dart';
import '../theme/app_theme.dart';
import '../services/supabase_service.dart';
import '../widgets/app_snackbar.dart';

class RegistrationScreen extends StatefulWidget {
  const RegistrationScreen({super.key});

  @override
  State<RegistrationScreen> createState() => _RegistrationScreenState();
}

class _RegistrationScreenState extends State<RegistrationScreen> {
  final _formKey = GlobalKey<FormState>();
  final _fullNameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _emailController = TextEditingController();
  final _staffIdController = TextEditingController();
  final _emergencyPhoneController = TextEditingController();
  final _emergencyRelationController = TextEditingController();

  String _selectedGender = 'Male';
  bool _isLoading = false;
  String _phoneNumber = '';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final args = ModalRoute.of(context)?.settings.arguments as Map<String, dynamic>?;
    if (args != null && args['phone'] != null) {
      _phoneNumber = args['phone'] as String;
    }
  }

  @override
  void dispose() {
    _fullNameController.dispose();
    _phoneController.dispose();
    _emailController.dispose();
    _staffIdController.dispose();
    _emergencyPhoneController.dispose();
    _emergencyRelationController.dispose();
    super.dispose();
  }

  Future<void> _submitRegistration() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isLoading = true);
    HapticFeedback.mediumImpact();

    try {
      final phoneNumber = '+960${_phoneController.text.trim()}';
      final response = await SupabaseService.signUpWithPhone(
        phone: phoneNumber,
        fullName: _fullNameController.text.trim(),
        email: _emailController.text.trim().isEmpty ? null : _emailController.text.trim(),
        gender: _selectedGender,
        staffId: _staffIdController.text.trim().toUpperCase(),
        emergencyContacts: _emergencyPhoneController.text.isNotEmpty
            ? [{'phone': '+960${_emergencyPhoneController.text.trim()}', 'relation': _emergencyRelationController.text.trim()}]
            : [],
      );

      if (!mounted) return;

      final appState = Provider.of<AppState>(context, listen: false);

      // Store the Supabase profile ID
      if (response['id'] != null) {
        appState.setProfileId(response['id']);
      }

      appState.setRegistrationData(
        fullName: _fullNameController.text.trim(),
        staffId: _staffIdController.text.trim().toUpperCase(),
        department: 'Staff',
        phone: phoneNumber,
      );

      HapticFeedback.lightImpact();

      // Check if user was auto-approved
      final status = response['status'] as String?;
      if (status == 'approved') {
        Navigator.pushReplacementNamed(context, '/home');
      } else {
        Navigator.pushReplacementNamed(context, '/pending');
      }
    } catch (e) {
      if (mounted) {
        HapticFeedback.heavyImpact();
        AppSnackbar.error(context, e.toString().replaceAll('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = context.isDark;

    return Scaffold(
      backgroundColor: context.bgColor,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 20),
                Center(
                  child: Container(
                    width: 80,
                    height: 80,
                    decoration: BoxDecoration(
                      color: AppColors.yellow,
                      borderRadius: BorderRadius.circular(24),
                    ),
                    child: Icon(Icons.person_add_rounded, color: context.isDark ? AppColors.bgDark : Colors.white, size: 40),
                  ),
                ),
                const SizedBox(height: 24),
                Center(
                  child: Text(
                    'Create Account',
                    style: TextStyle(color: context.textColor, fontSize: 28, fontWeight: FontWeight.w700),
                  ),
                ),
                const SizedBox(height: 8),
                Center(
                  child: Text(
                    _phoneNumber.isEmpty ? 'Register to request access' : _phoneNumber,
                    style: TextStyle(color: context.mutedColor, fontSize: 15),
                  ),
                ),
                const SizedBox(height: 40),

                // Full Name
                _buildLabel('Full Name *'),
                _buildTextField(
                  controller: _fullNameController,
                  hint: 'Enter your full name',
                  icon: Icons.person_outline,
                  isDark: isDark,
                  validator: (v) => v?.isEmpty == true ? 'Name is required' : null,
                ),
                const SizedBox(height: 20),

                // Email
                _buildLabel('Email (optional)'),
                _buildTextField(
                  controller: _emailController,
                  hint: 'your.email@example.com',
                  icon: Icons.email_outlined,
                  isDark: isDark,
                  keyboardType: TextInputType.emailAddress,
                ),
                const SizedBox(height: 20),

                // Gender
                _buildLabel('Gender'),
                Row(
                  children: [
                    Expanded(
                      child: GestureDetector(
                        onTap: () => setState(() => _selectedGender = 'Male'),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          decoration: BoxDecoration(
                            color: _selectedGender == 'Male'
                                ? AppColors.yellow
                                : isDark ? Colors.white.withValues(alpha: 0.05) : Colors.black.withValues(alpha: 0.05),
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(
                              color: _selectedGender == 'Male' ? AppColors.yellow : Colors.transparent,
                            ),
                          ),
                          child: Center(
                            child: Text(
                              'Male',
                              style: TextStyle(
                                color: _selectedGender == 'Male' ? Colors.black : context.textColor,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: GestureDetector(
                        onTap: () => setState(() => _selectedGender = 'Female'),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          decoration: BoxDecoration(
                            color: _selectedGender == 'Female'
                                ? AppColors.yellow
                                : isDark ? Colors.white.withValues(alpha: 0.05) : Colors.black.withValues(alpha: 0.05),
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(
                              color: _selectedGender == 'Female' ? AppColors.yellow : Colors.transparent,
                            ),
                          ),
                          child: Center(
                            child: Text(
                              'Female',
                              style: TextStyle(
                                color: _selectedGender == 'Female' ? Colors.black : context.textColor,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),

                // Phone Number
                _buildLabel('Phone Number *'),
                Container(
                  decoration: BoxDecoration(
                    color: isDark ? Colors.white.withValues(alpha: 0.05) : Colors.black.withValues(alpha: 0.05),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 16),
                        child: Row(
                          children: [
                            Icon(Icons.phone_outlined, color: context.mutedColor, size: 20),
                            const SizedBox(width: 6),
                            Text('+960', style: TextStyle(color: context.textColor, fontSize: 14)),
                          ],
                        ),
                      ),
                      Expanded(
                        child: TextFormField(
                          controller: _phoneController,
                          keyboardType: TextInputType.phone,
                          style: TextStyle(color: context.textColor),
                          decoration: InputDecoration(
                            hintText: '7XXXXXX',
                            hintStyle: TextStyle(color: context.mutedColor),
                            border: InputBorder.none,
                            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 16),
                          ),
                          validator: (v) => v?.isEmpty == true ? 'Phone is required' : null,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),

                // Staff ID
                _buildLabel('Staff ID *'),
                _buildTextField(
                  controller: _staffIdController,
                  hint: 'e.g., IT-0042',
                  icon: Icons.badge_outlined,
                  isDark: isDark,
                  textCapitalization: TextCapitalization.characters,
                  validator: (v) => v?.isEmpty == true ? 'Staff ID is required' : null,
                ),
                const SizedBox(height: 20),

                // Emergency Contact
                _buildLabel('Emergency Contact'),
                Row(
                  children: [
                    Expanded(
                      flex: 2,
                      child: Container(
                        decoration: BoxDecoration(
                          color: isDark ? Colors.white.withValues(alpha: 0.05) : Colors.black.withValues(alpha: 0.05),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 16),
                              child: Row(
                                children: [
                                  Icon(Icons.phone_outlined, color: context.mutedColor, size: 20),
                                  const SizedBox(width: 6),
                                  Text('+960', style: TextStyle(color: context.textColor, fontSize: 14)),
                                ],
                              ),
                            ),
                            Expanded(
                              child: TextField(
                                controller: _emergencyPhoneController,
                                keyboardType: TextInputType.phone,
                                style: TextStyle(color: context.textColor, fontSize: 16),
                                decoration: InputDecoration(
                                  hintText: '7XXXXXX',
                                  hintStyle: TextStyle(color: context.faintColor),
                                  border: InputBorder.none,
                                  contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 16),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _buildTextField(
                        controller: _emergencyRelationController,
                        hint: 'Relation',
                        isDark: isDark,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 32),

                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: AppColors.yellow.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: AppColors.yellow.withValues(alpha: 0.3)),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.info_outline, color: AppColors.yellow, size: 20),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          'Your registration will be reviewed by admin.',
                          style: TextStyle(color: context.textColor, fontSize: 13, height: 1.4),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 32),

                SizedBox(
                  width: double.infinity,
                  height: 56,
                  child: ElevatedButton(
                    onPressed: _isLoading ? null : _submitRegistration,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.yellow,
                      foregroundColor: AppColors.bgDark,
                      disabledBackgroundColor: AppColors.yellow.withValues(alpha: 0.5),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                      elevation: 0,
                    ),
                    child: _isLoading
                        ? const SizedBox(
                            width: 24, height: 24,
                            child: CircularProgressIndicator(strokeWidth: 2.5, valueColor: AlwaysStoppedAnimation<Color>(AppColors.bgDark)),
                          )
                        : Text('Create Account', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                  ),
                ),
                const SizedBox(height: 20),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildLabel(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(text, style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w600)),
    );
  }

  Widget _buildTextField({
    TextEditingController? controller,
    required String hint,
    IconData? icon,
    required bool isDark,
    TextInputType? keyboardType,
    TextCapitalization textCapitalization = TextCapitalization.none,
    String? Function(String?)? validator,
  }) {
    return TextFormField(
      controller: controller,
      keyboardType: keyboardType,
      textCapitalization: textCapitalization,
      validator: validator,
      style: TextStyle(color: context.textColor, fontSize: 16),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: TextStyle(color: context.faintColor),
        prefixIcon: icon != null ? Icon(icon, color: context.mutedColor, size: 22) : null,
        filled: true,
        fillColor: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.05),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.1)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.1)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: AppColors.yellow, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: AppColors.red),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      ),
    );
  }
}

class PendingApprovalScreen extends StatefulWidget {
  const PendingApprovalScreen({super.key});

  @override
  State<PendingApprovalScreen> createState() => _PendingApprovalScreenState();
}

class _PendingApprovalScreenState extends State<PendingApprovalScreen> {
  bool _checking = false;

  @override
  void initState() {
    super.initState();
    _checkApprovalStatus();
  }

  Future<void> _checkApprovalStatus() async {
    if (_checking) return;
    setState(() => _checking = true);

    try {
      final appState = Provider.of<AppState>(context, listen: false);
      final phone = appState.registrationData['phone'] ?? '';
      final staffId = appState.registrationData['staffId'] ?? '';

      Map<String, dynamic>? profile;

      // Try phone first
      if (phone.isNotEmpty) {
        profile = await SupabaseService.checkPhoneExists(phone);
      }

      // If not found, try by employee_id
      if (profile == null && staffId.isNotEmpty) {
        profile = await SupabaseService.checkEmployeeIdExists(staffId);
      }

      if (profile != null && mounted) {
        final role = profile['role'] ?? 'customer';
        final status = profile['status'] ?? 'pending';
        final isAdmin = role == 'super_admin' || role == 'manager' || role == 'operator';

        if (status == 'approved' || isAdmin) {
          appState.setUserData(
            name: profile['full_name'] ?? 'User',
            email: profile['email'] ?? '',
            phone: profile['phone'] ?? phone,
          );
          Navigator.pushReplacementNamed(context, '/home');
          return;
        } else if (status == 'rejected') {
          Navigator.pushReplacementNamed(context, '/rejected');
          return;
        }
      }
    } catch (e) {
      debugPrint('Error checking approval: $e');
    }

    if (mounted) setState(() => _checking = false);
  }

  @override
  Widget build(BuildContext context) {
    final isDark = context.isDark;
    final appState = Provider.of<AppState>(context);

    return Scaffold(
      backgroundColor: context.bgColor,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Spacer(),
              Container(
                width: 120, height: 120,
                decoration: BoxDecoration(color: AppColors.yellow.withValues(alpha: 0.15), shape: BoxShape.circle),
                child: Icon(Icons.hourglass_top_rounded, color: AppColors.yellow, size: 56),
              ),
              const SizedBox(height: 32),
              Text('Pending Approval', style: TextStyle(color: context.textColor, fontSize: 28, fontWeight: FontWeight.w700)),
              const SizedBox(height: 12),
              Text(
                'Your registration has been submitted and is awaiting admin approval.',
                style: TextStyle(color: context.mutedColor, fontSize: 15, height: 1.5),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 32),
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.03),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.08)),
                ),
                child: Column(
                  children: [
                    _buildInfoRow(context, 'Name', appState.registrationData['fullName'] ?? '-'),
                    _buildInfoRow(context, 'Staff ID', appState.registrationData['staffId'] ?? '-'),
                    _buildInfoRow(context, 'Status', 'Pending Review', isStatus: true),
                  ],
                ),
              ),
              const Spacer(),
              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton(
                  onPressed: _checking ? null : _checkApprovalStatus,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.yellow,
                    foregroundColor: AppColors.bgDark,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    elevation: 0,
                  ),
                  child: _checking
                      ? const SizedBox(
                          width: 20, height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2, valueColor: AlwaysStoppedAnimation<Color>(AppColors.bgDark)),
                        )
                      : Text('Check Status', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                'You will be notified once your account is approved.',
                style: TextStyle(color: context.mutedColor, fontSize: 13),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 20),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildInfoRow(BuildContext context, String label, String value, {bool isStatus = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(color: context.mutedColor, fontSize: 14)),
          isStatus
              ? Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: AppColors.yellow.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(8)),
                  child: Text('Pending Review', style: TextStyle(color: AppColors.yellow, fontSize: 13, fontWeight: FontWeight.w600)),
                )
              : Text(value, style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

class RejectedScreen extends StatelessWidget {
  const RejectedScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final appState = Provider.of<AppState>(context);

    return Scaffold(
      backgroundColor: context.bgColor,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Spacer(),
              Container(
                width: 120, height: 120,
                decoration: BoxDecoration(color: AppColors.red.withValues(alpha: 0.15), shape: BoxShape.circle),
                child: Icon(Icons.cancel_outlined, color: AppColors.red, size: 56),
              ),
              const SizedBox(height: 32),
              Text('Registration Declined', style: TextStyle(color: context.textColor, fontSize: 28, fontWeight: FontWeight.w700)),
              const SizedBox(height: 12),
              Text(
                'Unfortunately, your registration request was not approved.',
                style: TextStyle(color: context.mutedColor, fontSize: 15, height: 1.5),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.red.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: AppColors.red.withValues(alpha: 0.3)),
                ),
                child: Row(
                  children: [
                    Icon(Icons.info_outline, color: AppColors.red, size: 20),
                    const SizedBox(width: 12),
                    Expanded(child: Text(appState.rejectionReason ?? 'No reason provided', style: TextStyle(color: context.textColor, fontSize: 13, height: 1.4))),
                  ],
                ),
              ),
              const Spacer(),
              SizedBox(
                width: double.infinity,
                height: 56,
                child: ElevatedButton(
                  onPressed: () {
                    appState.resetRegistration();
                    Navigator.pushReplacementNamed(context, '/register');
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.yellow,
                    foregroundColor: AppColors.bgDark,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    elevation: 0,
                  ),
                  child: Text('Try Again', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class SuspendedScreen extends StatefulWidget {
  const SuspendedScreen({super.key});

  @override
  State<SuspendedScreen> createState() => _SuspendedScreenState();
}

class _SuspendedScreenState extends State<SuspendedScreen> {
  RealtimeChannel? _subscription;

  @override
  void initState() {
    super.initState();
    _subscribeToStatusChanges();
  }

  @override
  void dispose() {
    _subscription?.unsubscribe();
    super.dispose();
  }

  void _subscribeToStatusChanges() {
    final appState = Provider.of<AppState>(context, listen: false);
    final profileId = appState.profileId;
    if (profileId == null) return;

    _subscription = SupabaseService.client
        .channel('suspended_status_$profileId')
        .onPostgresChanges(
          event: PostgresChangeEvent.update,
          schema: 'public',
          table: 'profiles',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'id',
            value: profileId,
          ),
          callback: (payload) {
            final status = payload.newRecord['status'] as String?;
            if (status == 'approved' && mounted) {
              Navigator.pushNamedAndRemoveUntil(context, '/home', (route) => false);
            }
          },
        )
        .subscribe();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.bgColor,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Spacer(),
              Container(
                width: 120, height: 120,
                decoration: BoxDecoration(color: AppColors.red.withValues(alpha: 0.15), shape: BoxShape.circle),
                child: Icon(Icons.block, color: AppColors.red, size: 56),
              ),
              const SizedBox(height: 32),
              Text('Account Suspended', style: TextStyle(color: context.textColor, fontSize: 28, fontWeight: FontWeight.w700)),
              const SizedBox(height: 12),
              Text(
                'Your account has been suspended. Please contact support for assistance.',
                style: TextStyle(color: context.mutedColor, fontSize: 15, height: 1.5),
                textAlign: TextAlign.center,
              ),
              const Spacer(),
              SizedBox(
                width: double.infinity,
                height: 56,
                child: ElevatedButton(
                  onPressed: () async {
                    final appState = Provider.of<AppState>(context, listen: false);
                    await appState.logout();
                    if (context.mounted) {
                      Navigator.pushNamedAndRemoveUntil(context, '/welcome', (route) => false);
                    }
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.yellow,
                    foregroundColor: AppColors.bgDark,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    elevation: 0,
                  ),
                  child: Text('Sign Out', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
