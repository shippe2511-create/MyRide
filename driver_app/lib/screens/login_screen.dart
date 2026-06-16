import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../providers/driver_state.dart';
import '../theme/app_theme.dart';
import '../services/supabase_service.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _phoneController = TextEditingController();
  final _otpController = TextEditingController();
  bool _isLoading = false;
  bool _otpSent = false;

  @override
  void dispose() {
    _phoneController.dispose();
    _otpController.dispose();
    super.dispose();
  }

  Future<void> _sendOTP() async {
    final phone = _phoneController.text.trim();
    if (phone.isEmpty || phone.length < 7) {
      _showError('Please enter a valid phone number');
      return;
    }

    HapticFeedback.mediumImpact();
    setState(() => _isLoading = true);

    try {
      await Future.delayed(const Duration(seconds: 1));
      setState(() => _otpSent = true);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: const [
                Icon(Icons.check_circle, color: Colors.white, size: 20),
                SizedBox(width: 10),
                Text('OTP sent to your phone'),
              ],
            ),
            backgroundColor: AppColors.success,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        );
      }
    } catch (e) {
      if (mounted) _showError('Failed to send OTP');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _verifyOTP() async {
    final otp = _otpController.text.trim();
    if (otp.isEmpty || otp.length < 4) {
      _showError('Please enter the OTP');
      return;
    }

    HapticFeedback.mediumImpact();
    setState(() => _isLoading = true);

    try {
      final phone = _phoneController.text.trim();
      final fullPhone = phone.startsWith('+') ? phone : '+960$phone';

      final existingUser = await SupabaseService.checkPhoneExists(fullPhone);

      if (existingUser != null) {
        if (existingUser['role'] != 'driver') {
          _showError('Please use the Customer app to login');
          setState(() => _isLoading = false);
          return;
        }

        if (existingUser['status'] == 'pending') {
          _showPendingDialog();
          setState(() => _isLoading = false);
          return;
        } else if (existingUser['status'] == 'rejected') {
          _showRejectedDialog();
          setState(() => _isLoading = false);
          return;
        }

        final driverState = Provider.of<DriverState>(context, listen: false);

        // Get driver record using profile UUID
        final driverProfile = await SupabaseService.getDriverByProfileId(existingUser['id']);

        if (driverProfile == null) {
          _showError('Driver profile not found');
          setState(() => _isLoading = false);
          return;
        }

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

        // Use the drivers.id (UUID) not employee_id
        driverState.setDriverData(
          name: existingUser['full_name'] ?? 'Driver',
          id: driverProfile['id'], // This is drivers.id (UUID)
          profileId: driverProfile['profile_id'] ?? existingUser['id'], // profile UUID for SOS
          vehicleNumber: vehicleNumber,
          vehicleModel: vehicleModel,
          phone: fullPhone,
          rating: (driverProfile['rating'] ?? 5.0).toDouble(),
          avatarUrl: existingUser['avatar_url'] ?? '',
          employeeId: existingUser['employee_id'] ?? '',
        );

        HapticFeedback.lightImpact();
        Navigator.pushReplacementNamed(context, '/home');
      } else {
        Navigator.pushNamed(context, '/register', arguments: {'phone': fullPhone});
      }
    } catch (e) {
      if (mounted) _showError('Verification failed');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _showError(String message) {
    HapticFeedback.heavyImpact();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            const Icon(Icons.error_outline, color: Colors.white, size: 20),
            const SizedBox(width: 10),
            Expanded(child: Text(message)),
          ],
        ),
        backgroundColor: AppColors.error,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
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
          'Your driver registration is pending admin approval. You\'ll be notified once approved.',
          style: TextStyle(color: context.mutedColor),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('OK', style: TextStyle(color: AppColors.yellow)),
          ),
        ],
      ),
    );
  }

  void _showRejectedDialog() {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.cardColor,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Row(
          children: [
            const Icon(Icons.cancel, color: AppColors.error, size: 28),
            const SizedBox(width: 12),
            Text('Registration Rejected', style: TextStyle(color: context.textColor)),
          ],
        ),
        content: Text(
          'Your driver registration was not approved. Please contact admin for more information.',
          style: TextStyle(color: context.mutedColor),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
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
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 20),

              Container(
                width: 70,
                height: 70,
                decoration: BoxDecoration(
                  color: AppColors.yellow,
                  borderRadius: BorderRadius.circular(18),
                ),
                child: const Icon(Icons.local_taxi, size: 40, color: Colors.black),
              ),
              const SizedBox(height: 24),
              Text(
                _otpSent ? 'Enter OTP' : 'Driver Login',
                style: TextStyle(color: context.textColor, fontSize: 32, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 8),
              Text(
                _otpSent
                    ? 'Enter the code sent to +960 ${_phoneController.text}'
                    : 'Enter your phone number to get started',
                style: TextStyle(color: context.mutedColor, fontSize: 16),
              ),
              const SizedBox(height: 40),

              if (!_otpSent) ...[
                Text('Phone Number', style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                Container(
                  decoration: BoxDecoration(
                    color: isDark ? Colors.white.withValues(alpha: 0.05) : Colors.black.withValues(alpha: 0.05),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                        child: Row(
                          children: [
                            Icon(Icons.phone_outlined, color: context.mutedColor, size: 20),
                            const SizedBox(width: 8),
                            Text('+960', style: TextStyle(color: context.textColor, fontSize: 16, fontWeight: FontWeight.w500)),
                            const SizedBox(width: 8),
                            Container(width: 1, height: 24, color: context.mutedColor.withValues(alpha: 0.3)),
                          ],
                        ),
                      ),
                      Expanded(
                        child: TextField(
                          controller: _phoneController,
                          keyboardType: TextInputType.phone,
                          style: TextStyle(color: context.textColor, fontSize: 16),
                          decoration: InputDecoration(
                            hintText: '7XX XXXX',
                            hintStyle: TextStyle(color: context.mutedColor),
                            border: InputBorder.none,
                            contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 16),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ] else ...[
                Text('Verification Code', style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                TextField(
                  controller: _otpController,
                  keyboardType: TextInputType.number,
                  textAlign: TextAlign.center,
                  style: TextStyle(color: context.textColor, fontSize: 24, letterSpacing: 12, fontWeight: FontWeight.w600),
                  maxLength: 4,
                  decoration: InputDecoration(
                    hintText: '• • • •',
                    hintStyle: TextStyle(color: context.mutedColor, letterSpacing: 8),
                    filled: true,
                    fillColor: isDark ? Colors.white.withValues(alpha: 0.05) : Colors.black.withValues(alpha: 0.05),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                    counterText: '',
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                  ),
                ),
                const SizedBox(height: 12),
                Center(
                  child: TextButton(
                    onPressed: () => setState(() {
                      _otpSent = false;
                      _otpController.clear();
                    }),
                    child: Text('Change phone number', style: TextStyle(color: context.mutedColor)),
                  ),
                ),
              ],

              const SizedBox(height: 32),

              SizedBox(
                width: double.infinity,
                height: 56,
                child: ElevatedButton(
                  onPressed: _isLoading ? null : (_otpSent ? _verifyOTP : _sendOTP),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.yellow,
                    foregroundColor: Colors.black,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    elevation: 0,
                  ),
                  child: _isLoading
                      ? const SizedBox(
                          width: 24, height: 24,
                          child: CircularProgressIndicator(strokeWidth: 2.5, valueColor: AlwaysStoppedAnimation(Colors.black)),
                        )
                      : Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text('Login', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                            const SizedBox(width: 8),
                            const Icon(Icons.arrow_forward, size: 20),
                          ],
                        ),
                ),
              ),
              const SizedBox(height: 24),

              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text("Don't have an account? ", style: TextStyle(color: context.mutedColor)),
                  GestureDetector(
                    onTap: () => Navigator.pushNamed(context, '/register'),
                    child: const Text('Register', style: TextStyle(color: AppColors.yellow, fontWeight: FontWeight.w700)),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
