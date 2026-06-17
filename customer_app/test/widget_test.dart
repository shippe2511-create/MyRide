import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:myride/providers/app_state.dart';
import 'package:myride/screens/home_screen.dart';

void main() {
  testWidgets('Home screen loads with bottom navigation', (WidgetTester tester) async {
    await tester.pumpWidget(
      ChangeNotifierProvider(
        create: (_) => AppState(),
        child: MaterialApp(
          home: const HomeScreen(),
        ),
      ),
    );

    // Verify bottom navigation tabs exist
    expect(find.text('Activity'), findsOneWidget);
    expect(find.text('Schedule'), findsOneWidget);
    expect(find.text('Account'), findsOneWidget);
    // Search field should be present
    expect(find.text('Search destination'), findsOneWidget);
  });

  testWidgets('App state manages dark mode', (WidgetTester tester) async {
    final appState = AppState();

    // Default is dark mode
    expect(appState.isDarkMode, true);

    // Toggle dark mode
    appState.toggleDarkMode(false);
    expect(appState.isDarkMode, false);

    appState.toggleDarkMode(true);
    expect(appState.isDarkMode, true);
  });

  testWidgets('App state manages scheduled trips', (WidgetTester tester) async {
    final appState = AppState();

    // Initially empty
    expect(appState.scheduledTrips.isEmpty, true);

    // Add a trip
    appState.addScheduledTrip({
      'destination': 'Airport T3',
      'time': '9:00 AM',
    });

    expect(appState.scheduledTrips.length, 1);

    // Remove trip
    appState.removeScheduledTrip(0);
    expect(appState.scheduledTrips.isEmpty, true);
  });

  testWidgets('App state manages favorite drivers', (WidgetTester tester) async {
    final appState = AppState();

    // Initially empty
    expect(appState.favoriteDrivers.isEmpty, true);

    // Add driver
    appState.addFavoriteDriver({
      'id': 'driver1',
      'name': 'Marcus K.',
      'initials': 'MK',
      'vehicle': 'MV 88',
      'rating': 4.9,
    });

    expect(appState.favoriteDrivers.length, 1);
    expect(appState.isDriverFavorite('driver1'), true);

    // Remove driver
    appState.removeFavoriteDriver('driver1');
    expect(appState.favoriteDrivers.isEmpty, true);
  });
}
