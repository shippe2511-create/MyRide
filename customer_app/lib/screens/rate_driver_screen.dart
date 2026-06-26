import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../theme/app_theme.dart';
import '../services/supabase_service.dart';
import '../widgets/app_snackbar.dart';

class RateDriverScreen extends StatefulWidget {
  final String rideId;
  final String driverName;
  final String? driverPhoto;
  final String vehicleNumber;

  const RateDriverScreen({
    super.key,
    required this.rideId,
    required this.driverName,
    this.driverPhoto,
    required this.vehicleNumber,
  });

  @override
  State<RateDriverScreen> createState() => _RateDriverScreenState();
}

class _RateDriverScreenState extends State<RateDriverScreen> {
  int _rating = 0;
  String? _selectedFeedback;
  final _commentController = TextEditingController();
  bool _isSubmitting = false;

  final List<String> _positiveFeedback = [
    'Professional',
    'On time',
    'Safe driving',
    'Friendly',
    'Clean vehicle',
  ];

  final List<String> _negativeFeedback = [
    'Late arrival',
    'Rude behavior',
    'Unsafe driving',
    'Dirty vehicle',
    'Navigation issues',
  ];

  @override
  void dispose() {
    _commentController.dispose();
    super.dispose();
  }

  Future<void> _submitRating() async {
    if (_rating == 0) {
      AppSnackbar.warning(context, 'Please select a rating');
      return;
    }

    setState(() => _isSubmitting = true);
    HapticFeedback.mediumImpact();

    try {
      await SupabaseService.rateDriver(
        rideId: widget.rideId,
        rating: _rating,
        feedback: _selectedFeedback,
        comment: _commentController.text.trim().isEmpty ? null : _commentController.text.trim(),
      );

      if (mounted) {
        Navigator.pop(context);
        AppSnackbar.success(context, 'Thanks for your feedback!');
      }
    } catch (e) {
      if (mounted) {
        AppSnackbar.error(context, 'Failed to submit rating');
      }
    }

    setState(() => _isSubmitting = false);
  }

  @override
  Widget build(BuildContext context) {
    final feedbackOptions = _rating >= 4 ? _positiveFeedback : _negativeFeedback;

    return Scaffold(
      backgroundColor: context.bgColor,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  GestureDetector(
                    onTap: () => Navigator.pop(context),
                    child: Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: context.surfaceColor,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Icon(Icons.close, color: context.textColor),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: Column(
                  children: [
                    CircleAvatar(
                      radius: 50,
                      backgroundColor: AppColors.yellow.withValues(alpha: 0.2),
                      backgroundImage: widget.driverPhoto != null ? NetworkImage(widget.driverPhoto!) : null,
                      child: widget.driverPhoto == null
                          ? Text(widget.driverName[0], style: TextStyle(fontSize: 32, fontWeight: FontWeight.bold, color: AppColors.yellow))
                          : null,
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'How was your ride with',
                      style: TextStyle(color: context.mutedColor, fontSize: 16),
                    ),
                    Text(
                      widget.driverName,
                      style: TextStyle(color: context.textColor, fontSize: 24, fontWeight: FontWeight.bold),
                    ),
                    Text(
                      widget.vehicleNumber,
                      style: TextStyle(color: context.mutedColor, fontSize: 14),
                    ),
                    const SizedBox(height: 32),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: List.generate(5, (index) {
                        final starIndex = index + 1;
                        return GestureDetector(
                          onTap: () {
                            HapticFeedback.lightImpact();
                            setState(() {
                              _rating = starIndex;
                              _selectedFeedback = null;
                            });
                          },
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 6),
                            child: Icon(
                              starIndex <= _rating ? Icons.star_rounded : Icons.star_outline_rounded,
                              size: 48,
                              color: starIndex <= _rating ? AppColors.yellow : context.mutedColor,
                            ),
                          ),
                        );
                      }),
                    ),
                    if (_rating > 0) ...[
                      const SizedBox(height: 8),
                      Text(
                        _rating >= 4 ? 'Great!' : _rating >= 3 ? 'Okay' : 'Not good',
                        style: TextStyle(
                          color: _rating >= 4 ? AppColors.success : _rating >= 3 ? AppColors.yellow : AppColors.error,
                          fontSize: 18,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                    if (_rating > 0) ...[
                      const SizedBox(height: 24),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        alignment: WrapAlignment.center,
                        children: feedbackOptions.map((feedback) {
                          final isSelected = _selectedFeedback == feedback;
                          return GestureDetector(
                            onTap: () {
                              HapticFeedback.selectionClick();
                              setState(() => _selectedFeedback = isSelected ? null : feedback);
                            },
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                              decoration: BoxDecoration(
                                color: isSelected ? AppColors.yellow.withValues(alpha: 0.2) : context.surfaceColor,
                                borderRadius: BorderRadius.circular(20),
                                border: Border.all(
                                  color: isSelected ? AppColors.yellow : context.borderColor,
                                ),
                              ),
                              child: Text(
                                feedback,
                                style: TextStyle(
                                  color: isSelected ? AppColors.yellow : context.textColor,
                                  fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
                                ),
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                      const SizedBox(height: 24),
                      TextField(
                        controller: _commentController,
                        maxLines: 3,
                        style: TextStyle(color: context.textColor),
                        decoration: InputDecoration(
                          hintText: 'Add a comment (optional)',
                          hintStyle: TextStyle(color: context.mutedColor),
                          filled: true,
                          fillColor: context.surfaceColor,
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide(color: context.borderColor),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide(color: context.borderColor),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide(color: AppColors.yellow),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            Padding(
              padding: EdgeInsets.fromLTRB(24, 16, 24, MediaQuery.of(context).padding.bottom + 16),
              child: SizedBox(
                width: double.infinity,
                height: 56,
                child: ElevatedButton(
                  onPressed: _rating > 0 && !_isSubmitting ? _submitRating : null,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.yellow,
                    foregroundColor: Colors.black,
                    disabledBackgroundColor: context.surfaceColor,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    elevation: 0,
                  ),
                  child: _isSubmitting
                      ? SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black))
                      : Text('Submit Rating', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
