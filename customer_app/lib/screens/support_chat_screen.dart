import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:provider/provider.dart';
import 'package:image_picker/image_picker.dart';
import 'package:geolocator/geolocator.dart';
import 'dart:async';
import '../theme/app_theme.dart';
import '../services/supabase_service.dart';
import '../providers/app_state.dart';
import '../widgets/app_snackbar.dart';
import '../services/notification_service.dart';
import '../utils/timezone_utils.dart';

class SupportChatMessage {
  final String id;
  final String text;
  final bool isCustomer;
  final DateTime time;
  final bool isRead;
  final String? imageUrl;
  final double? latitude;
  final double? longitude;

  SupportChatMessage({
    required this.id,
    required this.text,
    required this.isCustomer,
    required this.time,
    this.isRead = false,
    this.imageUrl,
    this.latitude,
    this.longitude,
  });

  bool get hasImage => imageUrl != null && imageUrl!.isNotEmpty;
  bool get hasLocation => latitude != null && longitude != null;
}

class SupportChatScreen extends StatefulWidget {
  const SupportChatScreen({super.key});

  @override
  State<SupportChatScreen> createState() => _SupportChatScreenState();
}

class _SupportChatScreenState extends State<SupportChatScreen> {
  final TextEditingController _messageController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final FocusNode _focusNode = FocusNode();
  final List<SupportChatMessage> _messages = [];
  final _imagePicker = ImagePicker();
  final _supabase = Supabase.instance.client;

  String? _chatId;
  bool _isLoading = true;
  bool _isSending = false;
  bool _isUploading = false;
  RealtimeChannel? _chatChannel;

  final List<_QuickReply> _quickReplies = [
    _QuickReply(text: "Hello, I need help", icon: Icons.waving_hand),
    _QuickReply(text: "I have an issue with my ride", icon: Icons.directions_car),
    _QuickReply(text: "App is not working properly", icon: Icons.bug_report),
    _QuickReply(text: "Thank you!", icon: Icons.thumb_up),
  ];

  @override
  void initState() {
    super.initState();
    _initChat();
  }

  Future<void> _initChat() async {
    final chatId = await SupabaseService.getOrCreateSupportChat();
    if (chatId != null && mounted) {
      setState(() => _chatId = chatId);
      await _loadMessages();
      _subscribeToMessages();

      // Subscribe to notifications when not on this screen
      final appState = Provider.of<AppState>(context, listen: false);
      if (appState.profileId != null) {
        NotificationService.subscribeToSupportChat(chatId, appState.profileId!);
      }
    }
    if (mounted) {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _loadMessages() async {
    if (_chatId == null) return;
    try {
      final messages = await SupabaseService.getSupportChatMessages(_chatId!);
      if (mounted) {
        setState(() {
          _messages.clear();
          for (final msg in messages) {
            _messages.add(SupportChatMessage(
              id: msg['id'].toString(),
              text: msg['message'] ?? '',
              isCustomer: msg['sender_type'] == 'customer',
              time: MaldivesTimezone.parse(msg['created_at']) ?? MaldivesTimezone.now(),
              isRead: msg['is_read'] ?? false,
              imageUrl: msg['image_url'],
              latitude: (msg['latitude'] as num?)?.toDouble(),
              longitude: (msg['longitude'] as num?)?.toDouble(),
            ));
          }
        });
        _scrollToBottom();
        await SupabaseService.markSupportMessagesAsRead(_chatId!);
      }
    } catch (e) {
      debugPrint('Error loading messages: $e');
    }
  }

  void _subscribeToMessages() {
    if (_chatId == null) return;
    _chatChannel = SupabaseService.subscribeToSupportChat(
      _chatId!,
      (newMessage) {
        final isFromCustomer = newMessage['sender_type'] == 'customer';
        if (mounted && !isFromCustomer) {
          setState(() {
            _messages.add(SupportChatMessage(
              id: newMessage['id'].toString(),
              text: newMessage['message'] ?? '',
              isCustomer: false,
              time: MaldivesTimezone.parse(newMessage['created_at']) ?? MaldivesTimezone.now(),
              imageUrl: newMessage['image_url'],
              latitude: (newMessage['latitude'] as num?)?.toDouble(),
              longitude: (newMessage['longitude'] as num?)?.toDouble(),
            ));
          });
          _scrollToBottom();
          SupabaseService.markSupportMessagesAsRead(_chatId!);
        }
      },
    );
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _sendMessage({String? text, String? imageUrl, double? lat, double? lng}) async {
    final message = text ?? _messageController.text.trim();
    if (message.isEmpty && imageUrl == null && lat == null) return;
    if (_chatId == null || _isSending) return;

    setState(() => _isSending = true);
    _messageController.clear();

    final msgText = message.isNotEmpty ? message : (imageUrl != null ? '📷 Photo' : '📍 Location');

    // Add message locally first for instant feedback
    final localMsg = SupportChatMessage(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      text: msgText,
      isCustomer: true,
      time: DateTime.now(),
      imageUrl: imageUrl,
      latitude: lat,
      longitude: lng,
    );
    setState(() => _messages.add(localMsg));
    _scrollToBottom();

    try {
      final appState = Provider.of<AppState>(context, listen: false);
      await _supabase.from('support_chat_messages').insert({
        'chat_id': _chatId,
        'sender_id': appState.profileId,
        'sender_type': 'customer',
        'message': msgText,
        'image_url': imageUrl,
        'latitude': lat,
        'longitude': lng,
      });

      await _supabase.from('support_chats').update({
        'status': 'active',
        'updated_at': DateTime.now().toIso8601String(),
      }).eq('id', _chatId!);
    } catch (e) {
      debugPrint('Error sending message: $e');
      if (mounted) {
        AppSnackbar.error(context, 'Failed to send message');
      }
    } finally {
      if (mounted) {
        setState(() => _isSending = false);
      }
    }
  }

  Future<void> _pickAndSendImage() async {
    try {
      final XFile? image = await _imagePicker.pickImage(
        source: ImageSource.gallery,
        maxWidth: 1024,
        maxHeight: 1024,
        imageQuality: 80,
      );

      if (image == null) return;

      setState(() => _isUploading = true);

      final bytes = await image.readAsBytes();
      final fileName = 'support_${_chatId}_${DateTime.now().millisecondsSinceEpoch}.jpg';
      final path = 'support-chat/$fileName';

      await _supabase.storage.from('chat-images').uploadBinary(
        path,
        bytes,
        fileOptions: const FileOptions(contentType: 'image/jpeg'),
      );

      final imageUrl = _supabase.storage.from('chat-images').getPublicUrl(path);

      await _sendMessage(imageUrl: imageUrl);
    } catch (e) {
      debugPrint('Error uploading image: $e');
      if (mounted) {
        AppSnackbar.error(context, 'Failed to upload image');
      }
    } finally {
      if (mounted) {
        setState(() => _isUploading = false);
      }
    }
  }

  Future<void> _takeAndSendPhoto() async {
    try {
      final XFile? image = await _imagePicker.pickImage(
        source: ImageSource.camera,
        maxWidth: 1024,
        maxHeight: 1024,
        imageQuality: 80,
      );

      if (image == null) return;

      setState(() => _isUploading = true);

      final bytes = await image.readAsBytes();
      final fileName = 'support_${_chatId}_${DateTime.now().millisecondsSinceEpoch}.jpg';
      final path = 'support-chat/$fileName';

      await _supabase.storage.from('chat-images').uploadBinary(
        path,
        bytes,
        fileOptions: const FileOptions(contentType: 'image/jpeg'),
      );

      final imageUrl = _supabase.storage.from('chat-images').getPublicUrl(path);

      await _sendMessage(imageUrl: imageUrl);
    } catch (e) {
      debugPrint('Error taking photo: $e');
      if (mounted) {
        AppSnackbar.error(context, 'Failed to take photo');
      }
    } finally {
      if (mounted) {
        setState(() => _isUploading = false);
      }
    }
  }

  Future<void> _sendLocation() async {
    try {
      setState(() => _isSending = true);

      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
        if (permission == LocationPermission.denied) {
          throw Exception('Location permission denied');
        }
      }

      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      );

      await _sendMessage(
        lat: position.latitude,
        lng: position.longitude,
      );
    } catch (e) {
      debugPrint('Error getting location: $e');
      if (mounted) {
        AppSnackbar.error(context, 'Failed to get location');
        setState(() => _isSending = false);
      }
    }
  }

  void _showAttachmentOptions() {
    showModalBottomSheet(
      context: context,
      backgroundColor: context.cardColor,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: context.mutedColor.withValues(alpha: 0.3),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 20),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  _buildAttachmentOption(
                    icon: Icons.photo_library_rounded,
                    label: 'Gallery',
                    color: Colors.purple,
                    onTap: () {
                      Navigator.pop(context);
                      _pickAndSendImage();
                    },
                  ),
                  _buildAttachmentOption(
                    icon: Icons.camera_alt_rounded,
                    label: 'Camera',
                    color: Colors.blue,
                    onTap: () {
                      Navigator.pop(context);
                      _takeAndSendPhoto();
                    },
                  ),
                  _buildAttachmentOption(
                    icon: Icons.location_on_rounded,
                    label: 'Location',
                    color: Colors.green,
                    onTap: () {
                      Navigator.pop(context);
                      _sendLocation();
                    },
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildAttachmentOption({
    required IconData icon,
    required String label,
    required Color color,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Icon(icon, color: color, size: 28),
          ),
          const SizedBox(height: 8),
          Text(
            label,
            style: TextStyle(color: context.textColor, fontSize: 13),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _chatChannel?.unsubscribe();
    _messageController.dispose();
    _scrollController.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  String _formatTime(DateTime time) {
    final hour = time.hour.toString().padLeft(2, '0');
    final minute = time.minute.toString().padLeft(2, '0');
    return '$hour:$minute';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.bgColor,
      resizeToAvoidBottomInset: true,
      body: Column(
        children: [
          _buildHeader(context),
          if (_isLoading)
            const Expanded(child: Center(child: CircularProgressIndicator(color: AppColors.yellow)))
          else if (_chatId == null)
            Expanded(child: Center(child: Text('Failed to connect. Try again.', style: TextStyle(color: context.mutedColor))))
          else ...[
            Expanded(child: _buildMessageList(context)),
            if (_isUploading)
              Container(
                padding: const EdgeInsets.all(12),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.yellow),
                    ),
                    const SizedBox(width: 12),
                    Text('Uploading...', style: TextStyle(color: context.mutedColor)),
                  ],
                ),
              ),
            _buildQuickReplies(context),
            _buildInputBar(context),
          ],
        ],
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
    return Container(
      padding: EdgeInsets.only(
        top: MediaQuery.of(context).padding.top + 8,
        left: 12,
        right: 12,
        bottom: 12,
      ),
      decoration: BoxDecoration(
        color: context.cardColor,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 10,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        children: [
          GestureDetector(
            onTap: () => Navigator.pop(context),
            child: Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: context.bgColor,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(Icons.arrow_back, color: context.textColor, size: 22),
            ),
          ),
          const SizedBox(width: 12),
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [AppColors.yellow, AppColors.yellow.withValues(alpha: 0.7)],
              ),
              borderRadius: BorderRadius.circular(16),
            ),
            child: const Icon(Icons.support_agent, color: Colors.black, size: 28),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'MyRide Support',
                  style: TextStyle(
                    color: context.textColor,
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                Row(
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: const BoxDecoration(
                        color: AppColors.success,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      'Online',
                      style: TextStyle(
                        color: context.mutedColor,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMessageList(BuildContext context) {
    if (_messages.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.chat_bubble_outline, size: 64, color: context.mutedColor),
            const SizedBox(height: 16),
            Text(
              'Start a conversation',
              style: TextStyle(color: context.textColor, fontSize: 18, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            Text(
              'Our support team is here to help',
              style: TextStyle(color: context.mutedColor, fontSize: 14),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      controller: _scrollController,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      itemCount: _messages.length,
      itemBuilder: (context, index) {
        return _buildMessageBubble(context, _messages[index]);
      },
    );
  }

  Widget _buildMessageBubble(BuildContext context, SupportChatMessage message) {
    final isCustomer = message.isCustomer;

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        mainAxisAlignment: isCustomer ? MainAxisAlignment.end : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (!isCustomer) ...[
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: AppColors.yellow,
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(Icons.support_agent, color: Colors.black, size: 18),
            ),
            const SizedBox(width: 8),
          ],
          Flexible(
            child: Column(
              crossAxisAlignment: isCustomer ? CrossAxisAlignment.end : CrossAxisAlignment.start,
              children: [
                Container(
                  constraints: BoxConstraints(
                    maxWidth: MediaQuery.of(context).size.width * 0.7,
                  ),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    gradient: isCustomer
                        ? LinearGradient(
                            colors: [AppColors.yellow, AppColors.yellow.withValues(alpha: 0.9)],
                          )
                        : null,
                    color: isCustomer ? null : context.cardColor,
                    borderRadius: BorderRadius.only(
                      topLeft: const Radius.circular(18),
                      topRight: const Radius.circular(18),
                      bottomLeft: Radius.circular(isCustomer ? 18 : 4),
                      bottomRight: Radius.circular(isCustomer ? 4 : 18),
                    ),
                    border: isCustomer ? null : Border.all(color: context.borderColor),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (message.hasImage) ...[
                        ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: Image.network(
                            message.imageUrl!,
                            width: double.infinity,
                            fit: BoxFit.cover,
                            loadingBuilder: (context, child, progress) {
                              if (progress == null) return child;
                              return Container(
                                height: 150,
                                color: context.cardColor,
                                child: const Center(
                                  child: CircularProgressIndicator(color: AppColors.yellow),
                                ),
                              );
                            },
                          ),
                        ),
                        const SizedBox(height: 8),
                      ],
                      if (message.hasLocation) ...[
                        Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: isCustomer ? Colors.black.withValues(alpha: 0.1) : context.bgColor,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                Icons.location_on,
                                color: isCustomer ? Colors.black : AppColors.yellow,
                                size: 20,
                              ),
                              const SizedBox(width: 8),
                              Text(
                                '${message.latitude!.toStringAsFixed(4)}, ${message.longitude!.toStringAsFixed(4)}',
                                style: TextStyle(
                                  color: isCustomer ? Colors.black : context.textColor,
                                  fontSize: 13,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 8),
                      ],
                      if (message.text.isNotEmpty && !message.text.startsWith('📷') && !message.text.startsWith('📍'))
                        Text(
                          message.text,
                          style: TextStyle(
                            color: isCustomer ? Colors.black : context.textColor,
                            fontSize: 15,
                          ),
                        ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.only(top: 4, left: 4, right: 4),
                  child: Text(
                    _formatTime(message.time),
                    style: TextStyle(color: context.mutedColor, fontSize: 10),
                  ),
                ),
              ],
            ),
          ),
          if (isCustomer) const SizedBox(width: 8),
        ],
      ),
    );
  }

  Widget _buildQuickReplies(BuildContext context) {
    final isKeyboardOpen = MediaQuery.of(context).viewInsets.bottom > 0;
    if (isKeyboardOpen || _messages.isNotEmpty) return const SizedBox.shrink();

    return Container(
      height: 52,
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        itemCount: _quickReplies.length,
        itemBuilder: (context, index) {
          final reply = _quickReplies[index];
          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: GestureDetector(
              onTap: () {
                HapticFeedback.lightImpact();
                _sendMessage(text: reply.text);
              },
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: AppColors.yellow.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: AppColors.yellow.withValues(alpha: 0.3)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(reply.icon, color: AppColors.yellow, size: 16),
                    const SizedBox(width: 6),
                    Text(
                      reply.text,
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
          );
        },
      ),
    );
  }

  Widget _buildInputBar(BuildContext context) {
    final isKeyboardOpen = MediaQuery.of(context).viewInsets.bottom > 0;
    final hasText = _messageController.text.isNotEmpty;

    return Container(
      padding: EdgeInsets.fromLTRB(12, 12, 12, isKeyboardOpen ? 12 : MediaQuery.of(context).padding.bottom + 12),
      decoration: BoxDecoration(
        color: context.cardColor,
        border: Border(top: BorderSide(color: context.borderColor)),
      ),
      child: Row(
        children: [
          GestureDetector(
            onTap: _showAttachmentOptions,
            child: Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: context.bgColor,
                borderRadius: BorderRadius.circular(22),
              ),
              child: Icon(Icons.add, color: context.textColor, size: 24),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Container(
              height: 48,
              decoration: BoxDecoration(
                color: context.bgColor,
                borderRadius: BorderRadius.circular(24),
                border: Border.all(color: context.borderColor),
              ),
              child: TextField(
                controller: _messageController,
                focusNode: _focusNode,
                style: TextStyle(color: context.textColor, fontSize: 15),
                keyboardType: TextInputType.text,
                textInputAction: TextInputAction.send,
                textCapitalization: TextCapitalization.sentences,
                decoration: InputDecoration(
                  hintText: 'Type a message...',
                  hintStyle: TextStyle(color: context.mutedColor, fontSize: 15),
                  border: InputBorder.none,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                ),
                onChanged: (_) => setState(() {}),
                onSubmitted: (text) => _sendMessage(text: text),
                onTap: () => _focusNode.requestFocus(),
              ),
            ),
          ),
          const SizedBox(width: 8),
          GestureDetector(
            onTap: (_isSending || _isUploading) ? null : () {
              HapticFeedback.mediumImpact();
              if (hasText) {
                _sendMessage(text: _messageController.text);
              }
            },
            child: Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: (hasText && !_isSending && !_isUploading)
                      ? [AppColors.yellow, AppColors.yellow.withValues(alpha: 0.9)]
                      : [context.mutedColor, context.mutedColor.withValues(alpha: 0.5)],
                ),
                borderRadius: BorderRadius.circular(24),
              ),
              child: (_isSending || _isUploading)
                  ? const Padding(
                      padding: EdgeInsets.all(12),
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : Icon(
                      Icons.send,
                      color: hasText ? Colors.black : context.bgColor,
                      size: 22,
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

class _QuickReply {
  final String text;
  final IconData icon;

  _QuickReply({required this.text, required this.icon});
}
