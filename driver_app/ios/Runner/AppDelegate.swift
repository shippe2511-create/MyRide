import Flutter
import UIKit
import GoogleMaps
import CoreLocation

// Native location manager for reliable background tracking
class NativeLocationManager: NSObject, CLLocationManagerDelegate {
    static let shared = NativeLocationManager()

    private let locationManager = CLLocationManager()
    private var methodChannel: FlutterMethodChannel?
    private var driverId: String?
    private var isTracking = false
    private var lastUpdateTime: Date?
    private var lastLocation: CLLocation?

    override init() {
        super.init()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        locationManager.distanceFilter = kCLDistanceFilterNone
        locationManager.allowsBackgroundLocationUpdates = true
        locationManager.pausesLocationUpdatesAutomatically = false
        locationManager.showsBackgroundLocationIndicator = true
        locationManager.activityType = .otherNavigation
    }

    func setup(with binaryMessenger: FlutterBinaryMessenger) {
        methodChannel = FlutterMethodChannel(
            name: "com.myride.driver/location",
            binaryMessenger: binaryMessenger
        )

        methodChannel?.setMethodCallHandler { [weak self] call, result in
            switch call.method {
            case "startTracking":
                if let args = call.arguments as? [String: Any],
                   let driverId = args["driverId"] as? String {
                    self?.startTracking(driverId: driverId)
                    result(true)
                } else {
                    result(FlutterError(code: "INVALID_ARGS", message: "Missing driverId", details: nil))
                }
            case "stopTracking":
                self?.stopTracking()
                result(true)
            case "isTracking":
                result(self?.isTracking ?? false)
            default:
                result(FlutterMethodNotImplemented)
            }
        }
    }

    func startTracking(driverId: String) {
        self.driverId = driverId

        var status: CLAuthorizationStatus
        if #available(iOS 14.0, *) {
            status = locationManager.authorizationStatus
        } else {
            status = CLLocationManager.authorizationStatus()
        }

        if status == .notDetermined {
            locationManager.requestWhenInUseAuthorization()
        } else if status == .authorizedWhenInUse || status == .authorizedAlways {
            locationManager.startUpdatingLocation()
            isTracking = true
            print("NativeLocation: Started tracking for driver \(driverId)")
        }
    }

    func stopTracking() {
        locationManager.stopUpdatingLocation()
        isTracking = false
        driverId = nil
        lastLocation = nil
        lastUpdateTime = nil
        print("NativeLocation: Stopped tracking")
    }

    // MARK: - CLLocationManagerDelegate

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        var status: CLAuthorizationStatus
        if #available(iOS 14.0, *) {
            status = manager.authorizationStatus
        } else {
            status = CLLocationManager.authorizationStatus()
        }
        print("NativeLocation: Authorization changed to \(status.rawValue)")

        if status == .authorizedWhenInUse || status == .authorizedAlways {
            if driverId != nil && !isTracking {
                locationManager.startUpdatingLocation()
                isTracking = true
            }
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last, let driverId = driverId else { return }

        let now = Date()

        // Throttle: max 1 update per second
        if let lastTime = lastUpdateTime, now.timeIntervalSince(lastTime) < 1.0 {
            return
        }

        // Skip if moved less than 2 meters AND less than 5 seconds passed
        if let lastLoc = lastLocation {
            let distance = location.distance(from: lastLoc)
            if distance < 2.0, let lastTime = lastUpdateTime, now.timeIntervalSince(lastTime) < 5.0 {
                return
            }
        }

        // Validate Maldives coordinates
        let lat = location.coordinate.latitude
        let lng = location.coordinate.longitude
        guard lat >= -0.7 && lat <= 7.1 && lng >= 72.6 && lng <= 73.8 else {
            print("NativeLocation: Invalid coords (not in Maldives)")
            return
        }

        lastLocation = location
        lastUpdateTime = now

        print("NativeLocation: Update lat=\(lat), lng=\(lng)")

        // Send to Flutter
        methodChannel?.invokeMethod("onLocationUpdate", arguments: [
            "driverId": driverId,
            "lat": lat,
            "lng": lng,
            "heading": location.course,
            "speed": location.speed
        ])
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        print("NativeLocation: Error - \(error.localizedDescription)")
    }
}

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    GMSServices.provideAPIKey("AIzaSyBZ7HVy2dUvTCC5SZkz0MaFCBON2QorFbI")

    // Setup native location manager after super.application
    let result = super.application(application, didFinishLaunchingWithOptions: launchOptions)

    // Now the Flutter engine should be ready
    if let controller = window?.rootViewController as? FlutterViewController {
      NativeLocationManager.shared.setup(with: controller.binaryMessenger)
      print("NativeLocation: MethodChannel setup complete")
    } else {
      print("NativeLocation: ERROR - FlutterViewController not found")
    }

    return result
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
  }
}
