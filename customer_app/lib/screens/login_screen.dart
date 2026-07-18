import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import 'package:provider/provider.dart';
import '../theme/app_theme.dart';
import '../services/supabase_service.dart';
import '../providers/app_state.dart';
import '../widgets/app_snackbar.dart';

const String _supabaseUrl = 'https://lwkndyyfmmrzazdvrsnk.supabase.co';

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

  bool _isValidMaldivesPhone(String phone) {
    final cleaned = phone.replaceAll(RegExp(r'\D'), '');
    if (cleaned.startsWith('960')) {
      final local = cleaned.substring(3);
      return local.length == 7 && (local.startsWith('7') || local.startsWith('9'));
    }
    return cleaned.length == 7 && (cleaned.startsWith('7') || cleaned.startsWith('9'));
  }

  // DEV MODE: Skip OTP for testing (set to false for production)
  static const bool _devSkipOtp = true;

  Future<void> _sendOTP() async {
    final phone = _phoneController.text.trim();

    if (!_isValidMaldivesPhone(phone)) {
      _showError('Please enter a valid Maldives phone number (7 digits starting with 7 or 9)');
      return;
    }

    HapticFeedback.mediumImpact();
    setState(() => _isLoading = true);

    // DEV MODE: Skip actual OTP send
    if (_devSkipOtp) {
      setState(() {
        _otpSent = true;
        _isLoading = false;
      });
      if (mounted) {
        AppSnackbar.success(context, 'DEV MODE: Enter any 6 digits');
      }
      return;
    }

    try {
      final response = await http.post(
        Uri.parse('$_supabaseUrl/functions/v1/send-otp'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ${SupabaseService.client.auth.currentSession?.accessToken ?? ''}',
        },
        body: jsonEncode({
          'phone': phone,
          'action': 'send',
        }),
      );

      final result = jsonDecode(response.body);

      if (result['success'] == true) {
        setState(() => _otpSent = true);
        if (mounted) {
          AppSnackbar.success(context, 'OTP sent to your phone');
        }
      } else {
        if (mounted) _showError(result['error'] ?? 'Failed to send OTP');
      }
    } catch (e) {
      debugPrint('Send OTP error: $e');
      if (mounted) _showError('Failed to send OTP. Please try again.');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _verifyOTP() async {
    final otp = _otpController.text.trim();
    if (otp.length != 6) {
      _showError('Please enter the 6-digit code');
      return;
    }

    HapticFeedback.mediumImpact();
    setState(() => _isLoading = true);

    try {
      final phone = _phoneController.text.trim();
      final fullPhone = phone.startsWith('+') ? phone : '+960$phone';

      // DEV MODE: Skip OTP verification
      if (!_devSkipOtp) {
        // Verify OTP with server
        final verifyResponse = await http.post(
          Uri.parse('$_supabaseUrl/functions/v1/verify-otp'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'phone': phone,
            'code': otp,
          }),
        );

        final verifyResult = jsonDecode(verifyResponse.body);
        if (verifyResult['success'] != true) {
          if (mounted) _showError(verifyResult['error'] ?? 'Invalid code');
          setState(() => _isLoading = false);
          return;
        }
      }

      // OTP verified (or skipped in dev mode) - now check if user exists
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
        final status = existingUser['status'] ?? 'pending';

        if (!isAdmin && status == 'pending') {
          Navigator.pushReplacementNamed(context, '/pending');
          return;
        } else if (status == 'rejected') {
          Navigator.pushReplacementNamed(context, '/rejected');
          return;
        } else if (status == 'suspended') {
          Navigator.pushReplacementNamed(context, '/suspended');
          return;
        } else if (status != 'approved' && !isAdmin) {
          // Block any non-approved status
          Navigator.pushReplacementNamed(context, '/suspended');
          return;
        }

        final appState = Provider.of<AppState>(context, listen: false);

        // Store the Supabase profile ID
        if (existingUser['id'] != null) {
          appState.setProfileId(existingUser['id']);
          SupabaseService.setProfileId(existingUser['id']);

          // Register session - this will sign out other devices
          await SupabaseService.registerSession(existingUser['id']);
        }

        appState.setUserData(
          name: existingUser['full_name'] ?? 'User',
          email: existingUser['email'] ?? '',
          phone: fullPhone,
          profileId: existingUser['id'],
          avatarUrl: existingUser['avatar_url'],
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
    AppSnackbar.error(context, message);
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
                  style: TextStyle(color: context.textColor, fontSize: 24, letterSpacing: 8, fontWeight: FontWeight.w600),
                  maxLength: 6,
                  decoration: InputDecoration(
                    hintText: '• • • • • •',
                    hintStyle: TextStyle(color: context.mutedColor, letterSpacing: 6),
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
