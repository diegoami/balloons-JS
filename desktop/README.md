# Baloncelli desktop

Portable Windows x64 Tauri 2 / WebView2 wrapper, following Scopetta, Discola and
Tressette. The first wrapper is new work after the v2.8 release; its native
code was not part of the original v2.8 independent review. Do not claim that
tag as the source of the Windows executable.

The wrapper embeds `public/` directly, opens a resizable 1280×800 window, and
initializes the existing scores URL override before the game loads. It exposes
no native shell commands to JavaScript; external navigation is limited to the
known GitHub downloads directory and release destinations. Profile identifier
`com.diegoami.baloncelli.desktop` is permanent once distributed.

Build on Windows with Rust/MSVC tools and WebView2 installed:

```powershell
cd desktop
npm ci
npm run build
```

Output: `src-tauri/target/release/baloncelli.exe`. It is an unsigned portable
executable, with no installer; downloaded copies may trigger the usual Windows
unknown-publisher prompt. The bundled icon is copied unchanged from the game's
generated `public/favicon.ico`. Neither node_modules nor build outputs are
copied from another checkout.
