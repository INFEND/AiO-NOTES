# AiO NOTES
Android rich-text notebook by INFEND.

## Build
JDK 17, Android SDK 35, Gradle 8.9. Run gradle :app:assembleDebug.
For a signed release, add repository Actions secret AIO_SIGNING_BUNDLE (Base64 ZIP containing release.p12 and password.txt). Run the Release workflow manually after adding the secret. Subsequent pushes to main also trigger it.

## First implementation
Local notes, rich text, checklists, images, search, pinning, 24 accent colors, JSON backup/restore via Android document picker, Android cloud backup where enabled, signed OTA manifest and install flow. Platform spell checker availability depends on installed spell-check service. Full Google account multi-device sync, comprehensive Russian/English grammar, advanced document/PDF editing are not implemented.
