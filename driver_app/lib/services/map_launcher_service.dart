import 'dart:io';
import 'package:url_launcher/url_launcher.dart';
import 'package:flutter/material.dart';

class MapLauncherService {
  static Future<void> openInMaps({
    required double latitude,
    required double longitude,
    String? label,
  }) async {
    Uri uri;

    if (Platform.isIOS) {
      // Apple Maps
      uri = Uri.parse('maps://?daddr=$latitude,$longitude&dirflg=d');
    } else {
      // Google Maps
      uri = Uri.parse('google.navigation:q=$latitude,$longitude&mode=d');
    }

    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } else {
      // Fallback to web Google Maps
      final webUri = Uri.parse(
        'https://www.google.com/maps/dir/?api=1&destination=$latitude,$longitude'
      );
      await launchUrl(webUri, mode: LaunchMode.externalApplication);
    }
  }

  static Future<void> openGoogleMaps({
    required double latitude,
    required double longitude,
  }) async {
    final uri = Uri.parse(
      'https://www.google.com/maps/dir/?api=1&destination=$latitude,$longitude&travelmode=driving'
    );
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  static Future<void> openAppleMaps({
    required double latitude,
    required double longitude,
  }) async {
    final uri = Uri.parse('maps://?daddr=$latitude,$longitude&dirflg=d');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  static Future<void> showNavigationOptions(
    BuildContext context, {
    required double latitude,
    required double longitude,
    String? destinationName,
  }) async {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: Theme.of(context).scaffoldBackgroundColor,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.grey.withValues(alpha: 0.3),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 20),
            Text(
              'Navigate to ${destinationName ?? 'Destination'}',
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 20),
            ListTile(
              leading: Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: Colors.blue.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.map, color: Colors.blue),
              ),
              title: const Text('Apple Maps'),
              subtitle: const Text('Open in Apple Maps'),
              onTap: () {
                Navigator.pop(context);
                openAppleMaps(latitude: latitude, longitude: longitude);
              },
            ),
            ListTile(
              leading: Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: Colors.green.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.navigation, color: Colors.green),
              ),
              title: const Text('Google Maps'),
              subtitle: const Text('Open in Google Maps'),
              onTap: () {
                Navigator.pop(context);
                openGoogleMaps(latitude: latitude, longitude: longitude);
              },
            ),
            const SizedBox(height: 10),
          ],
        ),
      ),
    );
  }
}
