import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:image_picker/image_picker.dart';
import 'dart:math' as math;
import '../theme/app_theme.dart';
import '../providers/driver_state.dart';
import '../services/supabase_service.dart';

class VehicleChecklistScreen extends StatefulWidget {
  const VehicleChecklistScreen({super.key});

  @override
  State<VehicleChecklistScreen> createState() => _VehicleChecklistScreenState();
}

enum CheckStatus { unchecked, ok, issue }

class _VehicleChecklistScreenState extends State<VehicleChecklistScreen>
    with TickerProviderStateMixin {
  late AnimationController _progressController;
  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;

  final Map<String, CheckStatus> _checklist = {};
  final Map<String, String> _issueNotes = {};
  final Map<String, List<File>> _issuePhotos = {};
  final ImagePicker _picker = ImagePicker();

  final List<_ChecklistCategory> _categories = [
    _ChecklistCategory(
      name: 'Exterior',
      icon: Icons.directions_car,
      items: [
        _ChecklistItem(
          key: 'tires',
          icon: Icons.tire_repair,
          title: 'Tires & Wheels',
          description: 'Properly inflated, good tread depth, no damage',
        ),
        _ChecklistItem(
          key: 'lights',
          icon: Icons.highlight,
          title: 'Lights & Signals',
          description: 'Headlights, brake lights, indicators working',
        ),
        _ChecklistItem(
          key: 'body',
          icon: Icons.car_repair,
          title: 'Body Condition',
          description: 'No new dents, scratches, or damage',
        ),
      ],
    ),
    _ChecklistCategory(
      name: 'Interior',
      icon: Icons.airline_seat_recline_normal,
      items: [
        _ChecklistItem(
          key: 'cleanliness',
          icon: Icons.cleaning_services,
          title: 'Cleanliness',
          description: 'Interior clean, no trash or odors',
        ),
        _ChecklistItem(
          key: 'ac',
          icon: Icons.ac_unit,
          title: 'Climate Control',
          description: 'AC/heater functioning properly',
        ),
        _ChecklistItem(
          key: 'seatbelts',
          icon: Icons.airline_seat_legroom_normal,
          title: 'Seatbelts',
          description: 'All seatbelts working and accessible',
        ),
      ],
    ),
    _ChecklistCategory(
      name: 'Safety & Docs',
      icon: Icons.verified_user,
      items: [
        _ChecklistItem(
          key: 'fuel',
          icon: Icons.local_gas_station,
          title: 'Fuel Level',
          description: 'At least half tank for the shift',
        ),
        _ChecklistItem(
          key: 'documents',
          icon: Icons.folder_copy,
          title: 'Documents',
          description: 'License, registration, insurance ready',
        ),
        _ChecklistItem(
          key: 'safety',
          icon: Icons.medical_services,
          title: 'Safety Kit',
          description: 'First aid kit and fire extinguisher present',
        ),
      ],
    ),
  ];

  @override
  void initState() {
    super.initState();
    _progressController = AnimationController(
      duration: const Duration(milliseconds: 800),
      vsync: this,
    );
    _pulseController = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    )..repeat(reverse: true);
    _pulseAnimation = Tween<double>(begin: 1.0, end: 1.08).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );

    for (var cat in _categories) {
      for (var item in cat.items) {
        _checklist[item.key] = CheckStatus.unchecked;
      }
    }
  }

  @override
  void dispose() {
    _progressController.dispose();
    _pulseController.dispose();
    super.dispose();
  }

  int get _totalItems => _checklist.length;
  int get _checkedCount =>
      _checklist.values.where((v) => v != CheckStatus.unchecked).length;
  int get _issueCount =>
      _checklist.values.where((v) => v == CheckStatus.issue).length;
  bool get _allChecked => _checkedCount == _totalItems;
  bool get _hasIssues => _issueCount > 0;
  double get _progress => _checkedCount / _totalItems;

  void _updateProgress() {
    _progressController.animateTo(_progress);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.bgColor,
      body: CustomScrollView(
        slivers: [
          // Animated header
          SliverToBoxAdapter(
            child: _buildHeader(context),
          ),

          // Quick actions
          SliverToBoxAdapter(
            child: _buildQuickActions(context),
          ),

          // Categories
          SliverPadding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            sliver: SliverList(
              delegate: SliverChildBuilderDelegate(
                (context, index) => _buildCategorySection(context, _categories[index]),
                childCount: _categories.length,
              ),
            ),
          ),

          // Bottom spacing
          const SliverToBoxAdapter(
            child: SizedBox(height: 120),
          ),
        ],
      ),
      bottomSheet: _buildBottomBar(context),
    );
  }

  Widget _buildHeader(BuildContext context) {
    return Container(
      padding: EdgeInsets.only(
        top: MediaQuery.of(context).padding.top + 16,
        left: 20,
        right: 20,
        bottom: 24,
      ),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            AppColors.yellow.withValues(alpha: 0.15),
            context.bgColor,
          ],
        ),
      ),
      child: Column(
        children: [
          // Top bar
          Row(
            children: [
              GestureDetector(
                onTap: () => Navigator.pop(context, false),
                child: Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: context.cardColor,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: context.borderColor),
                  ),
                  child: Icon(Icons.close, color: context.textColor, size: 22),
                ),
              ),
              const Spacer(),
              Text(
                'Pre-Trip Check',
                style: TextStyle(
                  color: context.textColor,
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const Spacer(),
              const SizedBox(width: 44),
            ],
          ),

          const SizedBox(height: 32),

          // Progress ring
          Stack(
            alignment: Alignment.center,
            children: [
              // Outer glow
              if (_allChecked && !_hasIssues)
                AnimatedBuilder(
                  animation: _pulseAnimation,
                  builder: (context, child) => Transform.scale(
                    scale: _pulseAnimation.value,
                    child: Container(
                      width: 160,
                      height: 160,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(
                            color: AppColors.success.withValues(alpha: 0.3),
                            blurRadius: 30,
                            spreadRadius: 5,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),

              // Progress ring
              SizedBox(
                width: 150,
                height: 150,
                child: AnimatedBuilder(
                  animation: _progressController,
                  builder: (context, child) => CustomPaint(
                    painter: _ProgressRingPainter(
                      progress: _progressController.value,
                      hasIssues: _hasIssues,
                      bgColor: context.borderColor,
                    ),
                  ),
                ),
              ),

              // Center content
              Column(
                children: [
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 300),
                    child: _allChecked
                        ? Icon(
                            _hasIssues ? Icons.warning_rounded : Icons.check_circle,
                            key: ValueKey(_hasIssues),
                            color: _hasIssues ? AppColors.warning : AppColors.success,
                            size: 44,
                          )
                        : Text(
                            '${(_progress * 100).round()}%',
                            key: const ValueKey('percent'),
                            style: TextStyle(
                              color: context.textColor,
                              fontSize: 32,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    _allChecked
                        ? (_hasIssues ? '$_issueCount issue${_issueCount > 1 ? 's' : ''}' : 'All good!')
                        : '$_checkedCount / $_totalItems',
                    style: TextStyle(
                      color: context.mutedColor,
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ],
          ),

          const SizedBox(height: 24),

          // Status message
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 300),
            child: Container(
              key: ValueKey('$_allChecked-$_hasIssues'),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              decoration: BoxDecoration(
                color: _allChecked
                    ? (_hasIssues
                        ? AppColors.warning.withValues(alpha: 0.15)
                        : AppColors.success.withValues(alpha: 0.15))
                    : context.cardColor,
                borderRadius: BorderRadius.circular(30),
                border: Border.all(
                  color: _allChecked
                      ? (_hasIssues
                          ? AppColors.warning.withValues(alpha: 0.3)
                          : AppColors.success.withValues(alpha: 0.3))
                      : context.borderColor,
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    _allChecked
                        ? (_hasIssues ? Icons.warning_amber : Icons.verified)
                        : Icons.touch_app,
                    color: _allChecked
                        ? (_hasIssues ? AppColors.warning : AppColors.success)
                        : AppColors.yellow,
                    size: 18,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    _allChecked
                        ? (_hasIssues ? 'Issues will be reported' : 'Ready to go online')
                        : 'Swipe right for OK, left for Issue',
                    style: TextStyle(
                      color: context.textColor,
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
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

  Widget _buildQuickActions(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
      child: Row(
        children: [
          Expanded(
            child: _buildQuickActionButton(
              context,
              icon: Icons.check_circle_outline,
              label: 'All OK',
              color: AppColors.success,
              onTap: () {
                HapticFeedback.mediumImpact();
                setState(() {
                  for (var key in _checklist.keys) {
                    if (_checklist[key] == CheckStatus.unchecked) {
                      _checklist[key] = CheckStatus.ok;
                    }
                  }
                });
                _updateProgress();
              },
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: _buildQuickActionButton(
              context,
              icon: Icons.refresh,
              label: 'Reset All',
              color: context.mutedColor,
              onTap: () {
                HapticFeedback.lightImpact();
                setState(() {
                  for (var key in _checklist.keys) {
                    _checklist[key] = CheckStatus.unchecked;
                  }
                  _issueNotes.clear();
                });
                _updateProgress();
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildQuickActionButton(
    BuildContext context, {
    required IconData icon,
    required String label,
    required Color color,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: color.withValues(alpha: 0.3)),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: color, size: 20),
            const SizedBox(width: 8),
            Text(
              label,
              style: TextStyle(
                color: color,
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCategorySection(BuildContext context, _ChecklistCategory category) {
    final categoryItems = category.items;
    final checkedInCategory = categoryItems.where((i) => _checklist[i.key] != CheckStatus.unchecked).length;
    final allCheckedInCategory = checkedInCategory == categoryItems.length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Category header
        Padding(
          padding: const EdgeInsets.only(bottom: 12, top: 8),
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: allCheckedInCategory
                      ? AppColors.success.withValues(alpha: 0.15)
                      : AppColors.yellow.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(
                  allCheckedInCategory ? Icons.check : category.icon,
                  color: allCheckedInCategory ? AppColors.success : AppColors.yellow,
                  size: 20,
                ),
              ),
              const SizedBox(width: 12),
              Text(
                category.name,
                style: TextStyle(
                  color: context.textColor,
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: allCheckedInCategory
                      ? AppColors.success.withValues(alpha: 0.15)
                      : context.cardColor,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  '$checkedInCategory/${categoryItems.length}',
                  style: TextStyle(
                    color: allCheckedInCategory ? AppColors.success : context.mutedColor,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ),

        // Items
        ...categoryItems.map((item) => _buildChecklistItem(context, item)),

        const SizedBox(height: 16),
      ],
    );
  }

  Widget _buildChecklistItem(BuildContext context, _ChecklistItem item) {
    final status = _checklist[item.key]!;
    final isOk = status == CheckStatus.ok;
    final hasIssue = status == CheckStatus.issue;
    final isChecked = status != CheckStatus.unchecked;

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Dismissible(
        key: Key(item.key),
        confirmDismiss: (direction) async {
          HapticFeedback.mediumImpact();
          if (direction == DismissDirection.startToEnd) {
            setState(() {
              _checklist[item.key] = CheckStatus.ok;
              _issueNotes.remove(item.key);
            });
            _updateProgress();
          } else {
            _showIssueDialog(context, item);
          }
          return false;
        },
        background: Container(
          alignment: Alignment.centerLeft,
          padding: const EdgeInsets.only(left: 24),
          decoration: BoxDecoration(
            color: AppColors.success,
            borderRadius: BorderRadius.circular(16),
          ),
          child: const Row(
            children: [
              Icon(Icons.check, color: Colors.white, size: 28),
              SizedBox(width: 8),
              Text('OK', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 16)),
            ],
          ),
        ),
        secondaryBackground: Container(
          alignment: Alignment.centerRight,
          padding: const EdgeInsets.only(right: 24),
          decoration: BoxDecoration(
            color: AppColors.warning,
            borderRadius: BorderRadius.circular(16),
          ),
          child: const Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              Text('Issue', style: TextStyle(color: Colors.black, fontWeight: FontWeight.w700, fontSize: 16)),
              SizedBox(width: 8),
              Icon(Icons.warning, color: Colors.black, size: 28),
            ],
          ),
        ),
        child: GestureDetector(
          onTap: () {
            HapticFeedback.selectionClick();
            if (isChecked) {
              setState(() {
                _checklist[item.key] = CheckStatus.unchecked;
                _issueNotes.remove(item.key);
              });
            } else {
              setState(() => _checklist[item.key] = CheckStatus.ok);
            }
            _updateProgress();
          },
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: isOk
                  ? AppColors.success.withValues(alpha: 0.08)
                  : hasIssue
                      ? AppColors.error.withValues(alpha: 0.12)
                      : context.cardColor,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: isOk
                    ? AppColors.success.withValues(alpha: 0.5)
                    : hasIssue
                        ? AppColors.error
                        : context.borderColor,
                width: hasIssue ? 2.5 : (isChecked ? 2 : 1),
              ),
              boxShadow: hasIssue
                  ? [
                      BoxShadow(
                        color: AppColors.error.withValues(alpha: 0.3),
                        blurRadius: 12,
                        spreadRadius: 0,
                        offset: const Offset(0, 2),
                      ),
                    ]
                  : null,
            ),
            child: Row(
              children: [
                // Status indicator
                AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: isOk
                        ? AppColors.success
                        : hasIssue
                            ? AppColors.error
                            : context.bgColor,
                    borderRadius: BorderRadius.circular(14),
                    border: isChecked
                        ? null
                        : Border.all(color: context.borderColor, width: 2),
                    boxShadow: hasIssue
                        ? [
                            BoxShadow(
                              color: AppColors.error.withValues(alpha: 0.5),
                              blurRadius: 8,
                              spreadRadius: 0,
                            ),
                          ]
                        : null,
                  ),
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 200),
                    child: Icon(
                      isOk
                          ? Icons.check
                          : hasIssue
                              ? Icons.warning_rounded
                              : item.icon,
                      key: ValueKey(status),
                      color: isChecked ? Colors.white : context.mutedColor,
                      size: 24,
                    ),
                  ),
                ),
                const SizedBox(width: 14),

                // Content
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        item.title,
                        style: TextStyle(
                          color: context.textColor,
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        hasIssue && _issueNotes[item.key] != null
                            ? _issueNotes[item.key]!
                            : item.description,
                        style: TextStyle(
                          color: hasIssue ? AppColors.error : context.mutedColor,
                          fontSize: 12,
                          fontWeight: hasIssue ? FontWeight.w500 : FontWeight.normal,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),

                // Status badge
                if (isChecked)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: isOk
                          ? AppColors.success.withValues(alpha: 0.15)
                          : AppColors.error,
                      borderRadius: BorderRadius.circular(20),
                      boxShadow: hasIssue
                          ? [
                              BoxShadow(
                                color: AppColors.error.withValues(alpha: 0.4),
                                blurRadius: 6,
                              ),
                            ]
                          : null,
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (hasIssue) ...[
                          const Icon(Icons.error, color: Colors.white, size: 14),
                          const SizedBox(width: 4),
                        ],
                        Text(
                          isOk ? 'OK' : 'ISSUE',
                          style: TextStyle(
                            color: isOk ? AppColors.success : Colors.white,
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildBottomBar(BuildContext context) {
    return Container(
      padding: EdgeInsets.fromLTRB(
        20,
        16,
        20,
        MediaQuery.of(context).padding.bottom + 16,
      ),
      decoration: BoxDecoration(
        color: context.cardColor,
        border: Border(top: BorderSide(color: context.borderColor)),
      ),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            // Info
            Expanded(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _allChecked
                        ? (_hasIssues ? 'Continue with issues?' : 'Ready to go!')
                        : 'Complete all checks',
                    style: TextStyle(
                      color: context.textColor,
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    _allChecked
                        ? (_hasIssues ? 'Issues will be reported to admin' : 'Vehicle inspection complete')
                        : '${_totalItems - _checkedCount} items remaining',
                    style: TextStyle(
                      color: context.mutedColor,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),

            // Button
            GestureDetector(
              onTap: _allChecked
                  ? () async {
                      HapticFeedback.heavyImpact();
                      final driverState = context.read<DriverState>();
                      final allItems = _checklist.map((k, v) => MapEntry(k, v == CheckStatus.ok));

                      // Validate driver ID exists
                      if (driverState.driverId.isEmpty) {
                        debugPrint('Cannot save checklist: driverId is empty');
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Error: Driver not logged in properly')),
                        );
                        return;
                      }

                      try {
                        await SupabaseService.saveVehicleChecklist(
                          driverId: driverState.driverId,
                          driverName: driverState.driverName,
                          vehicleNumber: driverState.vehicleNumber,
                          hasIssues: _hasIssues,
                          issues: _issueNotes,
                          allItems: allItems,
                          issuePhotos: _issuePhotos,
                        );
                        debugPrint('Checklist saved successfully');
                      } catch (e) {
                        debugPrint('Failed to save checklist: $e');
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text('Failed to save: $e')),
                          );
                        }
                        return;
                      }

                      if (context.mounted) {
                        Navigator.pop(context, {
                          'completed': true,
                          'hasIssues': _hasIssues,
                          'issues': _issueNotes,
                        });
                      }
                    }
                  : null,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 16),
                decoration: BoxDecoration(
                  color: _allChecked
                      ? (_hasIssues ? AppColors.warning : AppColors.success)
                      : context.borderColor,
                  borderRadius: BorderRadius.circular(16),
                  boxShadow: _allChecked
                      ? [
                          BoxShadow(
                            color: (_hasIssues ? AppColors.warning : AppColors.success)
                                .withValues(alpha: 0.4),
                            blurRadius: 12,
                            offset: const Offset(0, 4),
                          ),
                        ]
                      : null,
                ),
                child: Row(
                  children: [
                    Icon(
                      _hasIssues ? Icons.check_circle : Icons.power_settings_new,
                      color: _allChecked
                          ? (_hasIssues ? Colors.black : Colors.white)
                          : context.mutedColor,
                      size: 22,
                    ),
                    const SizedBox(width: 10),
                    Text(
                      _hasIssues ? 'Continue' : 'Go Online',
                      style: TextStyle(
                        color: _allChecked
                            ? (_hasIssues ? Colors.black : Colors.white)
                            : context.mutedColor,
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showIssueDialog(BuildContext context, _ChecklistItem item) {
    final controller = TextEditingController(text: _issueNotes[item.key] ?? '');
    List<File> tempPhotos = List.from(_issuePhotos[item.key] ?? []);

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) => Container(
        padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
        decoration: BoxDecoration(
          color: context.cardColor,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Handle
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: context.borderColor,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 24),

              // Header
              Row(
                children: [
                  Container(
                    width: 50,
                    height: 50,
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [
                          AppColors.warning,
                          AppColors.warning.withValues(alpha: 0.7),
                        ],
                      ),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: const Icon(Icons.warning_rounded, color: Colors.black, size: 28),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Report Issue',
                          style: TextStyle(
                            color: context.textColor,
                            fontSize: 20,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        Text(
                          item.title,
                          style: TextStyle(
                            color: AppColors.warning,
                            fontSize: 14,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),

              // Quick issue buttons
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _buildQuickIssueChip(context, controller, 'Needs repair'),
                  _buildQuickIssueChip(context, controller, 'Not working'),
                  _buildQuickIssueChip(context, controller, 'Low level'),
                  _buildQuickIssueChip(context, controller, 'Damaged'),
                ],
              ),
              const SizedBox(height: 16),

              // Text field
              TextField(
                controller: controller,
                maxLines: 3,
                autofocus: true,
                style: TextStyle(color: context.textColor),
                decoration: InputDecoration(
                  hintText: 'Describe the issue in detail...',
                  hintStyle: TextStyle(color: context.mutedColor),
                  filled: true,
                  fillColor: context.bgColor,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: BorderSide.none,
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: const BorderSide(color: AppColors.warning, width: 2),
                  ),
                  contentPadding: const EdgeInsets.all(16),
                ),
              ),
              const SizedBox(height: 16),

              // Photo section
              Text(
                'Add Photos (optional)',
                style: TextStyle(
                  color: context.textColor,
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 8),
              SizedBox(
                height: 80,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  children: [
                    // Add photo button
                    GestureDetector(
                      onTap: () async {
                        final source = await showModalBottomSheet<ImageSource>(
                          context: ctx,
                          backgroundColor: context.cardColor,
                          shape: const RoundedRectangleBorder(
                            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
                          ),
                          builder: (c) => Padding(
                            padding: const EdgeInsets.all(20),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                ListTile(
                                  leading: Icon(Icons.camera_alt, color: AppColors.yellow),
                                  title: Text('Take Photo', style: TextStyle(color: context.textColor)),
                                  onTap: () => Navigator.pop(c, ImageSource.camera),
                                ),
                                ListTile(
                                  leading: Icon(Icons.photo_library, color: AppColors.yellow),
                                  title: Text('Choose from Gallery', style: TextStyle(color: context.textColor)),
                                  onTap: () => Navigator.pop(c, ImageSource.gallery),
                                ),
                              ],
                            ),
                          ),
                        );
                        if (source != null) {
                          final picked = await _picker.pickImage(source: source, imageQuality: 80);
                          if (picked != null) {
                            setModalState(() {
                              tempPhotos.add(File(picked.path));
                            });
                          }
                        }
                      },
                      child: Container(
                        width: 80,
                        height: 80,
                        margin: const EdgeInsets.only(right: 8),
                        decoration: BoxDecoration(
                          color: context.bgColor,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: context.borderColor, width: 2, style: BorderStyle.solid),
                        ),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.add_a_photo, color: AppColors.warning, size: 28),
                            const SizedBox(height: 4),
                            Text('Add', style: TextStyle(color: context.mutedColor, fontSize: 11)),
                          ],
                        ),
                      ),
                    ),
                    // Photo thumbnails
                    ...tempPhotos.asMap().entries.map((entry) => Stack(
                      children: [
                        Container(
                          width: 80,
                          height: 80,
                          margin: const EdgeInsets.only(right: 8),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(12),
                            image: DecorationImage(
                              image: FileImage(entry.value),
                              fit: BoxFit.cover,
                            ),
                          ),
                        ),
                        Positioned(
                          top: 4,
                          right: 12,
                          child: GestureDetector(
                            onTap: () {
                              setModalState(() {
                                tempPhotos.removeAt(entry.key);
                              });
                            },
                            child: Container(
                              padding: const EdgeInsets.all(4),
                              decoration: BoxDecoration(
                                color: Colors.black.withValues(alpha: 0.7),
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(Icons.close, color: Colors.white, size: 14),
                            ),
                          ),
                        ),
                      ],
                    )),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              // Buttons
              Row(
                children: [
                  Expanded(
                    child: GestureDetector(
                      onTap: () => Navigator.pop(ctx),
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        decoration: BoxDecoration(
                          color: context.bgColor,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: context.borderColor),
                        ),
                        child: Center(
                          child: Text(
                            'Cancel',
                            style: TextStyle(
                              color: context.textColor,
                              fontSize: 15,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: GestureDetector(
                      onTap: () {
                        HapticFeedback.mediumImpact();
                        setState(() {
                          _checklist[item.key] = CheckStatus.issue;
                          _issueNotes[item.key] = controller.text.trim().isEmpty
                              ? 'Issue reported'
                              : controller.text.trim();
                          _issuePhotos[item.key] = tempPhotos;
                        });
                        _updateProgress();
                        Navigator.pop(ctx);
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            colors: [
                              AppColors.warning,
                              AppColors.warning.withValues(alpha: 0.8),
                            ],
                          ),
                          borderRadius: BorderRadius.circular(14),
                          boxShadow: [
                            BoxShadow(
                              color: AppColors.warning.withValues(alpha: 0.4),
                              blurRadius: 12,
                              offset: const Offset(0, 4),
                            ),
                          ],
                        ),
                        child: const Center(
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.warning_amber, color: Colors.black, size: 20),
                              SizedBox(width: 8),
                              Text(
                                'Report Issue',
                                style: TextStyle(
                                  color: Colors.black,
                                  fontSize: 15,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      )),
    );
  }

  Widget _buildQuickIssueChip(BuildContext context, TextEditingController controller, String text) {
    return GestureDetector(
      onTap: () {
        HapticFeedback.selectionClick();
        controller.text = text;
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: context.bgColor,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: context.borderColor),
        ),
        child: Text(
          text,
          style: TextStyle(
            color: context.textColor,
            fontSize: 13,
            fontWeight: FontWeight.w500,
          ),
        ),
      ),
    );
  }
}

class _ProgressRingPainter extends CustomPainter {
  final double progress;
  final bool hasIssues;
  final Color bgColor;

  _ProgressRingPainter({
    required this.progress,
    required this.hasIssues,
    required this.bgColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2 - 8;
    const strokeWidth = 12.0;

    // Background ring
    final bgPaint = Paint()
      ..color = bgColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;

    canvas.drawCircle(center, radius, bgPaint);

    // Progress ring
    final progressColor = progress >= 1.0
        ? (hasIssues ? AppColors.warning : AppColors.success)
        : AppColors.yellow;

    final progressPaint = Paint()
      ..shader = SweepGradient(
        startAngle: -math.pi / 2,
        endAngle: 3 * math.pi / 2,
        colors: [
          progressColor.withValues(alpha: 0.5),
          progressColor,
        ],
      ).createShader(Rect.fromCircle(center: center, radius: radius))
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;

    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      -math.pi / 2,
      2 * math.pi * progress,
      false,
      progressPaint,
    );
  }

  @override
  bool shouldRepaint(_ProgressRingPainter oldDelegate) =>
      oldDelegate.progress != progress || oldDelegate.hasIssues != hasIssues;
}

class _ChecklistCategory {
  final String name;
  final IconData icon;
  final List<_ChecklistItem> items;

  _ChecklistCategory({
    required this.name,
    required this.icon,
    required this.items,
  });
}

class _ChecklistItem {
  final String key;
  final IconData icon;
  final String title;
  final String description;

  _ChecklistItem({
    required this.key,
    required this.icon,
    required this.title,
    required this.description,
  });
}
