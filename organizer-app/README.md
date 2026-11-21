# Mookalaa Organizer

Flutter app for the organisers, artists and gate staff of the Mookalaa event
ticketing platform.

## Running

The backend URL is a build-time setting. Without it the app talks to production
(`https://mookala.vercel.app/api`).

```sh
flutter pub get

# Production backend
flutter run

# A local backend (Android emulator reaches the host machine on 10.0.2.2)
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3100/api

# iOS simulator / desktop
flutter run --dart-define=API_BASE_URL=http://127.0.0.1:3100/api
```

Plain `http://` URLs are for local testing only. Android blocks cleartext
traffic by default: to test against an `http://` backend on Android, add
`android:usesCleartextTraffic="true"` to the `<application>` tag of
`android/app/src/debug/AndroidManifest.xml` (debug builds only; never in
`src/main`). iOS allows local-network `http://` in debug builds; other hosts
need an App Transport Security exception.

Release builds use the same flag:

```sh
flutter build apk --release --dart-define=API_BASE_URL=https://<host>/api
```

## Checks

```sh
flutter analyze
flutter test
```

## Before publishing

These are still the Flutter template values and must be decided by the owner:

- Android `applicationId` / `namespace` (`com.example.organizer_app`) and the
  release signing config (currently the debug keys) in `android/app/build.gradle`.
- iOS bundle identifier and signing team in Xcode.
