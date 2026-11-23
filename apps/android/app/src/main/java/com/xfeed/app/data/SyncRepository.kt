package com.xfeed.app.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.time.Instant

data class SyncResult(
    val ok: Boolean,
    val state: PersistedAppState,
    val message: String
)

class SyncRepository {

    suspend fun sync(current: PersistedAppState): SyncResult = withContext(Dispatchers.IO) {
        val cfg = current.syncConfig
        if (!cfg.enabled || cfg.endpointUrl.isBlank() || cfg.apiToken.isBlank()) {
            return@withContext SyncResult(false, current, "Sync disabled or not configured")
        }

        val base = cfg.endpointUrl.trim().trimEnd('/')
        try {
            var pushedCount = 0
            if (current.pendingFeedback.isNotEmpty()) {
                val payload = JSONObject().apply {
                    put("events", JSONArray().apply {
                        current.pendingFeedback.forEach { put(it.toJson()) }
                    })
                }
                val pushResp = requestJson("POST", "$base/v1/feedback/batch", cfg, payload.toString())
                pushedCount = pushResp.optInt("inserted", 0)
            }

            val sinceQuery = if (!current.lastSyncedAt.isNullOrBlank()) {
                "?since=${URLEncoder.encode(current.lastSyncedAt, "UTF-8")}"
            } else ""
            val remoteState = requestJson("GET", "$base/v1/state$sinceQuery", cfg, null)

            val remoteProfileObj = remoteState.optJSONObject("profile")
            val remoteProfile = if (remoteProfileObj != null) TuningProfile.fromJson(remoteProfileObj) else null
            val remoteEventsArr = remoteState.optJSONArray("feedback")
            val remoteEvents = buildList {
                if (remoteEventsArr != null) {
                    for (i in 0 until remoteEventsArr.length()) {
                        add(FeedbackEvent.fromJson(remoteEventsArr.getJSONObject(i)))
                    }
                }
            }

            val remoteLearnedModel = remoteState.optJSONObject("learnedModel")
            val mergedSnoozes = mergeSnoozes(
                current.profile.storySnoozes,
                remoteProfile?.storySnoozes ?: JSONArray()
            )
            val remoteSnoozeIds = extractSnoozeIds(remoteProfile?.storySnoozes)
            val hasNewLocalSnoozes = extractSnoozeIds(current.profile.storySnoozes).any {
                it !in remoteSnoozeIds
            }
            var mergedProfile = mergeProfiles(current.profile, remoteProfile)
            if (remoteLearnedModel != null && remoteLearnedModel.length() > 0) {
                mergedProfile = mergedProfile.copy(learnedModel = remoteLearnedModel)
            }
            val remoteRev = remoteProfile?.revision ?: 0
            val needsPush = remoteProfile == null || current.profile.revision > remoteRev || hasNewLocalSnoozes
            val nextRev = if (hasNewLocalSnoozes && mergedProfile.revision <= remoteRev) {
                remoteRev + 1
            } else {
                mergedProfile.revision
            }
            mergedProfile = mergedProfile.copy(
                revision = nextRev,
                updatedAt = if (nextRev > mergedProfile.revision) Instant.now().toString() else mergedProfile.updatedAt,
                storySnoozes = mergedSnoozes
            )
            if (needsPush) {
                val putBody = JSONObject().put("profile", mergedProfile.toJson()).toString()
                val putResp = requestJson("PUT", "$base/v1/profile", cfg, putBody)
                val pushedProfile = TuningProfile.fromJson(putResp.optJSONObject("profile") ?: mergedProfile.toJson())
                mergedProfile = pushedProfile.copy(
                    learnedModel = if (remoteLearnedModel != null && remoteLearnedModel.length() > 0) {
                        remoteLearnedModel
                    } else {
                        pushedProfile.learnedModel
                    },
                    storySnoozes = mergeSnoozes(mergedSnoozes, pushedProfile.storySnoozes)
                )
            }

            val mergedFeedback = mergeFeedback(current.feedbackHistory, remoteEvents)
            val serverTime = remoteState.optString("serverTime", Instant.now().toString())

            val nextState = current.copy(
                profile = mergedProfile,
                feedbackHistory = mergedFeedback,
                pendingFeedback = emptyList(),
                lastSyncedAt = serverTime
            )
            SyncResult(
                ok = true,
                state = nextState,
                message = "Synced (${pushedCount}↑ / ${remoteEvents.size}↓)"
            )
        } catch (e: Exception) {
            SyncResult(
                ok = false,
                state = current,
                message = "Sync error: ${e.message ?: "Network failure"}"
            )
        }
    }

    suspend fun judgePostsRaw(
        cfg: SyncConfig,
        postsJson: String,
        profileJson: String,
        historyJson: String
    ): String = withContext(Dispatchers.IO) {
        if (!cfg.enabled || cfg.endpointUrl.isBlank() || cfg.apiToken.isBlank()) {
            return@withContext "[]"
        }
        val base = cfg.endpointUrl.trim().trimEnd('/')
        try {
            val payload = JSONObject().apply {
                put("posts", JSONArray(postsJson))
                put("profile", JSONObject(profileJson))
                put("feedbackHistory", JSONArray(historyJson))
            }
            val resp = requestJson("POST", "$base/v1/judge", cfg, payload.toString())
            resp.optJSONArray("verdicts")?.toString() ?: "[]"
        } catch (_: Exception) {
            "[]"
        }
    }

    suspend fun reflectTaste(current: PersistedAppState): List<String>? = withContext(Dispatchers.IO) {
        val cfg = current.syncConfig
        if (!cfg.enabled || cfg.endpointUrl.isBlank() || cfg.apiToken.isBlank()) {
            return@withContext null
        }
        val base = cfg.endpointUrl.trim().trimEnd('/')
        try {
            val payload = JSONObject().apply {
                put("profile", current.profile.toJson())
                put("feedbackHistory", JSONArray().apply {
                    current.feedbackHistory.take(120).forEach { put(it.toJson()) }
                })
            }
            val resp = requestJson("POST", "$base/v1/reflect", cfg, payload.toString())
            val arr = resp.optJSONArray("learnedRules") ?: return@withContext null
            buildList {
                for (i in 0 until arr.length()) add(arr.optString(i))
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun extractSnoozeIds(arr: JSONArray?): Set<String> {
        if (arr == null) return emptySet()
        val ids = LinkedHashSet<String>()
        for (i in 0 until arr.length()) {
            val obj = arr.optJSONObject(i) ?: continue
            val id = obj.optString("id", "")
            if (id.isNotEmpty()) ids.add(id)
        }
        return ids
    }

    private fun mergeSnoozes(local: JSONArray, remote: JSONArray): JSONArray {
        val nowMs = System.currentTimeMillis()
        val byId = LinkedHashMap<String, JSONObject>()
        fun addActive(arr: JSONArray) {
            for (i in 0 until arr.length()) {
                val obj = arr.optJSONObject(i) ?: continue
                val id = obj.optString("id", "")
                val exp = parseTs(obj.optString("expiresAt", ""))
                if (id.isNotEmpty() && exp > nowMs) {
                    byId[id] = obj
                }
            }
        }
        addActive(remote)
        addActive(local)
        val sorted = byId.values
            .sortedByDescending { parseTs(it.optString("createdAt", "")) }
            .take(100)
        return JSONArray().apply { sorted.forEach { put(it) } }
    }

    private fun mergeProfiles(local: TuningProfile, remote: TuningProfile?): TuningProfile {
        if (remote == null) return local
        if (remote.revision > local.revision) return remote
        if (remote.revision < local.revision) return local
        return if (parseTs(remote.updatedAt) > parseTs(local.updatedAt)) remote else local
    }

    private fun mergeFeedback(
        local: List<FeedbackEvent>,
        remote: List<FeedbackEvent>
    ): List<FeedbackEvent> {
        val byId = LinkedHashMap<String, FeedbackEvent>()
        remote.forEach { byId[it.id] = it }
        local.forEach { byId[it.id] = it }
        return byId.values
            .sortedByDescending { parseTs(it.createdAt) }
            .take(2000)
    }

    private fun parseTs(iso: String): Long = try {
        Instant.parse(iso).toEpochMilli()
    } catch (_: Exception) {
        0L
    }

    private fun requestJson(
        method: String,
        urlString: String,
        cfg: SyncConfig,
        body: String?
    ): JSONObject {
        val conn = (URL(urlString).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 10_000
            readTimeout = 15_000
            setRequestProperty("Authorization", "Bearer ${cfg.apiToken}")
            setRequestProperty("X-XFeed-Device", cfg.deviceId)
            setRequestProperty("Content-Type", "application/json")
            if (body != null) {
                doOutput = true
            }
        }
        try {
            if (body != null) {
                conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.readText().orEmpty()
            if (code !in 200..299) {
                throw IllegalStateException("HTTP $code: $text")
            }
            return JSONObject(text)
        } finally {
            conn.disconnect()
        }
    }
}
