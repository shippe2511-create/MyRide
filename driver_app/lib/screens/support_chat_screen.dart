import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:provider/provider.dart';
import 'package:image_picker/image_picker.dart';
import 'package:geolocator/geolocator.dart';
import 'dart:async';
import '../theme/app_theme.dart';
import '../providers/driver_state.dart';
import '../services/notification_service.dart';
import '../utils/timezone_utils.dart';
import '../utils/image_utils.dart';
import '../widgets/cached_avatar.dart';

class SupportChatMessage {
  final String id;
  final String text;
  final bool isFromMe;
  final DateTime time;
  final bool isRead;
  final String? imageUrl;
  final double? latitude;
  final double? longitude;

  SupportChatMessage({
    required this.id,
    required this.text,
    required this.isFromMe,
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
  final _supabase = Supabase.instance.client;
  final _imagePicker = ImagePicker();

  String? _chatId;
  String? _profileId;
  bool _isLoading = true;
  bool _isSending = false;
  bool _isUploading = false;
  RealtimeChannel? _chatChannel;

  final List<_QuickReply> _quickReplies = [
    _QuickReply(text: "Hello, I need help", icon: Icons.waving_hand),
    _QuickReply(text: "I have an issue with a ride", icon: Icons.directions_car),
    _QuickReply(text: "Vehicle problem", icon: Icons.build),
    _QuickReply(text: "Thank you!", icon: Icons.thumb_up),
  ];

  @override
  void initState() {
    super.initState();
    _initChat();
  }

  Future<void> _initChat() async {
    final driverState = Provider.of<DriverState>(context, listen: false);
    _profileId = driverState.profileId;

    if (_profileId == null || _profileId!.isEmpty) {
      setState(() => _isLoading = false);
      return;
    }

    final chatId = await _getOrCreateSupportChat();
    if (chatId != null && mounted) {
      setState(() => _chatId = chatId);
      await _loadMessages();
      _subscribeToMessages();

      // Subscribe to notifications when not on this screen
      if (_profileId != null && _profileId!.isNotEmpty) {
        NotificationService.subscribeToSupportChat(chatId, _profileId!);
      }
    }
    if (mounted) {
      setState(() => _isLoading = false);
    }
  }

  Future<String?> _getOrCreateSupportChat() async {
    try {
      if (_profileId == null) return null;

      final existing = await _supabase
          .from('support_chats')
          .select('id')
          .eq('customer_id', _profileId!)
          .inFilter('status', ['open', 'active'])
          .order('created_at', ascending: false)
          .limit(1)
          .maybeSingle();

      if (existing != null) {
        return existing['id'] as String;
      }

      final response = await _supabase
          .from('support_chats')
          .insert({'customer_id': _profileId, 'status': 'open'})
          .select('id')
          .single();

      return response['id'] as String;
    } catch (e) {
      debugPrint('Error getting/creating support chat: $e');
      return null;
    }
  }

  Future<void> _loadMessages() async {
    if (_chatId == null) return;
    try {
      final messages = await _supabase
          .from('support_chat_messages')
          .select('*')
          .eq('chat_id', _chatId!)
          .order('created_at', ascending: true);

      if (mounted) {
        setState(() {
          _messages.clear();
          for (final msg in List<Map<String, dynamic>>.from(messages)) {
            _messages.add(SupportChatMessage(
              id: msg['id'].toString(),
              text: msg['message'] ?? '',
              isFromMe: msg['sender_type'] == 'customer',
              time: MaldivesTimezone.parse(msg['created_at']) ?? MaldivesTimezone.now(),
              isRead: msg['is_read'] ?? false,
              imageUrl: msg['image_url'],
              latitude: (msg['latitude'] as num?)?.toDouble(),
              longitude: (msg['longitude'] as num?)?.toDouble(),
            ));
          }
        });
        _scrollToBottom();
        await _markMessagesAsRead();
      }
    } catch (e) {
      debugPrint('Error loading messages: $e');
    }
  }

  void _subscribeToMessages() {
    if (_chatId == null) return;
    _chatChannel = _supabase
        .channel('driver_support_chat_$_chatId')
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'support_chat_messages',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'chat_id',
            value: _chatId!,
          ),
          callback: (payload) {
            final newMessage = payload.newRecord;
            final isFromAdmin = newMessage['sender_type'] == 'admin';
            if (mounted && isFromAdmin) {
              setState(() {
                _messages.add(SupportChatMessage(
                  id: newMessage['id'].toString(),
                  text: newMessage['message'] ?? '',
                  isFromMe: false,
                  time: MaldivesTimezone.parse(newMessage['created_at']) ?? MaldivesTimezone.now(),
                  imageUrl: newMessage['image_url'],
                  latitude: (newMessage['latitude'] as num?)?.toDouble(),
                  longitude: (newMessage['longitude'] as num?)?.toDouble(),
                ));
              });
              _scrollToBottom();
              _markMessagesAsRead();
            }
          },
        )
        .subscribe();
  }

  Future<void> _markMessagesAsRead() async {
    if (_chatId == null) return;
    try {
      await _supabase
          .from('support_chat_messages')
          .update({'is_read': true})
          .eq('chat_id', _chatId!)
          .eq('sender_type', 'admin');
    } catch (e) {
      debugPrint('Error marking messages as read: $e');
    }
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
    if (_chatId == null || _profileId == null) return;

    setState(() => _isSending = true);
    _messageController.clear();

    try {
      await _supabase.from('support_chat_messages').insert({
        'chat_id': _chatId,
        'sender_id': _profileId,
        'sender_type': 'customer',
        'message': message.isNotEmpty ? message : (imageUrl != null ? '📷 Photo' : '📍 Location'),
        'image_url': imageUrl,
        'latitude': lat,
        'longitude': lng,
      });

      await _supabase.from('support_chats').update({
        'status': 'active',
        'updated_at': DateTime.now().toIso8601String(),
      }).eq('id', _chatId!);

      if (mounted) {
        setState(() {
          _messages.add(SupportChatMessage(
            id: DateTime.now().millisecondsSinceEpoch.toString(),
            text: message.isNotEmpty ? message : (imageUrl != null ? '📷 Photo' : '📍 Location'),
            isFromMe: true,
            time: DateTime.now(),
            imageUrl: imageUrl,
            latitude: lat,
            longitude: lng,
          ));
        });
        _scrollToBottom();
      }
    } catch (e) {
      debugPrint('Error sending message: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to send message')),
        );
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
      );

      if (image == null) return;

      setState(() => _isUploading = true);

      // Compress image before upload
      final bytes = await image.readAsBytes();
      final compressed = await ImageUtils.compressImageBytes(bytes, type: ImageType.chat);
      final fileName = 'support_${_chatId}_${DateTime.now().millisecondsSinceEpoch}.jpg';
      final path = 'support-chat/$fileName';

      await _supabase.storage.from('chat-images').uploadBinary(
        path,
        compressed ?? bytes,
        fileOptions: const FileOptions(contentType: 'image/jpeg'),
      );

      final imageUrl = _supabase.storage.from('chat-images').getPublicUrl(path);

      await _sendMessage(imageUrl: imageUrl);
    } catch (e) {
      debugPrint('Error uploading image: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to upload image')),
        );
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
      );

      if (image == null) return;

      setState(() => _isUploading = true);

      // Compress image before upload
      final bytes = await image.readAsBytes();
      final compressed = await ImageUtils.compressImageBytes(bytes, type: ImageType.chat);
      final fileName = 'support_${_chatId}_${DateTime.now().millisecondsSinceEpoch}.jpg';
      final path = 'support-chat/$fileName';

      await _supabase.storage.from('chat-images').uploadBinary(
        path,
        compressed ?? bytes,
        fileOptions: const FileOptions(contentType: 'image/jpeg'),
      );

      final imageUrl = _supabase.storage.from('chat-images').getPublicUrl(path);

      await _sendMessage(imageUrl: imageUrl);
    } catch (e) {
      debugPrint('Error taking photo: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to take photo')),
        );
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
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to get location')),
        );
      }
    } finally {
      if (mounted) {
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
    _messageController.dispose();
    _scrollController.dispose();
    _focusNode.dispose();
    _chatChannel?.unsubscribe();
    super.dispose();
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
        title: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: AppColors.yellow.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Icons.support_agent, color: AppColors.yellow, size: 22),
            ),
            const SizedBox(width: 12),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Support Team',
                  style: TextStyle(
                    color: context.textColor,
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                Text(
                  'Usually replies within minutes',
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
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: AppColors.yellow))
          : Column(
              children: [
                Expanded(
                  child: _messages.isEmpty
                      ? _buildEmptyState()
                      : ListView.builder(
                          controller: _scrollController,
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                          itemCount: _messages.length,
                          itemBuilder: (context, index) {
                            return _buildMessageBubble(_messages[index]);
                          },
                        ),
                ),
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
                _buildQuickReplies(),
                _buildInputArea(),
              ],
            ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 80,
            height: 80,
            decoration: BoxDecoration(
              color: AppColors.yellow.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(20),
            ),
            child: const Icon(Icons.chat_bubble_outline, color: AppColors.yellow, size: 40),
          ),
          const SizedBox(height: 16),
          Text(
            'Start a conversation',
            style: TextStyle(
              color: context.textColor,
              fontSize: 18,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Send a message or tap a quick reply below',
            style: TextStyle(color: context.mutedColor, fontSize: 14),
          ),
        ],
      ),
    );
  }

  Widget _buildMessageBubble(SupportChatMessage message) {
    final isMe = message.isFromMe;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        mainAxisAlignment: isMe ? MainAxisAlignment.end : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (!isMe) ...[
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: AppColors.yellow.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.support_agent, color: AppColors.yellow, size: 18),
            ),
            const SizedBox(width: 8),
          ],
          Flexible(
            child: Container(
              constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.7),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: isMe ? AppColors.yellow : context.cardColor,
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(16),
                  topRight: const Radius.circular(16),
                  bottomLeft: Radius.circular(isMe ? 16 : 4),
                  bottomRight: Radius.circular(isMe ? 4 : 16),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (message.hasImage) ...[
                    ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: CachedImage(
                        imageUrl: message.imageUrl,
                        width: double.infinity,
                        fit: BoxFit.cover,
                        placeholder: Container(
                          height: 150,
                          color: context.cardColor,
                          child: const Center(
                            child: CircularProgressIndicator(color: AppColors.yellow),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                  ],
                  if (message.hasLocation) ...[
                    GestureDetector(
                      onTap: () {
                        // Could open maps app here
                      },
                      child: Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: isMe ? Colors.black.withValues(alpha: 0.1) : context.bgColor,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              Icons.location_on,
                              color: isMe ? Colors.black : AppColors.yellow,
                              size: 20,
                            ),
                            const SizedBox(width: 8),
                            Text(
                              '${message.latitude!.toStringAsFixed(4)}, ${message.longitude!.toStringAsFixed(4)}',
                              style: TextStyle(
                                color: isMe ? Colors.black : context.textColor,
                                fontSize: 13,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                  ],
                  if (message.text.isNotEmpty && !message.text.startsWith('📷') && !message.text.startsWith('📍'))
                    Text(
                      message.text,
                      style: TextStyle(
                        color: isMe ? Colors.black : context.textColor,
                        fontSize: 15,
                      ),
                    ),
                  const SizedBox(height: 4),
                  Text(
                    _formatTime(message.time),
                    style: TextStyle(
                      color: isMe ? Colors.black54 : context.mutedColor,
                      fontSize: 11,
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

  Widget _buildQuickReplies() {
    if (_messages.isNotEmpty) return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: _quickReplies.map((reply) {
          return GestureDetector(
            onTap: () => _sendMessage(text: reply.text),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: context.cardColor,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: context.borderColor),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(reply.icon, size: 16, color: AppColors.yellow),
                  const SizedBox(width: 6),
                  Text(
                    reply.text,
                    style: TextStyle(color: context.textColor, fontSize: 13),
                  ),
                ],
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildInputArea() {
    return Container(
      padding: EdgeInsets.fromLTRB(16, 12, 16, MediaQuery.of(context).padding.bottom + 12),
      decoration: BoxDecoration(
        color: context.bgColor,
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
                color: context.cardColor,
                borderRadius: BorderRadius.circular(22),
              ),
              child: Icon(Icons.add, color: context.textColor, size: 24),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Container(
              decoration: BoxDecoration(
                color: context.cardColor,
                borderRadius: BorderRadius.circular(24),
              ),
              child: TextField(
                controller: _messageController,
                focusNode: _focusNode,
                style: TextStyle(color: context.textColor),
                decoration: InputDecoration(
                  hintText: 'Type a message...',
                  hintStyle: TextStyle(color: context.mutedColor),
                  border: InputBorder.none,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                ),
                textInputAction: TextInputAction.send,
                onSubmitted: (_) => _sendMessage(text: _messageController.text),
              ),
            ),
          ),
          const SizedBox(width: 8),
          GestureDetector(
            onTap: (_isSending || _isUploading) ? null : () => _sendMessage(text: _messageController.text),
            child: Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: AppColors.yellow,
                borderRadius: BorderRadius.circular(22),
              ),
              child: (_isSending || _isUploading)
                  ? const Padding(
                      padding: EdgeInsets.all(12),
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black),
                    )
                  : const Icon(Icons.send_rounded, color: Colors.black, size: 20),
            ),
          ),
        ],
      ),
    );
  }

  String _formatTime(DateTime time) {
    final now = DateTime.now();
    final diff = now.difference(time);
    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inHours < 1) return '${diff.inMinutes}m ago';
    if (diff.inDays < 1) return '${diff.inHours}h ago';
    return '${time.day}/${time.month} ${time.hour}:${time.minute.toString().padLeft(2, '0')}';
  }
}

class _QuickReply {
  final String text;
  final IconData icon;
  _QuickReply({required this.text, required this.icon});
}
