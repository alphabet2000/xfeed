package com.xfeed.app.webview

import android.webkit.JavascriptInterface
import com.xfeed.app.data.FeedStats
import com.xfeed.app.data.FeedbackEvent
import com.xfeed.app.data.TuningProfile
import org.json.JSONArray
import org.json.JSONObject

class XFeedJsBridge(
    private val getStateJsonProvider: () -> String,
    private val onProfileSaved: (TuningProfile) -> Unit,
    private val onFeedbackRecorded: (FeedbackEvent, TuningProfile, List<FeedbackEvent>) -> Unit,
    private val onJudgeBatchRequested: (String, String, String, String) -> Unit,
    private val onOpenTuningPanel: () -> Unit,
    private val onStatsReported: (FeedStats) -> Unit
) {
    @JavascriptInterface
    fun getStateJson(): String = getStateJsonProvider()

    @JavascriptInterface
    fun saveProfileJson(profileJson: String) {
        try {
            val profile = TuningProfile.fromJson(JSONObject(profileJson))
            onProfileSaved(profile)
        } catch (_: Exception) {
            // Ignore malformed payloads
        }
    }

    @JavascriptInterface
    fun recordFeedbackJson(eventJson: String, profileJson: String, historyJson: String) {
        try {
            val event = FeedbackEvent.fromJson(JSONObject(eventJson))
            val profile = TuningProfile.fromJson(JSONObject(profileJson))
            val arr = JSONArray(historyJson)
            val history = buildList {
                for (i in 0 until arr.length()) {
                    add(FeedbackEvent.fromJson(arr.getJSONObject(i)))
                }
            }
            onFeedbackRecorded(event, profile, history)
        } catch (_: Exception) {
            // Ignore malformed payloads
        }
    }

    @JavascriptInterface
    fun requestJudgeBatch(
        requestId: String,
        postsJson: String,
        profileJson: String,
        historyJson: String
    ) {
        onJudgeBatchRequested(requestId, postsJson, profileJson, historyJson)
    }

    @JavascriptInterface
    fun openTuningPanel() {
        onOpenTuningPanel()
    }

    @JavascriptInterface
    fun reportStatsJson(statsJson: String) {
        onStatsReported(FeedStats.fromJson(statsJson))
    }
}
