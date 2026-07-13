import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/foundation.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:path_provider/path_provider.dart';
import 'package:path/path.dart' as path;

enum ImageType {
  avatar,      // 400x400, 80% quality
  document,    // 1200px max edge, 85% quality
  chat,        // 1024px max, 75% quality
  vehicle,     // 800px max edge, 85% quality
}

class ImageUtils {
  static const _avatarMaxSize = 400;
  static const _avatarQuality = 80;

  static const _documentMaxSize = 1200;
  static const _documentQuality = 85;

  static const _chatMaxSize = 1024;
  static const _chatQuality = 75;

  static const _vehicleMaxSize = 800;
  static const _vehicleQuality = 85;

  static Future<File?> compressImage(
    String sourcePath, {
    required ImageType type,
  }) async {
    try {
      final file = File(sourcePath);
      if (!await file.exists()) {
        debugPrint('ImageUtils: Source file does not exist: $sourcePath');
        return null;
      }

      int maxSize;
      int quality;

      switch (type) {
        case ImageType.avatar:
          maxSize = _avatarMaxSize;
          quality = _avatarQuality;
        case ImageType.document:
          maxSize = _documentMaxSize;
          quality = _documentQuality;
        case ImageType.chat:
          maxSize = _chatMaxSize;
          quality = _chatQuality;
        case ImageType.vehicle:
          maxSize = _vehicleMaxSize;
          quality = _vehicleQuality;
      }

      final tempDir = await getTemporaryDirectory();
      final targetPath = path.join(
        tempDir.path,
        'compressed_${DateTime.now().millisecondsSinceEpoch}.jpg',
      );

      final result = await FlutterImageCompress.compressAndGetFile(
        sourcePath,
        targetPath,
        minWidth: maxSize,
        minHeight: maxSize,
        quality: quality,
        format: CompressFormat.jpeg,
        keepExif: false,
      );

      if (result != null) {
        final originalSize = await file.length();
        final compressedSize = await result.length();
        final savings = ((1 - compressedSize / originalSize) * 100).toStringAsFixed(1);
        debugPrint('ImageUtils: Compressed ${type.name} from ${_formatBytes(originalSize)} to ${_formatBytes(compressedSize)} ($savings% reduction)');
        return File(result.path);
      }

      debugPrint('ImageUtils: Compression returned null, using original');
      return file;
    } catch (e) {
      debugPrint('ImageUtils: Error compressing image: $e');
      return File(sourcePath);
    }
  }

  static Future<Uint8List?> compressImageBytes(
    Uint8List bytes, {
    required ImageType type,
  }) async {
    try {
      int maxSize;
      int quality;

      switch (type) {
        case ImageType.avatar:
          maxSize = _avatarMaxSize;
          quality = _avatarQuality;
        case ImageType.document:
          maxSize = _documentMaxSize;
          quality = _documentQuality;
        case ImageType.chat:
          maxSize = _chatMaxSize;
          quality = _chatQuality;
        case ImageType.vehicle:
          maxSize = _vehicleMaxSize;
          quality = _vehicleQuality;
      }

      final result = await FlutterImageCompress.compressWithList(
        bytes,
        minWidth: maxSize,
        minHeight: maxSize,
        quality: quality,
        format: CompressFormat.jpeg,
        keepExif: false,
      );

      final savings = ((1 - result.length / bytes.length) * 100).toStringAsFixed(1);
      debugPrint('ImageUtils: Compressed ${type.name} bytes from ${_formatBytes(bytes.length)} to ${_formatBytes(result.length)} ($savings% reduction)');

      return result;
    } catch (e) {
      debugPrint('ImageUtils: Error compressing image bytes: $e');
      return bytes;
    }
  }

  static String _formatBytes(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
}
