# Putting the Android app on the website

The site already has a page `https://chatzy.site/download` (and a "Get the Chatzy app" card on the login
page for Android browsers). It only shows the Download button when the file really exists.

## To publish / update the app
1. Build the signed release APK from the Android wrapper project.
2. Rename it `chatzy.apk` and put it in `frontend/public/` (this folder is served as-is by Vercel).
3. Change the number in `frontend/public/app-version.json`.
4. Commit and push. Vercel deploys, the Download button appears.

Use one signing key for every release, otherwise phones will refuse to update the old app.
Big files: keep the APK under ~100 MB. For larger, host it on GitHub Releases and point `APK` in `src/GetApp.jsx` to that link.
