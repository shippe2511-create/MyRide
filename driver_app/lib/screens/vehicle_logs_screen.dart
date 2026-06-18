import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../theme/app_theme.dart';
import '../services/supabase_service.dart';

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
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.cardColor,
        title: Text('Delete Log', style: TextStyle(color: context.textColor)),
        content: Text('Delete this log entry?', style: TextStyle(color: context.textColor.withValues(alpha: 0.7))),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('Cancel', style: TextStyle(color: context.textColor.withValues(alpha: 0.7))),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete', style: TextStyle(color: Colors.red)),
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
      appBar: AppBar(
        backgroundColor: context.bgColor,
        elevation: 0,
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: context.textColor),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text('Vehicle Logs', style: TextStyle(color: context.textColor, fontWeight: FontWeight.w700)),
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: AppColors.yellow,
          labelColor: AppColors.yellow,
          unselectedLabelColor: context.textColor.withValues(alpha: 0.5),
          tabs: const [
            Tab(text: 'Logs'),
            Tab(text: 'Summary'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildLogsTab(),
          _buildSummaryTab(),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showTypeSelector(),
        backgroundColor: AppColors.yellow,
        child: const Icon(Icons.add, color: AppColors.darkBg),
      ),
    );
  }

  void _showTypeSelector() {
    showModalBottomSheet(
      context: context,
      backgroundColor: context.cardColor,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Add Log', style: TextStyle(color: context.textColor, fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 20),
            Row(
              children: [
                Expanded(child: _buildTypeButton(Icons.local_gas_station, 'Fuel', 'fuel', Colors.orange)),
                const SizedBox(width: 12),
                Expanded(child: _buildTypeButton(Icons.build, 'Maintenance', 'maintenance', Colors.blue)),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(child: _buildTypeButton(Icons.handyman, 'Repair', 'repair', Colors.red)),
                const SizedBox(width: 12),
                Expanded(child: _buildTypeButton(Icons.cleaning_services, 'Cleaning', 'cleaning', Colors.green)),
              ],
            ),
            SizedBox(height: MediaQuery.of(ctx).padding.bottom + 16),
          ],
        ),
      ),
    );
  }

  Widget _buildTypeButton(IconData icon, String label, String type, Color color) {
    return GestureDetector(
      onTap: () {
        Navigator.pop(context);
        _showAddDialog(type);
      },
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: color.withValues(alpha: 0.3)),
        ),
        child: Column(
          children: [
            Icon(icon, color: color, size: 32),
            const SizedBox(height: 8),
            Text(label, style: TextStyle(color: context.textColor, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }

  Widget _buildLogsTab() {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator(color: AppColors.yellow));
    }

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _buildFilterChip('All', 'all'),
                const SizedBox(width: 8),
                _buildFilterChip('Fuel', 'fuel'),
                const SizedBox(width: 8),
                _buildFilterChip('Maintenance', 'maintenance'),
                const SizedBox(width: 8),
                _buildFilterChip('Repair', 'repair'),
                const SizedBox(width: 8),
                _buildFilterChip('Cleaning', 'cleaning'),
              ],
            ),
          ),
        ),
        Expanded(
          child: _logs.isEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.receipt_long, size: 64, color: context.textColor.withValues(alpha: 0.3)),
                      const SizedBox(height: 16),
                      Text('No logs yet', style: TextStyle(color: context.textColor.withValues(alpha: 0.6))),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _loadData,
                  color: AppColors.yellow,
                  child: ListView.builder(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    itemCount: _logs.length,
                    itemBuilder: (ctx, i) => _buildLogCard(_logs[i]),
                  ),
                ),
        ),
      ],
    );
  }

  Widget _buildFilterChip(String label, String value) {
    final isSelected = _selectedFilter == value;
    return GestureDetector(
      onTap: () {
        setState(() => _selectedFilter = value);
        _loadData();
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.yellow : context.cardColor,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: isSelected ? AppColors.yellow : context.borderColor),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: isSelected ? AppColors.darkBg : context.textColor,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }

  Widget _buildLogCard(Map<String, dynamic> log) {
    final type = log['log_type'] ?? 'fuel';
    final amount = (log['amount'] ?? 0).toDouble();
    final odometer = log['odometer'];
    final notes = log['notes'] ?? '';
    final dateStr = log['log_date'] ?? '';
    final date = DateTime.tryParse(dateStr);

    IconData icon;
    Color color;
    switch (type) {
      case 'fuel':
        icon = Icons.local_gas_station;
        color = Colors.orange;
        break;
      case 'maintenance':
        icon = Icons.build;
        color = Colors.blue;
        break;
      case 'repair':
        icon = Icons.handyman;
        color = Colors.red;
        break;
      case 'cleaning':
        icon = Icons.cleaning_services;
        color = Colors.green;
        break;
      default:
        icon = Icons.receipt;
        color = Colors.grey;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.cardColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.borderColor),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: color),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  type[0].toUpperCase() + type.substring(1),
                  style: TextStyle(color: context.textColor, fontWeight: FontWeight.w600),
                ),
                if (notes.isNotEmpty)
                  Text(
                    notes,
                    style: TextStyle(color: context.textColor.withValues(alpha: 0.6), fontSize: 13),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                if (odometer != null)
                  Text(
                    '$odometer km',
                    style: TextStyle(color: context.textColor.withValues(alpha: 0.5), fontSize: 12),
                  ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              if (amount > 0)
                Text(
                  'MVR ${amount.toStringAsFixed(2)}',
                  style: TextStyle(color: context.textColor, fontWeight: FontWeight.w700),
                ),
              Text(
                date != null ? DateFormat('MMM d').format(date) : '',
                style: TextStyle(color: context.textColor.withValues(alpha: 0.5), fontSize: 12),
              ),
            ],
          ),
          const SizedBox(width: 8),
          GestureDetector(
            onTap: () => _deleteLog(log['id']),
            child: Icon(Icons.close, size: 18, color: context.textColor.withValues(alpha: 0.4)),
          ),
        ],
      ),
    );
  }

  Widget _buildSummaryTab() {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator(color: AppColors.yellow));
    }

    final fuelTotal = (_stats['fuel_total'] ?? 0).toDouble();
    final fuelCount = _stats['fuel_count'] ?? 0;
    final maintenanceTotal = (_stats['maintenance_total'] ?? 0).toDouble();
    final maintenanceCount = _stats['maintenance_count'] ?? 0;
    final total = (_stats['total'] ?? 0).toDouble();

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('This Month', style: TextStyle(color: context.textColor.withValues(alpha: 0.6), fontSize: 14)),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [AppColors.yellow, Color(0xFFFFE066)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Column(
              children: [
                Text(
                  'Total Expenses',
                  style: TextStyle(color: AppColors.darkBg.withValues(alpha: 0.7), fontSize: 14),
                ),
                const SizedBox(height: 8),
                Text(
                  'MVR ${total.toStringAsFixed(2)}',
                  style: const TextStyle(color: AppColors.darkBg, fontSize: 36, fontWeight: FontWeight.w800),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          Row(
            children: [
              Expanded(child: _buildStatCard('Fuel', fuelTotal, fuelCount, Icons.local_gas_station, Colors.orange)),
              const SizedBox(width: 12),
              Expanded(child: _buildStatCard('Maintenance', maintenanceTotal, maintenanceCount, Icons.build, Colors.blue)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStatCard(String label, double amount, int count, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.cardColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: color, size: 20),
              const SizedBox(width: 8),
              Text(label, style: TextStyle(color: context.textColor.withValues(alpha: 0.6), fontSize: 13)),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            'MVR ${amount.toStringAsFixed(0)}',
            style: TextStyle(color: context.textColor, fontSize: 20, fontWeight: FontWeight.w700),
          ),
          Text(
            '$count entries',
            style: TextStyle(color: context.textColor.withValues(alpha: 0.5), fontSize: 12),
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
  DateTime _selectedDate = DateTime.now();
  bool _isSaving = false;

  Future<void> _save() async {
    setState(() => _isSaving = true);

    final result = await SupabaseService.addVehicleLog(
      logType: widget.logType,
      amount: double.tryParse(_amountController.text),
      odometer: int.tryParse(_odometerController.text),
      notes: _notesController.text.isNotEmpty ? _notesController.text : null,
      logDate: _selectedDate,
    );

    setState(() => _isSaving = false);

    if (result != null) {
      widget.onSaved();
    } else {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to save log')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    String title;
    switch (widget.logType) {
      case 'fuel':
        title = 'Add Fuel Log';
        break;
      case 'maintenance':
        title = 'Add Maintenance';
        break;
      case 'repair':
        title = 'Add Repair';
        break;
      case 'cleaning':
        title = 'Add Cleaning';
        break;
      default:
        title = 'Add Log';
    }

    return Container(
      padding: EdgeInsets.only(
        left: 24,
        right: 24,
        top: 24,
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
            Text(title, style: TextStyle(color: context.textColor, fontSize: 20, fontWeight: FontWeight.w700)),
            const SizedBox(height: 24),

            Text('Amount (MVR)', style: TextStyle(color: context.textColor.withValues(alpha: 0.6), fontSize: 13)),
            const SizedBox(height: 8),
            TextField(
              controller: _amountController,
              keyboardType: TextInputType.number,
              style: TextStyle(color: context.textColor),
              decoration: InputDecoration(
                hintText: '0.00',
                hintStyle: TextStyle(color: context.textColor.withValues(alpha: 0.4)),
                filled: true,
                fillColor: context.bgColor,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
              ),
            ),
            const SizedBox(height: 16),

            Text('Odometer (km)', style: TextStyle(color: context.textColor.withValues(alpha: 0.6), fontSize: 13)),
            const SizedBox(height: 8),
            TextField(
              controller: _odometerController,
              keyboardType: TextInputType.number,
              style: TextStyle(color: context.textColor),
              decoration: InputDecoration(
                hintText: 'Optional',
                hintStyle: TextStyle(color: context.textColor.withValues(alpha: 0.4)),
                filled: true,
                fillColor: context.bgColor,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
              ),
            ),
            const SizedBox(height: 16),

            Text('Notes', style: TextStyle(color: context.textColor.withValues(alpha: 0.6), fontSize: 13)),
            const SizedBox(height: 8),
            TextField(
              controller: _notesController,
              style: TextStyle(color: context.textColor),
              maxLines: 2,
              decoration: InputDecoration(
                hintText: 'Optional',
                hintStyle: TextStyle(color: context.textColor.withValues(alpha: 0.4)),
                filled: true,
                fillColor: context.bgColor,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
              ),
            ),
            const SizedBox(height: 24),

            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _isSaving ? null : _save,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.yellow,
                  foregroundColor: AppColors.darkBg,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                child: _isSaving
                    ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Save', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
