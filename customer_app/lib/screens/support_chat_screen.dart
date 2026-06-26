import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:provider/provider.dart';
import 'dart:async';
import '../theme/app_theme.dart';
import '../services/supabase_service.dart';
import '../providers/app_state.dart';
import '../widgets/app_snackbar.dart';

class SupportChatMessage {
  final String id;
  final String text;
  final bool isCustomer;
  final DateTime time;
  final bool isRead;

  SupportChatMessage({
    required this.id,
    required this.text,
    required this.isCustomer,
    required this.time,
    this.isRead = false,
  });
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

  String? _chatId;
  bool _isLoading = true;
  bool _isSending = false;
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
              time: (DateTime.tryParse(msg['created_at'] ?? '') ?? DateTime.now()).toLocal(),
              isRead: msg['is_read'] ?? false,
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
              time: (DateTime.tryParse(newMessage['created_at'] ?? '') ?? DateTime.now()).toLocal(),
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

  Future<void> _sendMessage(String text) async {
    if (text.trim().isEmpty || _chatId == null || _isSending) return;

    final message = SupportChatMessage(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      text: text.trim(),
      isCustomer: true,
      time: DateTime.now(),
    );

    setState(() {
      _messages.add(message);
      _isSending = true;
    });
    _messageController.clear();
    _scrollToBottom();

    final success = await SupabaseService.sendSupportChatMessage(
      chatId: _chatId!,
      message: text.trim(),
    );

    if (mounted) {
      setState(() => _isSending = false);
      if (!success) {
        AppSnackbar.error(context, 'Failed to send message');
      }
    }
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
                  child: Text(
                    message.text,
                    style: TextStyle(
                      color: isCustomer ? Colors.black : context.textColor,
                      fontSize: 15,
                    ),
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
                _sendMessage(reply.text);
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
                onSubmitted: _sendMessage,
                onTap: () => _focusNode.requestFocus(),
              ),
            ),
          ),
          const SizedBox(width: 10),
          GestureDetector(
            onTap: () {
              HapticFeedback.mediumImpact();
              if (hasText) {
                _sendMessage(_messageController.text);
              }
            },
            child: Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: hasText
                      ? [AppColors.yellow, AppColors.yellow.withValues(alpha: 0.9)]
                      : [context.mutedColor, context.mutedColor.withValues(alpha: 0.5)],
                ),
                borderRadius: BorderRadius.circular(24),
              ),
              child: Icon(
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
