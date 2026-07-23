import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';
import 'package:geocoding/geocoding.dart';
import '../services/supabase_service.dart';
import '../theme/app_theme.dart';
import '../widgets/app_snackbar.dart';

class IncidentReportScreen extends StatefulWidget {
  final String? rideId;

  const IncidentReportScreen({super.key, this.rideId});

  @override
  State<IncidentReportScreen> createState() => _IncidentReportScreenState();
}

class _IncidentReportScreenState extends State<IncidentReportScreen> {
  final _titleController = TextEditingController();
  final _descriptionController = TextEditingController();

  String _selectedType = 'accident';
  String _selectedSeverity = 'medium';
  bool _isSubmitting = false;
  bool _isLoadingLocation = false;
  String? _locationName;
  double? _latitude;
  double? _longitude;

  final List<Map<String, dynamic>> _incidentTypes = [
    {'value': 'accident', 'label': 'Accident', 'icon': Icons.car_crash_rounded},
    {'value': 'breakdown', 'label': 'Breakdown', 'icon': Icons.build_rounded},
    {'value': 'passenger_issue', 'label': 'Passenger Issue', 'icon': Icons.person_off_rounded},
    {'value': 'traffic', 'label': 'Traffic/Road', 'icon': Icons.traffic_rounded},
    {'value': 'safety', 'label': 'Safety Concern', 'icon': Icons.warning_rounded},
    {'value': 'other', 'label': 'Other', 'icon': Icons.more_horiz_rounded},
  ];

  final List<Map<String, dynamic>> _severityLevels = [
    {'value': 'low', 'label': 'Low', 'color': Colors.green},
    {'value': 'medium', 'label': 'Medium', 'color': Colors.orange},
    {'value': 'high', 'label': 'High', 'color': Colors.red},
    {'value': 'critical', 'label': 'Critical', 'color': Colors.purple},
  ];

  @override
  void initState() {
    super.initState();
    _getCurrentLocation();
  }

  Future<void> _getCurrentLocation() async {
    setState(() => _isLoadingLocation = true);
    try {
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      );
      _latitude = position.latitude;
      _longitude = position.longitude;

      final geocoding = Geocoding();
      final placemarks = await geocoding.placemarkFromCoordinates(position.latitude, position.longitude);
      if (placemarks.isNotEmpty) {
        final place = placemarks.first;
        _locationName = [place.street, place.locality, place.country]
            .where((s) => s != null && s.isNotEmpty)
            .join(', ');
      }
    } catch (e) {
      debugPrint('Error getting location: $e');
    }
    if (mounted) setState(() => _isLoadingLocation = false);
  }

  Future<void> _submitReport() async {
    final title = _titleController.text.trim();
    final description = _descriptionController.text.trim();

    if (title.isEmpty) {
      HapticFeedback.heavyImpact();
      AppSnackbar.error(context, 'Please enter a title');
      return;
    }

    if (description.isEmpty) {
      HapticFeedback.heavyImpact();
      AppSnackbar.error(context, 'Please describe the incident');
      return;
    }

    setState(() => _isSubmitting = true);
    HapticFeedback.mediumImpact();

    try {
      final driverProfile = await SupabaseService.getProfile();
      final driverData = await SupabaseService.getDriverProfile();

      if (driverData == null || driverData['id'] == null) {
        if (mounted) {
          AppSnackbar.error(context, 'Driver profile not found. Please log in again.');
        }
        setState(() => _isSubmitting = false);
        return;
      }

      final result = await SupabaseService.client.from('incidents').insert({
        'driver_id': driverData['id'],
        'ride_id': widget.rideId,
        'type': _selectedType,
        'severity': _selectedSeverity,
        'title': title,
        'description': description,
        'location_name': _locationName,
        'latitude': _latitude,
        'longitude': _longitude,
        'status': 'open',
        'reporter_name': driverProfile?['full_name'] ?? 'Driver',
      }).select().single();

      if (mounted) {
        HapticFeedback.lightImpact();
        AppSnackbar.success(context, 'Incident reported successfully');
        Navigator.pop(context, result);
      }
    } catch (e) {
      debugPrint('Error submitting incident: $e');
      if (mounted) {
        String errorMsg = 'Failed to submit report';
        if (e.toString().contains('title')) {
          errorMsg = 'Please enter a title';
        } else if (e.toString().contains('driver_id')) {
          errorMsg = 'Driver profile not found';
        }
        AppSnackbar.error(context, errorMsg);
      }
    }

    if (mounted) setState(() => _isSubmitting = false);
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bgColor = isDark ? const Color(0xFF0A0A0C) : const Color(0xFFF5F5F7);
    final cardColor = isDark ? const Color(0xFF1C1C1E) : Colors.white;
    final textColor = isDark ? Colors.white : Colors.black;
    final mutedColor = isDark ? Colors.white60 : Colors.black54;
    final borderColor = isDark ? Colors.white.withValues(alpha: 0.1) : Colors.black.withValues(alpha: 0.05);

    return Scaffold(
      backgroundColor: bgColor,
      appBar: AppBar(
        backgroundColor: bgColor,
        elevation: 0,
        leading: IconButton(
          icon: Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: cardColor,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(Icons.arrow_back, color: textColor, size: 20),
          ),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text(
          'Report Incident',
          style: TextStyle(color: textColor, fontWeight: FontWeight.w800, fontSize: 20),
        ),
        centerTitle: true,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Incident Type
            Text('Incident Type', style: TextStyle(color: textColor, fontSize: 16, fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: _incidentTypes.map((type) {
                final isSelected = _selectedType == type['value'];
                return GestureDetector(
                  onTap: () {
                    HapticFeedback.selectionClick();
                    setState(() => _selectedType = type['value']);
                  },
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    decoration: BoxDecoration(
                      color: isSelected ? AppColors.yellow : cardColor,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: isSelected ? AppColors.yellow : borderColor),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          type['icon'],
                          size: 18,
                          color: isSelected ? AppColors.darkBg : mutedColor,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          type['label'],
                          style: TextStyle(
                            color: isSelected ? AppColors.darkBg : textColor,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              }).toList(),
            ),
            const SizedBox(height: 24),

            // Severity
            Text('Severity', style: TextStyle(color: textColor, fontSize: 16, fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            Row(
              children: _severityLevels.map((level) {
                final isSelected = _selectedSeverity == level['value'];
                final color = level['color'] as Color;
                return Expanded(
                  child: GestureDetector(
                    onTap: () {
                      HapticFeedback.selectionClick();
                      setState(() => _selectedSeverity = level['value']);
                    },
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      margin: const EdgeInsets.only(right: 8),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      decoration: BoxDecoration(
                        color: isSelected ? color : cardColor,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: isSelected ? color : borderColor),
                      ),
                      child: Center(
                        child: Text(
                          level['label'],
                          style: TextStyle(
                            color: isSelected ? Colors.white : textColor,
                            fontWeight: FontWeight.w600,
                            fontSize: 13,
                          ),
                        ),
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
            const SizedBox(height: 24),

            // Title
            Text('Title', style: TextStyle(color: textColor, fontSize: 16, fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            TextField(
              controller: _titleController,
              style: TextStyle(color: textColor, fontSize: 16),
              decoration: InputDecoration(
                hintText: 'Brief summary of the incident',
                hintStyle: TextStyle(color: mutedColor.withValues(alpha: 0.5)),
                filled: true,
                fillColor: cardColor,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                contentPadding: const EdgeInsets.all(18),
              ),
            ),
            const SizedBox(height: 24),

            // Description
            Text('Description', style: TextStyle(color: textColor, fontSize: 16, fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            TextField(
              controller: _descriptionController,
              style: TextStyle(color: textColor, fontSize: 16),
              maxLines: 4,
              decoration: InputDecoration(
                hintText: 'Describe what happened in detail...',
                hintStyle: TextStyle(color: mutedColor.withValues(alpha: 0.5)),
                filled: true,
                fillColor: cardColor,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                contentPadding: const EdgeInsets.all(18),
              ),
            ),
            const SizedBox(height: 24),

            // Location
            Text('Location', style: TextStyle(color: textColor, fontSize: 16, fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: cardColor,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: AppColors.yellow.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(Icons.location_on_rounded, color: AppColors.yellow, size: 20),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: _isLoadingLocation
                        ? Row(
                            children: [
                              SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(strokeWidth: 2, color: mutedColor),
                              ),
                              const SizedBox(width: 12),
                              Text('Getting location...', style: TextStyle(color: mutedColor)),
                            ],
                          )
                        : Text(
                            _locationName ?? 'Location not available',
                            style: TextStyle(color: textColor, fontSize: 14),
                          ),
                  ),
                  IconButton(
                    icon: Icon(Icons.refresh_rounded, color: mutedColor, size: 20),
                    onPressed: _getCurrentLocation,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 32),

            // Submit Button
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _isSubmitting ? null : _submitReport,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.yellow,
                  foregroundColor: AppColors.darkBg,
                  disabledBackgroundColor: AppColors.yellow.withValues(alpha: 0.5),
                  padding: const EdgeInsets.symmetric(vertical: 18),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  elevation: 0,
                ),
                child: _isSubmitting
                    ? const SizedBox(
                        height: 22,
                        width: 22,
                        child: CircularProgressIndicator(strokeWidth: 2.5, color: AppColors.darkBg),
                      )
                    : const Text(
                        'Submit Report',
                        style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                      ),
              ),
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }
}
