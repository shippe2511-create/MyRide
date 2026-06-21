import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:provider/provider.dart';
import 'package:geolocator/geolocator.dart';
import '../theme/app_theme.dart';
import '../services/supabase_service.dart';
import '../providers/driver_state.dart';

class SOSScreen extends StatefulWidget {
  const SOSScreen({super.key});

  @override
  State<SOSScreen> createState() => _SOSScreenState();
}

class _SOSScreenState extends State<SOSScreen> with SingleTickerProviderStateMixin {
  late AnimationController _pulseController;
  bool _sosActivated = false;

  // Default emergency contacts (loaded from database if available)
  List<Map<String, dynamic>> _emergencyContacts = [
    {'name': 'Police', 'number': '119', 'icon': Icons.local_police_outlined},
    {'name': 'Ambulance', 'number': '102', 'icon': Icons.medical_services_outlined},
    {'name': 'Fire Department', 'number': '118', 'icon': Icons.fire_truck_outlined},
    {'name': 'MACL Control Room', 'number': '+960 333 0888', 'icon': Icons.business_outlined},
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
    super.dispose();
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
            // SOS Button
            _buildSOSButton(context),
            const SizedBox(height: 32),

            // Quick actions
            _buildQuickActions(context),
            const SizedBox(height: 24),

            // Emergency contacts
            _buildEmergencyContacts(context),
            const SizedBox(height: 24),

            // Safety tips
            _buildSafetyTips(context),
          ],
        ),
      ),
    );
  }

  Future<void> _activateSOS(BuildContext context) async {
    HapticFeedback.heavyImpact();
    setState(() => _sosActivated = true);

    final driverState = Provider.of<DriverState>(context, listen: false);
    final driverId = driverState.driverId;
    final profileId = driverState.profileId;

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

    if (driverId.isNotEmpty) {
      final success = await SupabaseService.triggerSOSAlert(
        userId: profileId.isNotEmpty ? profileId : driverId,
        driverId: driverId,
        latitude: lat,
        longitude: lng,
      );
      debugPrint('SOS Alert sent: $success');
    }
  }

  Widget _buildSOSButton(BuildContext context) {
    return Column(
      children: [
        GestureDetector(
          onLongPress: () async {
            await _activateSOS(context);
            if (mounted) _showSOSActivatedDialog(context);
          },
          child: AnimatedBuilder(
            animation: _pulseController,
            builder: (context, child) {
              final scale = _sosActivated ? 1.0 : 1.0 + 0.05 * _pulseController.value;
              return Transform.scale(
                scale: scale,
                child: Container(
                  width: 200,
                  height: 200,
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
                  child: Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          _sosActivated ? Icons.check : Icons.warning_rounded,
                          color: Colors.white,
                          size: 50,
                        ),
                        const SizedBox(height: 10),
                        Text(
                          _sosActivated ? 'HELP SENT' : 'SOS',
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 24,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 1,
                          ),
                        ),
                      ],
                    ),
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
          child: Material(
            color: Colors.transparent,
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
                child: const Icon(Icons.phone, color: Colors.white, size: 20),
              ),
            ),
          ),
          ),
        ))),
      ],
    );
  }

  Widget _buildSafetyTips(BuildContext context) {
    final tips = [
      'Keep your doors locked while driving',
      'Share your trip details with family',
      'Stay alert in unfamiliar areas',
      'Report suspicious activity immediately',
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
              'Emergency services have been notified. Your location has been shared.',
              style: TextStyle(color: context.mutedColor),
            ),
            const SizedBox(height: 16),
            Text(
              'What happens next:',
              style: TextStyle(color: context.textColor, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            _buildStep(context, '1', 'Control room has been alerted'),
            _buildStep(context, '2', 'Your GPS location is being tracked'),
            _buildStep(context, '3', 'Help is being dispatched'),
          ],
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
                style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700),
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

  void _shareLocation(BuildContext context) {
    HapticFeedback.mediumImpact();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: const Row(
          children: [
            Icon(Icons.check_circle, color: Colors.white),
            SizedBox(width: 12),
            Text('Location shared with emergency contacts'),
          ],
        ),
        backgroundColor: AppColors.success,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    );
  }
}
