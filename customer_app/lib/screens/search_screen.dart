import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import '../providers/app_state.dart';
import '../theme/app_theme.dart';
import '../widgets/glass_container.dart';
import '../widgets/primary_button.dart';
import '../services/supabase_service.dart';
import '../services/location_service.dart';
import 'driver_matching_screen.dart';

const String _darkMapStyle = '''
[
  {"elementType": "geometry", "stylers": [{"color": "#212121"}]},
  {"elementType": "labels.icon", "stylers": [{"visibility": "off"}]},
  {"elementType": "labels.text.fill", "stylers": [{"color": "#757575"}]},
  {"elementType": "labels.text.stroke", "stylers": [{"color": "#212121"}]},
  {"featureType": "road", "elementType": "geometry.fill", "stylers": [{"color": "#2c2c2c"}]},
  {"featureType": "water", "elementType": "geometry", "stylers": [{"color": "#000000"}]}
]
''';

class SearchScreen extends StatefulWidget {
  final String? initialDestination;
  const SearchScreen({super.key, this.initialDestination});

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  final _searchController = TextEditingController();
  List<Map<String, dynamic>> _filteredResults = [];
  List<Map<String, dynamic>> _savedPlaces = [];
  bool _loadingSavedPlaces = true;
  LatLng _currentLocation = const LatLng(4.1755, 73.5093);

  @override
  void initState() {
    super.initState();
    _loadCurrentLocation();
    _filteredResults = _allResults;
    _searchController.addListener(_filterResults);
    if (widget.initialDestination != null) {
      _searchController.text = widget.initialDestination!;
    }
    _loadSavedPlaces();
    _loadRecentPlaces();
  }

  Future<void> _loadCurrentLocation() async {
    final loc = await LocationService.getCurrentLocation();
    if (mounted) {
      setState(() => _currentLocation = LatLng(loc.latitude, loc.longitude));
    }
  }

  final List<Map<String, dynamic>> _placeIconOptions = [
    {'icon': Icons.home_rounded, 'label': 'Home'},
    {'icon': Icons.work_rounded, 'label': 'Work'},
    {'icon': Icons.school_rounded, 'label': 'School'},
    {'icon': Icons.fitness_center_rounded, 'label': 'Gym'},
    {'icon': Icons.local_hospital_rounded, 'label': 'Hospital'},
    {'icon': Icons.shopping_bag_rounded, 'label': 'Shopping'},
    {'icon': Icons.restaurant_rounded, 'label': 'Restaurant'},
    {'icon': Icons.local_cafe_rounded, 'label': 'Cafe'},
    {'icon': Icons.park_rounded, 'label': 'Park'},
    {'icon': Icons.beach_access_rounded, 'label': 'Beach'},
    {'icon': Icons.mosque_rounded, 'label': 'Mosque'},
    {'icon': Icons.church_rounded, 'label': 'Church'},
    {'icon': Icons.local_airport_rounded, 'label': 'Airport'},
    {'icon': Icons.directions_boat_rounded, 'label': 'Ferry'},
    {'icon': Icons.hotel_rounded, 'label': 'Hotel'},
    {'icon': Icons.movie_rounded, 'label': 'Cinema'},
    {'icon': Icons.sports_soccer_rounded, 'label': 'Sports'},
    {'icon': Icons.local_pharmacy_rounded, 'label': 'Pharmacy'},
    {'icon': Icons.local_gas_station_rounded, 'label': 'Gas'},
    {'icon': Icons.local_parking_rounded, 'label': 'Parking'},
    {'icon': Icons.store_rounded, 'label': 'Store'},
    {'icon': Icons.apartment_rounded, 'label': 'Apartment'},
    {'icon': Icons.family_restroom_rounded, 'label': 'Family'},
    {'icon': Icons.favorite_rounded, 'label': 'Favorite'},
  ];

  final List<Color> _placeColors = [
    AppColors.yellow,
    AppColors.success,
    const Color(0xFF007AFF),
    AppColors.error,
    const Color(0xFFFF2D55),
    const Color(0xFFAF52DE),
    const Color(0xFFFF9500),
    const Color(0xFF5AC8FA),
    const Color(0xFF30D158),
    const Color(0xFFFFD60A),
    const Color(0xFFBF5AF2),
    const Color(0xFF64D2FF),
  ];

  List<Map<String, dynamic>> _recentPlaces = [];
  bool _loadingRecentPlaces = true;

  final _allResults = [
    {'title': 'Hulhulé Airport', 'subtitle': 'Velana International Airport', 'highlight': true},
    {'title': 'Hulhumalé', 'subtitle': 'Housing Development · 15 min', 'highlight': false},
    {'title': 'Malé City', 'subtitle': 'Capital Island · 10 min by ferry', 'highlight': false},
    {'title': 'IT Office', 'subtitle': 'One Central Tower, 14F', 'highlight': false},
    {'title': 'Staff Housing', 'subtitle': 'Marina Walk, Block C', 'highlight': false},
    {'title': 'Data Centre', 'subtitle': 'Hulhumalé Industrial Zone', 'highlight': false},
  ];

  // initState moved to top of class (line 31)

  Future<void> _loadRecentPlaces() async {
    try {
      final rides = await SupabaseService.getMyRides();
      final recentDestinations = <String, Map<String, dynamic>>{};

      for (final ride in rides.take(10)) {
        final dropoffName = ride['dropoff_name'] as String?;
        if (dropoffName != null && dropoffName.isNotEmpty && !recentDestinations.containsKey(dropoffName)) {
          final createdAt = DateTime.tryParse(ride['created_at'] ?? '');
          String timeAgo = '';
          if (createdAt != null) {
            final diff = DateTime.now().difference(createdAt);
            if (diff.inDays == 0) {
              timeAgo = 'Today';
            } else if (diff.inDays == 1) {
              timeAgo = 'Yesterday';
            } else if (diff.inDays < 7) {
              timeAgo = '${diff.inDays} days ago';
            } else {
              timeAgo = '${(diff.inDays / 7).floor()} week${diff.inDays >= 14 ? 's' : ''} ago';
            }
          }
          recentDestinations[dropoffName] = {
            'name': dropoffName.split(',').first,
            'address': dropoffName,
            'time': timeAgo,
          };
        }
      }

      setState(() {
        _recentPlaces = recentDestinations.values.take(5).toList();
        _loadingRecentPlaces = false;
      });
    } catch (e) {
      debugPrint('Error loading recent places: $e');
      setState(() => _loadingRecentPlaces = false);
    }
  }

  Future<void> _loadSavedPlaces() async {
    try {
      final appState = Provider.of<AppState>(context, listen: false);
      String? userId = appState.profileId;

      // Fallback: try auth user
      if (userId == null) {
        userId = SupabaseService.currentUser?.id;
      }

      // Fallback: get user ID by staffId from AppState
      if (userId == null && appState.staffId.isNotEmpty) {
        final profile = await SupabaseService.client
            .from('profiles')
            .select('id')
            .eq('employee_id', appState.staffId)
            .maybeSingle();
        userId = profile?['id'];
      }

      if (userId == null) {
        setState(() => _loadingSavedPlaces = false);
        return;
      }

      final response = await SupabaseService.client
          .from('saved_places')
          .select()
          .eq('user_id', userId)
          .order('created_at');

      final places = List<Map<String, dynamic>>.from(response);

      setState(() {
        _savedPlaces = places.map((p) => {
          'id': p['id'],
          'icon': _getIconFromString(p['icon'] ?? 'location_on'),
          'name': p['name'] ?? '',
          'address': p['address'] ?? '',
          'color': _getColorFromString(p['color'] ?? 'yellow'),
        }).toList();
        _loadingSavedPlaces = false;
      });
    } catch (e) {
      debugPrint('Error loading saved places: $e');
      setState(() => _loadingSavedPlaces = false);
    }
  }

  IconData _getIconFromString(String iconName) {
    final iconMap = {
      'home': Icons.home_rounded,
      'work': Icons.work_rounded,
      'school': Icons.school_rounded,
      'gym': Icons.fitness_center_rounded,
      'hospital': Icons.local_hospital_rounded,
      'shopping': Icons.shopping_bag_rounded,
      'restaurant': Icons.restaurant_rounded,
      'cafe': Icons.local_cafe_rounded,
      'airport': Icons.local_airport_rounded,
      'ferry': Icons.directions_boat_rounded,
      'hotel': Icons.hotel_rounded,
      'favorite': Icons.favorite_rounded,
    };
    return iconMap[iconName.toLowerCase()] ?? Icons.location_on_rounded;
  }

  Color _getColorFromString(String colorName) {
    final colorMap = {
      'yellow': AppColors.yellow,
      'green': AppColors.success,
      'red': AppColors.error,
      'blue': const Color(0xFF007AFF),
      'purple': const Color(0xFFAF52DE),
      'orange': const Color(0xFFFF9500),
    };
    return colorMap[colorName.toLowerCase()] ?? AppColors.yellow;
  }

  void _filterResults() {
    final query = _searchController.text.toLowerCase();
    setState(() {
      if (query.isEmpty) {
        _filteredResults = _allResults;
      } else {
        _filteredResults = _allResults.where((r) {
          return (r['title'] as String).toLowerCase().contains(query) ||
              (r['subtitle'] as String).toLowerCase().contains(query);
        }).toList();
      }
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = context.isDark;

    return Scaffold(
      backgroundColor: context.bgColor,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: Row(
                children: [
                  _buildBackButton(isDark),
                  const SizedBox(width: 12),
                  Text(
                    'Plan your ride',
                    style: TextStyle(
                      color: context.textColor,
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
              child: _buildRouteCard(isDark),
            ),
            Expanded(
              child: _searchController.text.isEmpty
                  ? SingleChildScrollView(
                      physics: const BouncingScrollPhysics(),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const SizedBox(height: 20),
                          _buildSavedPlaces(context, isDark),
                          const SizedBox(height: 24),
                          _buildRecentPlaces(context, isDark),
                          const SizedBox(height: 20),
                        ],
                      ),
                    )
                  : _filteredResults.isEmpty
                      ? Center(
                          child: Text(
                            'No locations found',
                            style: TextStyle(color: context.mutedColor),
                          ),
                        )
                      : ListView.builder(
                          padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
                          itemCount: _filteredResults.length,
                          itemBuilder: (context, index) {
                            final result = _filteredResults[index];
                            return _buildResultItem(
                              result['title'] as String,
                              result['subtitle'] as String,
                              result['highlight'] as bool,
                              isDark,
                              onTap: () => Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (_) => NearbyScreen(
                                    destination: '${result['title']} · ${result['subtitle']}',
                                  ),
                                ),
                              ),
                            );
                          },
                        ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 40),
              child: PrimaryButton(
                text: 'Set location on map',
                kind: ButtonKind.ghost,
                icon: Icon(Icons.location_on, color: AppColors.yellow, size: 20),
                onPressed: () => _showMapPicker(isDark),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showMapPicker(bool isDark) {
    LatLng selectedLocation = const LatLng(4.1918, 73.5290);
    GoogleMapController? googleMapController;
    String locationName = 'Velana International Airport';
    String locationAddress = 'Velana International Airport';

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) {
          return Container(
            height: MediaQuery.of(context).size.height * 0.92,
            decoration: BoxDecoration(
              color: context.surfaceColor,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
            ),
            child: Column(
              children: [
                const SizedBox(height: 12),
                Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.18),
                    borderRadius: BorderRadius.circular(99),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                  child: Row(
                    children: [
                      GestureDetector(
                        onTap: () => Navigator.pop(ctx),
                        child: Container(
                          width: 40,
                          height: 40,
                          decoration: BoxDecoration(
                            color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.05),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Icon(Icons.close, color: context.textColor, size: 20),
                        ),
                      ),
                      const Spacer(),
                      Text('Set location', style: TextStyle(color: context.textColor, fontSize: 16, fontWeight: FontWeight.w600)),
                      const Spacer(),
                      const SizedBox(width: 40),
                    ],
                  ),
                ),
                Expanded(
                  child: Stack(
                    children: [
                      GoogleMap(
                        initialCameraPosition: CameraPosition(target: selectedLocation, zoom: 15),
                        onMapCreated: (controller) => googleMapController = controller,
                        onTap: (point) {
                          HapticFeedback.lightImpact();
                          setSheetState(() {
                            selectedLocation = point;
                            locationName = 'Selected Location';
                            locationAddress = '${point.latitude.toStringAsFixed(5)}, ${point.longitude.toStringAsFixed(5)}';
                          });
                        },
                        markers: {
                          Marker(
                            markerId: const MarkerId('selected'),
                            position: selectedLocation,
                            icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueYellow),
                          ),
                        },
                        myLocationEnabled: true,
                        myLocationButtonEnabled: false,
                        zoomControlsEnabled: false,
                        mapToolbarEnabled: false,
                        style: isDark ? _darkMapStyle : null,
                      ),
                      // Zoom controls
                      Positioned(
                        right: 16,
                        bottom: 16,
                        child: Column(
                          children: [
                            _buildMapButton(Icons.add, () {
                              HapticFeedback.lightImpact();
                              googleMapController?.animateCamera(CameraUpdate.zoomIn());
                            }, isDark),
                            const SizedBox(height: 8),
                            _buildMapButton(Icons.remove, () {
                              HapticFeedback.lightImpact();
                              googleMapController?.animateCamera(CameraUpdate.zoomOut());
                            }, isDark),
                            const SizedBox(height: 8),
                            _buildMapButton(Icons.my_location, () {
                              HapticFeedback.mediumImpact();
                              googleMapController?.animateCamera(CameraUpdate.newLatLngZoom(const LatLng(4.1918, 73.5290), 15));
                            }, isDark, isHighlighted: true),
                          ],
                        ),
                      ),
                      // Tap hint
                      Positioned(
                        top: 16,
                        left: 0,
                        right: 0,
                        child: Center(
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                            decoration: BoxDecoration(
                              color: (isDark ? Colors.black : Colors.white).withValues(alpha: 0.9),
                              borderRadius: BorderRadius.circular(20),
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.black.withValues(alpha: 0.1),
                                  blurRadius: 8,
                                ),
                              ],
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.touch_app, color: AppColors.yellow, size: 16),
                                const SizedBox(width: 6),
                                Text('Tap to select location', style: TextStyle(color: context.textColor, fontSize: 12)),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: context.surfaceColor,
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.1),
                        blurRadius: 10,
                        offset: const Offset(0, -4),
                      ),
                    ],
                  ),
                  child: Column(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.05),
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Row(
                          children: [
                            Container(
                              width: 44,
                              height: 44,
                              decoration: BoxDecoration(
                                color: AppColors.yellow,
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Icon(Icons.location_on, color: context.isDark ? AppColors.bgDark : Colors.white, size: 24),
                            ),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(locationName, style: TextStyle(color: context.textColor, fontSize: 16, fontWeight: FontWeight.w600)),
                                  Text(locationAddress, style: TextStyle(color: context.mutedColor, fontSize: 13)),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),
                      PrimaryButton(
                        text: 'Confirm location',
                        onPressed: () {
                          Navigator.pop(ctx);
                          Navigator.push(
                            context,
                            MaterialPageRoute(builder: (_) => NearbyScreen(destination: locationName)),
                          );
                        },
                      ),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildMapButton(IconData icon, VoidCallback onTap, bool isDark, {bool isHighlighted = false}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          color: context.surfaceColor,
          borderRadius: BorderRadius.circular(12),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.1),
              blurRadius: 8,
            ),
          ],
        ),
        child: Icon(icon, color: isHighlighted ? AppColors.yellow : context.textColor, size: 22),
      ),
    );
  }

  Widget _buildBackButton(bool isDark) {
    return GestureDetector(
      onTap: () => Navigator.pop(context),
      child: Container(
        width: 48,
        height: 48,
        decoration: BoxDecoration(
          color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.05),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.1)),
        ),
        child: Icon(Icons.arrow_back_ios_new, color: context.textColor, size: 18),
      ),
    );
  }

  Widget _buildRouteCard(bool isDark) {
    return GlassContainer(
      blur: 0,
      backgroundColor: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.04),
      borderRadius: BorderRadius.circular(22),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      border: Border.all(color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.08)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 18),
            child: Column(
              children: [
                Container(
                  width: 11,
                  height: 11,
                  decoration: BoxDecoration(
                    color: AppColors.yellow,
                    shape: BoxShape.circle,
                  ),
                ),
                Container(
                  width: 2,
                  height: 30,
                  margin: const EdgeInsets.symmetric(vertical: 4),
                  color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.14),
                ),
                Container(
                  width: 11,
                  height: 11,
                  decoration: BoxDecoration(
                    color: context.textColor,
                    borderRadius: BorderRadius.circular(3),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              children: [
                _buildRouteField('PICKUP', 'Current location', false, isDark),
                Container(
                  height: 1,
                  color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.07),
                ),
                _buildEditableRouteField('DESTINATION', isDark),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRouteField(String label, String value, bool isEditable, bool isDark) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(
              color: context.faintColor,
              fontSize: 10,
              letterSpacing: 1,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            value,
            style: TextStyle(
              color: context.textColor,
              fontSize: 15,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEditableRouteField(String label, bool isDark) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(
              color: context.faintColor,
              fontSize: 10,
              letterSpacing: 1,
            ),
          ),
          const SizedBox(height: 2),
          TextField(
            controller: _searchController,
            autofocus: false,
            style: TextStyle(
              color: context.textColor,
              fontSize: 15,
              fontWeight: FontWeight.w600,
            ),
            decoration: InputDecoration(
              hintText: 'Where to?',
              hintStyle: TextStyle(color: context.faintColor),
              border: InputBorder.none,
              isDense: true,
              contentPadding: EdgeInsets.zero,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildResultItem(String title, String subtitle, bool highlight, bool isDark, {VoidCallback? onTap}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 4),
        decoration: BoxDecoration(
          border: Border(
            bottom: BorderSide(color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.05)),
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.05),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(
                Icons.location_on,
                color: highlight ? AppColors.yellow : context.mutedColor,
                size: 20,
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      color: context.textColor,
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Text(
                    subtitle,
                    style: TextStyle(color: context.mutedColor, fontSize: 12.5),
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: context.mutedColor, size: 20),
          ],
        ),
      ),
    );
  }

  Widget _buildSavedPlaces(BuildContext context, bool isDark) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Saved Places',
                style: TextStyle(
                  color: context.textColor,
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                ),
              ),
              GestureDetector(
                onTap: () {
                  HapticFeedback.lightImpact();
                  _showAddPlaceSheet(context, isDark);
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.yellow.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.add, color: AppColors.yellow, size: 14),
                      const SizedBox(width: 4),
                      Text('Add', style: TextStyle(color: AppColors.yellow, fontSize: 12, fontWeight: FontWeight.w600)),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        _loadingSavedPlaces
            ? const SizedBox(
                height: 110,
                child: Center(child: CircularProgressIndicator(color: AppColors.yellow)),
              )
            : _savedPlaces.isEmpty
                ? Container(
                    height: 110,
                    margin: const EdgeInsets.symmetric(horizontal: 16),
                    decoration: BoxDecoration(
                      color: isDark ? AppColors.surfaceDark : Colors.white,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: isDark ? context.borderColor : const Color(0xFFE0E0E0)),
                    ),
                    child: Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.bookmark_add_outlined, color: context.mutedColor, size: 28),
                          const SizedBox(height: 8),
                          Text('No saved places yet', style: TextStyle(color: context.mutedColor, fontSize: 13)),
                          const SizedBox(height: 4),
                          Text('Tap + Add to save a place', style: TextStyle(color: context.faintColor, fontSize: 11)),
                        ],
                      ),
                    ),
                  )
                : SizedBox(
                    height: 110,
                    child: ListView.builder(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      itemCount: _savedPlaces.length,
                      itemBuilder: (context, index) {
                        final place = _savedPlaces[index];
                        return _buildSavedPlaceCard(place, index, isDark);
                      },
                    ),
                  ),
      ],
    );
  }

  Widget _buildSavedPlaceCard(Map<String, dynamic> place, int index, bool isDark) {
    return GestureDetector(
      onTap: () {
        HapticFeedback.mediumImpact();
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (context) => NearbyScreen(destination: place['address']),
          ),
        );
      },
      onLongPress: () {
        HapticFeedback.mediumImpact();
        _showDeletePlaceDialog(place, index, isDark);
      },
      child: Container(
        width: 140,
        margin: const EdgeInsets.only(right: 12),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: isDark ? AppColors.surfaceDark : Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: isDark ? context.borderColor : const Color(0xFFE0E0E0)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: (place['color'] as Color).withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(place['icon'] as IconData, color: place['color'] as Color, size: 18),
                ),
                GestureDetector(
                  onTap: () {
                    HapticFeedback.lightImpact();
                    _showDeletePlaceDialog(place, index, isDark);
                  },
                  child: Icon(Icons.more_vert, color: context.mutedColor, size: 18),
                ),
              ],
            ),
            const Spacer(),
            Text(
              place['name'] as String,
              style: TextStyle(
                color: context.textColor,
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              place['address'] as String,
              style: TextStyle(color: context.mutedColor, fontSize: 11),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }

  void _showDeletePlaceDialog(Map<String, dynamic> place, int index, bool isDark) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: context.surfaceColor,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(color: context.mutedColor.withValues(alpha: 0.3), borderRadius: BorderRadius.circular(2)),
            ),
            const SizedBox(height: 24),
            Container(
              width: 60,
              height: 60,
              decoration: BoxDecoration(
                color: (place['color'] as Color).withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Icon(place['icon'] as IconData, color: place['color'] as Color, size: 28),
            ),
            const SizedBox(height: 16),
            Text(
              place['name'] as String,
              style: TextStyle(color: context.textColor, fontSize: 20, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 4),
            Text(
              place['address'] as String,
              style: TextStyle(color: context.mutedColor, fontSize: 14),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.pop(ctx),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: context.textColor,
                      side: BorderSide(color: context.mutedColor.withValues(alpha: 0.3)),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: Text('Cancel'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton(
                    onPressed: () async {
                      Navigator.pop(ctx);
                      final placeId = place['id'];
                      if (placeId != null) {
                        await SupabaseService.deleteSavedPlace(placeId);
                      }
                      setState(() {
                        _savedPlaces.removeAt(index);
                      });
                      HapticFeedback.mediumImpact();
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Row(
                            children: [
                              Icon(Icons.delete_outline, color: Colors.white, size: 20),
                              const SizedBox(width: 10),
                              Text('${place['name']} removed'),
                            ],
                          ),
                          backgroundColor: AppColors.red,
                          behavior: SnackBarBehavior.floating,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                      );
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.red,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: Text('Remove'),
                  ),
                ),
              ],
            ),
            SizedBox(height: MediaQuery.of(ctx).padding.bottom + 8),
          ],
        ),
      ),
    );
  }

  Widget _buildRecentPlaces(BuildContext context, bool isDark) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Recent',
                style: TextStyle(
                  color: context.textColor,
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                ),
              ),
              GestureDetector(
                onTap: () {
                  HapticFeedback.lightImpact();
                },
                child: Text('See All', style: TextStyle(color: AppColors.yellow, fontSize: 13, fontWeight: FontWeight.w600)),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (_loadingRecentPlaces)
            const Center(child: CircularProgressIndicator(color: AppColors.yellow))
          else if (_recentPlaces.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: Center(
                child: Text('No recent rides yet', style: TextStyle(color: context.mutedColor, fontSize: 13)),
              ),
            )
          else
            ...List.generate(_recentPlaces.length, (index) {
              final place = _recentPlaces[index];
              return _buildRecentPlaceItem(place, isDark, isLast: index == _recentPlaces.length - 1);
            }),
        ],
      ),
    );
  }

  Widget _buildRecentPlaceItem(Map<String, dynamic> place, bool isDark, {bool isLast = false}) {
    return GestureDetector(
      onTap: () {
        HapticFeedback.lightImpact();
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (context) => NearbyScreen(destination: place['address']),
          ),
        );
      },
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          border: isLast ? null : Border(bottom: BorderSide(color: isDark ? context.borderColor : const Color(0xFFE0E0E0))),
        ),
        child: Row(
          children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: isDark ? AppColors.surfaceDark : Colors.white,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(Icons.history, color: context.mutedColor, size: 20),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    place['name'] as String,
                    style: TextStyle(
                      color: context.textColor,
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    place['address'] as String,
                    style: TextStyle(color: context.mutedColor, fontSize: 12),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            Text(
              place['time'] as String,
              style: TextStyle(color: context.faintColor, fontSize: 11),
            ),
          ],
        ),
      ),
    );
  }

  void _showAddPlaceSheet(BuildContext context, bool isDark) {
    final nameController = TextEditingController();
    String selectedAddress = '';
    String selectedLocationName = '';
    double? selectedLat;
    double? selectedLng;
    int selectedIconIndex = 0;
    int selectedColorIndex = 0;

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setModalState) => Padding(
          padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
          child: Container(
            constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.85),
            decoration: BoxDecoration(
              color: this.context.surfaceColor,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
            ),
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(color: this.context.mutedColor.withValues(alpha: 0.3), borderRadius: BorderRadius.circular(2)),
                    ),
                  ),
                  const SizedBox(height: 20),
                  Center(
                    child: Text(
                      'Add New Place',
                      style: TextStyle(color: this.context.textColor, fontSize: 20, fontWeight: FontWeight.w700),
                    ),
                  ),
                  const SizedBox(height: 24),

                  Text('Choose Icon', style: TextStyle(color: this.context.mutedColor, fontSize: 13, fontWeight: FontWeight.w500)),
                  const SizedBox(height: 12),
                  SizedBox(
                    height: 80,
                    child: ListView.builder(
                      scrollDirection: Axis.horizontal,
                      itemCount: _placeIconOptions.length,
                      itemBuilder: (context, index) {
                        final iconOption = _placeIconOptions[index];
                        final isSelected = selectedIconIndex == index;
                        return GestureDetector(
                          onTap: () => setModalState(() => selectedIconIndex = index),
                          child: Container(
                            width: 70,
                            margin: const EdgeInsets.only(right: 10),
                            padding: const EdgeInsets.symmetric(vertical: 10),
                            decoration: BoxDecoration(
                              color: isSelected ? _placeColors[selectedColorIndex % _placeColors.length].withValues(alpha: 0.15) : (isDark ? AppColors.bgDark : Colors.white),
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(
                                color: isSelected ? _placeColors[selectedColorIndex % _placeColors.length] : (isDark ? context.borderColor : const Color(0xFFE0E0E0)),
                                width: isSelected ? 2 : 1,
                              ),
                            ),
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(
                                  iconOption['icon'] as IconData,
                                  color: isSelected ? _placeColors[selectedColorIndex % _placeColors.length] : this.context.mutedColor,
                                  size: 24,
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  iconOption['label'] as String,
                                  style: TextStyle(
                                    color: isSelected ? this.context.textColor : this.context.mutedColor,
                                    fontSize: 10,
                                    fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
                  ),

                  const SizedBox(height: 20),

                  Text('Choose Color', style: TextStyle(color: this.context.mutedColor, fontSize: 13, fontWeight: FontWeight.w500)),
                  const SizedBox(height: 12),
                  SizedBox(
                    height: 44,
                    child: ListView.builder(
                      scrollDirection: Axis.horizontal,
                      itemCount: _placeColors.length,
                      itemBuilder: (context, index) {
                        final isSelected = selectedColorIndex == index;
                        return GestureDetector(
                          onTap: () => setModalState(() => selectedColorIndex = index),
                          child: Container(
                            width: 44,
                            height: 44,
                            margin: const EdgeInsets.only(right: 10),
                            decoration: BoxDecoration(
                              color: _placeColors[index],
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: isSelected ? Colors.white : Colors.transparent, width: 3),
                              boxShadow: isSelected
                                  ? [BoxShadow(color: _placeColors[index].withValues(alpha: 0.5), blurRadius: 8, spreadRadius: 1)]
                                  : null,
                            ),
                            child: isSelected ? Icon(Icons.check, color: Colors.white, size: 22) : null,
                          ),
                        );
                      },
                    ),
                  ),

                  const SizedBox(height: 20),

                  Text('Place Name', style: TextStyle(color: this.context.mutedColor, fontSize: 13, fontWeight: FontWeight.w500)),
                  const SizedBox(height: 8),
                  Container(
                    decoration: BoxDecoration(
                      color: isDark ? AppColors.bgDark : Colors.white,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: isDark ? context.borderColor : const Color(0xFFE0E0E0)),
                    ),
                    child: TextField(
                      controller: nameController,
                      style: TextStyle(color: this.context.textColor, fontSize: 15),
                      decoration: InputDecoration(
                        hintText: 'e.g. Home, Office, Gym',
                        hintStyle: TextStyle(color: this.context.faintColor),
                        border: InputBorder.none,
                        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                        prefixIcon: Icon(
                          _placeIconOptions[selectedIconIndex]['icon'] as IconData,
                          color: _placeColors[selectedColorIndex % _placeColors.length],
                          size: 22,
                        ),
                      ),
                    ),
                  ),

                  const SizedBox(height: 16),

                  Text('Location', style: TextStyle(color: this.context.mutedColor, fontSize: 13, fontWeight: FontWeight.w500)),
                  const SizedBox(height: 8),
                  GestureDetector(
                    onTap: () async {
                      final result = await _showLocationPicker(
                        this.context,
                        'Select Location',
                        _placeColors[selectedColorIndex % _placeColors.length],
                        isDark,
                      );
                      if (result != null) {
                        setModalState(() {
                          selectedAddress = result['address'] as String;
                          selectedLocationName = (result['name'] as String?) ?? '';
                          selectedLat = result['lat'] as double?;
                          selectedLng = result['lng'] as double?;
                        });
                      }
                    },
                    child: Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: isDark ? AppColors.bgDark : Colors.white,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                          color: selectedAddress.isNotEmpty
                              ? _placeColors[selectedColorIndex % _placeColors.length].withValues(alpha: 0.5)
                              : (isDark ? context.borderColor : const Color(0xFFE0E0E0)),
                        ),
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 44,
                            height: 44,
                            decoration: BoxDecoration(
                              color: _placeColors[selectedColorIndex % _placeColors.length].withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Icon(Icons.map_rounded, color: _placeColors[selectedColorIndex % _placeColors.length], size: 22),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  selectedAddress.isEmpty ? 'Search or pin on map' : (selectedLocationName.isNotEmpty ? selectedLocationName : 'Location Selected'),
                                  style: TextStyle(
                                    color: selectedAddress.isEmpty ? this.context.mutedColor : this.context.textColor,
                                    fontSize: 14,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                                if (selectedAddress.isNotEmpty) ...[
                                  const SizedBox(height: 2),
                                  Text(
                                    selectedAddress,
                                    style: TextStyle(color: this.context.mutedColor, fontSize: 12),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ],
                              ],
                            ),
                          ),
                          Icon(
                            selectedAddress.isEmpty ? Icons.chevron_right : Icons.check_circle,
                            color: selectedAddress.isEmpty ? this.context.mutedColor : AppColors.success,
                            size: 22,
                          ),
                        ],
                      ),
                    ),
                  ),

                  const SizedBox(height: 24),

                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: () async {
                        if (nameController.text.isNotEmpty && selectedAddress.isNotEmpty) {
                          final iconLabel = (_placeIconOptions[selectedIconIndex]['label'] as String).toLowerCase();
                          final colorNames = ['yellow', 'green', 'blue', 'red', 'pink', 'purple', 'orange', 'cyan', 'lime', 'amber', 'violet', 'sky'];
                          final colorName = colorNames[selectedColorIndex % colorNames.length];
                          final appState = Provider.of<AppState>(this.context, listen: false);

                          final success = await SupabaseService.addSavedPlace(
                            name: nameController.text,
                            address: selectedAddress,
                            icon: iconLabel,
                            color: colorName,
                            latitude: selectedLat,
                            longitude: selectedLng,
                            staffId: appState.staffId,
                            profileId: appState.profileId,
                          );

                          if (success) {
                            setState(() {
                              _savedPlaces.add({
                                'icon': _placeIconOptions[selectedIconIndex]['icon'],
                                'name': nameController.text,
                                'address': selectedAddress,
                                'color': _placeColors[selectedColorIndex % _placeColors.length],
                              });
                            });
                            Navigator.pop(ctx);
                            HapticFeedback.mediumImpact();
                            ScaffoldMessenger.of(this.context).showSnackBar(
                              SnackBar(
                                content: Row(
                                  children: [
                                    Icon(Icons.check_circle, color: Colors.white, size: 20),
                                    const SizedBox(width: 10),
                                    Text('${nameController.text} added to saved places'),
                                  ],
                                ),
                                backgroundColor: AppColors.green,
                                behavior: SnackBarBehavior.floating,
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                              ),
                            );
                          } else {
                            ScaffoldMessenger.of(this.context).showSnackBar(
                              SnackBar(
                                content: const Row(
                                  children: [
                                    Icon(Icons.error, color: Colors.white, size: 20),
                                    SizedBox(width: 10),
                                    Text('Failed to save place. Please try again.'),
                                  ],
                                ),
                                backgroundColor: AppColors.error,
                                behavior: SnackBarBehavior.floating,
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                              ),
                            );
                          }
                        }
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.yellow,
                        foregroundColor: AppColors.bgDark,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      ),
                      child: Text('Save Place', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                    ),
                  ),

                  SizedBox(height: MediaQuery.of(ctx).padding.bottom + 8),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<Map<String, dynamic>?> _showLocationPicker(BuildContext context, String title, Color accentColor, bool isDark) async {
    LatLng selectedLocation = const LatLng(4.1755, 73.5093);
    GoogleMapController? googleMapController;
    final searchController = TextEditingController();
    String addressText = '';
    String selectedName = '';
    bool showSearchResults = false;
    List<Map<String, dynamic>> searchResults = [];

    final List<Map<String, dynamic>> allPlaces = [
      {'name': 'Hulhumale Phase 2', 'address': 'Hulhumale Phase 2, Flat Area', 'lat': 4.2286, 'lng': 73.5400, 'icon': Icons.location_city},
      {'name': 'Hulhumale Phase 1', 'address': 'Hulhumale Phase 1, Housing', 'lat': 4.2116, 'lng': 73.5380, 'icon': Icons.location_city},
      {'name': 'Velana Airport', 'address': 'Velana International Airport', 'lat': 4.1918, 'lng': 73.5290, 'icon': Icons.flight},
      {'name': 'Male City Center', 'address': 'Male City, Republic Square', 'lat': 4.1755, 'lng': 73.5093, 'icon': Icons.location_city},
      {'name': 'Ferry Terminal', 'address': 'Hulhumale Ferry Terminal', 'lat': 4.2106, 'lng': 73.5400, 'icon': Icons.directions_boat},
      {'name': 'Central Park', 'address': 'Hulhumale Central Park', 'lat': 4.2200, 'lng': 73.5380, 'icon': Icons.park},
      {'name': 'Tree Top Hospital', 'address': 'Tree Top Hospital, Hulhumale', 'lat': 4.2250, 'lng': 73.5420, 'icon': Icons.local_hospital},
      {'name': 'ADK Hospital', 'address': 'ADK Hospital, Male City', 'lat': 4.1740, 'lng': 73.5100, 'icon': Icons.local_hospital},
      {'name': 'Artificial Beach', 'address': 'Artificial Beach, Male', 'lat': 4.1720, 'lng': 73.5050, 'icon': Icons.beach_access},
      {'name': 'Fish Market', 'address': 'Male Fish Market', 'lat': 4.1760, 'lng': 73.5070, 'icon': Icons.store},
      {'name': 'Islamic Centre', 'address': 'Islamic Centre, Male', 'lat': 4.1750, 'lng': 73.5090, 'icon': Icons.mosque},
      {'name': 'SO Fitness', 'address': 'SO Fitness, Male City', 'lat': 4.1735, 'lng': 73.5095, 'icon': Icons.fitness_center},
    ];

    return await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setModalState) {
          void performSearch(String query) {
            if (query.isEmpty) {
              setModalState(() {
                showSearchResults = false;
                searchResults = [];
              });
            } else {
              final results = allPlaces.where((place) {
                final name = (place['name'] as String).toLowerCase();
                final address = (place['address'] as String).toLowerCase();
                return name.contains(query.toLowerCase()) || address.contains(query.toLowerCase());
              }).toList();
              setModalState(() {
                showSearchResults = true;
                searchResults = results;
              });
            }
          }

          return Container(
            height: MediaQuery.of(context).size.height * 0.92,
            decoration: BoxDecoration(
              color: isDark ? AppColors.bgDark : Colors.white,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
            ),
            child: Column(
              children: [
                Container(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                  decoration: BoxDecoration(
                    color: isDark ? AppColors.surfaceDark : Colors.white,
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
                  ),
                  child: Column(
                    children: [
                      Container(
                        width: 40,
                        height: 4,
                        decoration: BoxDecoration(color: isDark ? context.borderColor : const Color(0xFFE0E0E0), borderRadius: BorderRadius.circular(2)),
                      ),
                      const SizedBox(height: 16),
                      Row(
                        children: [
                          GestureDetector(
                            onTap: () => Navigator.pop(context),
                            child: Container(
                              width: 40,
                              height: 40,
                              decoration: BoxDecoration(
                                color: isDark ? AppColors.bgDark : Colors.white,
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Icon(Icons.arrow_back, color: isDark ? context.textColor : Colors.black87, size: 20),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              title,
                              style: TextStyle(color: isDark ? context.textColor : Colors.black87, fontSize: 18, fontWeight: FontWeight.w700),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      Container(
                        decoration: BoxDecoration(
                          color: isDark ? AppColors.bgDark : Colors.white,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: isDark ? context.borderColor : const Color(0xFFE0E0E0)),
                        ),
                        child: Row(
                          children: [
                            Padding(
                              padding: const EdgeInsets.only(left: 14),
                              child: Icon(Icons.search, color: accentColor, size: 22),
                            ),
                            Expanded(
                              child: TextField(
                                controller: searchController,
                                style: TextStyle(color: isDark ? context.textColor : Colors.black87, fontSize: 15),
                                decoration: InputDecoration(
                                  hintText: 'Search by name or address...',
                                  hintStyle: TextStyle(color: isDark ? context.mutedColor : Colors.grey, fontSize: 15),
                                  border: InputBorder.none,
                                  contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
                                ),
                                onChanged: performSearch,
                              ),
                            ),
                            if (searchController.text.isNotEmpty)
                              GestureDetector(
                                onTap: () {
                                  searchController.clear();
                                  performSearch('');
                                },
                                child: Padding(
                                  padding: const EdgeInsets.only(right: 12),
                                  child: Icon(Icons.close, color: isDark ? context.mutedColor : Colors.grey, size: 20),
                                ),
                              ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],
                  ),
                ),

                Expanded(
                  child: showSearchResults
                      ? Container(
                          color: isDark ? AppColors.surfaceDark : Colors.white,
                          child: searchResults.isEmpty
                              ? Center(
                                  child: Column(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Icon(Icons.search_off, color: isDark ? context.mutedColor : Colors.grey, size: 48),
                                      const SizedBox(height: 12),
                                      Text('No results found', style: TextStyle(color: isDark ? context.mutedColor : Colors.grey, fontSize: 16)),
                                    ],
                                  ),
                                )
                              : ListView.builder(
                                  padding: const EdgeInsets.symmetric(horizontal: 16),
                                  itemCount: searchResults.length,
                                  itemBuilder: (context, index) {
                                    final place = searchResults[index];
                                    final isSelected = addressText == place['address'];
                                    return GestureDetector(
                                      onTap: () {
                                        final lat = place['lat'] as double;
                                        final lng = place['lng'] as double;
                                        setModalState(() {
                                          selectedLocation = LatLng(lat, lng);
                                          addressText = place['address'] as String;
                                          selectedName = place['name'] as String;
                                          showSearchResults = false;
                                          searchController.text = place['name'] as String;
                                        });
                                        googleMapController?.animateCamera(CameraUpdate.newLatLngZoom(selectedLocation, 16));
                                      },
                                      child: Container(
                                        margin: const EdgeInsets.only(bottom: 8),
                                        padding: const EdgeInsets.all(14),
                                        decoration: BoxDecoration(
                                          color: isSelected ? accentColor.withValues(alpha: 0.15) : (isDark ? AppColors.bgDark : Colors.white),
                                          borderRadius: BorderRadius.circular(14),
                                          border: Border.all(color: isSelected ? accentColor : (isDark ? context.borderColor : const Color(0xFFE0E0E0))),
                                        ),
                                        child: Row(
                                          children: [
                                            Container(
                                              width: 44,
                                              height: 44,
                                              decoration: BoxDecoration(
                                                color: accentColor.withValues(alpha: 0.15),
                                                borderRadius: BorderRadius.circular(12),
                                              ),
                                              child: Icon(place['icon'] as IconData, color: accentColor, size: 22),
                                            ),
                                            const SizedBox(width: 14),
                                            Expanded(
                                              child: Column(
                                                crossAxisAlignment: CrossAxisAlignment.start,
                                                children: [
                                                  Text(
                                                    place['name'] as String,
                                                    style: TextStyle(color: isDark ? context.textColor : Colors.black87, fontSize: 15, fontWeight: FontWeight.w600),
                                                  ),
                                                  const SizedBox(height: 2),
                                                  Text(
                                                    place['address'] as String,
                                                    style: TextStyle(color: isDark ? context.mutedColor : Colors.grey, fontSize: 13),
                                                  ),
                                                ],
                                              ),
                                            ),
                                            if (isSelected)
                                              Icon(Icons.check_circle, color: accentColor, size: 22),
                                          ],
                                        ),
                                      ),
                                    );
                                  },
                                ),
                        )
                      : Stack(
                          children: [
                            GoogleMap(
                              initialCameraPosition: CameraPosition(target: selectedLocation, zoom: 14),
                              onMapCreated: (controller) => googleMapController = controller,
                              onTap: (point) {
                                setModalState(() {
                                  selectedLocation = point;
                                  addressText = '${point.latitude.toStringAsFixed(5)}, ${point.longitude.toStringAsFixed(5)}';
                                  selectedName = 'Pinned Location';
                                  searchController.text = '';
                                });
                              },
                              markers: {
                                Marker(
                                  markerId: const MarkerId('selected'),
                                  position: selectedLocation,
                                  icon: BitmapDescriptor.defaultMarkerWithHue(
                                    accentColor == AppColors.success ? BitmapDescriptor.hueGreen : BitmapDescriptor.hueRed,
                                  ),
                                ),
                              },
                              myLocationEnabled: true,
                              myLocationButtonEnabled: false,
                              zoomControlsEnabled: false,
                              mapToolbarEnabled: false,
                              style: isDark ? _darkMapStyle : null,
                            ),
                            Positioned(
                              bottom: 20,
                              right: 16,
                              child: Column(
                                children: [
                                  GestureDetector(
                                    onTap: () => googleMapController?.animateCamera(CameraUpdate.zoomIn()),
                                    child: Container(
                                      width: 48,
                                      height: 48,
                                      decoration: BoxDecoration(
                                        color: isDark ? AppColors.surfaceDark : Colors.white,
                                        borderRadius: BorderRadius.circular(14),
                                        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.2), blurRadius: 10)],
                                      ),
                                      child: Icon(Icons.add, color: isDark ? context.textColor : Colors.black87, size: 24),
                                    ),
                                  ),
                                  const SizedBox(height: 10),
                                  GestureDetector(
                                    onTap: () => googleMapController?.animateCamera(CameraUpdate.zoomOut()),
                                    child: Container(
                                      width: 48,
                                      height: 48,
                                      decoration: BoxDecoration(
                                        color: isDark ? AppColors.surfaceDark : Colors.white,
                                        borderRadius: BorderRadius.circular(14),
                                        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.2), blurRadius: 10)],
                                      ),
                                      child: Icon(Icons.remove, color: isDark ? context.textColor : Colors.black87, size: 24),
                                    ),
                                  ),
                                  const SizedBox(height: 10),
                                  GestureDetector(
                                    onTap: () => googleMapController?.animateCamera(CameraUpdate.newLatLngZoom(const LatLng(4.1755, 73.5093), 13)),
                                    child: Container(
                                      width: 48,
                                      height: 48,
                                      decoration: BoxDecoration(
                                        color: isDark ? AppColors.surfaceDark : Colors.white,
                                        borderRadius: BorderRadius.circular(14),
                                        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.2), blurRadius: 10)],
                                      ),
                                      child: Icon(Icons.my_location, color: accentColor, size: 22),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            if (addressText.isEmpty)
                              Positioned(
                                top: 20,
                                left: 16,
                                right: 16,
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                                  decoration: BoxDecoration(
                                    color: (isDark ? AppColors.surfaceDark : Colors.white).withValues(alpha: 0.95),
                                    borderRadius: BorderRadius.circular(12),
                                    boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.15), blurRadius: 10)],
                                  ),
                                  child: Row(
                                    children: [
                                      Icon(Icons.touch_app, color: accentColor, size: 20),
                                      const SizedBox(width: 10),
                                      Expanded(
                                        child: Text(
                                          'Tap on the map to pin location or search above',
                                          style: TextStyle(color: isDark ? context.textColor : Colors.black87, fontSize: 13),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                          ],
                        ),
                ),

                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: isDark ? AppColors.surfaceDark : Colors.white,
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
                    boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.1), blurRadius: 15, offset: const Offset(0, -5))],
                  ),
                  child: Column(
                    children: [
                      if (addressText.isNotEmpty)
                        Container(
                          width: double.infinity,
                          margin: const EdgeInsets.only(bottom: 14),
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: accentColor.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: accentColor.withValues(alpha: 0.3)),
                          ),
                          child: Row(
                            children: [
                              Container(
                                width: 40,
                                height: 40,
                                decoration: BoxDecoration(
                                  color: accentColor,
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Icon(Icons.check, color: Colors.white, size: 22),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      selectedName.isEmpty ? 'Selected Location' : selectedName,
                                      style: TextStyle(color: isDark ? context.textColor : Colors.black87, fontSize: 15, fontWeight: FontWeight.w600),
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      addressText,
                                      style: TextStyle(color: isDark ? context.mutedColor : Colors.grey, fontSize: 12),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: addressText.isNotEmpty
                              ? () => Navigator.pop(context, {'address': addressText, 'name': selectedName, 'lat': selectedLocation.latitude, 'lng': selectedLocation.longitude})
                              : null,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: accentColor,
                            foregroundColor: Colors.white,
                            disabledBackgroundColor: isDark ? context.borderColor : const Color(0xFFE0E0E0),
                            disabledForegroundColor: isDark ? context.mutedColor : Colors.grey,
                            padding: const EdgeInsets.symmetric(vertical: 16),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                            elevation: 0,
                          ),
                          child: Text(
                            addressText.isEmpty ? 'Select a location' : 'Confirm Location',
                            style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
                          ),
                        ),
                      ),
                      SizedBox(height: MediaQuery.of(context).padding.bottom),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class NearbyScreen extends StatefulWidget {
  final String destination;

  const NearbyScreen({super.key, this.destination = 'International Airport · T3'});

  @override
  State<NearbyScreen> createState() => _NearbyScreenState();
}

class _NearbyScreenState extends State<NearbyScreen> with SingleTickerProviderStateMixin {
  GoogleMapController? _mapController;
  LatLng _currentLocation = const LatLng(4.1755, 73.5093);
  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;

  List<LatLng> _vehicleLocations = [];
  bool _loadingDrivers = true;

  @override
  void initState() {
    super.initState();
    _loadCurrentLocation();
    _pulseController = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    )..repeat(reverse: true);
    _pulseAnimation = Tween<double>(begin: 1.0, end: 2.5).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );
    _loadNearbyDrivers();
  }

  Future<void> _loadCurrentLocation() async {
    final loc = await LocationService.getCurrentLocation();
    if (mounted) setState(() => _currentLocation = LatLng(loc.latitude, loc.longitude));
  }

  Future<void> _loadNearbyDrivers() async {
    try {
      final drivers = await SupabaseService.getOnlineDriverLocations();
      if (mounted) {
        setState(() {
          _vehicleLocations = drivers
              .map((d) => LatLng(d['lat'] as double, d['lng'] as double))
              .toList();
          _loadingDrivers = false;
        });
      }
    } catch (e) {
      debugPrint('Error loading nearby drivers: $e');
      if (mounted) setState(() => _loadingDrivers = false);
    }
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = context.isDark;

    return Scaffold(
      backgroundColor: context.bgColor,
      body: Stack(
        children: [
          GoogleMap(
            initialCameraPosition: CameraPosition(target: _currentLocation, zoom: 15),
            onMapCreated: (controller) => _mapController = controller,
            markers: {
              Marker(
                markerId: const MarkerId('user'),
                position: _currentLocation,
                icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueYellow),
              ),
              ..._vehicleLocations.asMap().entries.map((entry) => Marker(
                markerId: MarkerId('vehicle_${entry.key}'),
                position: entry.value,
                icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueOrange),
              )),
            },
            myLocationEnabled: true,
            myLocationButtonEnabled: false,
            zoomControlsEnabled: false,
            mapToolbarEnabled: false,
            style: isDark ? _darkMapStyle : null,
          ),
          _buildHeader(context, isDark),
          _buildCountPill(isDark),
          _buildBottomSheet(context, isDark),
        ],
      ),
    );
  }

  Widget _buildHeader(BuildContext context, bool isDark) {
    return Positioned(
      top: 56,
      left: 16,
      right: 16,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          _buildRoundButton(Icons.arrow_back_ios_new, isDark, context, onTap: () => Navigator.pop(context)),
          _buildRoundButton(Icons.shield_outlined, isDark, context, color: AppColors.yellow, onTap: () => _showSafetyInfo(context, isDark)),
        ],
      ),
    );
  }

  void _showSafetyInfo(BuildContext context, bool isDark) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: context.surfaceColor,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: AppColors.yellowSoft,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Icon(Icons.shield, color: AppColors.yellow, size: 32),
            ),
            const SizedBox(height: 16),
            Text('Safety Features', style: TextStyle(color: context.textColor, fontSize: 20, fontWeight: FontWeight.w700)),
            const SizedBox(height: 16),
            _buildSafetyItem(context, Icons.share_location, 'Share trip with contacts'),
            _buildSafetyItem(context, Icons.phone, 'Emergency call button'),
            _buildSafetyItem(context, Icons.verified_user, 'Verified drivers only'),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _buildSafetyItem(BuildContext context, IconData icon, String text) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Icon(icon, color: AppColors.yellow, size: 24),
          const SizedBox(width: 16),
          Text(text, style: TextStyle(color: context.textColor, fontSize: 15)),
        ],
      ),
    );
  }

  Widget _buildCountPill(bool isDark) {
    return Positioned(
      top: 120,
      left: 0,
      right: 0,
      child: Center(
        child: GlassContainer(
          borderRadius: BorderRadius.circular(99),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
          backgroundColor: isDark ? const Color(0xB8141416) : const Color(0xE8FFFFFF),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: AppColors.yellow,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 8),
              Builder(
                builder: (context) => Text(
                  '${_vehicleLocations.length} vehicle${_vehicleLocations.length == 1 ? '' : 's'} near you',
                  style: TextStyle(
                    color: context.textColor,
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildRoundButton(IconData icon, bool isDark, BuildContext context, {Color? color, VoidCallback? onTap}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 48,
        height: 48,
        decoration: BoxDecoration(
          color: isDark ? const Color(0xB8141416) : const Color(0xB8FFFFFF),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.1)),
        ),
        child: Icon(icon, color: color ?? context.textColor, size: 20),
      ),
    );
  }

  Widget _buildBottomSheet(BuildContext context, bool isDark) {
    return Positioned(
      left: 8,
      right: 8,
      bottom: 8,
      child: GlassContainer(
        borderRadius: BorderRadius.circular(32),
        backgroundColor: isDark ? const Color(0xB8141416) : const Color(0xE8FFFFFF),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.18),
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
            ),
            const SizedBox(height: 14),
            Text(
              'Vehicles near you',
              style: TextStyle(
                color: context.textColor,
                fontSize: 20,
                fontWeight: FontWeight.w700,
                letterSpacing: -0.4,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'No need to pick — request and we\'ll assign the nearest available vehicle.',
              style: TextStyle(color: context.mutedColor, fontSize: 13, height: 1.45),
            ),
            const SizedBox(height: 14),
            _buildTripSummary(isDark, context),
            const SizedBox(height: 12),
            _buildStaffRow(isDark, context),
            const SizedBox(height: 14),
            SizedBox(
              width: double.infinity,
              height: 58,
              child: ElevatedButton(
                onPressed: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => DriverMatchingScreen(
                        pickup: 'Current location',
                        dropoff: widget.destination,
                        rideType: 'Staff Car',
                        pickupLat: _currentLocation.latitude,
                        pickupLng: _currentLocation.longitude,
                        dropoffLat: 4.1755, // Default destination
                        dropoffLng: 73.5093,
                      ),
                    ),
                  );
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.yellow,
                  foregroundColor: AppColors.bgDark,
                  elevation: 0,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                ),
                child: Text(
                  'Request nearest ride',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTripSummary(bool isDark, BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.03),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.07)),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(
                  color: AppColors.yellow,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 12),
              Text(
                'Current location',
                style: TextStyle(color: context.textColor, fontSize: 13.5, fontWeight: FontWeight.w500),
              ),
            ],
          ),
          Container(
            width: 2,
            height: 14,
            margin: const EdgeInsets.only(left: 4, top: 2, bottom: 2),
            color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.14),
          ),
          Row(
            children: [
              Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(
                  color: context.textColor,
                  borderRadius: BorderRadius.circular(3),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  widget.destination,
                  style: TextStyle(color: context.textColor, fontSize: 13.5, fontWeight: FontWeight.w500),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStaffRow(bool isDark, BuildContext context) {
    final appState = Provider.of<AppState>(context);
    return Row(
      children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.05),
            borderRadius: BorderRadius.circular(11),
          ),
          child: Icon(Icons.shield_outlined, color: AppColors.yellow, size: 18),
        ),
        const SizedBox(width: 12),
        Text(
          'Staff trip',
          style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w600),
        ),
        const Spacer(),
        Text('Staff ID · ${appState.staffId}', style: TextStyle(color: context.mutedColor, fontSize: 13)),
      ],
    );
  }
}

class FindingScreen extends StatefulWidget {
  final String destination;

  const FindingScreen({super.key, this.destination = 'International Airport · T3'});

  @override
  State<FindingScreen> createState() => _FindingScreenState();
}

class _FindingScreenState extends State<FindingScreen> with TickerProviderStateMixin {
  late AnimationController _radarController;
  late AnimationController _pulseController;
  LatLng _currentLocation = const LatLng(4.1755, 73.5093);

  Future<void> _loadCurrentLocation() async {
    final loc = await LocationService.getCurrentLocation();
    if (mounted) setState(() => _currentLocation = LatLng(loc.latitude, loc.longitude));
  }

  @override
  void initState() {
    super.initState();
    _loadCurrentLocation();
    _radarController = AnimationController(
      duration: const Duration(milliseconds: 2200),
      vsync: this,
    )..repeat();
    _pulseController = AnimationController(
      duration: const Duration(milliseconds: 1200),
      vsync: this,
    )..repeat();

    Future.delayed(const Duration(seconds: 3), () {
      if (mounted) {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => TrackingScreen(destination: widget.destination)),
        );
      }
    });
  }

  @override
  void dispose() {
    _radarController.dispose();
    _pulseController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = context.isDark;

    return Scaffold(
      backgroundColor: context.bgColor,
      body: Stack(
        children: [
          GoogleMap(
            initialCameraPosition: CameraPosition(target: _currentLocation, zoom: 15),
            markers: {
              Marker(
                markerId: const MarkerId('current'),
                position: _currentLocation,
                icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueYellow),
              ),
            },
            myLocationEnabled: false,
            zoomControlsEnabled: false,
            zoomGesturesEnabled: false,
            scrollGesturesEnabled: false,
            rotateGesturesEnabled: false,
            tiltGesturesEnabled: false,
            mapToolbarEnabled: false,
            style: isDark ? _darkMapStyle : null,
          ),
          _buildRadar(),
          _buildHeader(isDark),
          _buildBottomSheet(isDark),
        ],
      ),
    );
  }

  Widget _buildHeader(bool isDark) {
    return Positioned(
      top: 56,
      left: 16,
      child: GestureDetector(
        onTap: () {
          final appState = Provider.of<AppState>(context, listen: false);
          appState.endTrip();
          Navigator.pop(context);
        },
        child: Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            color: isDark ? const Color(0xB8141416) : const Color(0xB8FFFFFF),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.1)),
          ),
          child: Icon(Icons.close, color: context.textColor, size: 22),
        ),
      ),
    );
  }

  Widget _buildRadar() {
    return Positioned(
      top: 250,
      left: 0,
      right: 0,
      child: Center(
        child: SizedBox(
          width: 200,
          height: 200,
          child: Stack(
            alignment: Alignment.center,
            children: [
              ...List.generate(3, (i) {
                return AnimatedBuilder(
                  animation: _radarController,
                  builder: (context, child) {
                    final delay = i * 0.3;
                    final value = (_radarController.value + delay) % 1.0;
                    final scale = 0.6 + value * 2.6;
                    final opacity = (0.7 - value * 0.7).clamp(0.0, 1.0);
                    return Transform.scale(
                      scale: scale,
                      child: Container(
                        width: 60,
                        height: 60,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: AppColors.yellow.withValues(alpha: opacity),
                            width: 2,
                          ),
                        ),
                      ),
                    );
                  },
                );
              }),
              Container(
                width: 60,
                height: 60,
                decoration: BoxDecoration(
                  color: AppColors.yellow,
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.yellow.withValues(alpha: 0.4),
                      blurRadius: 40,
                    ),
                  ],
                ),
                child: Icon(Icons.directions_car, color: context.isDark ? AppColors.bgDark : Colors.white, size: 28),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildBottomSheet(bool isDark) {
    return Positioned(
      left: 8,
      right: 8,
      bottom: 8,
      child: GlassContainer(
        borderRadius: BorderRadius.circular(32),
        backgroundColor: isDark ? const Color(0xB8141416) : const Color(0xE8FFFFFF),
        padding: const EdgeInsets.all(22),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: List.generate(
                3,
                (i) => AnimatedBuilder(
                  animation: _pulseController,
                  builder: (context, child) {
                    final delay = i * 0.15;
                    final value = (_pulseController.value - delay) % 1.0;
                    final opacity = 0.4 + 0.6 * _pulse(value);
                    return Container(
                      margin: const EdgeInsets.only(right: 6),
                      width: 7,
                      height: 7,
                      decoration: BoxDecoration(
                        color: AppColors.yellow.withValues(alpha: opacity),
                        shape: BoxShape.circle,
                      ),
                    );
                  },
                ),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Finding your vehicle…',
              style: TextStyle(
                color: context.textColor,
                fontSize: 22,
                fontWeight: FontWeight.w700,
                letterSpacing: -0.5,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Matching you with the nearest vehicle. This usually takes under a minute.',
              style: TextStyle(color: context.mutedColor, fontSize: 14, height: 1.5),
            ),
            const SizedBox(height: 18),
            Row(
              children: [
                Expanded(child: _buildInfoCard('Vehicle', 'MV 88', isDark)),
                const SizedBox(width: 10),
                Expanded(child: _buildInfoCard('To', widget.destination.split(' · ').first, isDark)),
              ],
            ),
            const SizedBox(height: 14),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: ElevatedButton(
                onPressed: () {
                  final appState = Provider.of<AppState>(context, listen: false);
                  appState.endTrip();
                  Navigator.of(context).pushNamedAndRemoveUntil('/home', (route) => false);
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.red,
                  foregroundColor: Colors.white,
                  elevation: 0,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                child: Text(
                  'Cancel',
                  style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildInfoCard(String label, String value, bool isDark) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(color: context.faintColor, fontSize: 11)),
          const SizedBox(height: 2),
          Text(
            value,
            style: TextStyle(
              color: context.textColor,
              fontSize: 16,
              fontWeight: FontWeight.w700,
            ),
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }

  double _pulse(double t) {
    if (t < 0) t += 1;
    return t < 0.5 ? 2 * t : 2 * (1 - t);
  }
}

class TrackingScreen extends StatefulWidget {
  final String destination;

  const TrackingScreen({super.key, this.destination = 'International Airport · T3'});

  @override
  State<TrackingScreen> createState() => _TrackingScreenState();
}

class _TrackingScreenState extends State<TrackingScreen> {
  LatLng _currentLocation = const LatLng(4.1755, 73.5093);
  final LatLng _driverLocation = const LatLng(4.1950, 73.5320);
  final LatLng _destination = const LatLng(4.1880, 73.5250);
  static const String _trackingScreenId = 'tracking';

  final List<LatLng> _routePoints = [
    const LatLng(4.1950, 73.5320),
    const LatLng(4.1940, 73.5305),
    const LatLng(4.1930, 73.5295),
    const LatLng(4.1918, 73.5290),
    const LatLng(4.1900, 73.5270),
    const LatLng(4.1880, 73.5250),
  ];

  @override
  void initState() {
    super.initState();
    _loadCurrentLocation();
  }

  Future<void> _loadCurrentLocation() async {
    final loc = await LocationService.getCurrentLocation();
    if (mounted) setState(() => _currentLocation = LatLng(loc.latitude, loc.longitude));
  }

  @override
  Widget build(BuildContext context) {
    final isDark = context.isDark;

    return Scaffold(
      backgroundColor: context.bgColor,
      body: Stack(
        children: [
          GoogleMap(
            initialCameraPosition: CameraPosition(target: _currentLocation, zoom: 15),
            markers: {
              Marker(
                markerId: MarkerId('${_trackingScreenId}_user'),
                position: _currentLocation,
                icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueYellow),
              ),
              Marker(
                markerId: MarkerId('${_trackingScreenId}_driver'),
                position: _driverLocation,
                icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueOrange),
              ),
              Marker(
                markerId: MarkerId('${_trackingScreenId}_destination'),
                position: _destination,
                icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueRed),
              ),
            },
            polylines: {
              Polyline(
                polylineId: PolylineId('${_trackingScreenId}_route'),
                points: _routePoints,
                width: 5,
                color: AppColors.yellow,
              ),
            },
            myLocationEnabled: true,
            myLocationButtonEnabled: false,
            zoomControlsEnabled: false,
            mapToolbarEnabled: false,
            style: isDark ? _darkMapStyle : null,
          ),
          _buildHeader(context, isDark),
          _buildEtaPill(isDark, context),
          _buildBottomSheet(context, isDark),
        ],
      ),
    );
  }

  Widget _buildHeader(BuildContext context, bool isDark) {
    return Positioned(
      top: 56,
      left: 16,
      right: 16,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          _buildRoundButton(Icons.arrow_back_ios_new, isDark, context, onTap: () {
            _showCancelDialog(context, isDark);
          }),
          _buildRoundButton(Icons.shield_outlined, isDark, context, color: AppColors.yellow, onTap: () {
            Navigator.push(context, MaterialPageRoute(builder: (_) => const SafetyScreen()));
          }),
        ],
      ),
    );
  }

  void _showCancelDialog(BuildContext context, bool isDark) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.surfaceColor,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        title: Text('Cancel ride?', style: TextStyle(color: context.textColor)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Your driver is on the way. Are you sure you want to cancel?', style: TextStyle(color: context.mutedColor)),
            const SizedBox(height: 24),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.pop(ctx),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: context.textColor,
                      side: BorderSide(color: context.mutedColor.withValues(alpha: 0.3)),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: Text('Keep ride', style: TextStyle(fontWeight: FontWeight.w600)),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton(
                    onPressed: () {
                      final appState = Provider.of<AppState>(context, listen: false);
                      appState.endTrip();
                      Navigator.pop(ctx);
                      Navigator.of(context).pushNamedAndRemoveUntil('/home', (route) => false);
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.red,
                      foregroundColor: Colors.white,
                      elevation: 0,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: Text('Cancel ride', style: TextStyle(fontWeight: FontWeight.w600)),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEtaPill(bool isDark, BuildContext context) {
    return Positioned(
      top: 120,
      left: 0,
      right: 0,
      child: Center(
        child: GlassContainer(
          borderRadius: BorderRadius.circular(99),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
          backgroundColor: isDark ? const Color(0xB8141416) : const Color(0xE8FFFFFF),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: AppColors.yellow,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                'Arriving in 3 min',
                style: TextStyle(
                  color: context.textColor,
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildRoundButton(IconData icon, bool isDark, BuildContext context, {Color? color, VoidCallback? onTap}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 48,
        height: 48,
        decoration: BoxDecoration(
          color: isDark ? const Color(0xB8141416) : const Color(0xB8FFFFFF),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.1)),
        ),
        child: Icon(icon, color: color ?? context.textColor, size: 20),
      ),
    );
  }

  Widget _buildBottomSheet(BuildContext context, bool isDark) {
    return Positioned(
      left: 8,
      right: 8,
      bottom: 8,
      child: GlassContainer(
        borderRadius: BorderRadius.circular(32),
        backgroundColor: isDark ? const Color(0xB8141416) : const Color(0xE8FFFFFF),
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            Row(
              children: [
                _buildAvatar('MK', ring: true, isDark: isDark, context: context),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Marcus K.',
                        style: TextStyle(
                          color: context.textColor,
                          fontSize: 17,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      Row(
                        children: [
                          Icon(Icons.star, color: AppColors.yellow, size: 16),
                          const SizedBox(width: 4),
                          Text(
                            '4.96 · 2,140 trips',
                            style: TextStyle(color: context.mutedColor, fontSize: 13),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      'MV 88',
                      style: TextStyle(
                        color: context.textColor,
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.5,
                      ),
                    ),
                    Text('Twin Cab', style: TextStyle(color: context.mutedColor, fontSize: 12.5)),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 18),
            Row(
              children: [
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: () => Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => ChatScreen(destination: widget.destination)),
                    ),
                    icon: Icon(Icons.chat_bubble_outline, size: 18),
                    label: Text('Message'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.yellow,
                      foregroundColor: AppColors.bgDark,
                      elevation: 0,
                      minimumSize: const Size(0, 54),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _showCallDialog(context),
                    icon: Icon(Icons.phone_outlined, size: 18),
                    label: Text('Call'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: context.textColor,
                      side: BorderSide(color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.12)),
                      minimumSize: const Size(0, 54),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            _buildShareTripButton(context, isDark),
            const SizedBox(height: 16),
            _buildTripSummary(context, isDark),
          ],
        ),
      ),
    );
  }

  Widget _buildShareTripButton(BuildContext context, bool isDark) {
    final appState = Provider.of<AppState>(context);
    final isSharing = appState.isSharingTrip;

    return GestureDetector(
      onTap: () {
        HapticFeedback.mediumImpact();
        if (isSharing) {
          appState.stopTripSharing();
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: const Row(
                children: [
                  Icon(Icons.location_off, color: Colors.white, size: 20),
                  SizedBox(width: 10),
                  Text('Trip sharing stopped'),
                ],
              ),
              backgroundColor: context.mutedColor,
              behavior: SnackBarBehavior.floating,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
          );
        } else {
          final contacts = appState.trustedContacts.map((c) => c['name'] ?? '').toList();
          appState.startTripSharing(contacts);
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: const Row(
                children: [
                  Icon(Icons.check_circle, color: Colors.white, size: 20),
                  SizedBox(width: 10),
                  Text('Trip shared with trusted contacts'),
                ],
              ),
              backgroundColor: AppColors.green,
              behavior: SnackBarBehavior.floating,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
          );
        }
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: isSharing
            ? AppColors.green.withValues(alpha: 0.15)
            : (isDark ? Colors.white : Colors.black).withValues(alpha: 0.03),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: isSharing
              ? AppColors.green
              : (isDark ? Colors.white : Colors.black).withValues(alpha: 0.08),
          ),
        ),
        child: Row(
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: isSharing ? AppColors.green : (isDark ? Colors.white : Colors.black).withValues(alpha: 0.05),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(
                isSharing ? Icons.location_on : Icons.share_location_outlined,
                color: isSharing ? Colors.white : context.mutedColor,
                size: 20,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    isSharing ? 'Sharing Live Location' : 'Share Trip',
                    style: TextStyle(
                      color: isSharing ? AppColors.green : context.textColor,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Text(
                    isSharing ? 'Tap to stop sharing' : 'Share with trusted contacts',
                    style: TextStyle(color: context.mutedColor, fontSize: 12),
                  ),
                ],
              ),
            ),
            if (isSharing)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.green,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.circle, color: Colors.white, size: 6),
                    SizedBox(width: 4),
                    Text('LIVE', style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w800)),
                  ],
                ),
              )
            else
              Icon(Icons.chevron_right, color: context.mutedColor, size: 20),
          ],
        ),
      ),
    );
  }

  void _showCallDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.surfaceColor,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        title: Text('Call Driver', style: TextStyle(color: context.textColor)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Call Marcus K. at +960 777 8888?', style: TextStyle(color: context.mutedColor)),
            const SizedBox(height: 24),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.pop(ctx),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: context.textColor,
                      side: BorderSide(color: context.mutedColor.withValues(alpha: 0.3)),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: Text('Cancel', style: TextStyle(fontWeight: FontWeight.w600)),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: () {
                      Navigator.pop(ctx);
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text('Calling driver...'),
                          backgroundColor: AppColors.yellow,
                          behavior: SnackBarBehavior.floating,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                      );
                    },
                    icon: Icon(Icons.phone, size: 18),
                    label: Text('Call', style: TextStyle(fontWeight: FontWeight.w600)),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.green,
                      foregroundColor: Colors.white,
                      elevation: 0,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAvatar(String initials, {bool ring = false, required bool isDark, required BuildContext context}) {
    return Container(
      width: 56,
      height: 56,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: isDark
              ? [const Color(0xFF2A2A30), const Color(0xFF1B1B1F)]
              : [const Color(0xFFE0E0E5), const Color(0xFFD0D0D5)],
        ),
        shape: BoxShape.circle,
        border: ring
            ? Border.all(color: AppColors.yellow, width: 2)
            : Border.all(color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.1)),
      ),
      child: Center(
        child: Text(
          initials,
          style: TextStyle(
            color: context.textColor,
            fontSize: 19,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }

  Widget _buildTripSummary(BuildContext context, bool isDark) {
    return GestureDetector(
      onTap: () => Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => TripProgressScreen(destination: widget.destination)),
      ),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.03),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.07)),
        ),
        child: Column(
          children: [
            Row(
              children: [
                Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(color: AppColors.yellow, shape: BoxShape.circle),
                ),
                const SizedBox(width: 12),
                Text(
                  'Current location',
                  style: TextStyle(color: context.textColor, fontSize: 13.5, fontWeight: FontWeight.w500),
                ),
              ],
            ),
            Container(
              width: 2,
              height: 14,
              margin: const EdgeInsets.only(left: 4, top: 2, bottom: 2),
              color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.14),
            ),
            Row(
              children: [
                Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(
                    color: context.textColor,
                    borderRadius: BorderRadius.circular(3),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    widget.destination,
                    style: TextStyle(color: context.textColor, fontSize: 13.5, fontWeight: FontWeight.w500),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                Icon(Icons.chevron_right, color: context.mutedColor, size: 18),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

enum _MessageType { text, voice, location }
enum _MessageStatus { sending, sent, delivered, read }

class _ChatMessage {
  final String id;
  final String text;
  final bool isMe;
  final DateTime time;
  final _MessageType type;
  final _MessageStatus status;
  final String? reaction;
  final int? voiceDuration;
  final String? locationName;

  _ChatMessage({
    required this.id,
    required this.text,
    required this.isMe,
    required this.time,
    this.type = _MessageType.text,
    this.status = _MessageStatus.read,
    this.reaction,
    this.voiceDuration,
    this.locationName,
  });

  _ChatMessage copyWith({String? reaction, _MessageStatus? status}) {
    return _ChatMessage(
      id: id,
      text: text,
      isMe: isMe,
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
  final String destination;

  const ChatScreen({super.key, this.destination = 'Airport T3'});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> with TickerProviderStateMixin {
  final _messageController = TextEditingController();
  final _scrollController = ScrollController();
  final _focusNode = FocusNode();
  final List<_ChatMessage> _messages = [];

  bool _isTyping = false;
  bool _driverTyping = false;
  bool _isRecording = false;
  int _recordingSeconds = 0;
  Timer? _recordingTimer;
  late AnimationController _recordingController;
  late Animation<double> _recordingAnimation;

  final List<_QuickReply> _quickReplies = [
    _QuickReply(icon: Icons.location_on, text: "I'm here", color: AppColors.success),
    _QuickReply(icon: Icons.access_time, text: "Running late", color: AppColors.yellow),
    _QuickReply(icon: Icons.directions_walk, text: "On my way", color: const Color(0xFF007AFF)),
    _QuickReply(icon: Icons.thumb_up, text: "Thanks!", color: AppColors.success),
  ];

  final List<String> _reactions = ['👍', '❤️', '😊', '👏', '🙏'];

  @override
  void initState() {
    super.initState();
    _recordingController = AnimationController(
      duration: const Duration(milliseconds: 1000),
      vsync: this,
    )..repeat(reverse: true);
    _recordingAnimation = Tween<double>(begin: 1.0, end: 1.3).animate(
      CurvedAnimation(parent: _recordingController, curve: Curves.easeInOut),
    );
    // No mock messages - chat starts empty
    _messageController.addListener(_onTextChanged);
  }

  void _onTextChanged() {
    final hasText = _messageController.text.isNotEmpty;
    if (hasText != _isTyping) {
      setState(() => _isTyping = hasText);
    }
  }

  @override
  void dispose() {
    _messageController.dispose();
    _scrollController.dispose();
    _focusNode.dispose();
    _recordingTimer?.cancel();
    _recordingController.dispose();
    super.dispose();
  }

  void _sendMessage(String text, {_MessageType type = _MessageType.text, int? voiceDuration, String? locationName}) {
    if (text.trim().isEmpty && type == _MessageType.text) return;

    final message = _ChatMessage(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      text: text.trim(),
      isMe: true,
      time: DateTime.now(),
      type: type,
      status: _MessageStatus.sending,
      voiceDuration: voiceDuration,
      locationName: locationName,
    );

    setState(() => _messages.add(message));
    _messageController.clear();
    _scrollToBottom();

    // Simulate status updates
    Future.delayed(const Duration(milliseconds: 400), () {
      if (mounted) _updateMessageStatus(message.id, _MessageStatus.sent);
    });
    Future.delayed(const Duration(milliseconds: 800), () {
      if (mounted) _updateMessageStatus(message.id, _MessageStatus.delivered);
    });

    // Simulate driver typing
    Future.delayed(const Duration(seconds: 2), () {
      if (mounted) {
        setState(() => _driverTyping = true);
        _scrollToBottom();
      }
    });

    // Simulate driver response
    Future.delayed(const Duration(seconds: 4), () {
      if (mounted) {
        setState(() {
          _driverTyping = false;
          _updateMessageStatus(message.id, _MessageStatus.read);
          _messages.add(_ChatMessage(
            id: DateTime.now().millisecondsSinceEpoch.toString(),
            text: "Got it! See you soon 👍",
            isMe: false,
            time: DateTime.now(),
          ));
        });
        _scrollToBottom();
      }
    });
  }

  void _updateMessageStatus(String id, _MessageStatus status) {
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
        _scrollController.animateTo(0, duration: const Duration(milliseconds: 300), curve: Curves.easeOut);
      }
    });
  }

  void _showReactionPicker(_ChatMessage message) {
    HapticFeedback.mediumImpact();
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        margin: const EdgeInsets.all(16),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        decoration: BoxDecoration(
          color: context.surfaceColor,
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
                  color: message.reaction == emoji ? AppColors.yellow.withValues(alpha: 0.2) : Colors.transparent,
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
    _sendMessage("My location", type: _MessageType.location, locationName: "My current location");
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
      if (mounted) setState(() => _recordingSeconds++);
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
      _sendMessage("Voice message", type: _MessageType.voice, voiceDuration: duration);
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
    return '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final isDark = context.isDark;
    final isKeyboardOpen = MediaQuery.of(context).viewInsets.bottom > 0;

    return Scaffold(
      backgroundColor: context.bgColor,
      resizeToAvoidBottomInset: true,
      body: GestureDetector(
        onTap: () => FocusScope.of(context).unfocus(),
        child: Column(
          children: [
            _buildHeader(context, isDark),
            if (!isKeyboardOpen) _buildTripInfo(context, isDark),
            Expanded(child: _buildMessageList(context, isDark)),
            if (_driverTyping) _buildTypingIndicator(context, isDark),
            if (!isKeyboardOpen) _buildQuickReplies(context, isDark),
            _buildInputBar(context, isDark),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context, bool isDark) {
    return Container(
      padding: EdgeInsets.only(
        top: MediaQuery.of(context).padding.top + 8,
        left: 12,
        right: 12,
        bottom: 12,
      ),
      decoration: BoxDecoration(
        color: context.surfaceColor,
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
                color: isDark ? AppColors.bgDark : Colors.white,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(Icons.arrow_back, color: context.textColor, size: 22),
            ),
          ),
          const SizedBox(width: 12),
          Stack(
            children: [
              Container(
                width: 50,
                height: 50,
                decoration: BoxDecoration(
                  gradient: LinearGradient(colors: [AppColors.yellow, AppColors.yellow.withValues(alpha: 0.7)]),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: const Center(child: Text('MK', style: TextStyle(color: Colors.black, fontWeight: FontWeight.w700, fontSize: 16))),
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
                    border: Border.all(color: context.surfaceColor, width: 2),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Marcus K.', style: TextStyle(color: context.textColor, fontSize: 17, fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Row(
                  children: [
                    Container(width: 8, height: 8, decoration: BoxDecoration(color: AppColors.success, shape: BoxShape.circle)),
                    const SizedBox(width: 6),
                    Text('Driver • Online', style: TextStyle(color: context.mutedColor, fontSize: 12)),
                  ],
                ),
              ],
            ),
          ),
          GestureDetector(
            onTap: () => _showCallDialog(context),
            child: Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: AppColors.success.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(Icons.phone, color: AppColors.success, size: 22),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTripInfo(BuildContext context, bool isDark) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [AppColors.yellow.withValues(alpha: 0.15), AppColors.yellow.withValues(alpha: 0.05)],
        ),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(6),
            decoration: BoxDecoration(color: AppColors.yellow.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(8)),
            child: Icon(Icons.location_on, color: AppColors.yellow, size: 16),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Destination', style: TextStyle(color: context.mutedColor, fontSize: 11)),
                Text(widget.destination, style: TextStyle(color: context.textColor, fontSize: 13, fontWeight: FontWeight.w600), maxLines: 1, overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(color: AppColors.success, borderRadius: BorderRadius.circular(12)),
            child: Text('ACTIVE', style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
  }

  Widget _buildMessageList(BuildContext context, bool isDark) {
    return ListView.builder(
      controller: _scrollController,
      reverse: true,
      padding: const EdgeInsets.all(16),
      itemCount: _messages.length,
      itemBuilder: (context, index) {
        final reversedIndex = _messages.length - 1 - index;
        final message = _messages[reversedIndex];
        return _buildMessageBubble(context, isDark, message);
      },
    );
  }

  Widget _buildMessageBubble(BuildContext context, bool isDark, _ChatMessage message) {
    final isMe = message.isMe;
    return GestureDetector(
      onLongPress: () => _showReactionPicker(message),
      child: Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(
          mainAxisAlignment: isMe ? MainAxisAlignment.end : MainAxisAlignment.start,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            if (!isMe) ...[
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(color: AppColors.yellow, borderRadius: BorderRadius.circular(10)),
                child: const Center(child: Text('MK', style: TextStyle(color: Colors.black, fontSize: 10, fontWeight: FontWeight.w700))),
              ),
              const SizedBox(width: 8),
            ],
            Flexible(
              child: Column(
                crossAxisAlignment: isMe ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                children: [
                  Stack(
                    clipBehavior: Clip.none,
                    children: [
                      Container(
                        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.7),
                        padding: EdgeInsets.all(message.type == _MessageType.location ? 0 : 12),
                        decoration: BoxDecoration(
                          gradient: isMe ? LinearGradient(colors: [AppColors.yellow, AppColors.yellow.withValues(alpha: 0.85)]) : null,
                          color: isMe ? null : (isDark ? const Color(0xFF2A2A30) : const Color(0xFFF0F0F5)),
                          borderRadius: BorderRadius.only(
                            topLeft: const Radius.circular(18),
                            topRight: const Radius.circular(18),
                            bottomLeft: Radius.circular(isMe ? 18 : 4),
                            bottomRight: Radius.circular(isMe ? 4 : 18),
                          ),
                          boxShadow: [
                            BoxShadow(color: (isMe ? AppColors.yellow : Colors.black).withValues(alpha: 0.1), blurRadius: 8, offset: const Offset(0, 2)),
                          ],
                        ),
                        child: _buildMessageContent(context, isDark, message),
                      ),
                      if (message.reaction != null)
                        Positioned(
                          bottom: -8,
                          right: isMe ? null : 8,
                          left: isMe ? 8 : null,
                          child: Container(
                            padding: const EdgeInsets.all(4),
                            decoration: BoxDecoration(
                              color: context.surfaceColor,
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(color: isDark ? context.borderColor : const Color(0xFFE0E0E0)),
                            ),
                            child: Text(message.reaction!, style: TextStyle(fontSize: 12)),
                          ),
                        ),
                    ],
                  ),
                  Padding(
                    padding: EdgeInsets.only(top: message.reaction != null ? 12 : 4, left: 4, right: 4),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(_formatTime(message.time), style: TextStyle(color: context.mutedColor, fontSize: 10)),
                        if (isMe) ...[
                          const SizedBox(width: 4),
                          _buildStatusIcon(message.status),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
            if (isMe) const SizedBox(width: 8),
          ],
        ),
      ),
    );
  }

  Widget _buildMessageContent(BuildContext context, bool isDark, _ChatMessage message) {
    final isMe = message.isMe;
    switch (message.type) {
      case _MessageType.voice:
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(color: isMe ? Colors.black.withValues(alpha: 0.2) : AppColors.yellow, borderRadius: BorderRadius.circular(18)),
              child: Icon(Icons.play_arrow, color: Colors.white, size: 22),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(width: 100, height: 24, decoration: BoxDecoration(color: (isMe ? Colors.black : context.mutedColor).withValues(alpha: 0.2), borderRadius: BorderRadius.circular(4))),
                const SizedBox(height: 4),
                Text('0:${message.voiceDuration?.toString().padLeft(2, '0') ?? '00'}', style: TextStyle(color: isMe ? Colors.black54 : context.mutedColor, fontSize: 11)),
              ],
            ),
          ],
        );
      case _MessageType.location:
        return ClipRRect(
          borderRadius: BorderRadius.circular(18),
          child: Column(
            children: [
              Container(
                width: 200,
                height: 100,
                color: isDark ? const Color(0xFF1A1A1D) : const Color(0xFFE8E8EC),
                child: Stack(
                  children: [
                    Center(child: Icon(Icons.map, color: context.mutedColor, size: 40)),
                    Center(
                      child: Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(color: AppColors.yellow, shape: BoxShape.circle, boxShadow: [BoxShadow(color: AppColors.yellow.withValues(alpha: 0.4), blurRadius: 8)]),
                        child: Icon(Icons.person, color: Colors.black, size: 18),
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                width: 200,
                padding: const EdgeInsets.all(10),
                color: isMe ? AppColors.yellow : (isDark ? const Color(0xFF2A2A30) : const Color(0xFFF0F0F5)),
                child: Row(
                  children: [
                    Icon(Icons.location_on, color: isMe ? Colors.black : AppColors.yellow, size: 16),
                    const SizedBox(width: 6),
                    Expanded(child: Text(message.locationName ?? 'Location', style: TextStyle(color: isMe ? Colors.black : context.textColor, fontSize: 12, fontWeight: FontWeight.w500))),
                  ],
                ),
              ),
            ],
          ),
        );
      default:
        return Text(message.text, style: TextStyle(color: isMe ? Colors.black : context.textColor, fontSize: 15));
    }
  }

  Widget _buildStatusIcon(_MessageStatus status) {
    switch (status) {
      case _MessageStatus.sending:
        return SizedBox(width: 12, height: 12, child: CircularProgressIndicator(strokeWidth: 1.5, color: context.mutedColor));
      case _MessageStatus.sent:
        return Icon(Icons.check, color: context.mutedColor, size: 14);
      case _MessageStatus.delivered:
        return Icon(Icons.done_all, color: context.mutedColor, size: 14);
      case _MessageStatus.read:
        return Icon(Icons.done_all, color: Color(0xFF007AFF), size: 14);
    }
  }

  Widget _buildTypingIndicator(BuildContext context, bool isDark) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          Container(width: 32, height: 32, decoration: BoxDecoration(color: AppColors.yellow, borderRadius: BorderRadius.circular(10)), child: const Center(child: Text('MK', style: TextStyle(color: Colors.black, fontSize: 10, fontWeight: FontWeight.w700)))),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: BoxDecoration(color: isDark ? const Color(0xFF2A2A30) : const Color(0xFFF0F0F5), borderRadius: BorderRadius.circular(18)),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: List.generate(3, (i) => Container(margin: EdgeInsets.only(right: i < 2 ? 4 : 0), width: 8, height: 8, decoration: BoxDecoration(color: context.mutedColor.withValues(alpha: 0.5), shape: BoxShape.circle))),
            ),
          ),
          const SizedBox(width: 8),
          Text('Marcus is typing...', style: TextStyle(color: context.mutedColor, fontSize: 12, fontStyle: FontStyle.italic)),
        ],
      ),
    );
  }

  Widget _buildQuickReplies(BuildContext context, bool isDark) {
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
                    Text(reply.text, style: TextStyle(color: context.textColor, fontSize: 13, fontWeight: FontWeight.w500)),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildInputBar(BuildContext context, bool isDark) {
    final isKeyboardOpen = MediaQuery.of(context).viewInsets.bottom > 0;
    return Container(
      padding: EdgeInsets.fromLTRB(12, 12, 12, isKeyboardOpen ? 12 : MediaQuery.of(context).padding.bottom + 12),
      decoration: BoxDecoration(
        color: context.surfaceColor,
        border: Border(top: BorderSide(color: isDark ? context.borderColor : const Color(0xFFE0E0E0))),
      ),
      child: _isRecording
          ? Row(
              children: [
                GestureDetector(
                  onTap: _cancelRecording,
                  child: Container(width: 44, height: 44, decoration: BoxDecoration(color: AppColors.error.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(14)), child: Icon(Icons.delete, color: AppColors.error, size: 22)),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Container(
                    height: 44,
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    decoration: BoxDecoration(color: isDark ? AppColors.bgDark : Colors.white, borderRadius: BorderRadius.circular(24), border: Border.all(color: AppColors.error.withValues(alpha: 0.3))),
                    child: Row(
                      children: [
                        AnimatedBuilder(
                          animation: _recordingAnimation,
                          builder: (context, child) => Transform.scale(scale: _recordingAnimation.value * 0.8, child: Container(width: 12, height: 12, decoration: BoxDecoration(color: AppColors.error, shape: BoxShape.circle))),
                        ),
                        const SizedBox(width: 10),
                        Text('Recording ${_formatRecordingTime(_recordingSeconds)}', style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w500)),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                GestureDetector(
                  onTap: _toggleRecording,
                  child: Container(width: 50, height: 50, decoration: BoxDecoration(gradient: const LinearGradient(colors: [AppColors.yellow, AppColors.yellow]), borderRadius: BorderRadius.circular(25)), child: Icon(Icons.send, color: Colors.black, size: 22)),
                ),
              ],
            )
          : Row(
              children: [
                GestureDetector(
                  onTap: _sendLocation,
                  child: Container(width: 44, height: 44, decoration: BoxDecoration(color: isDark ? AppColors.bgDark : Colors.white, borderRadius: BorderRadius.circular(14)), child: Icon(Icons.location_on, color: context.textColor, size: 24)),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Container(
                    decoration: BoxDecoration(
                      color: isDark ? AppColors.bgDark : Colors.white,
                      borderRadius: BorderRadius.circular(24),
                      border: Border.all(color: isDark ? context.borderColor : const Color(0xFFE0E0E0)),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _messageController,
                            focusNode: _focusNode,
                            style: TextStyle(color: context.textColor),
                            keyboardType: TextInputType.text,
                            textInputAction: TextInputAction.send,
                            autocorrect: true,
                            enableSuggestions: true,
                            decoration: InputDecoration(
                              hintText: 'Type a message...',
                              hintStyle: TextStyle(color: context.mutedColor),
                              border: InputBorder.none,
                              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                            ),
                            onSubmitted: _sendMessage,
                            onTap: () {
                              _focusNode.requestFocus();
                            },
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
                      gradient: LinearGradient(colors: [AppColors.yellow, AppColors.yellow.withValues(alpha: 0.85)]),
                      borderRadius: BorderRadius.circular(25),
                      boxShadow: [BoxShadow(color: AppColors.yellow.withValues(alpha: 0.4), blurRadius: 12, offset: const Offset(0, 4))],
                    ),
                    child: Icon(_isTyping ? Icons.send : Icons.mic, color: Colors.black, size: 22),
                  ),
                ),
              ],
            ),
    );
  }

  void _showCallDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.surfaceColor,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        title: Text('Call Driver', style: TextStyle(color: context.textColor)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Call Marcus K. at +960 777 8888?', style: TextStyle(color: context.mutedColor)),
            const SizedBox(height: 24),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.pop(ctx),
                    style: OutlinedButton.styleFrom(foregroundColor: context.textColor, side: BorderSide(color: context.mutedColor.withValues(alpha: 0.3)), padding: const EdgeInsets.symmetric(vertical: 14), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                    child: Text('Cancel', style: TextStyle(fontWeight: FontWeight.w600)),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: () {
                      Navigator.pop(ctx);
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Calling driver...'), backgroundColor: AppColors.yellow, behavior: SnackBarBehavior.floating, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))));
                    },
                    icon: Icon(Icons.phone, size: 18),
                    label: Text('Call', style: TextStyle(fontWeight: FontWeight.w600)),
                    style: ElevatedButton.styleFrom(backgroundColor: AppColors.green, foregroundColor: Colors.white, elevation: 0, padding: const EdgeInsets.symmetric(vertical: 14), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class TripProgressScreen extends StatefulWidget {
  final String destination;

  const TripProgressScreen({super.key, this.destination = 'International Airport · T3'});

  @override
  State<TripProgressScreen> createState() => _TripProgressScreenState();
}

class _TripProgressScreenState extends State<TripProgressScreen> {
  LatLng _currentLocation = const LatLng(4.1755, 73.5093);
  final LatLng _driverLocation = const LatLng(4.1930, 73.5300);
  final LatLng _destination = const LatLng(4.1880, 73.5250);

  @override
  void initState() {
    super.initState();
    _loadCurrentLocation();
  }

  Future<void> _loadCurrentLocation() async {
    final loc = await LocationService.getCurrentLocation();
    if (mounted) setState(() => _currentLocation = LatLng(loc.latitude, loc.longitude));
  }

  final List<LatLng> _routePoints = [
    const LatLng(4.1930, 73.5300),
    const LatLng(4.1918, 73.5290),
    const LatLng(4.1900, 73.5270),
    const LatLng(4.1880, 73.5250),
  ];

  @override
  Widget build(BuildContext context) {
    final isDark = context.isDark;

    return Scaffold(
      backgroundColor: context.bgColor,
      body: Stack(
        children: [
          GoogleMap(
            initialCameraPosition: CameraPosition(target: _currentLocation, zoom: 15),
            markers: {
              Marker(
                markerId: const MarkerId('progress_user'),
                position: _currentLocation,
                icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueYellow),
              ),
              Marker(
                markerId: const MarkerId('progress_driver'),
                position: _driverLocation,
                icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueOrange),
              ),
              Marker(
                markerId: const MarkerId('progress_destination'),
                position: _destination,
                icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueRed),
              ),
            },
            polylines: {
              Polyline(
                polylineId: const PolylineId('progress_route'),
                points: _routePoints,
                width: 5,
                color: AppColors.yellow,
              ),
            },
            myLocationEnabled: true,
            myLocationButtonEnabled: false,
            zoomControlsEnabled: false,
            mapToolbarEnabled: false,
            style: isDark ? _darkMapStyle : null,
          ),
          _buildStatusPill(isDark, context),
          _buildSosButton(context, isDark),
          _buildBottomSheet(context, isDark),
        ],
      ),
    );
  }

  Widget _buildSosButton(BuildContext context, bool isDark) {
    return Positioned(
      top: 56,
      right: 16,
      child: GestureDetector(
        onLongPress: () => _showSosDialog(context),
        onTap: () {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Hold for 2 seconds to trigger SOS'),
              backgroundColor: Colors.red.shade700,
              behavior: SnackBarBehavior.floating,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
          );
        },
        child: Container(
          width: 50,
          height: 50,
          decoration: BoxDecoration(
            color: Colors.red,
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(color: Colors.red.withValues(alpha: 0.4), blurRadius: 12, offset: const Offset(0, 4)),
            ],
          ),
          child: const Center(
            child: Text(
              'SOS',
              style: TextStyle(
                color: Colors.white,
                fontSize: 14,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _showSosDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.surfaceColor,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        title: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: Colors.red,
                shape: BoxShape.circle,
              ),
              child: Icon(Icons.warning, color: Colors.white, size: 22),
            ),
            const SizedBox(width: 12),
            Text('Emergency SOS', style: TextStyle(color: context.textColor)),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('This will:', style: TextStyle(color: context.mutedColor)),
            const SizedBox(height: 12),
            _buildSosAction(context, Icons.location_on, 'Share your live location'),
            _buildSosAction(context, Icons.people, 'Alert emergency contacts'),
            _buildSosAction(context, Icons.phone, 'Call security helpline'),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text('Cancel', style: TextStyle(color: context.mutedColor)),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(ctx);
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: const Row(
                    children: [
                      Icon(Icons.check_circle, color: Colors.white, size: 20),
                      SizedBox(width: 10),
                      Text('Emergency alert sent'),
                    ],
                  ),
                  backgroundColor: Colors.red,
                  behavior: SnackBarBehavior.floating,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
              );
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            child: Text('Confirm SOS'),
          ),
        ],
      ),
    );
  }

  Widget _buildSosAction(BuildContext context, IconData icon, String text) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Icon(icon, color: Colors.red, size: 18),
          const SizedBox(width: 10),
          Text(text, style: TextStyle(color: context.textColor, fontSize: 14)),
        ],
      ),
    );
  }

  Widget _buildStatusPill(bool isDark, BuildContext context) {
    return Positioned(
      top: 56,
      left: 0,
      right: 0,
      child: Center(
        child: GlassContainer(
          borderRadius: BorderRadius.circular(99),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
          backgroundColor: isDark ? const Color(0xB8141416) : const Color(0xE8FFFFFF),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: const Color(0xFF3CCB7F),
                  shape: BoxShape.circle,
                  boxShadow: [BoxShadow(color: const Color(0xFF3CCB7F), blurRadius: 10)],
                ),
              ),
              const SizedBox(width: 10),
              Text(
                'On trip · 14 min remaining',
                style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w700),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildBottomSheet(BuildContext context, bool isDark) {
    return Positioned(
      left: 8,
      right: 8,
      bottom: 8,
      child: GlassContainer(
        borderRadius: BorderRadius.circular(32),
        backgroundColor: isDark ? const Color(0xB8141416) : const Color(0xE8FFFFFF),
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.18),
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Text('Pickup', style: TextStyle(color: context.mutedColor, fontSize: 12, fontWeight: FontWeight.w600)),
                const SizedBox(width: 10),
                Expanded(
                  child: Stack(
                    children: [
                      Container(
                        height: 6,
                        decoration: BoxDecoration(
                          color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.08),
                          borderRadius: BorderRadius.circular(99),
                        ),
                      ),
                      FractionallySizedBox(
                        widthFactor: 0.62,
                        child: Container(
                          height: 6,
                          decoration: BoxDecoration(
                            color: AppColors.yellow,
                            borderRadius: BorderRadius.circular(99),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 10),
                Text(widget.destination.split(' · ').first, style: TextStyle(color: context.textColor, fontSize: 12, fontWeight: FontWeight.w700)),
              ],
            ),
            const SizedBox(height: 18),
            Row(
              children: [
                _buildAvatar('MK', ring: true, isDark: isDark, context: context),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Marcus K.', style: TextStyle(color: context.textColor, fontSize: 16, fontWeight: FontWeight.w700)),
                      Text('MV 88 · Twin Cab', style: TextStyle(color: context.mutedColor, fontSize: 13)),
                    ],
                  ),
                ),
                GestureDetector(
                  onTap: () => Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => const ChatScreen()),
                  ),
                  child: Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.05),
                      borderRadius: BorderRadius.circular(15),
                      border: Border.all(color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.12)),
                    ),
                    child: Icon(Icons.chat_bubble_outline, color: context.textColor, size: 20),
                  ),
                ),
                const SizedBox(width: 10),
                GestureDetector(
                  onTap: () => _showCallDialog(context),
                  child: Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.05),
                      borderRadius: BorderRadius.circular(15),
                      border: Border.all(color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.12)),
                    ),
                    child: Icon(Icons.phone_outlined, color: context.textColor, size: 20),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: SizedBox(
                    height: 48,
                    child: ElevatedButton.icon(
                      onPressed: () {
                        final appState = Provider.of<AppState>(context, listen: false);
                        appState.endTrip();
                        Navigator.of(context).pushNamedAndRemoveUntil('/trip-complete', (route) => false);
                      },
                      icon: Icon(Icons.check_circle, size: 18),
                      label: Text('Trip Complete', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.success,
                        foregroundColor: Colors.white,
                        elevation: 0,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                SizedBox(
                  height: 48,
                  child: OutlinedButton.icon(
                    onPressed: () {
                      showDialog(
                        context: context,
                        builder: (ctx) => AlertDialog(
                          backgroundColor: context.surfaceColor,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                          title: Text('Cancel Trip?', style: TextStyle(color: context.textColor)),
                      content: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text('Are you sure you want to cancel this trip?', style: TextStyle(color: context.mutedColor)),
                          const SizedBox(height: 24),
                          Row(
                            children: [
                              Expanded(
                                child: OutlinedButton(
                                  onPressed: () => Navigator.pop(ctx),
                                  style: OutlinedButton.styleFrom(
                                    foregroundColor: context.textColor,
                                    side: BorderSide(color: context.mutedColor.withValues(alpha: 0.3)),
                                    padding: const EdgeInsets.symmetric(vertical: 14),
                                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                  ),
                                  child: Text('No', style: TextStyle(fontWeight: FontWeight.w600)),
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: ElevatedButton(
                                  onPressed: () {
                                    Navigator.pop(ctx);
                                    final appState = Provider.of<AppState>(context, listen: false);
                                    appState.endTrip();
                                    Navigator.of(context).pushNamedAndRemoveUntil('/trip-complete', (route) => false);
                                  },
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: AppColors.red,
                                    foregroundColor: Colors.white,
                                    elevation: 0,
                                    padding: const EdgeInsets.symmetric(vertical: 14),
                                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                  ),
                                  child: Text('Yes, Cancel', style: TextStyle(fontWeight: FontWeight.w600)),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  );
                },
                    icon: Icon(Icons.close, size: 18),
                    label: Text('Cancel', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.red,
                      side: BorderSide(color: Colors.red, width: 1.5),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  void _showCallDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.surfaceColor,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        title: Text('Call Driver', style: TextStyle(color: context.textColor)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Call Marcus K. at +960 777 8888?', style: TextStyle(color: context.mutedColor)),
            const SizedBox(height: 24),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.pop(ctx),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: context.textColor,
                      side: BorderSide(color: context.mutedColor.withValues(alpha: 0.3)),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: Text('Cancel', style: TextStyle(fontWeight: FontWeight.w600)),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: () => Navigator.pop(ctx),
                    icon: Icon(Icons.phone, size: 18),
                    label: Text('Call', style: TextStyle(fontWeight: FontWeight.w600)),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.green,
                      foregroundColor: Colors.white,
                      elevation: 0,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAvatar(String initials, {bool ring = false, required bool isDark, required BuildContext context}) {
    return Container(
      width: 50,
      height: 50,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: isDark
              ? [const Color(0xFF2A2A30), const Color(0xFF1B1B1F)]
              : [const Color(0xFFE0E0E5), const Color(0xFFD0D0D5)],
        ),
        shape: BoxShape.circle,
        border: ring ? Border.all(color: AppColors.yellow, width: 2) : Border.all(color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.1)),
      ),
      child: Center(
        child: Text(initials, style: TextStyle(color: context.textColor, fontSize: 17, fontWeight: FontWeight.w700)),
      ),
    );
  }

}

class SafetyScreen extends StatelessWidget {
  const SafetyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final isDark = context.isDark;
    final appState = Provider.of<AppState>(context);

    return Scaffold(
      backgroundColor: context.bgColor,
      body: SafeArea(
        child: Column(
          children: [
            _buildHeader(context, isDark),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 18, 16, 0),
              child: Text(
                'Share your trip with trusted contacts. Use the tools below if anything feels off.',
                style: TextStyle(color: context.mutedColor, fontSize: 13.5, height: 1.5),
              ),
            ),
            const SizedBox(height: 24),
            _buildSOSButton(context),
            const SizedBox(height: 26),
            _buildToolsList(isDark, context, appState),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context, bool isDark) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: Row(
        children: [
          GestureDetector(
            onTap: () => Navigator.pop(context),
            child: Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.04),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.1)),
              ),
              child: Icon(Icons.arrow_back_ios_new, color: context.textColor, size: 18),
            ),
          ),
          const SizedBox(width: 12),
          Text('Safety Centre', style: TextStyle(color: context.textColor, fontSize: 18, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }

  Widget _buildSOSButton(BuildContext context) {
    return GestureDetector(
      onTap: () {
        Navigator.pushNamed(context, '/sos');
      },
      onLongPress: () {
        showDialog(
          context: context,
          builder: (ctx) => AlertDialog(
            backgroundColor: context.surfaceColor,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
            title: Row(
              children: [
                Icon(Icons.warning_amber, color: AppColors.red, size: 28),
                const SizedBox(width: 12),
                Text('Emergency SOS', style: TextStyle(color: context.textColor)),
              ],
            ),
            content: Text(
              'This will alert your trusted contacts and share your location with emergency services.',
              style: TextStyle(color: context.mutedColor),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: Text('Cancel', style: TextStyle(color: context.mutedColor)),
              ),
              TextButton(
                onPressed: () {
                  Navigator.pop(ctx);
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('Emergency contacts notified'),
                      backgroundColor: AppColors.red,
                      behavior: SnackBarBehavior.floating,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                  );
                },
                child: Text('Confirm SOS', style: TextStyle(color: AppColors.red, fontWeight: FontWeight.w700)),
              ),
            ],
          ),
        );
      },
      child: Container(
        width: 168,
        height: 168,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: const RadialGradient(
            center: Alignment(0, -0.3),
            colors: [Color(0xFFFF5A5F), Color(0xFFE5484D)],
          ),
          boxShadow: [
            BoxShadow(color: const Color(0xFFE5484D).withValues(alpha: 0.4), blurRadius: 50, offset: const Offset(0, 18)),
          ],
        ),
        child: const Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text('SOS', style: TextStyle(color: Colors.white, fontSize: 34, fontWeight: FontWeight.w800, letterSpacing: 1)),
            SizedBox(height: 2),
            Text('Hold for help', style: TextStyle(color: Colors.white70, fontSize: 12)),
          ],
        ),
      ),
    );
  }

  Widget _buildToolsList(bool isDark, BuildContext context, AppState appState) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        children: [
          _buildToolItem(
            context,
            isDark,
            Icons.location_on,
            AppColors.yellow,
            'Share live location',
            'Send your live trip to a contact',
            () {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text('Location shared with trusted contacts'),
                  backgroundColor: AppColors.yellow,
                  behavior: SnackBarBehavior.floating,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
              );
            },
          ),
          _buildToolItem(
            context,
            isDark,
            Icons.person_outline,
            context.textColor,
            'Trusted contacts',
            '${appState.trustedContacts.length} people added',
            () => Navigator.push(context, MaterialPageRoute(builder: (_) => const TrustedContactsScreen())),
          ),
          _buildToolItem(
            context,
            isDark,
            Icons.shield_outlined,
            context.textColor,
            'Call Facilities desk',
            'Internal staff support · 24/7',
            () {
              showDialog(
                context: context,
                builder: (ctx) => AlertDialog(
                  backgroundColor: context.surfaceColor,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
                  title: Text('Call Facilities', style: TextStyle(color: context.textColor)),
                  content: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text('Call Facilities desk at +960 333 0000?', style: TextStyle(color: context.mutedColor)),
                      const SizedBox(height: 24),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton(
                              onPressed: () => Navigator.pop(ctx),
                              style: OutlinedButton.styleFrom(
                                foregroundColor: context.textColor,
                                side: BorderSide(color: context.mutedColor.withValues(alpha: 0.3)),
                                padding: const EdgeInsets.symmetric(vertical: 14),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                              ),
                              child: Text('Cancel', style: TextStyle(fontWeight: FontWeight.w600)),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: ElevatedButton.icon(
                              onPressed: () => Navigator.pop(ctx),
                              icon: Icon(Icons.phone, size: 18),
                              label: Text('Call', style: TextStyle(fontWeight: FontWeight.w600)),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppColors.green,
                                foregroundColor: Colors.white,
                                elevation: 0,
                                padding: const EdgeInsets.symmetric(vertical: 14),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildToolItem(BuildContext context, bool isDark, IconData icon, Color iconColor, String title, String subtitle, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.03),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.08)),
        ),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.05),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(icon, color: iconColor, size: 20),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: TextStyle(color: context.textColor, fontSize: 15, fontWeight: FontWeight.w600)),
                  Text(subtitle, style: TextStyle(color: context.mutedColor, fontSize: 12.5)),
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: context.mutedColor, size: 20),
          ],
        ),
      ),
    );
  }
}

class TrustedContactsScreen extends StatefulWidget {
  const TrustedContactsScreen({super.key});

  @override
  State<TrustedContactsScreen> createState() => _TrustedContactsScreenState();
}

class _TrustedContactsScreenState extends State<TrustedContactsScreen> {
  @override
  Widget build(BuildContext context) {
    final isDark = context.isDark;
    final appState = Provider.of<AppState>(context);

    return Scaffold(
      backgroundColor: context.bgColor,
      body: SafeArea(
        child: Column(
          children: [
            _buildHeader(context, isDark),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Text(
                'These contacts will be notified if you trigger an SOS alert during a trip.',
                style: TextStyle(color: context.mutedColor, fontSize: 14, height: 1.4),
              ),
            ),
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: appState.trustedContacts.length + 1,
                itemBuilder: (context, index) {
                  if (index == appState.trustedContacts.length) {
                    return _buildAddButton(isDark);
                  }
                  return _buildContactCard(appState.trustedContacts[index], index, isDark, appState);
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context, bool isDark) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
      child: Row(
        children: [
          GestureDetector(
            onTap: () => Navigator.pop(context),
            child: Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.04),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.1)),
              ),
              child: Icon(Icons.arrow_back_ios_new, color: context.textColor, size: 18),
            ),
          ),
          const SizedBox(width: 12),
          Text('Trusted Contacts', style: TextStyle(color: context.textColor, fontSize: 18, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }

  Widget _buildContactCard(Map<String, String> contact, int index, bool isDark, AppState appState) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.03),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.07)),
      ),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: AppColors.yellowSoft,
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(Icons.person_outline, color: AppColors.yellow, size: 24),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(contact['name']!, style: TextStyle(color: context.textColor, fontSize: 15, fontWeight: FontWeight.w600)),
                Text(contact['phone']!, style: TextStyle(color: context.mutedColor, fontSize: 13)),
              ],
            ),
          ),
          GestureDetector(
            onTap: () => _showDeleteConfirmation(index, appState),
            child: Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: AppColors.red.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(Icons.delete_outline, color: AppColors.red, size: 18),
            ),
          ),
        ],
      ),
    );
  }

  void _showDeleteConfirmation(int index, AppState appState) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.surfaceColor,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        title: Text('Remove contact?', style: TextStyle(color: context.textColor)),
        content: Text('This contact will no longer receive SOS alerts.', style: TextStyle(color: context.mutedColor)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text('Cancel', style: TextStyle(color: context.mutedColor)),
          ),
          TextButton(
            onPressed: () {
              appState.removeTrustedContact(index);
              Navigator.pop(ctx);
            },
            child: Text('Remove', style: TextStyle(color: AppColors.red)),
          ),
        ],
      ),
    );
  }

  Widget _buildAddButton(bool isDark) {
    return GestureDetector(
      onTap: () => _showAddContactDialog(),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.03),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: AppColors.yellow.withValues(alpha: 0.3)),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: AppColors.yellow,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(Icons.add, color: context.isDark ? AppColors.bgDark : Colors.white, size: 20),
            ),
            const SizedBox(width: 12),
            Text(
              'Add trusted contact',
              style: TextStyle(color: context.textColor, fontSize: 15, fontWeight: FontWeight.w600),
            ),
          ],
        ),
      ),
    );
  }

  void _showAddContactDialog() {
    final nameController = TextEditingController();
    final phoneController = TextEditingController();
    final isDark = context.isDark;

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.surfaceColor,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        title: Text('Add Contact', style: TextStyle(color: context.textColor)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameController,
              style: TextStyle(color: context.textColor),
              decoration: InputDecoration(
                hintText: 'Contact name',
                hintStyle: TextStyle(color: context.mutedColor),
                filled: true,
                fillColor: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.05),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: phoneController,
              style: TextStyle(color: context.textColor),
              keyboardType: TextInputType.phone,
              decoration: InputDecoration(
                hintText: 'Phone number',
                hintStyle: TextStyle(color: context.mutedColor),
                filled: true,
                fillColor: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.05),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
            const SizedBox(height: 24),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.pop(ctx),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: context.textColor,
                      side: BorderSide(color: context.mutedColor.withValues(alpha: 0.3)),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: Text('Cancel', style: TextStyle(fontWeight: FontWeight.w600)),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton(
                    onPressed: () {
                      if (nameController.text.isNotEmpty && phoneController.text.isNotEmpty) {
                        final appState = Provider.of<AppState>(context, listen: false);
                        appState.addTrustedContact({
                          'name': nameController.text,
                          'phone': phoneController.text,
                        });
                        Navigator.pop(ctx);
                      }
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.yellow,
                      foregroundColor: AppColors.bgDark,
                      elevation: 0,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: Text('Add', style: TextStyle(fontWeight: FontWeight.w600)),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class ScheduleSearchScreen extends StatefulWidget {
  final DateTime scheduledDate;
  final TimeOfDay scheduledTime;
  final String pickupLocation;

  const ScheduleSearchScreen({
    super.key,
    required this.scheduledDate,
    required this.scheduledTime,
    this.pickupLocation = 'Current Location',
  });

  @override
  State<ScheduleSearchScreen> createState() => _ScheduleSearchScreenState();
}

class _ScheduleSearchScreenState extends State<ScheduleSearchScreen> {
  final _searchController = TextEditingController();
  List<Map<String, dynamic>> _filteredResults = [];

  final _allResults = [
    {'title': 'Hulhulé Airport', 'subtitle': 'Velana International Airport', 'highlight': true},
    {'title': 'Hulhumalé', 'subtitle': 'Housing Development · 15 min', 'highlight': false},
    {'title': 'Malé City', 'subtitle': 'Capital Island · 10 min by ferry', 'highlight': false},
    {'title': 'IT Office', 'subtitle': 'One Central Tower, 14F', 'highlight': false},
    {'title': 'Staff Housing', 'subtitle': 'Marina Walk, Block C', 'highlight': false},
    {'title': 'Data Centre', 'subtitle': 'Hulhumalé Industrial Zone', 'highlight': false},
  ];

  @override
  void initState() {
    super.initState();
    _filteredResults = _allResults;
    _searchController.addListener(_filterResults);
  }

  void _filterResults() {
    final query = _searchController.text.toLowerCase();
    setState(() {
      if (query.isEmpty) {
        _filteredResults = _allResults;
      } else {
        _filteredResults = _allResults.where((r) {
          return (r['title'] as String).toLowerCase().contains(query) ||
              (r['subtitle'] as String).toLowerCase().contains(query);
        }).toList();
      }
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  String _formatDate(DateTime date) {
    final months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${date.day} ${months[date.month - 1]}';
  }

  @override
  Widget build(BuildContext context) {
    final isDark = context.isDark;

    return Scaffold(
      backgroundColor: context.bgColor,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: Row(
                children: [
                  GestureDetector(
                    onTap: () => Navigator.pop(context),
                    child: Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.05),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.1)),
                      ),
                      child: Icon(Icons.arrow_back_ios_new, color: context.textColor, size: 18),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Schedule ride',
                        style: TextStyle(
                          color: context.textColor,
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      Row(
                        children: [
                          Icon(Icons.access_time, color: AppColors.yellow, size: 14),
                          const SizedBox(width: 4),
                          Text(
                            '${_formatDate(widget.scheduledDate)} at ${widget.scheduledTime.format(context)}',
                            style: TextStyle(color: AppColors.yellow, fontSize: 13, fontWeight: FontWeight.w600),
                          ),
                        ],
                      ),
                    ],
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
              child: _buildSearchBox(isDark),
            ),
            Expanded(
              child: _filteredResults.isEmpty
                  ? Center(
                      child: Text(
                        'No locations found',
                        style: TextStyle(color: context.mutedColor),
                      ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
                      itemCount: _filteredResults.length,
                      itemBuilder: (context, index) {
                        final result = _filteredResults[index];
                        return _buildResultItem(
                          result['title'] as String,
                          result['subtitle'] as String,
                          result['highlight'] as bool,
                          isDark,
                          onTap: () => _confirmSchedule(result['title'] as String, result['subtitle'] as String, isDark),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSearchBox(bool isDark) {
    return Container(
      height: 56,
      padding: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(
        color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.1)),
      ),
      child: Row(
        children: [
          Icon(Icons.search, color: context.mutedColor, size: 22),
          const SizedBox(width: 12),
          Expanded(
            child: TextField(
              controller: _searchController,
              autofocus: false,
              style: TextStyle(color: context.textColor, fontSize: 15),
              decoration: InputDecoration(
                hintText: 'Where to?',
                hintStyle: TextStyle(color: context.mutedColor),
                border: InputBorder.none,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildResultItem(String title, String subtitle, bool highlight, bool isDark, {VoidCallback? onTap}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 4),
        decoration: BoxDecoration(
          border: Border(
            bottom: BorderSide(color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.05)),
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.05),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(
                Icons.location_on,
                color: highlight ? AppColors.yellow : context.mutedColor,
                size: 20,
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      color: context.textColor,
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Text(
                    subtitle,
                    style: TextStyle(color: context.mutedColor, fontSize: 12.5),
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: context.mutedColor, size: 20),
          ],
        ),
      ),
    );
  }

  void _confirmSchedule(String title, String subtitle, bool isDark) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Container(
        padding: EdgeInsets.fromLTRB(20, 12, 20, MediaQuery.of(ctx).viewInsets.bottom + 20),
        decoration: BoxDecoration(
          color: context.surfaceColor,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(99),
              ),
            ),
            const SizedBox(height: 14),
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                color: AppColors.yellowSoft,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Icon(Icons.schedule, color: AppColors.yellow, size: 26),
            ),
            const SizedBox(height: 12),
            Text(
              'Confirm Scheduled Ride',
              style: TextStyle(color: context.textColor, fontSize: 17, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.05),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Column(
                children: [
                  _buildConfirmRow(Icons.my_location, 'From', widget.pickupLocation, isDark),
                  const SizedBox(height: 8),
                  _buildConfirmRow(Icons.location_on, 'To', title, isDark),
                  const SizedBox(height: 8),
                  _buildConfirmRow(Icons.calendar_today, 'Date', _formatDate(widget.scheduledDate), isDark),
                  const SizedBox(height: 8),
                  _buildConfirmRow(Icons.access_time, 'Time', widget.scheduledTime.format(context), isDark),
                ],
              ),
            ),
            const SizedBox(height: 14),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton(
                onPressed: () {
                  final appState = Provider.of<AppState>(context, listen: false);
                  appState.addScheduledTrip({
                    'pickup': widget.pickupLocation,
                    'destination': title,
                    'date': widget.scheduledDate,
                    'time': widget.scheduledTime,
                  });
                  Navigator.pop(ctx);
                  Navigator.of(context).pushNamedAndRemoveUntil('/home', (route) => false);
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.yellow,
                  foregroundColor: AppColors.bgDark,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                child: Text('Confirm Schedule', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
              ),
            ),
            const SizedBox(height: 6),
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: Text('Cancel', style: TextStyle(color: context.mutedColor, fontSize: 14)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildConfirmRow(IconData icon, String label, String value, bool isDark) {
    return Row(
      children: [
        Icon(icon, color: AppColors.yellow, size: 20),
        const SizedBox(width: 12),
        Text(label, style: TextStyle(color: context.mutedColor, fontSize: 13)),
        const Spacer(),
        Text(value, style: TextStyle(color: context.textColor, fontSize: 14, fontWeight: FontWeight.w600)),
      ],
    );
  }
}
