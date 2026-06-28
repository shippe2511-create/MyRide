import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:geolocator/geolocator.dart';
import 'package:share_plus/share_plus.dart';
import 'package:audioplayers/audioplayers.dart';
import '../theme/app_theme.dart';
import '../services/supabase_service.dart';
import '../services/notification_service.dart';
import '../widgets/app_snackbar.dart';

class SOSScreen extends StatefulWidget {
  const SOSScreen({super.key});

  @override
  State<SOSScreen> createState() => _SOSScreenState();
}

class _SOSScreenState extends State<SOSScreen> with SingleTickerProviderStateMixin {
  late AnimationController _pulseController;
  bool _sosActivated = false;
  final AudioPlayer _audioPlayer = AudioPlayer();

  List<Map<String, dynamic>> _emergencyContacts = [
    {'name': 'Police', 'number': '119', 'icon': Icons.local_police_outlined},
    {'name': 'Ambulance', 'number': '102', 'icon': Icons.medical_services_outlined},
    {'name': 'Fire Department', 'number': '118', 'icon': Icons.fire_truck_outlined},
    {'name': 'MyRide Support', 'number': '+960 333 1234', 'icon': Icons.support_agent_outlined},
  ];

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    )..repeat();
    _loadEmergencyContacts();
  }

  Future<void> _loadEmergencyContacts() async {
    try {
      final contacts = await SupabaseService.getEmergencyContacts();
      if (contacts.isNotEmpty) {
        setState(() {
          _emergencyContacts = contacts.map((c) {
            IconData icon = Icons.phone_outlined;
            switch (c['icon']) {
              case 'shield': icon = Icons.local_police_outlined; break;
              case 'heart': icon = Icons.medical_services_outlined; break;
              case 'flame': icon = Icons.fire_truck_outlined; break;
              case 'building': icon = Icons.business_outlined; break;
            }
            return {
              'name': c['name'] ?? 'Contact',
              'number': c['phone'] ?? '',
              'icon': icon,
            };
          }).toList();
        });
      }
    } catch (e) {
      debugPrint('Error loading emergency contacts: $e');
    }
  }

  @override
  void dispose() {
    _pulseController.dispose();
    _audioPlayer.dispose();
    super.dispose();
  }

  Future<void> _playSOSSound() async {
    try {
      // Use URL source for a standard alarm tone
      await _audioPlayer.setReleaseMode(ReleaseMode.loop);
      // Play system-like alarm using a publicly available alarm sound
      await _audioPlayer.play(UrlSource('https://www.soundjay.com/misc/sounds/bell-ringing-05.mp3'));
    } catch (e) {
      debugPrint('Error playing SOS sound: $e');
      // Fallback: continuous haptic feedback
      _startHapticAlarm();
    }
  }

  bool _hapticAlarmActive = false;

  void _startHapticAlarm() async {
    _hapticAlarmActive = true;
    while (_hapticAlarmActive && _sosActivated) {
      HapticFeedback.heavyImpact();
      await Future.delayed(const Duration(milliseconds: 500));
    }
  }

  Future<void> _stopSOSSound() async {
    _hapticAlarmActive = false;
    try {
      await _audioPlayer.stop();
    } catch (e) {
      debugPrint('Error stopping SOS sound: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.bgColor,
      appBar: AppBar(
        backgroundColor: context.bgColor,
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: context.textColor),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text('Emergency SOS', style: TextStyle(color: context.textColor)),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            _buildSOSButton(context),
            const SizedBox(height: 32),
            _buildQuickActions(context),
            const SizedBox(height: 24),
            _buildEmergencyContacts(context),
            const SizedBox(height: 24),
            _buildSafetyTips(context),
          ],
        ),
      ),
    );
  }

  Future<void> _activateSOS() async {
    HapticFeedback.heavyImpact();
    setState(() => _sosActivated = true);

    // Play SOS alarm sound
    _playSOSSound();

    // Show notification
    NotificationService.showNotification(
      title: '🚨 SOS ACTIVATED',
      body: 'Emergency services have been notified. Help is on the way.',
    );

    double? lat;
    double? lng;
    try {
      // Try current position first with longer timeout
      final position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      ).timeout(const Duration(seconds: 15));
      lat = position.latitude;
      lng = position.longitude;
    } catch (e) {
      debugPrint('Could not get current location for SOS: $e');
      // Fall back to last known position
      try {
        final lastPosition = await Geolocator.getLastKnownPosition();
        if (lastPosition != null) {
          lat = lastPosition.latitude;
          lng = lastPosition.longitude;
          debugPrint('Using last known position for SOS');
        }
      } catch (e2) {
        debugPrint('Could not get last known location: $e2');
      }
    }

    await SupabaseService.triggerSOSAlert(
      latitude: lat,
      longitude: lng,
    );
  }

  Widget _buildSOSButton(BuildContext context) {
    return Column(
      children: [
        GestureDetector(
          onLongPress: () async {
            await _activateSOS();
            if (mounted) _showSOSActivatedDialog(context);
          },
          child: AnimatedBuilder(
            animation: _pulseController,
            builder: (context, child) {
              final scale = _sosActivated ? 1.0 : 1.0 + 0.05 * _pulseController.value;
              return Transform.scale(
                scale: scale,
                child: Container(
                  width: 180,
                  height: 180,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: _sosActivated ? AppColors.success : AppColors.error,
                    boxShadow: [
                      BoxShadow(
                        color: (_sosActivated ? AppColors.success : AppColors.error).withValues(alpha: 0.4),
                        blurRadius: 30,
                        spreadRadius: 5,
                      ),
                    ],
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        _sosActivated ? Icons.check : Icons.warning_rounded,
                        color: Colors.white,
                        size: 56,
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _sosActivated ? 'HELP SENT' : 'SOS',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 28,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 2,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 16),
        Text(
          _sosActivated ? 'Help is on the way' : 'Hold for 3 seconds to activate',
          style: TextStyle(
            color: context.mutedColor,
            fontSize: 14,
          ),
        ),
        if (_sosActivated) ...[
          const SizedBox(height: 12),
          GestureDetector(
            onTap: () {
              HapticFeedback.mediumImpact();
              _stopSOSSound();
              setState(() => _sosActivated = false);
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
              decoration: BoxDecoration(
                color: context.cardColor,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: context.borderColor),
              ),
              child: Text(
                'Cancel SOS',
                style: TextStyle(
                  color: context.textColor,
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildQuickActions(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _buildActionCard(
            context,
            icon: Icons.phone,
            title: 'Call Police',
            color: Colors.blue,
            onTap: () => _makeCall('119'),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _buildActionCard(
            context,
            icon: Icons.medical_services,
            title: 'Ambulance',
            color: AppColors.error,
            onTap: () => _makeCall('102'),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _buildActionCard(
            context,
            icon: Icons.share_location,
            title: 'Share Location',
            color: AppColors.success,
            onTap: () => _shareLocation(context),
          ),
        ),
      ],
    );
  }

  Widget _buildActionCard(
    BuildContext context, {
    required IconData icon,
    required String title,
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
          color: color.withValues(alpha: 0.15),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: color.withValues(alpha: 0.3)),
        ),
        child: Column(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: color,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(icon, color: Colors.white, size: 24),
            ),
            const SizedBox(height: 10),
            Text(
              title,
              style: TextStyle(
                color: context.textColor,
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmergencyContacts(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Emergency Contacts',
          style: TextStyle(
            color: context.textColor,
            fontSize: 18,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 12),
        ...(_emergencyContacts.map((contact) => Container(
          margin: const EdgeInsets.only(bottom: 10),
          decoration: BoxDecoration(
            color: context.cardColor,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: context.borderColor),
          ),
          child: ListTile(
            leading: Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: AppColors.yellow.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(contact['icon'] as IconData, color: AppColors.yellow, size: 22),
            ),
            title: Text(
              contact['name'] as String,
              style: TextStyle(
                color: context.textColor,
                fontSize: 15,
                fontWeight: FontWeight.w600,
              ),
            ),
            subtitle: Text(
              contact['number'] as String,
              style: TextStyle(
                color: context.mutedColor,
                fontSize: 13,
              ),
            ),
            trailing: GestureDetector(
              onTap: () => _makeCall(contact['number'] as String),
              child: Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: AppColors.success,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(Icons.phone, color: Colors.white, size: 20),
              ),
            ),
          ),
        ))),
      ],
    );
  }

  Widget _buildSafetyTips(BuildContext context) {
    final tips = [
      'Share your trip details with family',
      'Verify driver details before boarding',
      'Sit in the back seat when possible',
      'Trust your instincts - cancel if uncomfortable',
    ];

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.yellow.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.yellow.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.lightbulb_outline, color: AppColors.yellow, size: 20),
              const SizedBox(width: 8),
              Text(
                'Safety Tips',
                style: TextStyle(
                  color: context.textColor,
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ...tips.map((tip) => Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.check_circle, color: AppColors.success, size: 16),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    tip,
                    style: TextStyle(
                      color: context.textColor,
                      fontSize: 13,
                    ),
                  ),
                ),
              ],
            ),
          )),
        ],
      ),
    );
  }

  void _showSOSActivatedDialog(BuildContext context) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.cardColor,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Row(
          children: [
            Icon(Icons.check_circle, color: AppColors.success, size: 28),
            const SizedBox(width: 12),
            Text('SOS Activated', style: TextStyle(color: context.textColor)),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Emergency services and your driver have been notified. Your location is being shared.',
              style: TextStyle(color: context.mutedColor),
            ),
            const SizedBox(height: 16),
            Text(
              'What happens next:',
              style: TextStyle(color: context.textColor, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            _buildStep(context, '1', 'MyRide support has been alerted'),
            _buildStep(context, '2', 'Your GPS location is being tracked'),
            _buildStep(context, '3', 'Emergency contacts notified'),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text('OK', style: TextStyle(color: AppColors.yellow)),
          ),
        ],
      ),
    );
  }

  Widget _buildStep(BuildContext context, String number, String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          Container(
            width: 20,
            height: 20,
            decoration: BoxDecoration(
              color: AppColors.success,
              shape: BoxShape.circle,
            ),
            child: Center(
              child: Text(
                number,
                style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Text(text, style: TextStyle(color: context.textColor, fontSize: 13)),
        ],
      ),
    );
  }

  Future<void> _makeCall(String number) async {
    final uri = Uri.parse('tel:$number');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }

  Future<void> _shareLocation(BuildContext context) async {
    HapticFeedback.mediumImpact();
    try {
      final position = await Geolocator.getCurrentPosition(desiredAccuracy: LocationAccuracy.high);
      final mapUrl = 'https://maps.google.com/?q=${position.latitude},${position.longitude}';
      final message = '''🆘 EMERGENCY - I need help!

My current location:
$mapUrl

Coordinates: ${position.latitude.toStringAsFixed(6)}, ${position.longitude.toStringAsFixed(6)}

Sent via MyRide SOS''';

      await Share.share(message, subject: 'Emergency - My Location');

      if (context.mounted) {
        AppSnackbar.success(context, 'Location ready to share');
      }
    } catch (e) {
      if (context.mounted) {
        AppSnackbar.error(context, 'Failed to get location', subtitle: '$e');
      }
    }
  }
}
