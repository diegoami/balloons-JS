# Baloncelli for Android

The game in a WebView, with `public/` bundled so it plays offline. The APK is
published at
[diegoami/balloons-js-releases](https://github.com/diegoami/balloons-js-releases/releases);
this directory is the project that builds it.

There is no second copy of the game. `copyGame`
(`app/build.gradle.kts`) copies `public/` into `app/src/main/assets/www` before
every build, and that directory is gitignored. Edit `public/`; never edit the
copy.

## Building

```bash
cd android
./gradlew assembleDebug     # app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease   # app/build/outputs/apk/release/app-release.apk
```

A fresh clone builds a debug APK with no secrets at all — signing is only
wired up if `keystore.properties` exists.

### Two things about the environment

**Android Studio's bundled JDK is Java 25, and Gradle 8.14.3 refuses it.**
The JBR under `Android Studio/jbr` reports `openjdk 25.0.3`; Gradle fails
before it does anything, complaining about an unsupported class file or JVM
version. Point it at a 21:

```bash
JAVA_HOME="$HOME/.jdks/jbr-21.0.11" ./gradlew assembleRelease
```

`-Dorg.gradle.java.home=...` on its own is **not** enough: the `gradlew`
script needs a JVM to start at all, so without `JAVA_HOME` (or a `java` on
`PATH`) it exits with "JAVA_HOME is not set" before Gradle ever reads the
flag. Verified: with `JAVA_HOME` set as above, `./gradlew -version` reports
Gradle 8.14.3 on launcher JVM 21.0.11.

`gradle.properties` deliberately does not pin `org.gradle.java.home`, since
that path differs per machine.

**`local.properties` is a Java properties file, so backslashes escape.** A
Windows SDK path written with single backslashes silently becomes something
else — `\U` in `C:\Users\...` is read as an escape. Double them, or use
forward slashes:

```properties
sdk.dir=C:\\Users\\you\\AppData\\Local\\Android\\Sdk
```

The file is gitignored; it holds this machine's SDK path and nothing else.

## Signing and releasing

The keystore is the app's identity. **Do not generate one, and do not read
`keystore.properties`** — copy `keystore.properties.example` and let the owner
fill it in. If the key is lost, no update can ever be installed over an
existing copy of the app.

Releasing:

1. Bump `versionCode` and `versionName` in `app/build.gradle.kts`.
   `versionCode` must increase; 2.1 is `versionCode = 2`.
2. `./gradlew assembleRelease`.
3. Upload `app-release.apk` to a release in the releases repo, renamed
   `baloncelli-v<version>.apk`.

**Installing a release build over a debug one fails on signature mismatch.**
They are signed with different keys, and Android will not replace one with the
other. Uninstall first:

```bash
adb uninstall com.diegoami.baloncelli
```

Release APKs are currently signed v2 only, which is fine for `minSdk 26`.
Adding `enableV3Signing` would allow rotating the key later; without it this
keystore is permanent.

## Why it is built this way

The interesting decisions are commented where they are made, not repeated
here. `MainActivity.kt` explains why the game is served over
`https://appassets.androidplatform.net/` rather than `file://`, why the asset
handler is registered under `/assets/` (the prefix is stripped before the
handler sees the path — getting this wrong opens the app on "cannot load the
page"), and why the leaderboard URL is injected with
`addDocumentStartJavaScript` rather than `evaluateJavascript`.
`app/build.gradle.kts` explains `copyGame` and the `minSdk 26` floor. The
manifest explains `configChanges`, which is what keeps a run alive when the
phone is turned.
