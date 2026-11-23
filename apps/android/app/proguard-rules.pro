# Keep JavascriptInterface bridge methods intact if minification is ever enabled
-keepclassmembers class com.xfeed.app.webview.XFeedJsBridge {
    @android.webkit.JavascriptInterface <methods>;
}
