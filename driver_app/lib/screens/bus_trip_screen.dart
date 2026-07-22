import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../services/supabase_service.dart';
import '../providers/driver_state.dart';
import '../theme/app_theme.dart';
import '../widgets/app_snackbar.dart';

class BusTripScreen extends StatefulWidget {
  final String tripId;
  final Map<String, dynamic> assignment;

  const BusTripScreen({
    super.key,
    required this.tripId,
    required this.assignment,
  });

  @override
  State<BusTripScreen> createState() => _BusTripScreenState();
}

class _BusTripScreenState extends State<BusTripScreen> {
  List<Map<String, dynamic>> _stops = [];
  Map<String, dynamic>? _trip;
  bool _isLoading = true;
  bool _isAdvancing = false;
  bool _isCompleting = false;
  int _currentStopIndex = 0;
  int _onBoardCount = 0;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final routeId = widget.assignment['route_id'] as String?;
      if (routeId != null) {
        final stops = await SupabaseService.getBusRouteStops(routeId);
        final trip = await SupabaseService.getBusTrip(widget.tripId);

        setState(() {
          _stops = stops;
          _trip = trip;
          _isLoading = false;

          // Find current stop index
          if (trip != null && trip['current_stop_id'] != null) {
            final idx = stops.indexWhere((s) => s['id'] == trip['current_stop_id']);
            if (idx >= 0) _currentStopIndex = idx;
          }
        });

        // Load passenger counts to calculate on-board
        await _calculateOnBoardCount();
      }
    } catch (e) {
      debugPrint('Error loading data: $e');
      setState(() => _isLoading = false);
    }
  }

  Future<void> _calculateOnBoardCount() async {
    try {
      final counts = await SupabaseService.getPassengerCounts(widget.tripId);
      int boarded = 0;
      int alighted = 0;
      for (final count in counts) {
        boarded += (count['boarded_count'] as int?) ?? 0;
        alighted += (count['alighted_count'] as int?) ?? 0;
      }
      setState(() => _onBoardCount = boarded - alighted);
    } catch (e) {
      debugPrint('Error calculating on-board count: $e');
    }
  }

  Future<void> _advanceToNextStop() async {
    if (_currentStopIndex >= _stops.length - 1) return;

    HapticFeedback.mediumImpact();

    // Show passenger count dialog before advancing
    final counts = await _showPassengerCountDialog();
    if (counts == null) return; // User cancelled

    setState(() => _isAdvancing = true);

    // Record passenger counts for current stop
    final currentStop = _stops[_currentStopIndex];
    await SupabaseService.recordPassengerCount(
      tripId: widget.tripId,
      stopId: currentStop['id'],
      boarded: counts['boarded'] ?? 0,
      alighted: counts['alighted'] ?? 0,
    );

    final nextStop = _stops[_currentStopIndex + 1];
    final success = await SupabaseService.advanceToNextStop(widget.tripId, nextStop['id']);

    if (success) {
      setState(() {
        _currentStopIndex++;
        _onBoardCount += (counts['boarded'] ?? 0) - (counts['alighted'] ?? 0);
        _isAdvancing = false;
      });
    } else {
      setState(() => _isAdvancing = false);
      if (mounted) AppSnackbar.error(context, 'Failed to advance stop');
    }
  }

  Future<Map<String, int>?> _showPassengerCountDialog() async {
    int boarded = 0;
    int alighted = 0;

    return showDialog<Map<String, int>>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          backgroundColor: context.cardColor,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          title: Text(
            'Passenger Count',
            style: TextStyle(color: context.textColor, fontWeight: FontWeight.w700),
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'At ${_stops[_currentStopIndex]['name']}',
                style: TextStyle(color: context.mutedColor, fontSize: 14),
              ),
              const SizedBox(height: 24),
              // Boarded counter
              _buildCounterRow(
                context,
                'Boarded',
                Icons.arrow_upward,
                Colors.green,
                boarded,
                (val) => setDialogState(() => boarded = val),
              ),
              const SizedBox(height: 16),
              // Alighted counter
              _buildCounterRow(
                context,
                'Alighted',
                Icons.arrow_downward,
                Colors.orange,
                alighted,
                (val) => setDialogState(() => alighted = val),
                max: _onBoardCount + boarded,
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, null),
              child: Text('Cancel', style: TextStyle(color: context.mutedColor)),
            ),
            ElevatedButton(
              onPressed: () => Navigator.pop(ctx, {'boarded': boarded, 'alighted': alighted}),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.yellow,
                foregroundColor: AppColors.darkBg,
              ),
              child: const Text('Confirm'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCounterRow(
    BuildContext context,
    String label,
    IconData icon,
    Color color,
    int value,
    Function(int) onChanged, {
    int max = 99,
  }) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, color: Colors.white, size: 20),
          ),
          const SizedBox(width: 12),
          Text(
            label,
            style: TextStyle(
              color: context.textColor,
              fontSize: 16,
              fontWeight: FontWeight.w600,
            ),
          ),
          const Spacer(),
          // Minus button
          IconButton(
            onPressed: value > 0 ? () => onChanged(value - 1) : null,
            icon: Container(
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(
                color: value > 0 ? color : context.borderColor,
                borderRadius: BorderRadius.circular(6),
              ),
              child: Icon(Icons.remove, color: Colors.white, size: 18),
            ),
          ),
          Container(
            width: 40,
            alignment: Alignment.center,
            child: Text(
              '$value',
              style: TextStyle(
                color: context.textColor,
                fontSize: 20,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          // Plus button
          IconButton(
            onPressed: value < max ? () => onChanged(value + 1) : null,
            icon: Container(
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(
                color: value < max ? color : context.borderColor,
                borderRadius: BorderRadius.circular(6),
              ),
              child: Icon(Icons.add, color: Colors.white, size: 18),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _completeTrip() async {
    HapticFeedback.mediumImpact();

    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.cardColor,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text('Complete Trip?', style: TextStyle(color: context.textColor, fontWeight: FontWeight.w700)),
        content: Text(
          'This will end the bus trip and return you to normal on-demand mode.',
          style: TextStyle(color: context.mutedColor),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('Cancel', style: TextStyle(color: context.mutedColor)),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.green,
              foregroundColor: Colors.white,
            ),
            child: const Text('Complete'),
          ),
        ],
      ),
    );

    if (confirm != true) return;

    setState(() => _isCompleting = true);

    final success = await SupabaseService.completeBusTrip(widget.tripId, widget.assignment['id']);

    if (success && mounted) {
      final driverState = context.read<DriverState>();
      driverState.exitBusMode();

      AppSnackbar.success(context, 'Trip completed');
      Navigator.of(context).popUntil((route) => route.isFirst);
    } else {
      setState(() => _isCompleting = false);
      if (mounted) AppSnackbar.error(context, 'Failed to complete trip');
    }
  }

  @override
  Widget build(BuildContext context) {
    final route = widget.assignment['route'] as Map<String, dynamic>?;
    final vehicle = widget.assignment['vehicle'] as Map<String, dynamic>?;

    return Scaffold(
      backgroundColor: context.bgColor,
      appBar: AppBar(
        backgroundColor: AppColors.yellow,
        elevation: 0,
        automaticallyImplyLeading: false,
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: AppColors.darkBg.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.directions_bus, color: AppColors.darkBg, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'BUS MODE',
                    style: TextStyle(
                      color: AppColors.darkBg.withValues(alpha: 0.7),
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1,
                    ),
                  ),
                  Text(
                    route?['name'] ?? 'Bus Trip',
                    style: const TextStyle(
                      color: AppColors.darkBg,
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          Container(
            margin: const EdgeInsets.only(right: 16),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: AppColors.darkBg,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Row(
              children: [
                const Icon(Icons.people, color: AppColors.yellow, size: 18),
                const SizedBox(width: 6),
                Text(
                  '$_onBoardCount',
                  style: const TextStyle(
                    color: AppColors.yellow,
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: AppColors.yellow))
          : Column(
              children: [
                // Route info bar
                Container(
                  padding: const EdgeInsets.all(16),
                  color: context.cardColor,
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '${route?['origin_label'] ?? ''} → ${route?['destination_label'] ?? ''}',
                              style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w500),
                            ),
                            if (vehicle != null)
                              Text(
                                '${vehicle['name']} • ${vehicle['plate_no']}',
                                style: TextStyle(color: context.mutedColor, fontSize: 13),
                              ),
                          ],
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: Colors.green.withValues(alpha: 0.2),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Row(
                          children: [
                            Container(
                              width: 8,
                              height: 8,
                              decoration: const BoxDecoration(
                                color: Colors.green,
                                shape: BoxShape.circle,
                              ),
                            ),
                            const SizedBox(width: 6),
                            const Text(
                              'LIVE',
                              style: TextStyle(
                                color: Colors.green,
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),

                // Stops list
                Expanded(
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: _stops.length,
                    itemBuilder: (context, index) {
                      final stop = _stops[index];
                      final isCurrent = index == _currentStopIndex;
                      final isPast = index < _currentStopIndex;

                      return Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Timeline
                          SizedBox(
                            width: 40,
                            child: Column(
                              children: [
                                Container(
                                  width: 24,
                                  height: 24,
                                  decoration: BoxDecoration(
                                    color: isCurrent
                                        ? AppColors.yellow
                                        : isPast
                                            ? Colors.green
                                            : context.cardColor,
                                    shape: BoxShape.circle,
                                    border: Border.all(
                                      color: isCurrent
                                          ? AppColors.yellow
                                          : isPast
                                              ? Colors.green
                                              : context.borderColor,
                                      width: 2,
                                    ),
                                  ),
                                  child: Center(
                                    child: isPast
                                        ? const Icon(Icons.check, color: Colors.white, size: 14)
                                        : Text(
                                            '${index + 1}',
                                            style: TextStyle(
                                              color: isCurrent ? AppColors.darkBg : context.mutedColor,
                                              fontWeight: FontWeight.w700,
                                              fontSize: 11,
                                            ),
                                          ),
                                  ),
                                ),
                                if (index < _stops.length - 1)
                                  Container(
                                    width: 2,
                                    height: 50,
                                    color: isPast ? Colors.green : context.borderColor,
                                  ),
                              ],
                            ),
                          ),

                          // Stop card
                          Expanded(
                            child: Container(
                              margin: const EdgeInsets.only(bottom: 12),
                              padding: const EdgeInsets.all(16),
                              decoration: BoxDecoration(
                                color: isCurrent
                                    ? AppColors.yellow.withValues(alpha: 0.15)
                                    : context.cardColor,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(
                                  color: isCurrent ? AppColors.yellow : context.borderColor,
                                  width: isCurrent ? 2 : 1,
                                ),
                              ),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        if (isCurrent)
                                          Container(
                                            margin: const EdgeInsets.only(bottom: 6),
                                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                            decoration: BoxDecoration(
                                              color: AppColors.yellow,
                                              borderRadius: BorderRadius.circular(4),
                                            ),
                                            child: const Text(
                                              'CURRENT STOP',
                                              style: TextStyle(
                                                color: AppColors.darkBg,
                                                fontSize: 10,
                                                fontWeight: FontWeight.w700,
                                              ),
                                            ),
                                          ),
                                        Text(
                                          stop['name'] ?? 'Stop ${index + 1}',
                                          style: TextStyle(
                                            color: isPast ? context.mutedColor : context.textColor,
                                            fontSize: 16,
                                            fontWeight: isCurrent ? FontWeight.w700 : FontWeight.w500,
                                            decoration: isPast ? TextDecoration.lineThrough : null,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  if (isPast)
                                    Icon(Icons.check_circle, color: Colors.green, size: 24),
                                ],
                              ),
                            ),
                          ),
                        ],
                      );
                    },
                  ),
                ),

                // Bottom action bar
                Container(
                  padding: EdgeInsets.only(
                    left: 16,
                    right: 16,
                    top: 16,
                    bottom: MediaQuery.of(context).padding.bottom + 16,
                  ),
                  decoration: BoxDecoration(
                    color: context.cardColor,
                    border: Border(top: BorderSide(color: context.borderColor)),
                  ),
                  child: Row(
                    children: [
                      // On-board count
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                        decoration: BoxDecoration(
                          color: context.bgColor,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Row(
                          children: [
                            Icon(Icons.people, color: context.mutedColor, size: 20),
                            const SizedBox(width: 8),
                            Text(
                              '$_onBoardCount on board',
                              style: TextStyle(
                                color: context.textColor,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 12),
                      // Next Stop / Complete button
                      Expanded(
                        child: _currentStopIndex >= _stops.length - 1
                            ? ElevatedButton(
                                onPressed: _isCompleting ? null : _completeTrip,
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: Colors.green,
                                  foregroundColor: Colors.white,
                                  padding: const EdgeInsets.symmetric(vertical: 16),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                ),
                                child: _isCompleting
                                    ? const SizedBox(
                                        width: 20,
                                        height: 20,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                          color: Colors.white,
                                        ),
                                      )
                                    : const Row(
                                        mainAxisAlignment: MainAxisAlignment.center,
                                        children: [
                                          Icon(Icons.check_circle),
                                          SizedBox(width: 8),
                                          Text(
                                            'Complete Trip',
                                            style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                                          ),
                                        ],
                                      ),
                              )
                            : ElevatedButton(
                                onPressed: _isAdvancing ? null : _advanceToNextStop,
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: AppColors.yellow,
                                  foregroundColor: AppColors.darkBg,
                                  padding: const EdgeInsets.symmetric(vertical: 16),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                ),
                                child: _isAdvancing
                                    ? const SizedBox(
                                        width: 20,
                                        height: 20,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                          color: AppColors.darkBg,
                                        ),
                                      )
                                    : Row(
                                        mainAxisAlignment: MainAxisAlignment.center,
                                        children: [
                                          const Icon(Icons.arrow_forward),
                                          const SizedBox(width: 8),
                                          Text(
                                            'Next: ${_stops.length > _currentStopIndex + 1 ? _stops[_currentStopIndex + 1]['name'] : ''}',
                                            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                        ],
                                      ),
                              ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
    );
  }
}
