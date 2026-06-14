import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../providers/driver_state.dart';
import '../theme/app_theme.dart';
import '../models/ride_request.dart';

class HistoryScreen extends StatelessWidget {
  const HistoryScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.bgColor,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
              child: Text(
                'Trip History',
                style: TextStyle(
                  color: context.textColor,
                  fontSize: 24,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            Expanded(
              child: Consumer<DriverState>(
                builder: (context, state, _) {
                  if (state.completedTrips.isEmpty) {
                    return _buildEmptyState(context);
                  }

                  return ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: state.completedTrips.length,
                    itemBuilder: (context, index) {
                      final trip = state.completedTrips[index];
                      return _buildTripCard(context, trip);
                    },
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmptyState(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 100,
            height: 100,
            decoration: BoxDecoration(
              color: context.cardColor,
              borderRadius: BorderRadius.circular(24),
            ),
            child: Icon(
              Icons.history,
              size: 48,
              color: context.mutedColor,
            ),
          ),
          const SizedBox(height: 24),
          Text(
            'No Trips Yet',
            style: TextStyle(
              color: context.textColor,
              fontSize: 22,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Complete your first trip to see it here',
            style: TextStyle(
              color: context.mutedColor,
              fontSize: 15,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTripCard(BuildContext context, CompletedTrip trip) {
    final dateFormat = DateFormat('MMM d, yyyy');
    final timeFormat = DateFormat('h:mm a');

    // Determine icon and color based on status
    IconData statusIcon;
    Color statusColor;
    Color bgColor;

    switch (trip.status) {
      case TripStatus.completed:
        statusIcon = Icons.check_circle;
        statusColor = AppColors.success;
        bgColor = AppColors.success.withValues(alpha: 0.15);
        break;
      case TripStatus.cancelled:
        statusIcon = Icons.cancel;
        statusColor = AppColors.error;
        bgColor = AppColors.error.withValues(alpha: 0.15);
        break;
      case TripStatus.rejected:
        statusIcon = Icons.block;
        statusColor = AppColors.warning;
        bgColor = AppColors.warning.withValues(alpha: 0.15);
        break;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: context.cardColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.borderColor),
      ),
      child: Column(
        children: [
          // Header
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: bgColor,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(
                    statusIcon,
                    color: statusColor,
                    size: 26,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        trip.customerName,
                        style: TextStyle(
                          color: context.textColor,
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${dateFormat.format(trip.tripDate)} at ${timeFormat.format(trip.tripDate)}',
                        style: TextStyle(
                          color: context.mutedColor,
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ),
                ),
                if (trip.status != TripStatus.completed)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: statusColor.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      trip.status == TripStatus.cancelled ? 'Cancelled' : 'Rejected',
                      style: TextStyle(
                        color: statusColor,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  )
                else if (trip.rating > 0)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.warning.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.star,
                          color: AppColors.warning,
                          size: 16,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          '${trip.rating}',
                          style: const TextStyle(
                            color: AppColors.warning,
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),

          // Divider
          Divider(color: context.borderColor, height: 1),

          // Route
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Column(
                  children: [
                    Icon(
                      Icons.radio_button_checked,
                      color: AppColors.success,
                      size: 18,
                    ),
                    Container(
                      width: 2,
                      height: 20,
                      color: context.borderColor,
                    ),
                    Icon(
                      Icons.location_on,
                      color: AppColors.error,
                      size: 18,
                    ),
                  ],
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        trip.pickupLocation,
                        style: TextStyle(
                          color: context.textColor,
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const SizedBox(height: 16),
                      Text(
                        trip.dropoffLocation,
                        style: TextStyle(
                          color: context.textColor,
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          // Cancellation reason
          if (trip.cancellationReason != null && trip.cancellationReason!.isNotEmpty)
            Container(
              margin: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.error.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppColors.error.withValues(alpha: 0.2)),
              ),
              child: Row(
                children: [
                  Icon(Icons.info_outline, color: AppColors.error, size: 18),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Reason',
                          style: TextStyle(
                            color: context.mutedColor,
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        Text(
                          trip.cancellationReason!,
                          style: TextStyle(
                            color: context.textColor,
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

          // Stats
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: context.bgColor,
              borderRadius: const BorderRadius.vertical(
                bottom: Radius.circular(16),
              ),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _buildStat(
                  context,
                  Icons.timer_outlined,
                  '${trip.durationMinutes} min',
                ),
                Container(width: 1, height: 24, color: context.borderColor),
                _buildStat(
                  context,
                  Icons.straighten,
                  '${trip.distanceKm} km',
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStat(BuildContext context, IconData icon, String value) {
    return Row(
      children: [
        Icon(icon, color: context.mutedColor, size: 18),
        const SizedBox(width: 6),
        Text(
          value,
          style: TextStyle(
            color: context.textColor,
            fontSize: 14,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }
}
