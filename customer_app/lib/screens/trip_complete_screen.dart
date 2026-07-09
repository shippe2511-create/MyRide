import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../providers/app_state.dart';
import '../theme/app_theme.dart';
import '../widgets/glass_container.dart';
import '../widgets/primary_button.dart';
import '../widgets/status_animation.dart';
import '../widgets/app_snackbar.dart';
import '../services/supabase_service.dart';

class TripCompleteScreen extends StatefulWidget {
  final String destination;
  final String? rideId;
  final String? driverId;
  final String? driverName;
  final String? vehicleNumber;
  final double? distance;
  final int? duration;

  const TripCompleteScreen({
    super.key,
    this.destination = 'International Airport · T3',
    this.rideId,
    this.driverId,
    this.driverName,
    this.vehicleNumber,
    this.distance,
    this.duration,
  });

  @override
  State<TripCompleteScreen> createState() => _TripCompleteScreenState();
}

class _TripCompleteScreenState extends State<TripCompleteScreen> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scaleAnimation;
  late Animation<double> _fadeAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 600),
      vsync: this,
    );
    _scaleAnimation = Tween<double>(begin: 0.5, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.elasticOut),
    );
    _fadeAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeOut),
    );
    _controller.forward();
    HapticFeedback.mediumImpact();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = context.isDark;

    return Scaffold(
      backgroundColor: context.bgColor,
      body: SafeArea(
        child: Column(
          children: [
            const SizedBox(height: 40),
            _buildSuccessHeader(context),
            const SizedBox(height: 32),
            FadeTransition(
              opacity: _fadeAnimation,
              child: _buildTripSummary(context, isDark),
            ),
            const Spacer(),
            FadeTransition(
              opacity: _fadeAnimation,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 40),
                child: PrimaryButton(
                  text: 'Rate your trip',
                  onPressed: () => Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => RateDriverScreen(
                      destination: widget.destination,
                      rideId: widget.rideId,
                      driverId: widget.driverId,
                      driverName: widget.driverName,
                      vehicleNumber: widget.vehicleNumber,
                    )),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSuccessHeader(BuildContext context) {
    return Column(
      children: [
        ScaleTransition(
          scale: _scaleAnimation,
          child: const StatusAnimation(
            type: TripAnimationType.complete,
            size: 120,
            repeat: false,
          ),
        ),
        const SizedBox(height: 20),
        FadeTransition(
          opacity: _fadeAnimation,
          child: Text(
            'You\'ve arrived!',
            style: TextStyle(
              color: context.textColor,
              fontSize: 28,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.6,
            ),
          ),
        ),
        const SizedBox(height: 6),
        FadeTransition(
          opacity: _fadeAnimation,
          child: Text(
            widget.destination,
            style: TextStyle(color: context.mutedColor, fontSize: 15),
          ),
        ),
      ],
    );
  }

  Widget _buildTripSummary(BuildContext context, bool isDark) {
    final distance = widget.distance != null ? '${widget.distance!.toStringAsFixed(1)} km' : '--';
    final duration = widget.duration != null ? '${widget.duration} min' : '--';
    final vehicle = widget.vehicleNumber ?? 'Unknown';

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: GlassContainer(
        borderRadius: BorderRadius.circular(24),
        padding: const EdgeInsets.all(20),
        backgroundColor: isDark ? const Color(0xB8141416) : const Color(0xE8FFFFFF),
        child: Column(
          children: [
            _buildSummaryRow('Distance', distance, context),
            _buildSummaryRow('Duration', duration, context),
            _buildSummaryRow('Vehicle', vehicle, context),
          ],
        ),
      ),
    );
  }

  Widget _buildSummaryRow(String label, String value, BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(color: context.mutedColor, fontSize: 14)),
          Text(
            value,
            style: TextStyle(
              color: context.textColor,
              fontSize: 14,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class RateDriverScreen extends StatefulWidget {
  final String destination;
  final String? rideId;
  final String? driverId;
  final String? driverName;
  final String? vehicleNumber;

  const RateDriverScreen({
    super.key,
    this.destination = 'Airport T3',
    this.rideId,
    this.driverId,
    this.driverName,
    this.vehicleNumber,
  });

  @override
  State<RateDriverScreen> createState() => _RateDriverScreenState();
}

class _RateDriverScreenState extends State<RateDriverScreen> {
  int _rating = 5;
  final _ratingLabels = ['', 'Poor', 'Okay', 'Good', 'Great', 'Excellent!'];
  Set<String> _selectedFeedback = {};
  bool _isSubmitting = false;

  Map<String, dynamic> get _driverInfo => {
    'id': widget.driverId ?? 'unknown',
    'name': widget.driverName ?? 'Driver',
    'initials': (widget.driverName ?? 'D').isNotEmpty ? (widget.driverName ?? 'D')[0].toUpperCase() : 'D',
    'vehicle': widget.vehicleNumber ?? 'Unknown',
    'rating': 4.9,
  };

  final _feedbackOptions = [
    'Smooth driving',
    'Clean vehicle',
    'Friendly driver',
    'On time',
    'Good navigation',
  ];

  @override
  Widget build(BuildContext context) {
    final isDark = context.isDark;

    return Scaffold(
      backgroundColor: context.bgColor,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.only(bottom: 20),
          child: Column(
            children: [
              const SizedBox(height: 32),
              _buildDriverSection(isDark),
              const SizedBox(height: 32),
              _buildFeedbackSection(isDark),
              const SizedBox(height: 24),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
                child: PrimaryButton(
                  text: _isSubmitting ? 'Submitting...' : 'Submit rating',
                  onPressed: _isSubmitting ? null : () async {
                    setState(() => _isSubmitting = true);

                    try {
                      final appState = Provider.of<AppState>(context, listen: false);

                      // Build comment from feedback chips
                      final fullComment = _selectedFeedback.isNotEmpty ? _selectedFeedback.join(', ') : null;

                      appState.rateDriver(_rating, fullComment ?? '');

                      // Submit rating to database
                      debugPrint('Rating submit: rideId=${widget.rideId}, driverId=${widget.driverId}');
                      if (widget.rideId != null && widget.driverId != null) {
                        await SupabaseService.submitRideRating(
                          rideId: widget.rideId!,
                          driverId: widget.driverId!,
                          rating: _rating,
                          comment: fullComment,
                        );
                      }

                      if (!mounted) return;
                      Navigator.of(context).popUntil((route) => route.isFirst);
                      Navigator.pushReplacementNamed(context, '/home');
                    } catch (e) {
                      debugPrint('Error submitting rating: $e');
                      if (mounted) {
                        setState(() => _isSubmitting = false);
                        AppSnackbar.error(context, 'Failed to submit rating', subtitle: '$e');
                      }
                    }
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildDriverSection(bool isDark) {
    return Column(
      children: [
        Container(
          width: 88,
          height: 88,
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: isDark
                  ? [const Color(0xFF2A2A30), const Color(0xFF1B1B1F)]
                  : [const Color(0xFFE0E0E5), const Color(0xFFD0D0D5)],
            ),
            shape: BoxShape.circle,
            border: Border.all(color: AppColors.yellow, width: 2),
          ),
          child: Center(
            child: Text(
              _driverInfo['initials'] ?? 'D',
              style: TextStyle(
                color: context.textColor,
                fontSize: 30,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ),
        const SizedBox(height: 18),
        Text(
          'How was your trip?',
          style: TextStyle(
            color: context.textColor,
            fontSize: 24,
            fontWeight: FontWeight.w700,
            letterSpacing: -0.5,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          'with ${_driverInfo['name']} · ${_driverInfo['vehicle']}',
          style: TextStyle(color: context.mutedColor, fontSize: 14),
        ),
        const SizedBox(height: 24),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: List.generate(5, (index) {
            final starNum = index + 1;
            final isFilled = starNum <= _rating;
            return GestureDetector(
              onTap: () {
                HapticFeedback.selectionClick();
                setState(() => _rating = starNum);
              },
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 6),
                child: AnimatedScale(
                  scale: isFilled ? 1.1 : 1.0,
                  duration: const Duration(milliseconds: 150),
                  child: Icon(
                    isFilled ? Icons.star_rounded : Icons.star_outline_rounded,
                    color: isFilled ? AppColors.yellow : (isDark ? Colors.white : Colors.black).withValues(alpha: 0.2),
                    size: 44,
                  ),
                ),
              ),
            );
          }),
        ),
        const SizedBox(height: 12),
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 200),
          child: Text(
            _ratingLabels[_rating],
            key: ValueKey(_rating),
            style: TextStyle(
              color: AppColors.yellow,
              fontSize: 16,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildFeedbackSection(bool isDark) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'What went well?',
            style: TextStyle(
              color: context.textColor,
              fontSize: 16,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _feedbackOptions.map((option) {
              final isSelected = _selectedFeedback.contains(option);
              return GestureDetector(
                onTap: () {
                  HapticFeedback.lightImpact();
                  setState(() {
                    if (isSelected) {
                      _selectedFeedback.remove(option);
                    } else {
                      _selectedFeedback.add(option);
                    }
                  });
                },
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  decoration: BoxDecoration(
                    color: isSelected ? AppColors.yellow : (isDark ? Colors.white : Colors.black).withValues(alpha: 0.05),
                    borderRadius: BorderRadius.circular(99),
                    border: Border.all(
                      color: isSelected ? AppColors.yellow : (isDark ? Colors.white : Colors.black).withValues(alpha: 0.1),
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (isSelected) ...[
                        Icon(Icons.check, color: context.isDark ? AppColors.bgDark : Colors.white, size: 16),
                        const SizedBox(width: 6),
                      ],
                      Text(
                        option,
                        style: TextStyle(
                          color: isSelected ? AppColors.bgDark : context.textColor,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }
}
