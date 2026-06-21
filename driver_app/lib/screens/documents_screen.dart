import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../theme/app_theme.dart';
import '../services/supabase_service.dart';
import '../providers/driver_state.dart';
import '../widgets/shimmer_loading.dart';

class DocumentsScreen extends StatefulWidget {
  const DocumentsScreen({super.key});

  @override
  State<DocumentsScreen> createState() => _DocumentsScreenState();
}

class _DocumentsScreenState extends State<DocumentsScreen> {
  final ImagePicker _picker = ImagePicker();
  bool _isLoading = true;
  List<Map<String, dynamic>> _documents = [];
  RealtimeChannel? _documentsSubscription;

  // Document types with icons
  final Map<String, IconData> _documentIcons = {
    'license': Icons.badge_outlined,
    'driving_license': Icons.badge_outlined,
    'vehicle_reg': Icons.directions_car_outlined,
    'insurance': Icons.security_outlined,
    'id_card': Icons.credit_card_outlined,
    'profile_photo': Icons.person_outline,
    'police_clearance': Icons.verified_user_outlined,
  };

  final Map<String, String> _documentTitles = {
    'license': 'Driving License',
    'driving_license': 'Driving License',
    'vehicle_reg': 'Vehicle Registration',
    'insurance': 'Insurance Certificate',
    'id_card': 'National ID Card',
    'profile_photo': 'Profile Photo',
    'police_clearance': 'Police Clearance',
  };

  @override
  void initState() {
    super.initState();
    _loadDocuments();
    _subscribeToDocumentUpdates();
  }

  @override
  void dispose() {
    _documentsSubscription?.unsubscribe();
    super.dispose();
  }

  void _subscribeToDocumentUpdates() {
    final driverState = Provider.of<DriverState>(context, listen: false);
    if (driverState.driverId.isEmpty) return;

    _documentsSubscription = SupabaseService.client
        .channel('driver_documents_${driverState.driverId}')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'driver_documents',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'driver_id',
            value: driverState.driverId,
          ),
          callback: (payload) {
            debugPrint('Document update received: ${payload.eventType}');
            _loadDocuments();
          },
        )
        .subscribe();
  }

  Future<void> _loadDocuments() async {
    setState(() => _isLoading = true);
    try {
      final driverState = Provider.of<DriverState>(context, listen: false);
      final docs = await SupabaseService.getMyDocuments(driverId: driverState.driverId);

      // Map Supabase documents to local format
      _documents = docs.map((doc) {
        final docType = doc['document_type'] as String? ?? 'other';
        return {
          'id': doc['id'],
          'type': docType,
          'title': _documentTitles[docType] ?? docType.replaceAll('_', ' ').toUpperCase(),
          'icon': _documentIcons[docType] ?? Icons.description_outlined,
          'status': doc['status'] ?? 'pending',
          'expiry': doc['expiry_date'],
          'uploaded': true,
          'file_url': doc['file_url'],
        };
      }).toList();

      // Add missing required documents
      final uploadedTypes = _documents.map((d) => d['type']).toSet();
      final requiredTypes = ['license', 'vehicle_reg', 'insurance', 'id_card'];

      for (final type in requiredTypes) {
        if (!uploadedTypes.contains(type)) {
          _documents.add({
            'id': type,
            'type': type,
            'title': _documentTitles[type] ?? type,
            'icon': _documentIcons[type] ?? Icons.description_outlined,
            'status': 'not_uploaded',
            'expiry': null,
            'uploaded': false,
          });
        }
      }
    } catch (e) {
      debugPrint('Error loading documents: $e');
      // Use default documents if error
      _documents = [
        {'id': 'license', 'type': 'license', 'title': 'Driving License', 'icon': Icons.badge_outlined, 'status': 'not_uploaded', 'expiry': null, 'uploaded': false},
        {'id': 'vehicle_reg', 'type': 'vehicle_reg', 'title': 'Vehicle Registration', 'icon': Icons.directions_car_outlined, 'status': 'not_uploaded', 'expiry': null, 'uploaded': false},
        {'id': 'insurance', 'type': 'insurance', 'title': 'Insurance Certificate', 'icon': Icons.security_outlined, 'status': 'not_uploaded', 'expiry': null, 'uploaded': false},
        {'id': 'id_card', 'type': 'id_card', 'title': 'National ID Card', 'icon': Icons.credit_card_outlined, 'status': 'not_uploaded', 'expiry': null, 'uploaded': false},
      ];
    }
    setState(() => _isLoading = false);
  }

  List<Map<String, dynamic>> get _expiringDocuments {
    final now = DateTime.now();
    final thirtyDaysLater = now.add(const Duration(days: 30));

    return _documents.where((doc) {
      if (doc['expiry'] == null) return false;
      try {
        final expiry = DateTime.parse(doc['expiry']);
        return expiry.isBefore(thirtyDaysLater) && expiry.isAfter(now);
      } catch (e) {
        return false;
      }
    }).toList();
  }

  List<Map<String, dynamic>> get _expiredDocuments {
    final now = DateTime.now();
    return _documents.where((doc) {
      if (doc['expiry'] == null) return false;
      try {
        final expiry = DateTime.parse(doc['expiry']);
        return expiry.isBefore(now);
      } catch (e) {
        return false;
      }
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final verifiedCount = _documents.where((d) => d['status'] == 'verified').length;
    final totalCount = _documents.length;

    return Scaffold(
      backgroundColor: context.bgColor,
      appBar: AppBar(
        backgroundColor: context.bgColor,
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: context.textColor),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text('Documents', style: TextStyle(color: context.textColor)),
        actions: [
          IconButton(
            icon: Icon(Icons.refresh, color: context.textColor),
            onPressed: _loadDocuments,
          ),
        ],
      ),
      body: _isLoading
          ? const ShimmerList(itemCount: 5)
          : RefreshIndicator(
              onRefresh: _loadDocuments,
              color: AppColors.yellow,
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Status card
                    _buildStatusCard(context, verifiedCount, totalCount),

                    // Expiry alerts
                    if (_expiredDocuments.isNotEmpty) ...[
                      const SizedBox(height: 16),
                      _buildExpiryAlert(
                        context,
                        title: 'Expired Documents',
                        subtitle: '${_expiredDocuments.length} document(s) have expired',
                        color: AppColors.error,
                        icon: Icons.error_outline,
                      ),
                    ],
                    if (_expiringDocuments.isNotEmpty) ...[
                      const SizedBox(height: 16),
                      _buildExpiryAlert(
                        context,
                        title: 'Expiring Soon',
                        subtitle: '${_expiringDocuments.length} document(s) expiring within 30 days',
                        color: AppColors.warning,
                        icon: Icons.warning_amber_outlined,
                      ),
                    ],

                    const SizedBox(height: 24),

                    // Documents list
                    Text(
                      'Your Documents',
                      style: TextStyle(
                        color: context.textColor,
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 16),
                    ..._documents.map((doc) => _buildDocumentCard(context, doc)),
                  ],
                ),
              ),
            ),
    );
  }

  Widget _buildExpiryAlert(
    BuildContext context, {
    required String title,
    required String subtitle,
    required Color color,
    required IconData icon,
  }) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: color, size: 24),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    color: color,
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                Text(
                  subtitle,
                  style: TextStyle(
                    color: context.mutedColor,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
          Icon(Icons.chevron_right, color: color),
        ],
      ),
    );
  }

  Widget _buildStatusCard(BuildContext context, int verified, int total) {
    final progress = verified / total;
    final allVerified = verified == total;

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: allVerified
              ? [AppColors.success.withValues(alpha: 0.15), AppColors.success.withValues(alpha: 0.05)]
              : [AppColors.warning.withValues(alpha: 0.15), AppColors.warning.withValues(alpha: 0.05)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: allVerified
              ? AppColors.success.withValues(alpha: 0.3)
              : AppColors.warning.withValues(alpha: 0.3),
        ),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  color: allVerified ? AppColors.success : AppColors.warning,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Icon(
                  allVerified ? Icons.verified : Icons.pending_outlined,
                  color: Colors.white,
                  size: 28,
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      allVerified ? 'All Documents Verified' : 'Documents Pending',
                      style: TextStyle(
                        color: context.textColor,
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '$verified of $total documents verified',
                      style: TextStyle(
                        color: context.mutedColor,
                        fontSize: 13,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          // Progress bar
          Stack(
            children: [
              Container(
                height: 8,
                decoration: BoxDecoration(
                  color: context.borderColor,
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
              FractionallySizedBox(
                widthFactor: progress,
                child: Container(
                  height: 8,
                  decoration: BoxDecoration(
                    color: allVerified ? AppColors.success : AppColors.warning,
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildDocumentCard(BuildContext context, Map<String, dynamic> doc) {
    final status = doc['status'] as String;
    final isVerified = status == 'verified';
    final isPending = status == 'pending';
    final isUploaded = doc['uploaded'] as bool;

    // Check expiry status
    bool isExpired = false;
    bool isExpiringSoon = false;
    String? expiryDisplay;

    if (doc['expiry'] != null) {
      try {
        final expiry = DateTime.parse(doc['expiry']);
        final now = DateTime.now();
        final thirtyDaysLater = now.add(const Duration(days: 30));

        isExpired = expiry.isBefore(now);
        isExpiringSoon = !isExpired && expiry.isBefore(thirtyDaysLater);
        expiryDisplay = DateFormat('MMM d, yyyy').format(expiry);
      } catch (e) {
        expiryDisplay = doc['expiry'];
      }
    }

    Color statusColor;
    String statusText;
    IconData statusIcon;

    if (isExpired) {
      statusColor = AppColors.error;
      statusText = 'Expired';
      statusIcon = Icons.error;
    } else if (isExpiringSoon) {
      statusColor = AppColors.warning;
      statusText = 'Expiring Soon';
      statusIcon = Icons.warning_amber;
    } else if (isVerified) {
      statusColor = AppColors.success;
      statusText = 'Verified';
      statusIcon = Icons.check_circle;
    } else if (isPending) {
      statusColor = AppColors.warning;
      statusText = 'Pending Review';
      statusIcon = Icons.pending;
    } else {
      statusColor = AppColors.error;
      statusText = 'Upload Required';
      statusIcon = Icons.error_outline;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.cardColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.borderColor),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(
                  doc['icon'] as IconData,
                  color: statusColor,
                  size: 24,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      doc['title'] as String,
                      style: TextStyle(
                        color: context.textColor,
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Icon(statusIcon, color: statusColor, size: 14),
                        const SizedBox(width: 4),
                        Flexible(
                          child: Text(
                            expiryDisplay != null
                              ? '$statusText • Expires $expiryDisplay'
                              : statusText,
                            style: TextStyle(
                              color: statusColor,
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              GestureDetector(
                onTap: () => _showDocumentOptions(context, doc),
                child: Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: context.bgColor,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(
                    isUploaded ? Icons.more_vert : Icons.upload_outlined,
                    color: isUploaded ? context.mutedColor : AppColors.yellow,
                    size: 20,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  void _showDocumentOptions(BuildContext context, Map<String, dynamic> doc) {
    final isUploaded = doc['uploaded'] as bool;

    HapticFeedback.mediumImpact();
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 30),
        decoration: BoxDecoration(
          color: context.cardColor,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
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
            const SizedBox(height: 20),
            Text(
              doc['title'] as String,
              style: TextStyle(
                color: context.textColor,
                fontSize: 18,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 20),
            if (isUploaded)
              _buildOptionTile(
                context,
                icon: Icons.visibility_outlined,
                title: 'View Document',
                onTap: () {
                  Navigator.pop(ctx);
                  _showDocumentPreview(context, doc);
                },
              ),
            _buildOptionTile(
              context,
              icon: Icons.camera_alt_outlined,
              title: 'Take Photo',
              onTap: () async {
                Navigator.pop(ctx);
                await _captureDocument(ImageSource.camera, docType: doc['type'] as String?);
              },
            ),
            _buildOptionTile(
              context,
              icon: Icons.photo_library_outlined,
              title: 'Choose from Gallery',
              onTap: () async {
                Navigator.pop(ctx);
                await _captureDocument(ImageSource.gallery, docType: doc['type'] as String?);
              },
            ),
            if (isUploaded)
              _buildOptionTile(
                context,
                icon: Icons.delete_outline,
                title: 'Remove Document',
                color: AppColors.error,
                onTap: () {
                  Navigator.pop(ctx);
                  _showDeleteConfirmation(context, doc);
                },
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildOptionTile(
    BuildContext context, {
    required IconData icon,
    required String title,
    required VoidCallback onTap,
    Color? color,
  }) {
    return GestureDetector(
      onTap: () {
        HapticFeedback.lightImpact();
        onTap();
      },
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: (color ?? context.textColor).withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, color: color ?? context.textColor, size: 22),
            ),
            const SizedBox(width: 14),
            Text(
              title,
              style: TextStyle(
                color: color ?? context.textColor,
                fontSize: 16,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _captureDocument(ImageSource source, {String? docType}) async {
    try {
      final XFile? image = await _picker.pickImage(
        source: source,
        maxWidth: 1920,
        maxHeight: 1920,
        imageQuality: 85,
      );
      if (image != null && mounted) {
        // Show expiry date picker for documents that expire
        if (docType != null && docType != 'profile_photo') {
          _showExpiryDatePicker(context, image, docType);
        } else {
          _uploadDocument(image, docType, null);
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error capturing document: $e'),
            backgroundColor: AppColors.error,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          ),
        );
      }
    }
  }

  void _showExpiryDatePicker(BuildContext context, XFile image, String docType) {
    DateTime selectedDate = DateTime.now().add(const Duration(days: 365));

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Container(
        padding: EdgeInsets.fromLTRB(20, 16, 20, MediaQuery.of(ctx).padding.bottom + 20),
        decoration: BoxDecoration(
          color: context.cardColor,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
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
            const SizedBox(height: 20),
            Text(
              'Document Expiry Date',
              style: TextStyle(
                color: context.textColor,
                fontSize: 18,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'When does this document expire?',
              style: TextStyle(color: context.mutedColor, fontSize: 14),
            ),
            const SizedBox(height: 24),
            SizedBox(
              height: 320,
              child: Theme(
                data: Theme.of(context).copyWith(
                  colorScheme: ColorScheme.dark(
                    primary: AppColors.yellow,
                    onPrimary: Colors.black,
                    surface: context.cardColor,
                    onSurface: context.textColor,
                  ),
                  textButtonTheme: TextButtonThemeData(
                    style: TextButton.styleFrom(
                      foregroundColor: AppColors.yellow,
                    ),
                  ),
                ),
                child: CalendarDatePicker(
                  initialDate: selectedDate,
                  firstDate: DateTime.now(),
                  lastDate: DateTime.now().add(const Duration(days: 3650)),
                  onDateChanged: (date) => selectedDate = date,
                ),
              ),
            ),
            const SizedBox(height: 20),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () {
                      Navigator.pop(ctx);
                      _uploadDocument(image, docType, null);
                    },
                    style: OutlinedButton.styleFrom(
                      foregroundColor: context.textColor,
                      side: BorderSide(color: context.borderColor),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: const Text('Skip'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton(
                    onPressed: () {
                      Navigator.pop(ctx);
                      _uploadDocument(image, docType, selectedDate);
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.yellow,
                      foregroundColor: Colors.black,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: const Text('Confirm'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _uploadDocument(XFile image, String? docType, DateTime? expiryDate) async {
    // Show loading
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            const SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
              ),
            ),
            const SizedBox(width: 12),
            const Text('Uploading document...'),
          ],
        ),
        backgroundColor: AppColors.info,
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 30),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    );

    try {
      // Get driver ID from state
      final driverState = Provider.of<DriverState>(context, listen: false);
      final driverId = driverState.driverId;
      if (driverId.isEmpty) throw Exception('Not logged in as driver');

      // Upload file to Supabase Storage
      final fileUrl = await SupabaseService.uploadDocumentFile(
        filePath: image.path,
        documentType: docType ?? 'other',
        driverId: driverId,
      );

      if (fileUrl == null) throw Exception('Failed to upload file');

      // Save document metadata to database
      await SupabaseService.uploadDocument(
        documentType: docType ?? 'other',
        fileUrl: fileUrl,
        driverId: driverId,
        expiryDate: expiryDate,
      );

      if (mounted) {
        ScaffoldMessenger.of(context).hideCurrentSnackBar();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text('Document uploaded successfully! Pending review.'),
            backgroundColor: AppColors.success,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          ),
        );
        _loadDocuments();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).hideCurrentSnackBar();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Upload failed: $e'),
            backgroundColor: AppColors.error,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          ),
        );
      }
    }
  }

  void _showDocumentPreview(BuildContext context, Map<String, dynamic> doc) {
    final fileUrl = doc['file_url'] as String?;

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.cardColor,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text(doc['title'] as String, style: TextStyle(color: context.textColor)),
        content: Container(
          constraints: const BoxConstraints(maxHeight: 400, maxWidth: 300),
          decoration: BoxDecoration(
            color: context.bgColor,
            borderRadius: BorderRadius.circular(12),
          ),
          child: fileUrl != null && fileUrl.isNotEmpty
              ? ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: Image.network(
                    fileUrl,
                    fit: BoxFit.contain,
                    loadingBuilder: (context, child, loadingProgress) {
                      if (loadingProgress == null) return child;
                      return Center(
                        child: CircularProgressIndicator(
                          value: loadingProgress.expectedTotalBytes != null
                              ? loadingProgress.cumulativeBytesLoaded /
                                  loadingProgress.expectedTotalBytes!
                              : null,
                          color: AppColors.yellow,
                        ),
                      );
                    },
                    errorBuilder: (context, error, stackTrace) => Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.broken_image, size: 48, color: context.mutedColor),
                          const SizedBox(height: 8),
                          Text('Failed to load', style: TextStyle(color: context.mutedColor)),
                        ],
                      ),
                    ),
                  ),
                )
              : Center(
                  child: Icon(
                    doc['icon'] as IconData,
                    size: 64,
                    color: context.mutedColor,
                  ),
                ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Close', style: TextStyle(color: AppColors.yellow)),
          ),
        ],
      ),
    );
  }

  void _showDeleteConfirmation(BuildContext context, Map<String, dynamic> doc) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.cardColor,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text('Remove Document?', style: TextStyle(color: context.textColor)),
        content: Text(
          'Are you sure you want to remove ${doc['title']}? You will need to upload it again.',
          style: TextStyle(color: context.mutedColor),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text('Cancel', style: TextStyle(color: context.mutedColor)),
          ),
          TextButton(
            onPressed: () async {
              Navigator.pop(ctx);
              await _deleteDocument(doc);
            },
            child: const Text('Remove', style: TextStyle(color: AppColors.error)),
          ),
        ],
      ),
    );
  }

  Future<void> _deleteDocument(Map<String, dynamic> doc) async {
    final documentId = doc['id']?.toString();
    if (documentId == null || documentId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text('Cannot delete: document ID not found'),
          backgroundColor: AppColors.error,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        ),
      );
      return;
    }

    final driverState = Provider.of<DriverState>(context, listen: false);
    final driverId = driverState.driverId;

    final success = await SupabaseService.deleteDocument(
      documentId: documentId,
      driverId: driverId,
    );

    if (mounted) {
      if (success) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text('Document removed'),
            backgroundColor: AppColors.success,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          ),
        );
        _loadDocuments();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text('Failed to remove document'),
            backgroundColor: AppColors.error,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          ),
        );
      }
    }
  }
}
