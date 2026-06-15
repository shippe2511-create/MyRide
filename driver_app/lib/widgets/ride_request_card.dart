import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../models/ride_request.dart';
import '../theme/app_theme.dart';

class RideRequestCard extends StatelessWidget {
  final RideRequest request;
  final VoidCallback onAccept;
  final VoidCallback? onDecline;

  const RideRequestCard({
    super.key,
    required this.request,
    required this.onAccept,
    this.onDecline,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.cardColor,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.yellow, width: 2),
        boxShadow: [
          BoxShadow(
            color: AppColors.yellow.withValues(alpha: 0.2),
            blurRadius: 20,
            spreadRadius: 2,
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Header
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.yellow.withValues(alpha: 0.1),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(18)),
            ),
            child: Row(
              children: [
                // Customer photo
                Container(
                  width: 50,
                  height: 50,
                  decoration: BoxDecoration(
                    color: AppColors.yellow,
                    borderRadius: BorderRadius.circular(12),
                    image: request.customerPhoto != null
                        ? DecorationImage(
                            image: NetworkImage(request.customerPhoto!),
                            fit: BoxFit.cover,
                          )
                        : null,
                  ),
                  child: request.customerPhoto == null
                      ? const Icon(Icons.person, color: Colors.black, size: 28)
                      : null,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        request.customerName,
                        style: TextStyle(
                          color: context.textColor,
                          fontSize: 18,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Row(
                        children: [
                          if (request.isScheduled) ...[
                            Icon(Icons.schedule, color: AppColors.info, size: 14),
                            const SizedBox(width: 4),
                            Text(
                              'Scheduled',
                              style: TextStyle(
                                color: AppColors.info,
                                fontSize: 13,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ] else
                            Text(
                              'New ride request',
                              style: TextStyle(
                                color: AppColors.yellow,
                                fontSize: 13,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: context.bgColor,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    '${request.estimatedDistance} km',
                    style: TextStyle(
                      color: context.textColor,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ),

          // Scheduled time banner
          if (request.isScheduled)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
              color: AppColors.info.withValues(alpha: 0.1),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.access_time_filled, color: AppColors.info, size: 16),
                  const SizedBox(width: 8),
                  Text(
                    'Pickup at ${_formatTime(request.scheduledTime!)}',
                    style: TextStyle(
                      color: AppColors.info,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),

          // Route info
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
            child: Column(
              children: [
                _buildLocationRow(
                  context,
                  icon: Icons.radio_button_checked,
                  iconColor: AppColors.success,
                  label: 'PICKUP',
                  location: request.pickupLocation,
                ),
                Padding(
                  padding: const EdgeInsets.only(left: 11),
                  child: Container(
                    width: 2,
                    height: 20,
                    color: context.borderColor,
                  ),
                ),
                _buildLocationRow(
                  context,
                  icon: Icons.location_on,
                  iconColor: AppColors.error,
                  label: 'DROP-OFF',
                  location: request.dropoffLocation,
                ),
              ],
            ),
          ),

          // Stats row
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            decoration: BoxDecoration(
              color: context.bgColor,
              border: Border(
                top: BorderSide(color: context.borderColor),
                bottom: BorderSide(color: context.borderColor),
              ),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _buildStat(context, Icons.timer_outlined, '${request.estimatedDuration} min'),
                Container(width: 1, height: 30, color: context.borderColor),
                _buildStat(context, Icons.straighten, '${request.estimatedDistance} km'),
                if (request.fare != null) ...[
                  Container(width: 1, height: 30, color: context.borderColor),
                  _buildStat(context, Icons.attach_money, 'MVR ${request.fare!.toStringAsFixed(0)}'),
                ],
              ],
            ),
          ),

          // Action button
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            child: SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () {
                  HapticFeedback.heavyImpact();
                  onAccept();
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.yellow,
                  foregroundColor: Colors.black,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: const Text(
                  'Accept Ride',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _formatTime(DateTime time) {
    final hour = time.hour > 12 ? time.hour - 12 : (time.hour == 0 ? 12 : time.hour);
    final period = time.hour >= 12 ? 'PM' : 'AM';
    return '$hour:${time.minute.toString().padLeft(2, '0')} $period';
  }

  Widget _buildLocationRow(
    BuildContext context, {
    required IconData icon,
    required Color iconColor,
    required String label,
    required String location,
  }) {
    return Row(
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
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildStat(BuildContext context, IconData icon, String value) {
    return Row(
      children: [
        Icon(icon, color: context.mutedColor, size: 20),
        const SizedBox(width: 8),
        Text(
          value,
          style: TextStyle(
            color: context.textColor,
            fontSize: 15,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}
