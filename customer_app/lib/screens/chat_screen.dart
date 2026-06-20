import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:provider/provider.dart';
import 'package:image_picker/image_picker.dart';
import 'dart:async';
import '../theme/app_theme.dart';
import '../services/supabase_service.dart';
import '../services/notification_service.dart';
import '../providers/app_state.dart';

enum MessageType { text, voice, location, image }
enum MessageStatus { sending, sent, delivered, read }

class ChatMessage {
  final String id;
  final String text;
  final bool isCustomer;
  final DateTime time;
  final MessageType type;
  final MessageStatus status;
  final String? reaction;
  final int? voiceDuration;
  final String? locationName;

  ChatMessage({
    required this.id,
    required this.text,
    required this.isCustomer,
    required this.time,
    this.type = MessageType.text,
    this.status = MessageStatus.read,
    this.reaction,
    this.voiceDuration,
    this.locationName,
  });

  ChatMessage copyWith({
    String? reaction,
    MessageStatus? status,
  }) {
    return ChatMessage(
      id: id,
      text: text,
      isCustomer: isCustomer,
      time: time,
      type: type,
      status: status ?? this.status,
      reaction: reaction ?? this.reaction,
      voiceDuration: voiceDuration,
      locationName: locationName,
    );
  }
}

class ChatScreen extends StatefulWidget {
  final String driverName;
  final String driverPhone;
  final String vehicleNumber;
  final String? driverPhoto;
  final double? driverRating;
  final String? rideId;
  final String? driverUserId;
  final String? rideStatus;
  final int? etaMinutes;

  const ChatScreen({
    super.key,
    required this.driverName,
    required this.driverPhone,
    required this.vehicleNumber,
    this.driverPhoto,
    this.driverRating,
    this.rideId,
    this.driverUserId,
    this.rideStatus,
    this.etaMinutes,
  });

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> with TickerProviderStateMixin {
  final TextEditingController _messageController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final FocusNode _focusNode = FocusNode();
  final List<ChatMessage> _messages = [];

  bool _isTyping = false;
  bool _driverTyping = false;
  bool _isRecording = false;
  int _recordingSeconds = 0;
  Timer? _typingTimer;
  Timer? _recordingTimer;
  late AnimationController _recordingController;
  late Animation<double> _recordingAnimation;
  RealtimeChannel? _chatChannel;
  String? _myProfileId;

  final List<_QuickReply> _quickReplies = [
    _QuickReply(icon: Icons.waving_hand, text: "Hi, I'm here!", color: AppColors.yellow),
    _QuickReply(icon: Icons.access_time, text: "Running late", color: AppColors.warning),
    _QuickReply(icon: Icons.location_on, text: "At pickup point", color: AppColors.success),
    _QuickReply(icon: Icons.hourglass_bottom, text: "Please wait", color: AppColors.info),
    _QuickReply(icon: Icons.thumb_up, text: "Thanks!", color: AppColors.success),
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
      _myProfileId = Provider.of<AppState>(context, listen: false).profileId;
      if (widget.rideId != null) {
        _loadMessages();
        _subscribeToMessages();
      }
      // No mock messages - show empty chat when no ride
    });
    _messageController.addListener(_onTextChanged);
  }

  Future<void> _loadMessages() async {
    if (widget.rideId == null) return;
    final appState = Provider.of<AppState>(context, listen: false);
    try {
      final messages = await SupabaseService.getChatMessages(widget.rideId!);
      if (mounted) {
        setState(() {
          _messages.clear();
          for (final msg in messages) {
            final isCustomer = msg['sender_type'] == 'customer';
            _messages.add(ChatMessage(
              id: msg['id'].toString(),
              text: msg['message'] ?? '',
              isCustomer: isCustomer,
              time: DateTime.tryParse(msg['created_at'] ?? '') ?? DateTime.now(),
              status: msg['is_read'] == true ? MessageStatus.read : MessageStatus.delivered,
            ));
          }
        });
        _scrollToBottom();
      }
      await SupabaseService.markMessagesAsRead(widget.rideId!, userId: appState.profileId);
    } catch (e) {
      debugPrint('Error loading messages: $e');
    }
  }

  void _subscribeToMessages() {
    if (widget.rideId == null) return;
    debugPrint('ChatScreen: Subscribing to messages for ride ${widget.rideId}');
    _chatChannel = SupabaseService.subscribeToChatMessages(
      widget.rideId!,
      (newMessage) {
        debugPrint('ChatScreen: Received realtime message: $newMessage');
        final isFromCustomer = newMessage['sender_type'] == 'customer';
        if (mounted && !isFromCustomer) {
          debugPrint('ChatScreen: Adding driver message to UI');
          setState(() {
            _driverTyping = false;
            _messages.add(ChatMessage(
              id: newMessage['id'].toString(),
              text: newMessage['message'] ?? '',
              isCustomer: false,
              time: DateTime.tryParse(newMessage['created_at'] ?? '') ?? DateTime.now(),
              status: MessageStatus.read,
            ));
          });
          _scrollToBottom();
          SupabaseService.markMessagesAsRead(widget.rideId!, userId: _myProfileId);
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

  @override
  void dispose() {
    NotificationService.setChatScreenOpen(false);
    _chatChannel?.unsubscribe();
    _messageController.dispose();
    _scrollController.dispose();
    _focusNode.dispose();
    _typingTimer?.cancel();
    _recordingTimer?.cancel();
    _recordingController.dispose();
    super.dispose();
  }

  String _getStatusText() {
    switch (widget.rideStatus) {
      case 'accepted':
        final eta = widget.etaMinutes ?? 5;
        return 'Driver is $eta min away';
      case 'arrived':
        return 'Driver has arrived';
      case 'in_progress':
        return 'Trip in progress';
      case 'completed':
        return 'Trip completed';
      default:
        return 'Driver is on the way';
    }
  }

  String _getStatusSubtext() {
    switch (widget.rideStatus) {
      case 'accepted':
        return 'Arriving at pickup point';
      case 'arrived':
        return 'Waiting at pickup location';
      case 'in_progress':
        return 'Heading to destination';
      case 'completed':
        return 'Thank you for riding';
      default:
        return 'Getting ready';
    }
  }

  void _sendMessage(String text, {MessageType type = MessageType.text, int? voiceDuration, String? locationName}) async {
    if (text.trim().isEmpty && type == MessageType.text) return;

    final message = ChatMessage(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      text: text.trim(),
      isCustomer: true,
      time: DateTime.now(),
      type: type,
      status: MessageStatus.sending,
      voiceDuration: voiceDuration,
      locationName: locationName,
    );

    setState(() {
      _messages.add(message);
    });

    _messageController.clear();
    _scrollToBottom();

    // Send to Supabase if we have a ride ID
    if (widget.rideId != null) {
      try {
        final appState = Provider.of<AppState>(context, listen: false);
        await SupabaseService.sendChatMessage(
          rideId: widget.rideId!,
          message: text.trim(),
          senderId: appState.profileId,
        );
        if (mounted) {
          setState(() {
            final index = _messages.indexWhere((m) => m.id == message.id);
            if (index != -1) {
              _messages[index] = _messages[index].copyWith(status: MessageStatus.delivered);
            }
          });
        }
      } catch (e) {
        debugPrint('Error sending message: $e');
      }
    } else {
      // Mock mode for demo - simulate status updates
      Future.delayed(const Duration(milliseconds: 500), () {
        if (mounted) {
          setState(() {
            final index = _messages.indexWhere((m) => m.id == message.id);
            if (index != -1) {
              _messages[index] = _messages[index].copyWith(status: MessageStatus.sent);
            }
          });
        }
      });

      Future.delayed(const Duration(seconds: 1), () {
        if (mounted) {
          setState(() {
            final index = _messages.indexWhere((m) => m.id == message.id);
            if (index != -1) {
              _messages[index] = _messages[index].copyWith(status: MessageStatus.delivered);
            }
          });
        }
      });

      // Simulate driver typing and response
      Future.delayed(const Duration(seconds: 2), () {
        if (mounted) {
          setState(() => _driverTyping = true);
          _scrollToBottom();
        }
      });

      Future.delayed(const Duration(seconds: 4), () {
        if (mounted) {
          setState(() {
            _driverTyping = false;
            final index = _messages.indexWhere((m) => m.id == message.id);
            if (index != -1) {
              _messages[index] = _messages[index].copyWith(status: MessageStatus.read);
            }
            _messages.add(ChatMessage(
              id: DateTime.now().millisecondsSinceEpoch.toString(),
              text: "Got it, thanks for letting me know! 👍",
              isCustomer: false,
              time: DateTime.now(),
              status: MessageStatus.read,
            ));
          });
          _scrollToBottom();
        }
      });
    }
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

  void _showEmojiPicker() {
    final emojis = ['😀', '😊', '👍', '❤️', '🙏', '😂', '🎉', '👋', '🚗', '✅', '⭐', '🔥'];
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: context.cardColor,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(width: 40, height: 4, decoration: BoxDecoration(color: context.borderColor, borderRadius: BorderRadius.circular(2))),
            const SizedBox(height: 20),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: emojis.map((emoji) => GestureDetector(
                onTap: () {
                  Navigator.pop(ctx);
                  _messageController.text += emoji;
                  _messageController.selection = TextSelection.fromPosition(TextPosition(offset: _messageController.text.length));
                },
                child: Container(
                  width: 48, height: 48,
                  decoration: BoxDecoration(color: context.surfaceColor, borderRadius: BorderRadius.circular(12)),
                  child: Center(child: Text(emoji, style: TextStyle(fontSize: 24))),
                ),
              )).toList(),
            ),
            SizedBox(height: MediaQuery.of(ctx).padding.bottom + 16),
          ],
        ),
      ),
    );
  }

  Future<void> _pickAndSendImage(ImageSource source) async {
    HapticFeedback.lightImpact();
    try {
      final picker = ImagePicker();
      final pickedFile = await picker.pickImage(source: source, imageQuality: 70, maxWidth: 1024);
      if (pickedFile == null) return;

      // For now, send as a text message indicating image was shared
      // Full implementation would upload to Supabase Storage
      setState(() {
        _messages.add(ChatMessage(
          id: DateTime.now().millisecondsSinceEpoch.toString(),
          text: '📷 Shared an image',
          isCustomer: true,
          time: DateTime.now(),
          type: MessageType.image,
          status: MessageStatus.sent,
        ));
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Image sent'), backgroundColor: AppColors.success),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to pick image'), backgroundColor: AppColors.error),
      );
    }
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
                child: Text(emoji, style: TextStyle(fontSize: 28)),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }

  void _sendLocation() {
    HapticFeedback.mediumImpact();
    _sendMessage(
      "My current location",
      type: MessageType.location,
      locationName: "Customer's location",
    );
  }

  void _toggleRecording() {
    HapticFeedback.mediumImpact();
    if (_isRecording) {
      _stopRecording();
    } else {
      _startRecording();
    }
  }

  void _startRecording() {
    HapticFeedback.heavyImpact();
    setState(() {
      _isRecording = true;
      _recordingSeconds = 0;
    });
    _recordingTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (mounted) {
        setState(() => _recordingSeconds++);
      }
    });
  }

  void _stopRecording() {
    _recordingTimer?.cancel();
    final duration = _recordingSeconds;
    setState(() {
      _isRecording = false;
      _recordingSeconds = 0;
    });
    if (duration >= 1) {
      _sendMessage("Voice message", type: MessageType.voice, voiceDuration: duration);
    }
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
          if (!isKeyboardOpen) _buildStatusBar(context),
          Expanded(child: _buildMessageList(context)),
          if (_driverTyping) _buildTypingIndicator(context),
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

          // Driver avatar with online indicator
          Stack(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [AppColors.success, AppColors.success.withValues(alpha: 0.7)],
                  ),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: widget.driverPhoto != null
                    ? ClipRRect(
                        borderRadius: BorderRadius.circular(16),
                        child: Image.network(widget.driverPhoto!, fit: BoxFit.cover),
                      )
                    : Icon(Icons.person, color: Colors.white, size: 28),
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

          // Driver info
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      widget.driverName,
                      style: TextStyle(
                        color: context.textColor,
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(width: 6),
                    if (widget.driverRating != null) ...[
                      Icon(Icons.star, color: AppColors.yellow, size: 14),
                      const SizedBox(width: 2),
                      Text(
                        widget.driverRating!.toStringAsFixed(1),
                        style: TextStyle(
                          color: context.mutedColor,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 2),
                Row(
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                        color: AppColors.success,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      'Online • ${widget.vehicleNumber}',
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

          // Action buttons
          _buildHeaderAction(Icons.phone, AppColors.success, () async {
            HapticFeedback.mediumImpact();
            final uri = Uri.parse('tel:${widget.driverPhone}');
            if (await canLaunchUrl(uri)) {
              await launchUrl(uri);
            }
          }),
          const SizedBox(width: 8),
          _buildHeaderAction(Icons.videocam, AppColors.info, () {
            HapticFeedback.lightImpact();
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text('Video call coming soon'),
                backgroundColor: context.cardColor,
                behavior: SnackBarBehavior.floating,
              ),
            );
          }),
        ],
      ),
    );
  }

  Widget _buildHeaderAction(IconData icon, Color color, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.15),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Icon(icon, color: color, size: 20),
      ),
    );
  }

  Widget _buildStatusBar(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            AppColors.success.withValues(alpha: 0.15),
            AppColors.success.withValues(alpha: 0.05),
          ],
        ),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(6),
            decoration: BoxDecoration(
              color: AppColors.success.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(Icons.navigation, color: AppColors.success, size: 16),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _getStatusText(),
                  style: TextStyle(
                    color: context.textColor,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                Text(
                  _getStatusSubtext(),
                  style: TextStyle(
                    color: context.mutedColor,
                    fontSize: 11,
                  ),
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
            child: Text(
              'LIVE',
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
    final now = DateTime.now();
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
    final isCustomer = message.isCustomer;

    return GestureDetector(
      onLongPress: () => _showReactionPicker(message),
      child: Padding(
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
                  color: AppColors.success,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(Icons.directions_car, color: Colors.white, size: 18),
              ),
              const SizedBox(width: 8),
            ],

            Flexible(
              child: Column(
                crossAxisAlignment: isCustomer ? CrossAxisAlignment.end : CrossAxisAlignment.start,
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
                          boxShadow: [
                            BoxShadow(
                              color: (isCustomer ? AppColors.yellow : Colors.black).withValues(alpha: 0.1),
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
                          right: isCustomer ? null : 8,
                          left: isCustomer ? 8 : null,
                          child: Container(
                            padding: const EdgeInsets.all(4),
                            decoration: BoxDecoration(
                              color: context.cardColor,
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(color: context.borderColor),
                            ),
                            child: Text(message.reaction!, style: TextStyle(fontSize: 12)),
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
                        if (isCustomer) ...[
                          const SizedBox(width: 4),
                          _buildStatusIcon(message.status),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),

            if (isCustomer) const SizedBox(width: 8),
          ],
        ),
      ),
    );
  }

  Widget _buildMessageContent(BuildContext context, ChatMessage message) {
    final isCustomer = message.isCustomer;

    switch (message.type) {
      case MessageType.voice:
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: isCustomer ? Colors.black.withValues(alpha: 0.15) : AppColors.yellow,
                borderRadius: BorderRadius.circular(18),
              ),
              child: Icon(
                Icons.play_arrow,
                color: isCustomer ? Colors.black : Colors.black,
                size: 22,
              ),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 100,
                  height: 24,
                  decoration: BoxDecoration(
                    color: (isCustomer ? Colors.black : context.mutedColor).withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '0:${message.voiceDuration?.toString().padLeft(2, '0') ?? '00'}',
                  style: TextStyle(
                    color: isCustomer ? Colors.black54 : context.mutedColor,
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
                height: 120,
                color: context.bgColor,
                child: Stack(
                  children: [
                    Center(
                      child: Icon(
                        Icons.map,
                        color: context.mutedColor,
                        size: 48,
                      ),
                    ),
                    Center(
                      child: Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: AppColors.error,
                          shape: BoxShape.circle,
                          boxShadow: [
                            BoxShadow(
                              color: AppColors.error.withValues(alpha: 0.4),
                              blurRadius: 8,
                            ),
                          ],
                        ),
                        child: Icon(Icons.location_on, color: Colors.white, size: 20),
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                width: 200,
                padding: const EdgeInsets.all(12),
                color: isCustomer ? AppColors.yellow : context.cardColor,
                child: Row(
                  children: [
                    Icon(
                      Icons.location_on,
                      color: isCustomer ? Colors.black : AppColors.error,
                      size: 16,
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        message.locationName ?? 'Location',
                        style: TextStyle(
                          color: isCustomer ? Colors.black : context.textColor,
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
            color: isCustomer ? Colors.black : context.textColor,
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
        return Icon(Icons.done_all, color: AppColors.info, size: 14);
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
              color: AppColors.success,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(Icons.directions_car, color: Colors.white, size: 18),
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
            '${widget.driverName.split(' ').first} is typing...',
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
                _sendMessage(reply.text);
              },
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: reply.color.withValues(alpha: 0.1),
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
                  child: Icon(Icons.delete, color: AppColors.error, size: 22),
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
                            decoration: BoxDecoration(color: AppColors.error, shape: BoxShape.circle),
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
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(colors: [AppColors.yellow, AppColors.yellow]),
                    borderRadius: BorderRadius.circular(24),
                  ),
                  child: Icon(Icons.send, color: Colors.black, size: 22),
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
                  height: 48,
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
                          style: TextStyle(color: context.textColor, fontSize: 15),
                          keyboardType: TextInputType.text,
                          textInputAction: TextInputAction.send,
                          textCapitalization: TextCapitalization.sentences,
                          decoration: InputDecoration(
                            hintText: 'Type a message...',
                            hintStyle: TextStyle(color: context.mutedColor, fontSize: 15),
                            border: InputBorder.none,
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 16,
                              vertical: 14,
                            ),
                          ),
                          onSubmitted: _sendMessage,
                        ),
                      ),
                      GestureDetector(
                        onTap: () {
                          HapticFeedback.lightImpact();
                          _showEmojiPicker();
                        },
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
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [AppColors.yellow, AppColors.yellow.withValues(alpha: 0.9)],
                    ),
                    borderRadius: BorderRadius.circular(24),
                    boxShadow: [
                      BoxShadow(
                        color: AppColors.yellow.withValues(alpha: 0.4),
                        blurRadius: 12,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: Icon(
                    _isTyping ? Icons.send : Icons.mic,
                    color: Colors.black,
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
                  label: 'Gallery',
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

class _QuickReply {
  final IconData icon;
  final String text;
  final Color color;

  _QuickReply({required this.icon, required this.text, required this.color});
}
