# Building an Android APK

## Option A: EAS cloud build (recommended, no Android SDK needed)

```bash
npm install -g eas-cli
eas login                                 # free Expo account
cd app
eas init                                  # creates the EAS project and adds extra.eas.projectId to app.json
# Optional: point the build at your backend (public values only)
eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value https://<ref>.supabase.co --environment preview --visibility plaintext
eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon key> --environment preview --visibility plaintext
eas build --platform android --profile preview
```

The `preview` profile in [`app/eas.json`](../app/eas.json) produces an installable **`.apk`**. EAS prints a download link and a QR code when it finishes. Install the file on a phone with "Install unknown apps" allowed.

Without the two `EXPO_PUBLIC_*` variables, the APK runs in offline demo mode.

Push notifications need the `projectId` written by `eas init`, plus a build like this one; Expo Go can't receive remote push. If you want production push credentials, set up FCM with `eas credentials`.

## Option B: Local Gradle build

You need JDK 17, the Android SDK (via Android Studio, with `ANDROID_HOME` set) and about 10 GB of free disk space.

```bash
cd app
npx expo prebuild --platform android --clean
cd android
./gradlew assembleRelease        # Windows: gradlew.bat assembleRelease
# APK: app/android/app/build/outputs/apk/release/app-release.apk
```

The release build is signed with the debug keystore by default, which is fine for sideloading and demos. For the Play Store, generate an upload key and configure signing (`eas build --profile production` handles this for you).

`app/android` is generated (Continuous Native Generation) and git-ignored. Configure native behaviour in `app.json`, never by hand.

## Notes

- **Maps** use Leaflet with Esri basemap tiles inside a WebView, so no Google Maps API key is needed. OpenStreetMap's own tile servers are deliberately not used: their policy blocks app WebViews ("Access blocked"). For production traffic, register a free ArcGIS developer account or change `TILE_PROVIDERS` in `app/src/components/map/mapHtml.ts`.
- **Background audio** for the briefing is enabled through the `expo-audio` config plugin. The microphone permission is explicitly blocked.
