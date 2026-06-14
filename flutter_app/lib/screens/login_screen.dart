import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../theme/app_theme.dart';
import '../services/supabase_service.dart';
import '../providers/app_state.dart';

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
        // Allow customer, admin, super-admin roles to use the app
        // Drivers should use the driver app instead
        final role = existingUser['role'] ?? 'customer';
        if (role == 'driver') {
          _showError('Please use the Driver app to login');
          return;
        }

        // Check status - admins/super-admins bypass pending check
        final isAdmin = role == 'admin' || role == 'super-admin';
        if (!isAdmin && existingUser['status'] == 'pending') {
          Navigator.pushReplacementNamed(context, '/pending');
          return;
        } else if (existingUser['status'] == 'rejected') {
          Navigator.pushReplacementNamed(context, '/rejected');
          return;
        }

        final appState = Provider.of<AppState>(context, listen: false);

        // Store the Supabase profile ID
        if (existingUser['id'] != null) {
          appState.setProfileId(existingUser['id']);
        }

        appState.setUserData(
          name: existingUser['full_name'] ?? 'User',
          email: existingUser['email'] ?? '',
          phone: fullPhone,
          profileId: existingUser['id'],
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
            Icon(Icons.error_outline, color: Colors.white, size: 20),
            const SizedBox(width: 10),
            Expanded(child: Text(message)),
          ],
        ),
        backgroundColor: AppColors.red,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
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
              IconButton(
                onPressed: () => Navigator.pop(context),
                icon: Icon(Icons.arrow_back, color: context.textColor),
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(),
              ),
              const SizedBox(height: 32),
              Text(
                _otpSent ? 'Enter OTP' : 'Welcome back',
                style: TextStyle(
                  color: context.textColor,
                  fontSize: 32,
                  fontWeight: FontWeight.w700,
                  height: 1.2,
                ),
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
                Text(
                  'Phone Number',
                  style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w600),
                ),
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
                Text(
                  'Verification Code',
                  style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w600),
                ),
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
                      : Text(_otpSent ? 'Verify' : 'Continue', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                ),
              ),
              const SizedBox(height: 24),

              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text("Don't have an account? ", style: TextStyle(color: context.mutedColor)),
                  GestureDetector(
                    onTap: () => Navigator.pushNamed(context, '/register'),
                    child: Text('Sign Up', style: TextStyle(color: AppColors.yellow, fontWeight: FontWeight.w700)),
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
