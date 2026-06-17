import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';

class FavoriteRoute {
  final String id;
  final String name;
  final String pickupAddress;
  final double pickupLat;
  final double pickupLng;
  final String dropoffAddress;
  final double dropoffLat;
  final double dropoffLng;
  final int useCount;
  final DateTime lastUsed;

  FavoriteRoute({
    required this.id,
    required this.name,
    required this.pickupAddress,
    required this.pickupLat,
    required this.pickupLng,
    required this.dropoffAddress,
    required this.dropoffLat,
    required this.dropoffLng,
    this.useCount = 0,
    DateTime? lastUsed,
  }) : lastUsed = lastUsed ?? DateTime.now();

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'pickupAddress': pickupAddress,
    'pickupLat': pickupLat,
    'pickupLng': pickupLng,
    'dropoffAddress': dropoffAddress,
    'dropoffLat': dropoffLat,
    'dropoffLng': dropoffLng,
    'useCount': useCount,
    'lastUsed': lastUsed.toIso8601String(),
  };

  factory FavoriteRoute.fromJson(Map<String, dynamic> json) => FavoriteRoute(
    id: json['id'],
    name: json['name'],
    pickupAddress: json['pickupAddress'],
    pickupLat: json['pickupLat'],
    pickupLng: json['pickupLng'],
    dropoffAddress: json['dropoffAddress'],
    dropoffLat: json['dropoffLat'],
    dropoffLng: json['dropoffLng'],
    useCount: json['useCount'] ?? 0,
    lastUsed: json['lastUsed'] != null ? DateTime.parse(json['lastUsed']) : null,
  );

  FavoriteRoute copyWith({int? useCount, DateTime? lastUsed}) => FavoriteRoute(
    id: id,
    name: name,
    pickupAddress: pickupAddress,
    pickupLat: pickupLat,
    pickupLng: pickupLng,
    dropoffAddress: dropoffAddress,
    dropoffLat: dropoffLat,
    dropoffLng: dropoffLng,
    useCount: useCount ?? this.useCount,
    lastUsed: lastUsed ?? this.lastUsed,
  );
}

class FavoritesService {
  static const _key = 'favorite_routes';
  static FavoritesService? _instance;

  FavoritesService._();
  factory FavoritesService() => _instance ??= FavoritesService._();

  Future<List<FavoriteRoute>> getFavorites() async {
    final prefs = await SharedPreferences.getInstance();
    final data = prefs.getString(_key);
    if (data == null) return [];

    try {
      final List<dynamic> jsonList = json.decode(data);
      return jsonList.map((e) => FavoriteRoute.fromJson(e)).toList();
    } catch (e) {
      return [];
    }
  }

  Future<void> addFavorite(FavoriteRoute route) async {
    final favorites = await getFavorites();

    // Check if already exists
    final existing = favorites.indexWhere((r) => r.id == route.id);
    if (existing != -1) {
      favorites[existing] = route;
    } else {
      favorites.add(route);
    }

    await _saveFavorites(favorites);
  }

  Future<void> removeFavorite(String id) async {
    final favorites = await getFavorites();
    favorites.removeWhere((r) => r.id == id);
    await _saveFavorites(favorites);
  }

  Future<void> incrementUseCount(String id) async {
    final favorites = await getFavorites();
    final index = favorites.indexWhere((r) => r.id == id);
    if (index != -1) {
      favorites[index] = favorites[index].copyWith(
        useCount: favorites[index].useCount + 1,
        lastUsed: DateTime.now(),
      );
      await _saveFavorites(favorites);
    }
  }

  Future<void> _saveFavorites(List<FavoriteRoute> favorites) async {
    final prefs = await SharedPreferences.getInstance();
    final data = json.encode(favorites.map((r) => r.toJson()).toList());
    await prefs.setString(_key, data);
  }

  Future<List<FavoriteRoute>> getRecentFavorites({int limit = 5}) async {
    final favorites = await getFavorites();
    favorites.sort((a, b) => b.lastUsed.compareTo(a.lastUsed));
    return favorites.take(limit).toList();
  }

  Future<List<FavoriteRoute>> getMostUsedFavorites({int limit = 5}) async {
    final favorites = await getFavorites();
    favorites.sort((a, b) => b.useCount.compareTo(a.useCount));
    return favorites.take(limit).toList();
  }

  String generateId() {
    return DateTime.now().millisecondsSinceEpoch.toString();
  }
}
