import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../providers/driver_state.dart';
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
      final response = await SupabaseService.signUpWithPhone(
        phone: _phoneNumber,
        fullName: _fullNameController.text.trim(),
        email: _emailController.text.trim().isEmpty ? null : _emailController.text.trim(),
        gender: _selectedGender,
        staffId: _staffIdController.text.trim().toUpperCase(),
        emergencyContacts: _emergencyPhoneController.text.isNotEmpty
            ? [{'phone': '+960${_emergencyPhoneController.text.trim()}', 'relation': _emergencyRelationController.text.trim()}]
            : [],
        isDriver: true,
      );

      if (!mounted) return;

      HapticFeedback.lightImpact();

      // Check if auto-approved
      final status = response['status'] as String?;
      if (status == 'approved') {
        // Auto-approved - set driver data and go to home
        final driverState = Provider.of<DriverState>(context, listen: false);

        // Get driver record
        final driverProfile = await SupabaseService.getDriverByProfileId(response['id']);

        if (driverProfile != null) {
          String vehicleNumber = '';
          String vehicleModel = '';
          final vehicle = driverProfile['vehicle'];
          if (vehicle is List && vehicle.isNotEmpty) {
            vehicleNumber = vehicle[0]['plate_no'] ?? '';
            vehicleModel = vehicle[0]['display_name'] ?? '';
          } else if (vehicle is Map) {
            vehicleNumber = vehicle['plate_no'] ?? '';
            vehicleModel = vehicle['display_name'] ?? '';
          }

          await driverState.setDriverData(
            name: _fullNameController.text.trim(),
            id: driverProfile['id'],
            profileId: response['id'],
            vehicleNumber: vehicleNumber,
            vehicleModel: vehicleModel,
            phone: _phoneNumber,
            rating: (driverProfile['rating'] ?? 5.0).toDouble(),
            avatarUrl: response['avatar_url'] ?? '',
            employeeId: _staffIdController.text.trim().toUpperCase(),
          );

          Navigator.pushReplacementNamed(context, '/home');
        } else {
          // Driver record not created yet - send to login
          AppSnackbar.success(context, 'Registration successful! Please login.');
          Navigator.pushReplacementNamed(context, '/login');
        }
      } else {
        _showPendingDialog();
      }
    } catch (e) {
      if (mounted) {
        HapticFeedback.heavyImpact();
        AppSnackbar.error(context, 'Registration failed', subtitle: e.toString().replaceAll('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _showPendingDialog() {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.cardColor,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Row(
          children: [
            const Icon(Icons.hourglass_empty, color: AppColors.warning, size: 28),
            const SizedBox(width: 12),
            Text('Pending Approval', style: TextStyle(color: context.textColor)),
          ],
        ),
        content: Text(
          'Your driver registration has been submitted and is awaiting admin approval.',
          style: TextStyle(color: context.mutedColor),
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.pop(ctx);
              Navigator.pushReplacementNamed(context, '/login');
            },
            child: const Text('OK', style: TextStyle(color: AppColors.yellow)),
          ),
        ],
      ),
    );
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
                    child: const Icon(Icons.person_add_rounded, color: Colors.black, size: 40),
                  ),
                ),
                const SizedBox(height: 24),
                Center(
                  child: Text(
                    'Driver Registration',
                    style: TextStyle(color: context.textColor, fontSize: 28, fontWeight: FontWeight.w700),
                  ),
                ),
                const SizedBox(height: 8),
                Center(
                  child: Text(
                    _phoneNumber.isEmpty ? 'Register to start driving' : _phoneNumber,
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

                // Staff ID
                _buildLabel('Staff ID *'),
                _buildTextField(
                  controller: _staffIdController,
                  hint: 'e.g., DRV-0042',
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
                                  hintStyle: TextStyle(color: context.mutedColor),
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
                      const Icon(Icons.info_outline, color: AppColors.yellow, size: 20),
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
                      foregroundColor: Colors.black,
                      disabledBackgroundColor: AppColors.yellow.withValues(alpha: 0.5),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                      elevation: 0,
                    ),
                    child: _isLoading
                        ? const SizedBox(
                            width: 24, height: 24,
                            child: CircularProgressIndicator(strokeWidth: 2.5, valueColor: AlwaysStoppedAnimation<Color>(Colors.black)),
                          )
                        : const Text('Register as Driver', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
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
        hintStyle: TextStyle(color: context.mutedColor),
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
          borderSide: const BorderSide(color: AppColors.yellow, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.error),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
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
    final state = Provider.of<DriverState>(context, listen: false);
    final profileId = state.profileId;
    if (profileId.isEmpty) return;

    _subscription = SupabaseService.client
        .channel('driver_suspended_status_$profileId')
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
                decoration: BoxDecoration(color: AppColors.error.withValues(alpha: 0.15), shape: BoxShape.circle),
                child: Icon(Icons.block, color: AppColors.error, size: 56),
              ),
              const SizedBox(height: 32),
              Text('Account Suspended', style: TextStyle(color: context.textColor, fontSize: 28, fontWeight: FontWeight.w700)),
              const SizedBox(height: 12),
              Text(
                'Your driver account has been suspended. Please contact admin for assistance.',
                style: TextStyle(color: context.mutedColor, fontSize: 15, height: 1.5),
                textAlign: TextAlign.center,
              ),
              const Spacer(),
              SizedBox(
                width: double.infinity,
                height: 56,
                child: ElevatedButton(
                  onPressed: () {
                    Navigator.pushNamedAndRemoveUntil(context, '/login', (route) => false);
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.yellow,
                    foregroundColor: AppColors.darkBg,
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
