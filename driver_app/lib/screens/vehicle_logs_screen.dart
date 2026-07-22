import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import '../theme/app_theme.dart';
import '../services/supabase_service.dart';
import '../utils/timezone_utils.dart';
import '../widgets/shimmer_loading.dart';
import '../widgets/app_snackbar.dart';

class VehicleLogsScreen extends StatefulWidget {
  const VehicleLogsScreen({super.key});

  @override
  State<VehicleLogsScreen> createState() => _VehicleLogsScreenState();
}

class _VehicleLogsScreenState extends State<VehicleLogsScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  List<Map<String, dynamic>> _logs = [];
  Map<String, dynamic> _stats = {};
  bool _isLoading = true;
  String _selectedFilter = 'all';

  final List<Map<String, dynamic>> _logTypes = [
    {'type': 'all', 'label': 'All', 'icon': Icons.apps_rounded, 'color': AppColors.yellow},
    {'type': 'fuel', 'label': 'Fuel', 'icon': Icons.local_gas_station_rounded, 'color': Colors.orange},
    {'type': 'maintenance', 'label': 'Service', 'icon': Icons.build_rounded, 'color': Colors.blue},
    {'type': 'repair', 'label': 'Repair', 'icon': Icons.handyman_rounded, 'color': Colors.red},
    {'type': 'cleaning', 'label': 'Cleaning', 'icon': Icons.cleaning_services_rounded, 'color': Colors.green},
  ];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _loadData();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    final logs = await SupabaseService.getVehicleLogs(
      logType: _selectedFilter == 'all' ? null : _selectedFilter,
    );
    final stats = await SupabaseService.getVehicleLogStats();
    setState(() {
      _logs = logs;
      _stats = stats;
      _isLoading = false;
    });
  }

  void _showAddDialog(String logType) {
    HapticFeedback.mediumImpact();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => AddLogSheet(
        logType: logType,
        onSaved: () {
          Navigator.pop(ctx);
          _loadData();
        },
      ),
    );
  }

  Future<void> _deleteLog(String id) async {
    HapticFeedback.mediumImpact();
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.cardColor,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text('Delete Log', style: TextStyle(color: context.textColor, fontWeight: FontWeight.w700)),
        content: Text('Are you sure you want to delete this log entry?', style: TextStyle(color: context.mutedColor)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('Cancel', style: TextStyle(color: context.mutedColor)),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete', style: TextStyle(color: AppColors.error, fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );

    if (confirm == true) {
      await SupabaseService.deleteVehicleLog(id);
      _loadData();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.bgColor,
      body: NestedScrollView(
        headerSliverBuilder: (context, innerBoxIsScrolled) => [
          SliverAppBar(
            backgroundColor: context.bgColor,
            elevation: 0,
            floating: true,
            pinned: true,
            expandedHeight: 120,
            leading: IconButton(
              icon: Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: context.cardColor,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(Icons.arrow_back, color: context.textColor, size: 20),
              ),
              onPressed: () => Navigator.pop(context),
            ),
            actions: [
              IconButton(
                icon: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: context.cardColor,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(Icons.refresh_rounded, color: context.textColor, size: 20),
                ),
                onPressed: _loadData,
              ),
              const SizedBox(width: 8),
            ],
            flexibleSpace: FlexibleSpaceBar(
              titlePadding: const EdgeInsets.only(left: 60, bottom: 16),
              title: Text(
                'Vehicle Logs',
                style: TextStyle(
                  color: context.textColor,
                  fontWeight: FontWeight.w800,
                  fontSize: 20,
                ),
              ),
            ),
            bottom: PreferredSize(
              preferredSize: const Size.fromHeight(48),
              child: Container(
                margin: const EdgeInsets.symmetric(horizontal: 20),
                decoration: BoxDecoration(
                  color: context.cardColor,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: TabBar(
                  controller: _tabController,
                  indicatorSize: TabBarIndicatorSize.tab,
                  indicator: BoxDecoration(
                    color: AppColors.yellow,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  indicatorPadding: const EdgeInsets.all(4),
                  labelColor: AppColors.darkBg,
                  unselectedLabelColor: context.mutedColor,
                  labelStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                  dividerColor: Colors.transparent,
                  tabs: const [
                    Tab(text: 'Logs'),
                    Tab(text: 'Analytics'),
                  ],
                ),
              ),
            ),
          ),
        ],
        body: TabBarView(
          controller: _tabController,
          children: [
            _buildLogsTab(),
            _buildAnalyticsTab(),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showTypeSelector(),
        backgroundColor: AppColors.yellow,
        elevation: 4,
        icon: const Icon(Icons.add_rounded, color: AppColors.darkBg),
        label: const Text('Add Log', style: TextStyle(color: AppColors.darkBg, fontWeight: FontWeight.w700)),
      ),
    );
  }

  void _showTypeSelector() {
    HapticFeedback.mediumImpact();
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
        decoration: BoxDecoration(
          color: context.cardColor,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        ),
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
            const SizedBox(height: 24),
            Row(
              children: [
                Icon(Icons.add_circle_outline_rounded, color: AppColors.yellow, size: 24),
                const SizedBox(width: 12),
                Text(
                  'New Log Entry',
                  style: TextStyle(color: context.textColor, fontSize: 20, fontWeight: FontWeight.w800),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              'Select the type of expense to log',
              style: TextStyle(color: context.mutedColor, fontSize: 14),
            ),
            const SizedBox(height: 24),
            GridView.count(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisCount: 2,
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: 1.6,
              children: [
                _buildTypeCard(Icons.local_gas_station_rounded, 'Fuel', 'fuel', Colors.orange),
                _buildTypeCard(Icons.build_rounded, 'Service', 'maintenance', Colors.blue),
                _buildTypeCard(Icons.handyman_rounded, 'Repair', 'repair', Colors.red),
                _buildTypeCard(Icons.cleaning_services_rounded, 'Cleaning', 'cleaning', Colors.green),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTypeCard(IconData icon, String label, String type, Color color) {
    return GestureDetector(
      onTap: () {
        HapticFeedback.lightImpact();
        Navigator.pop(context);
        _showAddDialog(type);
      },
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [color.withValues(alpha: 0.15), color.withValues(alpha: 0.05)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: color.withValues(alpha: 0.3)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, color: color, size: 22),
            ),
            const SizedBox(height: 12),
            Text(
              label,
              style: TextStyle(
                color: context.textColor,
                fontWeight: FontWeight.w700,
                fontSize: 15,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLogsTab() {
    return Column(
      children: [
        const SizedBox(height: 16),
        // Filter chips
        SizedBox(
          height: 44,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 20),
            itemCount: _logTypes.length,
            separatorBuilder: (_, __) => const SizedBox(width: 10),
            itemBuilder: (ctx, i) {
              final item = _logTypes[i];
              final isSelected = _selectedFilter == item['type'];
              return GestureDetector(
                onTap: () {
                  HapticFeedback.selectionClick();
                  setState(() => _selectedFilter = item['type']);
                  _loadData();
                },
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  decoration: BoxDecoration(
                    color: isSelected ? item['color'] : context.cardColor,
                    borderRadius: BorderRadius.circular(22),
                    border: Border.all(
                      color: isSelected ? item['color'] : context.borderColor,
                    ),
                    boxShadow: isSelected ? [
                      BoxShadow(
                        color: (item['color'] as Color).withValues(alpha: 0.3),
                        blurRadius: 8,
                        offset: const Offset(0, 2),
                      ),
                    ] : null,
                  ),
                  child: Row(
                    children: [
                      Icon(
                        item['icon'],
                        size: 18,
                        color: isSelected ? AppColors.darkBg : context.mutedColor,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        item['label'],
                        style: TextStyle(
                          color: isSelected ? AppColors.darkBg : context.textColor,
                          fontWeight: FontWeight.w600,
                          fontSize: 14,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 16),
        Expanded(
          child: _isLoading
              ? const ShimmerList(itemCount: 5)
              : _logs.isEmpty
                  ? _buildEmptyState()
                  : RefreshIndicator(
                      onRefresh: _loadData,
                      color: AppColors.yellow,
                      child: ListView.builder(
                        padding: const EdgeInsets.fromLTRB(20, 0, 20, 100),
                        itemCount: _logs.length,
                        itemBuilder: (ctx, i) => _buildLogCard(_logs[i], i),
                      ),
                    ),
        ),
      ],
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: context.cardColor,
              shape: BoxShape.circle,
            ),
            child: Icon(
              Icons.receipt_long_rounded,
              size: 48,
              color: context.mutedColor,
            ),
          ),
          const SizedBox(height: 20),
          Text(
            'No logs yet',
            style: TextStyle(
              color: context.textColor,
              fontSize: 18,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Tap + to add your first log entry',
            style: TextStyle(color: context.mutedColor, fontSize: 14),
          ),
        ],
      ),
    );
  }

  Widget _buildLogCard(Map<String, dynamic> log, int index) {
    final type = log['log_type'] ?? 'fuel';
    final amount = (log['amount'] ?? 0).toDouble();
    final odometer = log['odometer'];
    final notes = log['notes'] ?? '';
    final dateStr = log['log_date'] ?? '';
    final date = MaldivesTimezone.parse(dateStr);

    IconData icon;
    Color color;
    switch (type) {
      case 'fuel':
        icon = Icons.local_gas_station_rounded;
        color = Colors.orange;
        break;
      case 'maintenance':
        icon = Icons.build_rounded;
        color = Colors.blue;
        break;
      case 'repair':
        icon = Icons.handyman_rounded;
        color = Colors.red;
        break;
      case 'cleaning':
        icon = Icons.cleaning_services_rounded;
        color = Colors.green;
        break;
      default:
        icon = Icons.receipt_rounded;
        color = Colors.grey;
    }

    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.0, end: 1.0),
      duration: Duration(milliseconds: 200 + (index * 50)),
      builder: (context, value, child) {
        return Transform.translate(
          offset: Offset(0, 20 * (1 - value)),
          child: Opacity(opacity: value, child: child),
        );
      },
      child: Dismissible(
        key: Key(log['id'].toString()),
        direction: DismissDirection.endToStart,
        background: Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.only(right: 20),
          decoration: BoxDecoration(
            color: AppColors.error.withValues(alpha: 0.2),
            borderRadius: BorderRadius.circular(20),
          ),
          alignment: Alignment.centerRight,
          child: const Icon(Icons.delete_rounded, color: AppColors.error),
        ),
        confirmDismiss: (_) async {
          HapticFeedback.mediumImpact();
          return await showDialog<bool>(
            context: context,
            builder: (ctx) => AlertDialog(
              backgroundColor: context.cardColor,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
              title: Text('Delete Log', style: TextStyle(color: context.textColor)),
              content: Text('Delete this entry?', style: TextStyle(color: context.mutedColor)),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(ctx, false),
                  child: Text('Cancel', style: TextStyle(color: context.mutedColor)),
                ),
                TextButton(
                  onPressed: () => Navigator.pop(ctx, true),
                  child: const Text('Delete', style: TextStyle(color: AppColors.error)),
                ),
              ],
            ),
          ) ?? false;
        },
        onDismissed: (_) {
          SupabaseService.deleteVehicleLog(log['id']);
          setState(() => _logs.removeAt(index));
        },
        child: Container(
          margin: const EdgeInsets.only(bottom: 12),
          decoration: BoxDecoration(
            color: context.cardColor,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: context.borderColor),
          ),
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              borderRadius: BorderRadius.circular(20),
              onLongPress: () => _deleteLog(log['id']),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    // Icon with gradient background
                    Container(
                      width: 52,
                      height: 52,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [color.withValues(alpha: 0.2), color.withValues(alpha: 0.1)],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Icon(icon, color: color, size: 26),
                    ),
                    const SizedBox(width: 16),
                    // Details
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Text(
                                type == 'maintenance' ? 'Service' : type[0].toUpperCase() + type.substring(1),
                                style: TextStyle(
                                  color: context.textColor,
                                  fontWeight: FontWeight.w700,
                                  fontSize: 16,
                                ),
                              ),
                              const SizedBox(width: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                decoration: BoxDecoration(
                                  color: color.withValues(alpha: 0.15),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text(
                                  date != null ? DateFormat('MMM d').format(date) : '',
                                  style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w600),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Row(
                            children: [
                              if (odometer != null) ...[
                                Icon(Icons.speed_rounded, size: 14, color: context.mutedColor),
                                const SizedBox(width: 4),
                                Text(
                                  '${NumberFormat('#,###').format(odometer)} km',
                                  style: TextStyle(color: context.mutedColor, fontSize: 13),
                                ),
                              ],
                              if (odometer != null && notes.isNotEmpty)
                                Text(' • ', style: TextStyle(color: context.mutedColor)),
                              if (notes.isNotEmpty)
                                Expanded(
                                  child: Text(
                                    notes,
                                    style: TextStyle(color: context.mutedColor, fontSize: 13),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    // Amount
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          'MVR',
                          style: TextStyle(color: context.mutedColor, fontSize: 11, fontWeight: FontWeight.w500),
                        ),
                        Text(
                          NumberFormat('#,##0.00').format(amount),
                          style: TextStyle(
                            color: context.textColor,
                            fontWeight: FontWeight.w800,
                            fontSize: 18,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildAnalyticsTab() {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator(color: AppColors.yellow));
    }

    final fuelTotal = (_stats['fuel_total'] ?? 0).toDouble();
    final fuelCount = _stats['fuel_count'] ?? 0;
    final maintenanceTotal = (_stats['maintenance_total'] ?? 0).toDouble();
    final maintenanceCount = _stats['maintenance_count'] ?? 0;
    final repairTotal = (_stats['repair_total'] ?? 0).toDouble();
    final repairCount = _stats['repair_count'] ?? 0;
    final cleaningTotal = (_stats['cleaning_total'] ?? 0).toDouble();
    final cleaningCount = _stats['cleaning_count'] ?? 0;
    final total = (_stats['total'] ?? 0).toDouble();

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Total card
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [AppColors.yellow, Color(0xFFFFE066)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(24),
              boxShadow: [
                BoxShadow(
                  color: AppColors.yellow.withValues(alpha: 0.3),
                  blurRadius: 20,
                  offset: const Offset(0, 8),
                ),
              ],
            ),
            child: Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.calendar_month_rounded, color: AppColors.darkBg.withValues(alpha: 0.6), size: 18),
                    const SizedBox(width: 6),
                    Text(
                      'This Month',
                      style: TextStyle(color: AppColors.darkBg.withValues(alpha: 0.7), fontSize: 14, fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Text(
                  'MVR ${NumberFormat('#,##0.00').format(total)}',
                  style: const TextStyle(
                    color: AppColors.darkBg,
                    fontSize: 36,
                    fontWeight: FontWeight.w900,
                    letterSpacing: -1,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Total Expenses',
                  style: TextStyle(color: AppColors.darkBg.withValues(alpha: 0.6), fontSize: 14),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // Category breakdown
          Text(
            'By Category',
            style: TextStyle(
              color: context.textColor,
              fontSize: 18,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 16),

          // Stats grid
          GridView.count(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisCount: 2,
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: 1.3,
            children: [
              _buildStatCard('Fuel', fuelTotal, fuelCount, Icons.local_gas_station_rounded, Colors.orange),
              _buildStatCard('Service', maintenanceTotal, maintenanceCount, Icons.build_rounded, Colors.blue),
              _buildStatCard('Repair', repairTotal, repairCount, Icons.handyman_rounded, Colors.red),
              _buildStatCard('Cleaning', cleaningTotal, cleaningCount, Icons.cleaning_services_rounded, Colors.green),
            ],
          ),

          const SizedBox(height: 24),

          // Quick insights
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: context.cardColor,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: context.borderColor),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(Icons.insights_rounded, color: AppColors.yellow, size: 22),
                    const SizedBox(width: 10),
                    Text(
                      'Quick Insights',
                      style: TextStyle(
                        color: context.textColor,
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                _buildInsightRow(
                  'Fuel is your biggest expense',
                  '${((fuelTotal / (total > 0 ? total : 1)) * 100).toStringAsFixed(0)}% of total',
                  Icons.local_gas_station_rounded,
                  Colors.orange,
                ),
                const SizedBox(height: 12),
                _buildInsightRow(
                  'Average fuel cost',
                  'MVR ${(fuelCount > 0 ? fuelTotal / fuelCount : 0).toStringAsFixed(0)} per fill',
                  Icons.analytics_rounded,
                  Colors.blue,
                ),
              ],
            ),
          ),
          const SizedBox(height: 100),
        ],
      ),
    );
  }

  Widget _buildInsightRow(String title, String value, IconData icon, Color color) {
    return Row(
      children: [
        Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.15),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(icon, color: color, size: 18),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w600)),
              Text(value, style: TextStyle(color: context.mutedColor, fontSize: 12)),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildStatCard(String label, double amount, int count, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.cardColor,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: context.borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, color: color, size: 18),
              ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: context.bgColor,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  '$count',
                  style: TextStyle(color: context.mutedColor, fontSize: 12, fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
          const Spacer(),
          Text(
            label,
            style: TextStyle(color: context.mutedColor, fontSize: 13),
          ),
          const SizedBox(height: 4),
          Text(
            'MVR ${NumberFormat('#,##0').format(amount)}',
            style: TextStyle(
              color: context.textColor,
              fontSize: 18,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}

class AddLogSheet extends StatefulWidget {
  final String logType;
  final VoidCallback onSaved;

  const AddLogSheet({super.key, required this.logType, required this.onSaved});

  @override
  State<AddLogSheet> createState() => _AddLogSheetState();
}

class _AddLogSheetState extends State<AddLogSheet> {
  final _amountController = TextEditingController();
  final _odometerController = TextEditingController();
  final _notesController = TextEditingController();
  final _litersController = TextEditingController();
  DateTime _selectedDate = DateTime.now();
  bool _isSaving = false;
  String _fuelType = 'petrol';

  Color get _typeColor {
    switch (widget.logType) {
      case 'fuel': return Colors.orange;
      case 'maintenance': return Colors.blue;
      case 'repair': return Colors.red;
      case 'cleaning': return Colors.green;
      default: return AppColors.yellow;
    }
  }

  IconData get _typeIcon {
    switch (widget.logType) {
      case 'fuel': return Icons.local_gas_station_rounded;
      case 'maintenance': return Icons.build_rounded;
      case 'repair': return Icons.handyman_rounded;
      case 'cleaning': return Icons.cleaning_services_rounded;
      default: return Icons.receipt_rounded;
    }
  }

  String get _typeTitle {
    switch (widget.logType) {
      case 'fuel': return 'Fuel';
      case 'maintenance': return 'Service';
      case 'repair': return 'Repair';
      case 'cleaning': return 'Cleaning';
      default: return 'Log';
    }
  }

  Widget _buildFuelTypeChip(String label, String value) {
    final isSelected = _fuelType == value;
    return Expanded(
      child: GestureDetector(
        onTap: () {
          HapticFeedback.selectionClick();
          setState(() => _fuelType = value);
        },
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(vertical: 14),
          decoration: BoxDecoration(
            color: isSelected ? Colors.orange : context.bgColor,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: isSelected ? Colors.orange : context.borderColor,
            ),
          ),
          child: Center(
            child: Text(
              label,
              style: TextStyle(
                color: isSelected ? Colors.white : context.textColor,
                fontWeight: FontWeight.w600,
                fontSize: 15,
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now(),
      builder: (context, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: ColorScheme.dark(
              primary: AppColors.yellow,
              onPrimary: AppColors.darkBg,
              surface: context.cardColor,
              onSurface: context.textColor,
            ),
          ),
          child: child!,
        );
      },
    );
    if (picked != null) {
      setState(() => _selectedDate = picked);
    }
  }

  Future<void> _save() async {
    if (_amountController.text.isEmpty) {
      HapticFeedback.heavyImpact();
      AppSnackbar.error(context, 'Please enter an amount');
      return;
    }

    setState(() => _isSaving = true);
    HapticFeedback.mediumImpact();

    final result = await SupabaseService.addVehicleLog(
      logType: widget.logType,
      amount: double.tryParse(_amountController.text),
      odometer: int.tryParse(_odometerController.text),
      notes: _notesController.text.isNotEmpty ? _notesController.text : null,
      logDate: _selectedDate,
      fuelType: widget.logType == 'fuel' ? _fuelType : null,
      liters: widget.logType == 'fuel' ? double.tryParse(_litersController.text) : null,
    );

    setState(() => _isSaving = false);

    if (result != null) {
      HapticFeedback.lightImpact();
      widget.onSaved();
    } else {
      if (mounted) {
        AppSnackbar.error(context, 'Failed to save log');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.only(
        left: 24,
        right: 24,
        top: 12,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      decoration: BoxDecoration(
        color: context.cardColor,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(color: context.borderColor, borderRadius: BorderRadius.circular(2)),
              ),
            ),
            const SizedBox(height: 24),

            // Header with icon
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: _typeColor.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(_typeIcon, color: _typeColor, size: 24),
                ),
                const SizedBox(width: 14),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Add $_typeTitle',
                      style: TextStyle(color: context.textColor, fontSize: 20, fontWeight: FontWeight.w800),
                    ),
                    Text(
                      DateFormat('EEEE, MMM d').format(_selectedDate),
                      style: TextStyle(color: context.mutedColor, fontSize: 14),
                    ),
                  ],
                ),
                const Spacer(),
                GestureDetector(
                  onTap: _pickDate,
                  child: Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: context.bgColor,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(Icons.calendar_today_rounded, color: context.textColor, size: 20),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 28),

            // Amount field
            Text('Amount', style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w600)),
            const SizedBox(height: 10),
            TextField(
              controller: _amountController,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              style: TextStyle(color: context.textColor, fontSize: 24, fontWeight: FontWeight.w700),
              decoration: InputDecoration(
                prefixText: 'MVR ',
                prefixStyle: TextStyle(color: context.mutedColor, fontSize: 24, fontWeight: FontWeight.w700),
                hintText: '0.00',
                hintStyle: TextStyle(color: context.mutedColor.withValues(alpha: 0.5), fontSize: 24, fontWeight: FontWeight.w700),
                filled: true,
                fillColor: context.bgColor,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
                contentPadding: const EdgeInsets.all(20),
              ),
            ),
            const SizedBox(height: 20),

            // Fuel-specific fields
            if (widget.logType == 'fuel') ...[
              // Fuel Type
              Text('Fuel Type', style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w600)),
              const SizedBox(height: 10),
              Row(
                children: [
                  _buildFuelTypeChip('Petrol', 'petrol'),
                  const SizedBox(width: 10),
                  _buildFuelTypeChip('Diesel', 'diesel'),
                ],
              ),
              const SizedBox(height: 20),

              // Liters
              Text('Liters', style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w600)),
              const SizedBox(height: 10),
              TextField(
                controller: _litersController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                style: TextStyle(color: context.textColor, fontSize: 16),
                decoration: InputDecoration(
                  hintText: 'Liters filled (optional)',
                  hintStyle: TextStyle(color: context.mutedColor.withValues(alpha: 0.5)),
                  suffixText: 'L',
                  suffixStyle: TextStyle(color: context.mutedColor),
                  filled: true,
                  fillColor: context.bgColor,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
                  contentPadding: const EdgeInsets.all(20),
                ),
              ),
              const SizedBox(height: 20),
            ],

            // Odometer field
            Text('Odometer', style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w600)),
            const SizedBox(height: 10),
            TextField(
              controller: _odometerController,
              keyboardType: TextInputType.number,
              style: TextStyle(color: context.textColor, fontSize: 16),
              decoration: InputDecoration(
                hintText: 'Current mileage (optional)',
                hintStyle: TextStyle(color: context.mutedColor.withValues(alpha: 0.5)),
                suffixText: 'km',
                suffixStyle: TextStyle(color: context.mutedColor),
                filled: true,
                fillColor: context.bgColor,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
                contentPadding: const EdgeInsets.all(20),
              ),
            ),
            const SizedBox(height: 20),

            // Notes field
            Text('Notes', style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w600)),
            const SizedBox(height: 10),
            TextField(
              controller: _notesController,
              style: TextStyle(color: context.textColor, fontSize: 16),
              maxLines: 2,
              decoration: InputDecoration(
                hintText: 'Add notes (optional)',
                hintStyle: TextStyle(color: context.mutedColor.withValues(alpha: 0.5)),
                filled: true,
                fillColor: context.bgColor,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
                contentPadding: const EdgeInsets.all(20),
              ),
            ),
            const SizedBox(height: 28),

            // Save button
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _isSaving ? null : _save,
                style: ElevatedButton.styleFrom(
                  backgroundColor: _typeColor,
                  foregroundColor: Colors.white,
                  disabledBackgroundColor: _typeColor.withValues(alpha: 0.5),
                  padding: const EdgeInsets.symmetric(vertical: 18),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  elevation: 0,
                ),
                child: _isSaving
                    ? const SizedBox(height: 22, width: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                    : Text('Save $_typeTitle Log', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
