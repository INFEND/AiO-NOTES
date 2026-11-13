# AiO NOTES
All in One Notes — Android by INFEND.

## Build and release
JDK 17, Android SDK 35, Gradle 8.9. Run gradle :app:assembleDebug.
Signed releases use repository Actions secret AIO_SIGNING_BUNDLE (Base64 ZIP containing release.p12 and password.txt). Pushes to main trigger the Release workflow. Release assets are AiO-NOTES.apk and update.json.

## Implemented in source
- AMOLED editor with 24 accent colors, rich formatting, headings, lists, checkboxes, images, tables, quotations and basic code highlighting.
- Local atomic storage, search, pinned notes, folders, tags, trash with deletion markers, limited revision history.
- JSON backup/restore, TXT and HTML export, Android print/PDF.
- Optional synchronization through one user-selected writable document using Android Storage Access Framework (e.g. Google Drive where supported). Foreground polling, timestamp merge and deletion markers. This is not OAuth account integration or a conflict-safe real-time sync service; simultaneous edits can conflict.
- Platform spell-check service for Russian/English when available, local basic spelling/punctuation rules. No full linguistic grammar engine.
- Signed OTA manifest, resumable HTTP range downloads where supported, SHA-256 and APK signer verification, system installer.
- No full PDF editing, DOCX export or biometric vault yet.

Android runtime and provider compatibility require testing on a real device.
