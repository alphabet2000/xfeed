package com.xfeed.app

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
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

    private fun isXOrigin(host: String?): Boolean {
        if (host.isNullOrBlank()) return false
        val h = host.lowercase()
        return h == "x.com" || h.endsWith(".x.com") ||
            h == "twitter.com" || h.endsWith(".twitter.com") ||
            h == "accounts.google.com" || h == "appleid.apple.com"
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
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
                Surface(modifier = Modifier.fillMaxSize().systemBarsPadding()) {
                    Box(modifier = Modifier.fillMaxSize()) {
                        AndroidView(
                            modifier = Modifier.fillMaxSize(),
                            factory = { ctx ->
                                WebView(ctx).apply {
                                    setBackgroundColor(Color.parseColor("#0F1419"))
                                    settings.javaScriptEnabled = true
                                    settings.domStorageEnabled = true
                                    settings.databaseEnabled = true
                                    settings.mediaPlaybackRequiresUserGesture = false
                                    settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
                                    settings.userAgentString = settings.userAgentString.replace("; wv", "")
                                    webChromeClient = WebChromeClient()

                                    val cookieManager = CookieManager.getInstance()
                                    cookieManager.setAcceptCookie(true)
                                    cookieManager.setAcceptThirdPartyCookies(this, true)

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
                                            val uri = request?.url ?: return false
                                            if (isXOrigin(uri.host)) {
                                                return false
                                            }
                                            // Open external articles/links in the system browser
                                            try {
                                                startActivity(Intent(Intent.ACTION_VIEW, uri))
                                            } catch (_: Exception) {
                                                return false
                                            }
                                            return true
                                        }

                                        override fun onPageFinished(view: WebView?, url: String?) {
                                            super.onPageFinished(view, url)
                                            val host = url?.let { Uri.parse(it).host }
                                            if (host != null && (host.endsWith("x.com") || host.endsWith("twitter.com"))) {
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
