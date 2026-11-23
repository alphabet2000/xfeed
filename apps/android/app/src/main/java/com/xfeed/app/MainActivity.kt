package com.xfeed.app

import android.annotation.SuppressLint
import android.app.Dialog
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Message
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import com.xfeed.app.data.FeedStats
import com.xfeed.app.data.LocalStore
import com.xfeed.app.data.PersistedAppState
import com.xfeed.app.data.SyncRepository
import com.xfeed.app.ui.TuningSheet
import com.xfeed.app.webview.XFeedJsBridge
import kotlinx.coroutines.launch
import org.json.JSONObject

class MainActivity : ComponentActivity() {

    private lateinit var localStore: LocalStore
    private val syncRepository = SyncRepository()
    private var injectedScriptCache: String? = null

    private fun loadBundledAdapterScript(): String {
        injectedScriptCache?.let { return it }
        return assets.open("xfeed/webview-bundle.js")
            .bufferedReader(Charsets.UTF_8)
            .use { it.readText() }
            .also { injectedScriptCache = it }
    }

    private fun isInAppOrigin(host: String?): Boolean {
        if (host.isNullOrBlank()) return true
        val h = host.lowercase()
        return h == "x.com" || h.endsWith(".x.com") ||
            h == "twitter.com" || h.endsWith(".twitter.com") ||
            h == "twimg.com" || h.endsWith(".twimg.com") ||
            h == "accounts.google.com" || h.endsWith(".accounts.google.com") ||
            h == "accounts.youtube.com" || h == "myaccount.google.com" ||
            h == "gds.google.com" || h == "consent.google.com" ||
            h == "appleid.apple.com" || h == "idmsa.apple.com" ||
            h.endsWith(".arkoselabs.com") || h.endsWith(".funcaptcha.com") ||
            h == "challenges.cloudflare.com"
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebViewSettings(webView: WebView) {
        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.setSupportZoom(true)
        settings.builtInZoomControls = true
        settings.displayZoomControls = false
        settings.javaScriptCanOpenWindowsAutomatically = true
        settings.setSupportMultipleWindows(true)
        settings.mediaPlaybackRequiresUserGesture = false
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
        // Present as standard Android Chrome mobile (strip "; wv" and "Version/4.0" WebView markers)
        settings.userAgentString = settings.userAgentString
            .replace("; wv", "")
            .replace(Regex("""Version/\d+\.\d+\s*"""), "")

        val cookieManager = CookieManager.getInstance()
        cookieManager.setAcceptCookie(true)
        cookieManager.setAcceptThirdPartyCookies(webView, true)
    }

    override fun onPause() {
        super.onPause()
        CookieManager.getInstance().flush()
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if ((applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true)
        }
        localStore = LocalStore(applicationContext)

        setContent {
            val scope = rememberCoroutineScope()
            var appState by remember { mutableStateOf(localStore.load()) }
            var stats by remember { mutableStateOf(FeedStats()) }
            var showTuningSheet by remember { mutableStateOf(false) }
            var syncStatus by remember {
                mutableStateOf(
                    appState.lastSyncedAt?.let { "Last synced: $it" } ?: "Not synced yet"
                )
            }
            var webViewRef by remember { mutableStateOf<WebView?>(null) }

            fun pushStateToWebView(nextState: PersistedAppState) {
                val jsonLiteral = JSONObject.quote(localStore.toWebViewStateJson(nextState))
                runOnUiThread {
                    webViewRef?.evaluateJavascript(
                        "window.__xfeedPushState && window.__xfeedPushState($jsonLiteral);",
                        null
                    )
                }
            }

            var syncInFlight by remember { mutableStateOf(false) }
            var syncQueued by remember { mutableStateOf(false) }

            fun triggerSync(stateOverride: PersistedAppState? = null) {
                val initialState = stateOverride ?: appState
                if (!initialState.syncConfig.enabled) return
                if (syncInFlight) {
                    syncQueued = true
                    return
                }
                syncInFlight = true
                scope.launch {
                    try {
                        var pendingPassState = initialState
                        do {
                            syncQueued = false
                            syncStatus = "Syncing..."
                            val pushedIds = pendingPassState.pendingFeedback.map { it.id }.toSet()
                            val result = syncRepository.sync(pendingPassState)
                            if (result.ok) {
                                val latest = appState
                                val mergedProfile = if (latest.profile.revision > result.state.profile.revision) {
                                    latest.profile.copy(learnedModel = result.state.profile.learnedModel)
                                } else {
                                    result.state.profile
                                }
                                val mergedHistory = (latest.feedbackHistory + result.state.feedbackHistory)
                                    .associateBy { it.id }
                                    .values
                                    .sortedByDescending { it.createdAt }
                                    .take(2000)
                                val remainingPending = latest.pendingFeedback.filter { it.id !in pushedIds }
                                val finalState = result.state.copy(
                                    profile = mergedProfile,
                                    feedbackHistory = mergedHistory,
                                    pendingFeedback = remainingPending,
                                    syncConfig = latest.syncConfig
                                )
                                localStore.save(finalState)
                                appState = finalState
                                pushStateToWebView(finalState)
                                if (remainingPending.isNotEmpty() || latest.profile.revision > pendingPassState.profile.revision) {
                                    pendingPassState = finalState
                                    syncQueued = true
                                }
                            }
                            syncStatus = result.message
                            if (!result.ok) break
                        } while (syncQueued)
                    } finally {
                        syncInFlight = false
                    }
                }
            }

            LaunchedEffect(Unit) {
                triggerSync()
            }

            BackHandler(enabled = webViewRef?.canGoBack() == true) {
                webViewRef?.goBack()
            }

            MaterialTheme(colorScheme = darkColorScheme()) {
                Surface(modifier = Modifier.fillMaxSize().systemBarsPadding().imePadding()) {
                    Box(modifier = Modifier.fillMaxSize()) {
                        AndroidView(
                            modifier = Modifier.fillMaxSize(),
                            factory = { ctx ->
                                WebView(ctx).apply {
                                    layoutParams = ViewGroup.LayoutParams(
                                        ViewGroup.LayoutParams.MATCH_PARENT,
                                        ViewGroup.LayoutParams.MATCH_PARENT
                                    )
                                    setBackgroundColor(Color.parseColor("#0F1419"))
                                    configureWebViewSettings(this)

                                    webChromeClient = object : WebChromeClient() {
                                        override fun onCreateWindow(
                                            view: WebView?,
                                            isDialog: Boolean,
                                            isUserGesture: Boolean,
                                            resultMsg: Message?
                                        ): Boolean {
                                            val popupWebView = WebView(ctx).apply {
                                                layoutParams = ViewGroup.LayoutParams(
                                                    ViewGroup.LayoutParams.MATCH_PARENT,
                                                    ViewGroup.LayoutParams.MATCH_PARENT
                                                )
                                                setBackgroundColor(Color.parseColor("#0F1419"))
                                                configureWebViewSettings(this)
                                            }
                                            val dialog = Dialog(
                                                ctx,
                                                android.R.style.Theme_Black_NoTitleBar_Fullscreen
                                            ).apply {
                                                setContentView(popupWebView)
                                                setOnDismissListener {
                                                    popupWebView.destroy()
                                                    CookieManager.getInstance().flush()
                                                }
                                            }
                                            popupWebView.webChromeClient = object : WebChromeClient() {
                                                override fun onCloseWindow(window: WebView?) {
                                                    if (dialog.isShowing) dialog.dismiss()
                                                }
                                            }
                                            popupWebView.webViewClient = object : WebViewClient() {
                                                override fun shouldOverrideUrlLoading(
                                                    pView: WebView?,
                                                    req: WebResourceRequest?
                                                ): Boolean = false

                                                override fun onPageFinished(pView: WebView?, url: String?) {
                                                    super.onPageFinished(pView, url)
                                                    CookieManager.getInstance().flush()
                                                }
                                            }
                                            dialog.show()
                                            val transport = resultMsg?.obj as? WebView.WebViewTransport
                                            transport?.webView = popupWebView
                                            resultMsg?.sendToTarget()
                                            return true
                                        }
                                    }

                                    val jsBridge = XFeedJsBridge(
                                        getStateJsonProvider = {
                                            localStore.toWebViewStateJson(appState)
                                        },
                                        onProfileSaved = { updatedProfile ->
                                            val next = appState.copy(profile = updatedProfile)
                                            localStore.save(next)
                                            runOnUiThread {
                                                appState = next
                                                triggerSync(next)
                                            }
                                        },
                                        onFeedbackRecorded = { event, updatedProfile, updatedHistory ->
                                            val next = appState.copy(
                                                profile = updatedProfile,
                                                feedbackHistory = updatedHistory,
                                                pendingFeedback = (appState.pendingFeedback + event).takeLast(500)
                                            )
                                            localStore.save(next)
                                            runOnUiThread {
                                                appState = next
                                                triggerSync(next)
                                            }
                                        },
                                        onJudgeBatchRequested = { reqId, postsJson, profileJson, historyJson ->
                                            scope.launch {
                                                val verdictsJson = syncRepository.judgePostsRaw(
                                                    appState.syncConfig,
                                                    postsJson,
                                                    profileJson,
                                                    historyJson
                                                )
                                                val reqLit = JSONObject.quote(reqId)
                                                val verdictsLit = JSONObject.quote(verdictsJson)
                                                runOnUiThread {
                                                    webViewRef?.evaluateJavascript(
                                                        "window.__xfeedResolveJudge && window.__xfeedResolveJudge($reqLit, $verdictsLit);",
                                                        null
                                                    )
                                                }
                                            }
                                        },
                                        onOpenTuningPanel = {
                                            runOnUiThread { showTuningSheet = true }
                                        },
                                        onStatsReported = { reported ->
                                            runOnUiThread { stats = reported }
                                        }
                                    )
                                    addJavascriptInterface(jsBridge, "XFeedAndroid")

                                    webViewClient = object : WebViewClient() {
                                        override fun shouldOverrideUrlLoading(
                                            view: WebView?,
                                            request: WebResourceRequest?
                                        ): Boolean {
                                            val req = request ?: return false
                                            // Never hijack iframes (login verification, OAuth, embedded widgets)
                                            if (!req.isForMainFrame) return false
                                            val uri = req.url ?: return false
                                            val scheme = uri.scheme?.lowercase()
                                            if (scheme != "http" && scheme != "https") {
                                                return false
                                            }
                                            if (isInAppOrigin(uri.host) || !req.hasGesture()) {
                                                return false
                                            }
                                            // Open user-tapped external articles/links in the system browser
                                            try {
                                                startActivity(Intent(Intent.ACTION_VIEW, uri))
                                            } catch (_: Exception) {
                                                return false
                                            }
                                            return true
                                        }

                                        override fun onPageFinished(view: WebView?, url: String?) {
                                            super.onPageFinished(view, url)
                                            CookieManager.getInstance().flush()
                                            val host = url?.let { Uri.parse(it).host }?.lowercase()
                                            if (host != null && (host == "x.com" || host.endsWith(".x.com") || host == "twitter.com" || host.endsWith(".twitter.com"))) {
                                                val script = loadBundledAdapterScript()
                                                view?.evaluateJavascript(script, null)
                                            }
                                        }
                                    }

                                    loadUrl("https://x.com/home")
                                    webViewRef = this
                                }
                            }
                        )

                        if (showTuningSheet) {
                            TuningSheet(
                                appState = appState,
                                stats = stats,
                                syncStatus = syncStatus,
                                onDismiss = { showTuningSheet = false },
                                onUpdateProfile = { updatedProfile ->
                                    val next = appState.copy(profile = updatedProfile)
                                    localStore.save(next)
                                    appState = next
                                    pushStateToWebView(next)
                                    triggerSync(next)
                                },
                                onSaveSyncConfig = { nextCfg ->
                                    val next = appState.copy(syncConfig = nextCfg)
                                    localStore.save(next)
                                    appState = next
                                    syncStatus = "Sync settings saved."
                                },
                                onSyncNow = { nextCfg ->
                                    val next = appState.copy(syncConfig = nextCfg)
                                    localStore.save(next)
                                    appState = next
                                    triggerSync(next)
                                },
                                onReflectNow = {
                                    scope.launch {
                                        syncStatus = "Reflecting taste..."
                                        val learned = syncRepository.reflectTaste(appState)
                                        if (learned != null) {
                                            val updatedProfile = appState.profile.copy(
                                                tasteProfile = appState.profile.tasteProfile.copy(
                                                    learnedRules = learned
                                                )
                                            ).bumped()
                                            val next = appState.copy(profile = updatedProfile)
                                            localStore.save(next)
                                            appState = next
                                            pushStateToWebView(next)
                                            triggerSync(next)
                                            syncStatus = "Updated ${learned.size} learned taste rules"
                                        } else {
                                            syncStatus = "Enable Remote Sync to run Taste Reflection"
                                        }
                                    }
                                }
                            )
                        }
                    }
                }
            }
        }
    }
}
