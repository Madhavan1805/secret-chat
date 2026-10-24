# Blocking screenshots in the Android app (FLAG_SECURE)

A website cannot stop screenshots or screen recording. In the Android APK wrapper it takes one line.
Add this to `MainActivity` (Kotlin) of the wrapper project, inside `onCreate`, before `setContentView` / `super.onCreate`:

```kotlin
import android.view.WindowManager

override fun onCreate(savedInstanceState: Bundle?) {
    window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
    super.onCreate(savedInstanceState)
}
```

Java version:

```java
getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
```

With FLAG_SECURE the system blocks screenshots, screen recording and the preview in the recent-apps list.
The web app's own "Privacy shield" (Profile > App lock) still covers the app-switcher preview in browsers and PWAs.
