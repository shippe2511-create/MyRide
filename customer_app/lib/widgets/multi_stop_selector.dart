import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../theme/app_theme.dart';

class StopLocation {
  final String name;
  final String address;
  final double latitude;
  final double longitude;

  StopLocation({
    required this.name,
    required this.address,
    required this.latitude,
    required this.longitude,
  });

  Map<String, dynamic> toJson() => {
    'name': name,
    'address': address,
    'latitude': latitude,
    'longitude': longitude,
  };
}

class MultiStopSelector extends StatefulWidget {
  final List<StopLocation> stops;
  final Function(List<StopLocation>) onStopsChanged;
  final int maxStops;

  const MultiStopSelector({
    super.key,
    required this.stops,
    required this.onStopsChanged,
    this.maxStops = 3,
  });

  @override
  State<MultiStopSelector> createState() => _MultiStopSelectorState();
}

class _MultiStopSelectorState extends State<MultiStopSelector> {
  @override
  Widget build(BuildContext context) {
    final isDark = context.isDark;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (widget.stops.isNotEmpty) ...[
          ...widget.stops.asMap().entries.map((entry) {
            final index = entry.key;
            final stop = entry.value;
            return _buildStopItem(stop, index, isDark);
          }),
          const SizedBox(height: 8),
        ],
        if (widget.stops.length < widget.maxStops)
          _buildAddStopButton(isDark),
      ],
    );
  }

  Widget _buildStopItem(StopLocation stop, int index, bool isDark) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Container(
            width: 24,
            height: 24,
            decoration: BoxDecoration(
              color: AppColors.yellow.withValues(alpha: 0.2),
              shape: BoxShape.circle,
            ),
            child: Center(
              child: Text(
                '${index + 1}',
                style: TextStyle(
                  color: AppColors.yellow,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.05),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.location_on_outlined,
                    size: 18,
                    color: context.mutedColor,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          stop.name,
                          style: TextStyle(
                            color: context.textColor,
                            fontSize: 14,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                        if (stop.address != stop.name)
                          Text(
                            stop.address,
                            style: TextStyle(
                              color: context.mutedColor,
                              fontSize: 12,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                      ],
                    ),
                  ),
                  GestureDetector(
                    onTap: () {
                      HapticFeedback.lightImpact();
                      final newStops = List<StopLocation>.from(widget.stops);
                      newStops.removeAt(index);
                      widget.onStopsChanged(newStops);
                    },
                    child: Icon(
                      Icons.close,
                      size: 18,
                      color: context.mutedColor,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAddStopButton(bool isDark) {
    return GestureDetector(
      onTap: () {
        HapticFeedback.lightImpact();
        _showAddStopDialog();
      },
      child: Row(
        children: [
          Container(
            width: 24,
            height: 24,
            decoration: BoxDecoration(
              color: AppColors.yellow.withValues(alpha: 0.2),
              shape: BoxShape.circle,
            ),
            child: Icon(
              Icons.add,
              size: 14,
              color: AppColors.yellow,
            ),
          ),
          const SizedBox(width: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              border: Border.all(
                color: AppColors.yellow.withValues(alpha: 0.5),
                width: 1,
              ),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.add_location_alt_outlined,
                  size: 18,
                  color: AppColors.yellow,
                ),
                const SizedBox(width: 8),
                Text(
                  'Add stop',
                  style: TextStyle(
                    color: AppColors.yellow,
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _showAddStopDialog() {
    final nameController = TextEditingController();
    final isDark = context.isDark;

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Container(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(ctx).viewInsets.bottom,
        ),
        decoration: BoxDecoration(
          color: context.surfaceColor,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.18),
                    borderRadius: BorderRadius.circular(99),
                  ),
                ),
              ),
              const SizedBox(height: 20),
              Text(
                'Add a stop',
                style: TextStyle(
                  color: context.textColor,
                  fontSize: 18,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: nameController,
                autofocus: true,
                style: TextStyle(color: context.textColor),
                decoration: InputDecoration(
                  hintText: 'Enter location name',
                  hintStyle: TextStyle(color: context.mutedColor),
                  filled: true,
                  fillColor: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.05),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none,
                  ),
                  prefixIcon: Icon(Icons.location_on_outlined, color: context.mutedColor),
                ),
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () {
                    if (nameController.text.trim().isEmpty) return;
                    final newStops = List<StopLocation>.from(widget.stops);
                    newStops.add(StopLocation(
                      name: nameController.text.trim(),
                      address: nameController.text.trim(),
                      latitude: 4.1755,
                      longitude: 73.5093,
                    ));
                    widget.onStopsChanged(newStops);
                    Navigator.pop(ctx);
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
                    'Add stop',
                    style: TextStyle(fontWeight: FontWeight.w600),
                  ),
                ),
              ),
              const SizedBox(height: 12),
            ],
          ),
        ),
      ),
    );
  }
}
