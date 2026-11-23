package com.xfeed.app.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

class LocalStore(context: Context) {
    private val file = File(context.filesDir, "xfeed_state.json")
    private val lock = Any()

    fun load(): PersistedAppState = synchronized(lock) {
        if (!file.exists()) {
            val initial = PersistedAppState()
            saveLocked(initial)
            return initial
        }
        return try {
            val root = JSONObject(file.readText(Charsets.UTF_8))
            val historyArr = root.optJSONArray("feedbackHistory")
            val pendingArr = root.optJSONArray("pendingFeedback")
            PersistedAppState(
                profile = TuningProfile.fromJson(root.optJSONObject("profile")),
                feedbackHistory = parseEvents(historyArr),
                pendingFeedback = parseEvents(pendingArr),
                syncConfig = SyncConfig.fromJson(root.optJSONObject("syncConfig")),
                lastSyncedAt = if (root.has("lastSyncedAt") && !root.isNull("lastSyncedAt")) {
                    root.optString("lastSyncedAt")
                } else null
            )
        } catch (_: Exception) {
            PersistedAppState()
        }
    }

    fun save(state: PersistedAppState) = synchronized(lock) {
        saveLocked(state)
    }

    fun toWebViewStateJson(state: PersistedAppState): String {
        val root = JSONObject().apply {
            put("profile", state.profile.toJson())
            put("feedbackHistory", JSONArray().apply {
                state.feedbackHistory.forEach { put(it.toJson()) }
            })
        }
        return root.toString()
    }

    private fun saveLocked(state: PersistedAppState) {
        val root = JSONObject().apply {
            put("profile", state.profile.toJson())
            put("feedbackHistory", JSONArray().apply {
                state.feedbackHistory.take(2000).forEach { put(it.toJson()) }
            })
            put("pendingFeedback", JSONArray().apply {
                state.pendingFeedback.takeLast(500).forEach { put(it.toJson()) }
            })
            put("syncConfig", state.syncConfig.toJson())
            if (state.lastSyncedAt != null) put("lastSyncedAt", state.lastSyncedAt)
        }
        val tmp = File(file.parentFile, "${file.name}.tmp")
        tmp.writeText(root.toString(), Charsets.UTF_8)
        tmp.renameTo(file)
    }

    private fun parseEvents(arr: JSONArray?): List<FeedbackEvent> {
        if (arr == null) return emptyList()
        return buildList {
            for (i in 0 until arr.length()) {
                add(FeedbackEvent.fromJson(arr.getJSONObject(i)))
            }
        }
    }
}
