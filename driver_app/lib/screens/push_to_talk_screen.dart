import 'dart:async';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/push_to_talk_service.dart';
import '../widgets/voice_message_widget.dart';

class PushToTalkScreen extends StatefulWidget {
  const PushToTalkScreen({super.key});

  @override
  State<PushToTalkScreen> createState() => _PushToTalkScreenState();
}

class _PushToTalkScreenState extends State<PushToTalkScreen> {
  final PushToTalkService _service = PushToTalkService();
  List<Map<String, dynamic>> _messages = [];
  bool _loading = true;
  StreamSubscription? _messageSubscription;

  @override
  void initState() {
    super.initState();
    _loadMessages();
    _subscribeToNewMessages();
  }

  @override
  void dispose() {
    _messageSubscription?.cancel();
    super.dispose();
  }

  void _subscribeToNewMessages() {
    _messageSubscription = _service.onNewMessage.listen((message) {
      setState(() {
        _messages.insert(0, message);
      });
    });
  }

  Future<void> _loadMessages() async {
    setState(() => _loading = true);
    await _service.loadSettings();
    final messages = await _service.getMessages();
    setState(() {
      _messages = messages;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        title: const Row(
          children: [
            Icon(Icons.radio, color: Colors.yellow),
            SizedBox(width: 8),
            Text('Push to Talk', style: TextStyle(color: Colors.white)),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Colors.white),
            onPressed: _loadMessages,
          ),
        ],
      ),
      body: Column(
        children: [
          // Info Card
          Container(
            margin: const EdgeInsets.all(16),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.grey[900],
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.grey[800]!),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: Colors.yellow.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.mic, color: Colors.yellow, size: 24),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Voice Messages',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _service.featureEnabled
                            ? 'Listen to voice messages from dispatch'
                            : 'Feature disabled',
                        style: TextStyle(
                          color: Colors.grey[400],
                          fontSize: 14,
                        ),
                      ),
                    ],
                  ),
                ),
                Badge(
                  backgroundColor: _service.featureEnabled ? Colors.green : Colors.grey,
                  label: Text(
                    _service.featureEnabled ? 'ON' : 'OFF',
                    style: const TextStyle(fontSize: 10),
                  ),
                ),
              ],
            ),
          ),

          // Messages List
          Expanded(
            child: _loading
                ? const Center(
                    child: CircularProgressIndicator(color: Colors.yellow),
                  )
                : _messages.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              Icons.volume_off,
                              size: 64,
                              color: Colors.grey[700],
                            ),
                            const SizedBox(height: 16),
                            Text(
                              'No voice messages yet',
                              style: TextStyle(
                                color: Colors.grey[500],
                                fontSize: 16,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              'Messages from dispatch will appear here',
                              style: TextStyle(
                                color: Colors.grey[600],
                                fontSize: 14,
                              ),
                            ),
                          ],
                        ),
                      )
                    : RefreshIndicator(
                        onRefresh: _loadMessages,
                        color: Colors.yellow,
                        child: ListView.builder(
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          itemCount: _messages.length,
                          itemBuilder: (context, index) {
                            final message = _messages[index];
                            return VoiceMessageWidget(
                              message: message,
                              onPlayed: () async {
                                await _service.markAsPlayed(message['id']);
                                setState(() {
                                  _messages[index]['is_played'] = true;
                                });
                              },
                            );
                          },
                        ),
                      ),
          ),
        ],
      ),
    );
  }
}
