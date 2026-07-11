import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:provider/provider.dart';
import 'package:image_picker/image_picker.dart';
import 'package:geolocator/geolocator.dart';
import '../theme/app_theme.dart';
import '../services/supabase_service.dart';
import '../services/notification_service.dart';
import '../providers/driver_state.dart';
import '../widgets/app_snackbar.dart';
import '../utils/timezone_utils.dart';

enum MessageType { text, voice, location, image }
enum MessageStatus { sending, sent, delivered, read }

class ChatMessage {
  final String id;
  final String text;
  final bool isDriver;
  final DateTime time;
  final MessageType type;
  final MessageStatus status;
  final String? reaction;
  final int? voiceDuration;
  final String? locationName;

  ChatMessage({
    required this.id,
    required this.text,
    required this.isDriver,
    required this.time,
    this.type = MessageType.text,
    this.status = MessageStatus.read,
    this.reaction,
    this.voiceDuration,
    this.locationName,
  });

  ChatMessage copyWith({String? reaction, MessageStatus? status}) {
    return ChatMessage(
      id: id,
      text: text,
      isDriver: isDriver,
      time: time,
      type: type,
      status: status ?? this.status,
      reaction: reaction ?? this.reaction,
      voiceDuration: voiceDuration,
      locationName: locationName,
    );
  }
}

class _QuickReply {
  final IconData icon;
  final String text;
  final Color color;

  _QuickReply({required this.icon, required this.text, required this.color});
}

class ChatScreen extends StatefulWidget {
  final String customerName;
  final String customerPhone;
  final String? customerPhoto;
  final String? pickupLocation;
  final String? rideId;

  const ChatScreen({
    super.key,
    required this.customerName,
    required this.customerPhone,
    this.customerPhoto,
    this.pickupLocation,
    this.rideId,
  });

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> with TickerProviderStateMixin {
  final TextEditingController _messageController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final FocusNode _focusNode = FocusNode();
  final List<ChatMessage> _messages = [];
  RealtimeChannel? _chatSubscription;
  String? _myDriverId;

  bool _isTyping = false;
  bool _customerTyping = false;
  bool _isRecording = false;
  int _recordingSeconds = 0;
  Timer? _recordingTimer;
  Timer? _pollTimer;
  late AnimationController _recordingController;
  late Animation<double> _recordingAnimation;
  final Set<String> _seenMessageIds = {};


  final List<_QuickReply> _quickReplies = [
    _QuickReply(icon: Icons.navigation, text: "On my way!", color: AppColors.success),
    _QuickReply(icon: Icons.location_on, text: "I've arrived", color: AppColors.yellow),
    _QuickReply(icon: Icons.door_front_door, text: "Please come out", color: AppColors.info),
    _QuickReply(icon: Icons.access_time, text: "5 mins away", color: AppColors.warning),
    _QuickReply(icon: Icons.local_parking, text: "Parked outside", color: AppColors.success),
  ];

  final List<String> _reactions = ['👍', '❤️', '😊', '👏', '🙏'];

  @override
  void initState() {
    super.initState();
    NotificationService.setChatScreenOpen(true);
    _recordingController = AnimationController(
      duration: const Duration(milliseconds: 1000),
      vsync: this,
    )..repeat(reverse: true);
    _recordingAnimation = Tween<double>(begin: 1.0, end: 1.3).animate(
      CurvedAnimation(parent: _recordingController, curve: Curves.easeInOut),
    );

    WidgetsBinding.instance.addPostFrameCallback((_) {
      _myDriverId = Provider.of<DriverState>(context, listen: false).driverId;
      if (widget.rideId != null) {
        _loadMessages();
        _subscribeToMessages();
        _startPolling();
      } else {
        // No mock messages - show empty chat when no ride
        setState(() {});
      }
    });
    _messageController.addListener(_onTextChanged);
  }

  Future<void> _loadMessages() async {
    if (widget.rideId == null) return;

    try {
      final messages = await SupabaseService.getChatMessages(widget.rideId!);
      if (!mounted) return;

      // Track all message IDs (no notification needed when IN chat screen - messages appear directly)
      for (final msg in messages) {
        final msgId = msg['id']?.toString() ?? '';
        _seenMessageIds.add(msgId);
      }

      _messages.clear();
      for (final msg in messages) {
        final isDriver = msg['sender_type'] == 'driver';
        _messages.add(ChatMessage(
          id: msg['id'] ?? '',
          text: msg['message'] ?? '',
          isDriver: isDriver,
          time: MaldivesTimezone.parse(msg['created_at']) ?? MaldivesTimezone.now(),
          status: MessageStatus.read,
        ));
      }

      // Mark messages as read
      await SupabaseService.markMessagesAsRead(widget.rideId!, userId: _myDriverId);
    } catch (e) {
      debugPrint('Error loading messages: $e');
    }
    if (mounted) setState(() {});
    _scrollToBottom();
  }

  void _subscribeToMessages() {
    if (widget.rideId == null) return;

    debugPrint('DriverChatScreen: Subscribing to messages for ride ${widget.rideId}');
    _chatSubscription = SupabaseService.subscribeToChatMessages(
      widget.rideId!,
      (newMessage) {
        debugPrint('DriverChatScreen: Received realtime message: $newMessage');
        if (!mounted) return;

        final isDriver = newMessage['sender_type'] == 'driver';
        final msg = ChatMessage(
          id: newMessage['id'] ?? '',
          text: newMessage['message'] ?? '',
          isDriver: isDriver,
          time: MaldivesTimezone.parse(newMessage['created_at']) ?? MaldivesTimezone.now(),
          status: MessageStatus.read,
        );

        // Don't add duplicates
        if (!_messages.any((m) => m.id == msg.id)) {
          debugPrint('DriverChatScreen: Adding message to UI');
          setState(() => _messages.add(msg));
          _scrollToBottom();

          // Haptic feedback for new customer messages
          if (!isDriver) {
            HapticFeedback.lightImpact();
          }
        }
      },
    );
  }

  // Mock messages removed - chat starts empty

  void _onTextChanged() {
    final hasText = _messageController.text.isNotEmpty;
    if (hasText != _isTyping) {
      setState(() => _isTyping = hasText);
    }
  }

  void _startPolling() {
    _pollTimer = Timer.periodic(const Duration(seconds: 3), (_) {
      _loadMessages();
    });
  }

  @override
  void dispose() {
    NotificationService.setChatScreenOpen(false);
    _pollTimer?.cancel();
    _messageController.dispose();
    _scrollController.dispose();
    _focusNode.dispose();
    _recordingTimer?.cancel();
    _recordingController.dispose();
    _chatSubscription?.unsubscribe();
    super.dispose();
  }

  Future<void> _sendMessage(String text, {MessageType type = MessageType.text, int? voiceDuration, String? locationName}) async {
    if (text.trim().isEmpty && type == MessageType.text) return;

    final messageText = text.trim();
    _messageController.clear();

    // If we have a real ride, send to Supabase
    if (widget.rideId != null) {
      try {
        await SupabaseService.sendChatMessage(
          rideId: widget.rideId!,
          message: messageText,
          senderType: 'driver',
          senderId: _myDriverId,
        );
        // Message will be added via the subscription
      } catch (e) {
        debugPrint('Error sending message: $e');
        AppSnackbar.error(context, 'Failed to send message');
      }
      return;
    }

    // Fallback when no ride - just show message locally
    final message = ChatMessage(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      text: messageText,
      isDriver: true,
      time: DateTime.now(),
      type: type,
      status: MessageStatus.sent,
      voiceDuration: voiceDuration,
      locationName: locationName,
    );

    setState(() => _messages.add(message));
    _scrollToBottom();
  }

  void _updateMessageStatus(String id, MessageStatus status) {
    setState(() {
      final index = _messages.indexWhere((m) => m.id == id);
      if (index != -1) {
        _messages[index] = _messages[index].copyWith(status: status);
      }
    });
  }

  void _scrollToBottom() {
    Future.delayed(const Duration(milliseconds: 100), () {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          0,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _showReactionPicker(ChatMessage message) {
    HapticFeedback.mediumImpact();
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        margin: const EdgeInsets.all(16),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        decoration: BoxDecoration(
          color: context.cardColor,
          borderRadius: BorderRadius.circular(24),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: _reactions.map((emoji) {
            return GestureDetector(
              onTap: () {
                HapticFeedback.lightImpact();
                setState(() {
                  final index = _messages.indexWhere((m) => m.id == message.id);
                  if (index != -1) {
                    _messages[index] = _messages[index].copyWith(
                      reaction: _messages[index].reaction == emoji ? null : emoji,
                    );
                  }
                });
                Navigator.pop(ctx);
              },
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: message.reaction == emoji
                      ? AppColors.yellow.withValues(alpha: 0.2)
                      : Colors.transparent,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(emoji, style: const TextStyle(fontSize: 28)),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }

  Future<void> _sendLocation() async {
    HapticFeedback.mediumImpact();
    try {
      final position = await Geolocator.getCurrentPosition(desiredAccuracy: LocationAccuracy.high);
      final mapUrl = 'https://maps.google.com/?q=${position.latitude},${position.longitude}';
      _sendMessage(
        "📍 My location: $mapUrl",
        type: MessageType.location,
        locationName: "Current location (${position.latitude.toStringAsFixed(4)}, ${position.longitude.toStringAsFixed(4)})",
      );
    } catch (e) {
      AppSnackbar.error(context, 'Failed to get location');
    }
  }

  Future<void> _pickAndSendImage(ImageSource source) async {
    HapticFeedback.lightImpact();
    try {
      final picker = ImagePicker();
      final pickedFile = await picker.pickImage(source: source, imageQuality: 70, maxWidth: 1024);
      if (pickedFile == null) return;

      // Show sending state
      final tempId = DateTime.now().millisecondsSinceEpoch.toString();
      setState(() {
        _messages.add(ChatMessage(
          id: tempId,
          text: 'Uploading image...',
          isDriver: true,
          time: DateTime.now(),
          type: MessageType.image,
          status: MessageStatus.sending,
        ));
      });

      // Upload to Supabase Storage
      final file = File(pickedFile.path);
      final fileName = 'chat_${widget.rideId}_${DateTime.now().millisecondsSinceEpoch}.jpg';
      final path = 'chat-images/$fileName';

      final imageUrl = await SupabaseService.uploadFile(
        bucket: 'chat-images',
        path: path,
        file: file,
      );

      if (imageUrl != null) {
        // Update message with actual URL
        setState(() {
          final idx = _messages.indexWhere((m) => m.id == tempId);
          if (idx >= 0) {
            _messages[idx] = ChatMessage(
              id: tempId,
              text: imageUrl,
              isDriver: true,
              time: DateTime.now(),
              type: MessageType.image,
              status: MessageStatus.sent,
            );
          }
        });

        // Send to Supabase chat messages table if ride exists
        if (widget.rideId != null) {
          await SupabaseService.sendChatMessage(
            rideId: widget.rideId!,
            message: imageUrl,
            senderType: 'driver',
          );
        }

        AppSnackbar.success(context, 'Image sent');
      } else {
        // Remove failed message
        setState(() {
          _messages.removeWhere((m) => m.id == tempId);
        });
        AppSnackbar.error(context, 'Failed to upload image');
      }
    } catch (e) {
      AppSnackbar.error(context, 'Failed to send image');
    }
  }

  void _toggleRecording() {
    HapticFeedback.mediumImpact();
    AppSnackbar.info(context, 'Voice messages coming soon');
  }

  void _cancelRecording() {
    HapticFeedback.mediumImpact();
    _recordingTimer?.cancel();
    setState(() {
      _isRecording = false;
      _recordingSeconds = 0;
    });
  }

  String _formatRecordingTime(int seconds) {
    final mins = seconds ~/ 60;
    final secs = seconds % 60;
    return '$mins:${secs.toString().padLeft(2, '0')}';
  }

  String _formatTime(DateTime time) {
    final hour = time.hour.toString().padLeft(2, '0');
    final minute = time.minute.toString().padLeft(2, '0');
    return '$hour:$minute';
  }

  @override
  Widget build(BuildContext context) {
    final isKeyboardOpen = MediaQuery.of(context).viewInsets.bottom > 0;

    return Scaffold(
      backgroundColor: context.bgColor,
      resizeToAvoidBottomInset: true,
      body: Column(
        children: [
          _buildHeader(context),
          if (!isKeyboardOpen) _buildTripInfo(context),
          Expanded(child: _buildMessageList(context)),
          if (_customerTyping) _buildTypingIndicator(context),
          if (!isKeyboardOpen) _buildQuickReplies(context),
          _buildInputBar(context),
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
            color: Colors.black.withValues(alpha: 0.1),
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
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: context.bgColor,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(Icons.arrow_back, color: context.textColor, size: 22),
            ),
          ),
          const SizedBox(width: 12),

          // Customer avatar
          Stack(
            children: [
              Container(
                width: 50,
                height: 50,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [AppColors.yellow, AppColors.yellow.withValues(alpha: 0.7)],
                  ),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: widget.customerPhoto != null
                    ? ClipRRect(
                        borderRadius: BorderRadius.circular(16),
                        child: Image.network(widget.customerPhoto!, fit: BoxFit.cover),
                      )
                    : const Icon(Icons.person, color: Colors.black, size: 28),
              ),
              Positioned(
                right: 0,
                bottom: 0,
                child: Container(
                  width: 14,
                  height: 14,
                  decoration: BoxDecoration(
                    color: AppColors.success,
                    shape: BoxShape.circle,
                    border: Border.all(color: context.cardColor, width: 2),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(width: 12),

          // Customer info
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.customerName,
                  style: TextStyle(
                    color: context.textColor,
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 2),
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
                      'Customer • Online',
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

          // Call button
          GestureDetector(
            onTap: () async {
              HapticFeedback.mediumImpact();
              final uri = Uri.parse('tel:${widget.customerPhone}');
              if (await canLaunchUrl(uri)) {
                await launchUrl(uri);
              }
            },
            child: Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: AppColors.success.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(14),
              ),
              child: const Icon(Icons.phone, color: AppColors.success, size: 22),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTripInfo(BuildContext context) {
    if (widget.pickupLocation == null) return const SizedBox.shrink();

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            AppColors.yellow.withValues(alpha: 0.15),
            AppColors.yellow.withValues(alpha: 0.05),
          ],
        ),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(6),
            decoration: BoxDecoration(
              color: AppColors.yellow.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Icon(Icons.location_on, color: AppColors.yellow, size: 16),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Pickup Location',
                  style: TextStyle(
                    color: context.mutedColor,
                    fontSize: 11,
                  ),
                ),
                Text(
                  widget.pickupLocation!,
                  style: TextStyle(
                    color: context.textColor,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: AppColors.success,
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Text(
              'ACTIVE',
              style: TextStyle(
                color: Colors.white,
                fontSize: 10,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMessageList(BuildContext context) {
    return ListView.builder(
      controller: _scrollController,
      reverse: true,
      padding: const EdgeInsets.all(16),
      itemCount: _messages.length,
      itemBuilder: (context, index) {
        final reversedIndex = _messages.length - 1 - index;
        final message = _messages[reversedIndex];
        final showDate = reversedIndex == 0 ||
            _messages[reversedIndex - 1].time.day != message.time.day;

        return Column(
          children: [
            _buildMessageBubble(context, message),
            if (showDate) _buildDateSeparator(context, message.time),
          ],
        );
      },
    );
  }

  Widget _buildDateSeparator(BuildContext context, DateTime date) {
    final now = MaldivesTimezone.now();
    String text;
    if (date.year == now.year && date.month == now.month && date.day == now.day) {
      text = 'Today';
    } else if (date.year == now.year && date.month == now.month && date.day == now.day - 1) {
      text = 'Yesterday';
    } else {
      text = '${date.day}/${date.month}/${date.year}';
    }

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 16),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      decoration: BoxDecoration(
        color: context.cardColor,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: context.mutedColor,
          fontSize: 11,
          fontWeight: FontWeight.w500,
        ),
      ),
    );
  }

  Widget _buildMessageBubble(BuildContext context, ChatMessage message) {
    final isDriver = message.isDriver;

    return GestureDetector(
      onLongPress: () => _showReactionPicker(message),
      child: Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(
          mainAxisAlignment: isDriver ? MainAxisAlignment.end : MainAxisAlignment.start,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            if (!isDriver) ...[
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: AppColors.yellow,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.person, color: Colors.black, size: 18),
              ),
              const SizedBox(width: 8),
            ],

            Flexible(
              child: Column(
                crossAxisAlignment: isDriver ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                children: [
                  Stack(
                    clipBehavior: Clip.none,
                    children: [
                      Container(
                        constraints: BoxConstraints(
                          maxWidth: MediaQuery.of(context).size.width * 0.7,
                        ),
                        padding: EdgeInsets.all(message.type == MessageType.location ? 0 : 12),
                        decoration: BoxDecoration(
                          gradient: isDriver
                              ? LinearGradient(
                                  colors: [AppColors.success, AppColors.success.withValues(alpha: 0.85)],
                                )
                              : null,
                          color: isDriver ? null : context.cardColor,
                          borderRadius: BorderRadius.only(
                            topLeft: const Radius.circular(18),
                            topRight: const Radius.circular(18),
                            bottomLeft: Radius.circular(isDriver ? 18 : 4),
                            bottomRight: Radius.circular(isDriver ? 4 : 18),
                          ),
                          border: isDriver ? null : Border.all(color: context.borderColor),
                          boxShadow: [
                            BoxShadow(
                              color: (isDriver ? AppColors.success : Colors.black).withValues(alpha: 0.1),
                              blurRadius: 8,
                              offset: const Offset(0, 2),
                            ),
                          ],
                        ),
                        child: _buildMessageContent(context, message),
                      ),

                      // Reaction badge
                      if (message.reaction != null)
                        Positioned(
                          bottom: -8,
                          right: isDriver ? null : 8,
                          left: isDriver ? 8 : null,
                          child: Container(
                            padding: const EdgeInsets.all(4),
                            decoration: BoxDecoration(
                              color: context.cardColor,
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(color: context.borderColor),
                            ),
                            child: Text(message.reaction!, style: const TextStyle(fontSize: 12)),
                          ),
                        ),
                    ],
                  ),

                  // Time and status
                  Padding(
                    padding: EdgeInsets.only(
                      top: message.reaction != null ? 12 : 4,
                      left: 4,
                      right: 4,
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          _formatTime(message.time),
                          style: TextStyle(
                            color: context.mutedColor,
                            fontSize: 10,
                          ),
                        ),
                        if (isDriver) ...[
                          const SizedBox(width: 4),
                          _buildStatusIcon(message.status),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),

            if (isDriver) const SizedBox(width: 8),
          ],
        ),
      ),
    );
  }

  Widget _buildMessageContent(BuildContext context, ChatMessage message) {
    final isDriver = message.isDriver;

    switch (message.type) {
      case MessageType.voice:
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: isDriver ? Colors.white.withValues(alpha: 0.2) : AppColors.success,
                borderRadius: BorderRadius.circular(18),
              ),
              child: Icon(Icons.play_arrow, color: isDriver ? Colors.white : Colors.white, size: 22),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 100,
                  height: 24,
                  decoration: BoxDecoration(
                    color: (isDriver ? Colors.white : context.mutedColor).withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '0:${message.voiceDuration?.toString().padLeft(2, '0') ?? '00'}',
                  style: TextStyle(
                    color: isDriver ? Colors.white70 : context.mutedColor,
                    fontSize: 11,
                  ),
                ),
              ],
            ),
          ],
        );

      case MessageType.location:
        return ClipRRect(
          borderRadius: BorderRadius.circular(18),
          child: Column(
            children: [
              Container(
                width: 200,
                height: 100,
                color: context.bgColor,
                child: Stack(
                  children: [
                    Center(
                      child: Icon(Icons.map, color: context.mutedColor, size: 40),
                    ),
                    Center(
                      child: Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: AppColors.success,
                          shape: BoxShape.circle,
                          boxShadow: [
                            BoxShadow(
                              color: AppColors.success.withValues(alpha: 0.4),
                              blurRadius: 8,
                            ),
                          ],
                        ),
                        child: const Icon(Icons.directions_car, color: Colors.white, size: 18),
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                width: 200,
                padding: const EdgeInsets.all(10),
                color: isDriver ? AppColors.success : context.cardColor,
                child: Row(
                  children: [
                    Icon(
                      Icons.location_on,
                      color: isDriver ? Colors.white : AppColors.success,
                      size: 16,
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        message.locationName ?? 'Location',
                        style: TextStyle(
                          color: isDriver ? Colors.white : context.textColor,
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );

      default:
        return Text(
          message.text,
          style: TextStyle(
            color: isDriver ? Colors.white : context.textColor,
            fontSize: 15,
          ),
        );
    }
  }

  Widget _buildStatusIcon(MessageStatus status) {
    switch (status) {
      case MessageStatus.sending:
        return SizedBox(
          width: 12,
          height: 12,
          child: CircularProgressIndicator(
            strokeWidth: 1.5,
            color: context.mutedColor,
          ),
        );
      case MessageStatus.sent:
        return Icon(Icons.check, color: context.mutedColor, size: 14);
      case MessageStatus.delivered:
        return Icon(Icons.done_all, color: context.mutedColor, size: 14);
      case MessageStatus.read:
        return const Icon(Icons.done_all, color: AppColors.info, size: 14);
    }
  }

  Widget _buildTypingIndicator(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: AppColors.yellow,
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(Icons.person, color: Colors.black, size: 18),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: BoxDecoration(
              color: context.cardColor,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: context.borderColor),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: List.generate(3, (index) {
                return TweenAnimationBuilder<double>(
                  tween: Tween(begin: 0.0, end: 1.0),
                  duration: Duration(milliseconds: 600 + (index * 200)),
                  builder: (context, value, child) {
                    return Container(
                      margin: EdgeInsets.only(right: index < 2 ? 4 : 0),
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                        color: context.mutedColor.withValues(alpha: 0.3 + (0.7 * (1 - ((value + index * 0.3) % 1)))),
                        shape: BoxShape.circle,
                      ),
                    );
                  },
                );
              }),
            ),
          ),
          const SizedBox(width: 8),
          Text(
            '${widget.customerName.split(' ').first} is typing...',
            style: TextStyle(
              color: context.mutedColor,
              fontSize: 12,
              fontStyle: FontStyle.italic,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildQuickReplies(BuildContext context) {
    return Container(
      height: 54,
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
                _sendMessage(reply.text);
              },
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: reply.color.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: reply.color.withValues(alpha: 0.3)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(reply.icon, color: reply.color, size: 16),
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
    return Container(
      padding: EdgeInsets.fromLTRB(12, 12, 12, isKeyboardOpen ? 12 : MediaQuery.of(context).padding.bottom + 12),
      decoration: BoxDecoration(
        color: context.cardColor,
        border: Border(top: BorderSide(color: context.borderColor)),
      ),
      child: _isRecording
        ? Row(
            children: [
              GestureDetector(
                onTap: _cancelRecording,
                child: Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: AppColors.error.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: const Icon(Icons.delete, color: AppColors.error, size: 22),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Container(
                  height: 44,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  decoration: BoxDecoration(
                    color: context.bgColor,
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(color: AppColors.error.withValues(alpha: 0.3)),
                  ),
                  child: Row(
                    children: [
                      AnimatedBuilder(
                        animation: _recordingAnimation,
                        builder: (context, child) => Transform.scale(
                          scale: _recordingAnimation.value * 0.8,
                          child: Container(
                            width: 12,
                            height: 12,
                            decoration: const BoxDecoration(color: AppColors.error, shape: BoxShape.circle),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Text('Recording ${_formatRecordingTime(_recordingSeconds)}', style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w500)),
                      const Spacer(),
                      ...List.generate(5, (i) => Container(
                        width: 3,
                        height: 8 + (i % 3) * 6.0,
                        margin: const EdgeInsets.symmetric(horizontal: 2),
                        decoration: BoxDecoration(color: AppColors.error, borderRadius: BorderRadius.circular(2)),
                      )),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 10),
              GestureDetector(
                onTap: _toggleRecording,
                child: Container(
                  width: 50,
                  height: 50,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(colors: [AppColors.success, AppColors.success]),
                    borderRadius: BorderRadius.circular(25),
                  ),
                  child: const Icon(Icons.send, color: Colors.white, size: 22),
                ),
              ),
            ],
          )
        : Row(
            children: [
              GestureDetector(
                onTap: () {
                  HapticFeedback.lightImpact();
                  _showAttachmentOptions(context);
                },
                child: Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: context.bgColor,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(Icons.add, color: context.textColor, size: 24),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Container(
                  decoration: BoxDecoration(
                    color: context.bgColor,
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(color: context.borderColor),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _messageController,
                          focusNode: _focusNode,
                          style: TextStyle(color: context.textColor),
                          decoration: InputDecoration(
                            hintText: 'Type a message...',
                            hintStyle: TextStyle(color: context.mutedColor),
                            border: InputBorder.none,
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 16,
                              vertical: 12,
                            ),
                          ),
                          onSubmitted: _sendMessage,
                        ),
                      ),
                      GestureDetector(
                        onTap: () => HapticFeedback.lightImpact(),
                        child: Padding(
                          padding: const EdgeInsets.only(right: 12),
                          child: Icon(Icons.emoji_emotions_outlined, color: context.mutedColor, size: 22),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 10),
              GestureDetector(
                onTap: () {
                  HapticFeedback.mediumImpact();
                  if (_isTyping) {
                    _sendMessage(_messageController.text);
                  } else {
                    _toggleRecording();
                  }
                },
                child: Container(
                  width: 50,
                  height: 50,
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [AppColors.success, AppColors.success.withValues(alpha: 0.85)],
                    ),
                    borderRadius: BorderRadius.circular(25),
                    boxShadow: [
                      BoxShadow(
                        color: AppColors.success.withValues(alpha: 0.4),
                        blurRadius: 12,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: Icon(
                    _isTyping ? Icons.send : Icons.mic,
                    color: Colors.white,
                    size: 22,
                  ),
                ),
              ),
            ],
          ),
    );
  }

  void _showAttachmentOptions(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        padding: const EdgeInsets.all(24),
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
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                _buildAttachmentOption(
                  context,
                  icon: Icons.location_on,
                  label: 'Location',
                  color: AppColors.error,
                  onTap: () {
                    Navigator.pop(ctx);
                    _sendLocation();
                  },
                ),
                _buildAttachmentOption(
                  context,
                  icon: Icons.camera_alt,
                  label: 'Camera',
                  color: AppColors.info,
                  onTap: () {
                    Navigator.pop(ctx);
                    _pickAndSendImage(ImageSource.camera);
                  },
                ),
                _buildAttachmentOption(
                  context,
                  icon: Icons.photo,
                  label: 'Photo',
                  color: AppColors.success,
                  onTap: () {
                    Navigator.pop(ctx);
                    _pickAndSendImage(ImageSource.gallery);
                  },
                ),
              ],
            ),
            SizedBox(height: MediaQuery.of(ctx).padding.bottom + 16),
          ],
        ),
      ),
    );
  }

  Widget _buildAttachmentOption(
    BuildContext context, {
    required IconData icon,
    required String label,
    required Color color,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        children: [
          Container(
            width: 60,
            height: 60,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Icon(icon, color: color, size: 28),
          ),
          const SizedBox(height: 8),
          Text(
            label,
            style: TextStyle(
              color: context.textColor,
              fontSize: 13,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}
