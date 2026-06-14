import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/ride_request.dart';
import '../theme/app_theme.dart';
import '../screens/navigation_screen.dart';
import '../screens/chat_screen.dart';

class ActiveRideCard extends StatelessWidget {
  final RideRequest ride;
  final VoidCallback onArrivedAtPickup;
  final VoidCallback onStartTrip;
  final VoidCallback onCompleteTrip;
  final Function(String reason) onCancelTrip;

  const ActiveRideCard({
    super.key,
    required this.ride,
    required this.onArrivedAtPickup,
    required this.onStartTrip,
    required this.onCompleteTrip,
    required this.onCancelTrip,
  });

  String get _statusText {
    switch (ride.status) {
      case RideStatus.accepted:
        return 'Heading to pickup';
      case RideStatus.arrivedAtPickup:
        return 'Waiting for customer';
      case RideStatus.inProgress:
        return 'Trip in progress';
      default:
        return 'Active ride';
    }
  }

  Color get _statusColor {
    switch (ride.status) {
      case RideStatus.accepted:
        return AppColors.warning;
      case RideStatus.arrivedAtPickup:
        return AppColors.yellow;
      case RideStatus.inProgress:
        return AppColors.success;
      default:
        return AppColors.yellow;
    }
  }

  @override
  Widget build(BuildContext context) {
    // Simplified view when trip is in progress - just navigation
    if (ride.status == RideStatus.inProgress) {
      return _buildInProgressView(context);
    }

    return _buildFullView(context);
  }

  Widget _buildInProgressView(BuildContext context) {
    return Container(
      margin: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.cardColor,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.success, width: 2),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Status header
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: AppColors.success.withValues(alpha: 0.15),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(18)),
            ),
            child: Row(
              children: [
                Container(
                  width: 10,
                  height: 10,
                  decoration: const BoxDecoration(
                    color: AppColors.success,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 10),
                const Text(
                  'TRIP IN PROGRESS',
                  style: TextStyle(
                    color: AppColors.success,
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1,
                  ),
                ),
                const Spacer(),
                // Timer could go here
                Icon(Icons.timer, color: AppColors.success, size: 18),
              ],
            ),
          ),

          // Destination info
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: AppColors.error.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(Icons.location_on, color: AppColors.error, size: 26),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'DROP-OFF',
                        style: TextStyle(
                          color: context.mutedColor,
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          letterSpacing: 1,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        ride.dropoffLocation,
                        style: TextStyle(
                          color: context.textColor,
                          fontSize: 17,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
                // ETA & Distance
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.timer_outlined, color: AppColors.success, size: 16),
                        const SizedBox(width: 4),
                        Text(
                          '${ride.estimatedDuration} min',
                          style: const TextStyle(
                            color: AppColors.success,
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.straighten, color: context.mutedColor, size: 16),
                        const SizedBox(width: 4),
                        Text(
                          '${ride.estimatedDistance} km',
                          style: TextStyle(
                            color: context.mutedColor,
                            fontSize: 13,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ],
            ),
          ),

          // Navigate button (prominent)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: ElevatedButton.icon(
              onPressed: () => _navigateToDropoff(context),
              icon: const Icon(Icons.navigation, size: 22),
              label: const Text('Navigate to Drop-off', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.yellow,
                foregroundColor: Colors.black,
                padding: const EdgeInsets.symmetric(vertical: 16),
                minimumSize: const Size(double.infinity, 54),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
            ),
          ),

          const SizedBox(height: 12),

          // Complete button
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: ElevatedButton.icon(
              onPressed: () {
                HapticFeedback.heavyImpact();
                onCompleteTrip();
              },
              icon: const Icon(Icons.check_circle, size: 22),
              label: const Text('Complete Trip', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.success,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 16),
                minimumSize: const Size(double.infinity, 54),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFullView(BuildContext context) {
    return Container(
      margin: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.cardColor,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: _statusColor, width: 2),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Status header
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: _statusColor.withValues(alpha: 0.15),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(18)),
            ),
            child: Row(
              children: [
                Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(
                    color: _statusColor,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 10),
                Text(
                  _statusText.toUpperCase(),
                  style: TextStyle(
                    color: _statusColor,
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1,
                  ),
                ),
              ],
            ),
          ),

          // Customer info
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    color: AppColors.yellow,
                    borderRadius: BorderRadius.circular(14),
                    image: ride.customerPhoto != null
                        ? DecorationImage(
                            image: NetworkImage(ride.customerPhoto!),
                            fit: BoxFit.cover,
                          )
                        : null,
                  ),
                  child: ride.customerPhoto == null
                      ? const Icon(Icons.person, color: Colors.black, size: 32)
                      : null,
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        ride.customerName,
                        style: TextStyle(
                          color: context.textColor,
                          fontSize: 18,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        ride.customerPhone,
                        style: TextStyle(
                          color: context.mutedColor,
                          fontSize: 14,
                        ),
                      ),
                    ],
                  ),
                ),
                // Message button
                GestureDetector(
                  onTap: () => _showMessageOptions(context),
                  child: Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: AppColors.yellow,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(Icons.message, color: Colors.black, size: 24),
                  ),
                ),
                const SizedBox(width: 10),
                // Call button
                GestureDetector(
                  onTap: () => _makeCall(context),
                  child: Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: AppColors.success,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(Icons.call, color: Colors.white, size: 24),
                  ),
                ),
              ],
            ),
          ),

          // Divider
          Divider(color: context.borderColor, height: 1),

          // Route info
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                _buildLocationRow(
                  context,
                  icon: Icons.radio_button_checked,
                  iconColor: AppColors.success,
                  label: 'PICKUP',
                  location: ride.pickupLocation,
                  address: ride.pickupAddress,
                  isActive: ride.status == RideStatus.accepted,
                ),
                Padding(
                  padding: const EdgeInsets.only(left: 11),
                  child: Container(
                    width: 2,
                    height: 24,
                    color: context.borderColor,
                  ),
                ),
                _buildLocationRow(
                  context,
                  icon: Icons.location_on,
                  iconColor: AppColors.error,
                  label: 'DROP-OFF',
                  location: ride.dropoffLocation,
                  address: ride.dropoffAddress,
                  isActive: false,
                ),
              ],
            ),
          ),

          // Navigate button
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: ElevatedButton.icon(
              onPressed: () => _navigateToPickup(context),
              icon: const Icon(Icons.navigation),
              label: const Text('Navigate'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.yellow,
                foregroundColor: Colors.black,
                padding: const EdgeInsets.symmetric(vertical: 14),
                minimumSize: const Size(double.infinity, 52),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
          ),

          const SizedBox(height: 12),

          // Action buttons based on status
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: _buildActionButtons(context),
          ),
        ],
      ),
    );
  }

  Widget _buildActionButtons(BuildContext context) {
    if (ride.status == RideStatus.accepted) {
      // Heading to pickup - just show Arrived button
      return SizedBox(
        width: double.infinity,
        child: ElevatedButton.icon(
          onPressed: () {
            HapticFeedback.heavyImpact();
            onArrivedAtPickup();
          },
          icon: const Icon(Icons.location_on, size: 20),
          label: const Text('I\'ve Arrived', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.warning,
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(vertical: 16),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        ),
      );
    } else if (ride.status == RideStatus.arrivedAtPickup) {
      // Waiting for customer - show Cancel (with reasons) and Start Trip
      return Row(
        children: [
          // Cancel button with reasons
          Expanded(
            child: OutlinedButton(
              onPressed: () => _showCancelReasons(context),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.error,
                side: const BorderSide(color: AppColors.error, width: 2),
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: const Text('Cancel', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
            ),
          ),
          const SizedBox(width: 12),
          // Start Trip button
          Expanded(
            flex: 2,
            child: ElevatedButton(
              onPressed: () {
                HapticFeedback.heavyImpact();
                onStartTrip();
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.yellow,
                foregroundColor: Colors.black,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: const Text('Start Trip', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            ),
          ),
        ],
      );
    }
    return const SizedBox.shrink();
  }

  void _showCancelReasons(BuildContext context) {
    HapticFeedback.mediumImpact();
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Container(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.7,
        ),
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
              const SizedBox(height: 16),
              Text(
                'Cancel Ride',
                style: TextStyle(
                  color: context.textColor,
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                'Select a reason for cancellation',
                style: TextStyle(color: context.mutedColor, fontSize: 14),
              ),
              const SizedBox(height: 16),

              // Cancel reasons - scrollable
              Flexible(
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      _buildCancelReasonOption(ctx, context, Icons.person_off, 'Customer No Show', 'Customer did not arrive at pickup'),
                      const SizedBox(height: 8),
                      _buildCancelReasonOption(ctx, context, Icons.cancel, 'Customer Requested', 'Customer asked to cancel the ride'),
                      const SizedBox(height: 8),
                      _buildCancelReasonOption(ctx, context, Icons.wrong_location, 'Wrong Pickup Location', 'Pickup location is incorrect'),
                      const SizedBox(height: 8),
                      _buildCancelReasonOption(ctx, context, Icons.car_crash, 'Vehicle Issue', 'Vehicle breakdown or issue'),
                      const SizedBox(height: 8),
                      _buildCancelReasonOption(ctx, context, Icons.emergency, 'Emergency', 'Personal or medical emergency'),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 12),
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: Text('Go Back', style: TextStyle(color: context.mutedColor, fontSize: 15)),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildCancelReasonOption(BuildContext sheetCtx, BuildContext context, IconData icon, String title, String subtitle) {
    return GestureDetector(
      onTap: () {
        HapticFeedback.mediumImpact();
        Navigator.pop(sheetCtx);
        _confirmCancel(context, title);
      },
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.error.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.error.withValues(alpha: 0.2)),
        ),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: AppColors.error.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, color: AppColors.error, size: 24),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: TextStyle(color: context.textColor, fontSize: 15, fontWeight: FontWeight.w600)),
                  Text(subtitle, style: TextStyle(color: context.mutedColor, fontSize: 12)),
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: context.mutedColor, size: 22),
          ],
        ),
      ),
    );
  }

  void _confirmCancel(BuildContext context, String reason) {
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
              child: const Icon(Icons.warning_rounded, color: AppColors.error, size: 36),
            ),
            const SizedBox(height: 20),
            Text(
              'Confirm Cancellation',
              style: TextStyle(color: context.textColor, fontSize: 20, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 12),
            Text(
              'Cancel this ride due to:\n"$reason"',
              style: TextStyle(color: context.mutedColor, fontSize: 15, height: 1.4),
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
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: const Text('Go Back', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton(
                    onPressed: () {
                      HapticFeedback.heavyImpact();
                      Navigator.pop(ctx);
                      onCancelTrip(reason);
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.error,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: const Text('Cancel Ride', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLocationRow(
    BuildContext context, {
    required IconData icon,
    required Color iconColor,
    required String label,
    required String location,
    required String address,
    required bool isActive,
  }) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isActive ? iconColor.withValues(alpha: 0.1) : Colors.transparent,
        borderRadius: BorderRadius.circular(12),
        border: isActive ? Border.all(color: iconColor.withValues(alpha: 0.3)) : null,
      ),
      child: Row(
        children: [
          Icon(icon, color: iconColor, size: 22),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: TextStyle(
                    color: context.mutedColor,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 1,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  location,
                  style: TextStyle(
                    color: context.textColor,
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                Text(
                  address,
                  style: TextStyle(
                    color: context.mutedColor,
                    fontSize: 13,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _makeCall(BuildContext context) async {
    final uri = Uri.parse('tel:${ride.customerPhone}');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    } else {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Calling ${ride.customerPhone}...'),
            backgroundColor: AppColors.success,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    }
  }

  void _navigateToPickup(BuildContext context) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => NavigationScreen(ride: ride, isPickup: true),
      ),
    );
  }

  void _navigateToDropoff(BuildContext context) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => NavigationScreen(ride: ride, isPickup: false),
      ),
    );
  }

  void _showMessageOptions(BuildContext context) {
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
                'Message ${ride.customerName}',
                style: TextStyle(color: context.textColor, fontSize: 18, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 20),
              // In-app chat
              GestureDetector(
                onTap: () {
                  HapticFeedback.mediumImpact();
                  Navigator.pop(ctx);
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => ChatScreen(customerName: ride.customerName, customerPhone: ride.customerPhone),
                    ),
                  );
                },
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  decoration: BoxDecoration(
                    color: AppColors.yellow,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.chat_bubble, color: Colors.black, size: 22),
                      SizedBox(width: 10),
                      Text('In-App Chat', style: TextStyle(color: Colors.black, fontSize: 16, fontWeight: FontWeight.w600)),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: _buildContactOption(ctx, context, Icons.sms, 'SMS', Colors.blue, () async {
                      Navigator.pop(ctx);
                      final uri = Uri.parse('sms:${ride.customerPhone}');
                      if (await canLaunchUrl(uri)) await launchUrl(uri);
                    }),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _buildContactOption(ctx, context, Icons.chat, 'WhatsApp', const Color(0xFF25D366), () async {
                      Navigator.pop(ctx);
                      final phone = ride.customerPhone.replaceAll(RegExp(r'[^0-9]'), '');
                      final uri = Uri.parse('https://wa.me/$phone');
                      if (await canLaunchUrl(uri)) await launchUrl(uri, mode: LaunchMode.externalApplication);
                    }),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildContactOption(BuildContext sheetCtx, BuildContext context, IconData icon, String label, Color color, VoidCallback onTap) {
    return GestureDetector(
      onTap: () {
        HapticFeedback.mediumImpact();
        onTap();
      },
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 16),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: color.withValues(alpha: 0.3)),
        ),
        child: Column(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(12)),
              child: Icon(icon, color: Colors.white, size: 26),
            ),
            const SizedBox(height: 8),
            Text(label, style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}
