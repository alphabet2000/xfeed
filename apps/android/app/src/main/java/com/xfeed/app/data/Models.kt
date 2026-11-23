package com.xfeed.app.data

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.util.UUID

data class KeywordRule(
    val id: String = UUID.randomUUID().toString(),
    val pattern: String,
    val isRegex: Boolean = false,
    val weight: Double = -5.0,
    val label: String? = null,
    val enabled: Boolean = true
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("id", id)
        put("pattern", pattern)
        put("isRegex", isRegex)
        put("weight", weight)
        if (!label.isNullOrBlank()) put("label", label)
        put("enabled", enabled)
    }

    companion object {
        fun fromJson(obj: JSONObject): KeywordRule = KeywordRule(
            id = obj.optString("id", UUID.randomUUID().toString()),
            pattern = obj.optString("pattern", ""),
            isRegex = obj.optBoolean("isRegex", false),
            weight = obj.optDouble("weight", -5.0),
            label = if (obj.has("label") && !obj.isNull("label")) obj.optString("label") else null,
            enabled = obj.optBoolean("enabled", true)
        )
    }
}

data class ContentFilters(
    val hidePromoted: Boolean = true,
    val hideReposts: Boolean = false,
    val hideLinksOnly: Boolean = false,
    val hideShortPostsBelow: Int = 0
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("hidePromoted", hidePromoted)
        put("hideReposts", hideReposts)
        put("hideLinksOnly", hideLinksOnly)
        put("hideShortPostsBelow", hideShortPostsBelow)
    }

    companion object {
        fun fromJson(obj: JSONObject?): ContentFilters = if (obj == null) ContentFilters() else ContentFilters(
            hidePromoted = obj.optBoolean("hidePromoted", true),
            hideReposts = obj.optBoolean("hideReposts", false),
            hideLinksOnly = obj.optBoolean("hideLinksOnly", false),
            hideShortPostsBelow = obj.optInt("hideShortPostsBelow", 0)
        )
    }
}

data class Thresholds(
    val hideBelow: Double = -5.0,
    val collapseBelow: Double = -1.5,
    val boostAbove: Double = 2.5
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("hideBelow", hideBelow)
        put("collapseBelow", collapseBelow)
        put("boostAbove", boostAbove)
    }

    companion object {
        fun fromJson(obj: JSONObject?): Thresholds = if (obj == null) Thresholds() else Thresholds(
            hideBelow = obj.optDouble("hideBelow", -5.0),
            collapseBelow = obj.optDouble("collapseBelow", -1.5),
            boostAbove = obj.optDouble("boostAbove", 2.5)
        )
    }
}

data class UiOptions(
    val enabled: Boolean = true,
    val displayMode: String = "collapse",
    val showScoreBadge: Boolean = true,
    val forwardNotInterestedToX: Boolean = true,
    val observeNativeXFeedback: Boolean = true,
    val hideRightSidebar: Boolean = true,
    val wideTimeline: Boolean = true,
    val dedupeRepeatedStories: Boolean = true
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("enabled", enabled)
        put("displayMode", displayMode)
        put("showScoreBadge", showScoreBadge)
        put("forwardNotInterestedToX", forwardNotInterestedToX)
        put("observeNativeXFeedback", observeNativeXFeedback)
        put("hideRightSidebar", hideRightSidebar)
        put("wideTimeline", wideTimeline)
        put("dedupeRepeatedStories", dedupeRepeatedStories)
    }

    companion object {
        fun fromJson(obj: JSONObject?): UiOptions = if (obj == null) UiOptions() else UiOptions(
            enabled = obj.optBoolean("enabled", true),
            displayMode = obj.optString("displayMode", "collapse"),
            showScoreBadge = obj.optBoolean("showScoreBadge", true),
            forwardNotInterestedToX = obj.optBoolean("forwardNotInterestedToX", true),
            observeNativeXFeedback = obj.optBoolean("observeNativeXFeedback", true),
            hideRightSidebar = obj.optBoolean("hideRightSidebar", true),
            wideTimeline = obj.optBoolean("wideTimeline", true),
            dedupeRepeatedStories = obj.optBoolean("dedupeRepeatedStories", true)
        )
    }
}

data class TasteProfile(
    val philosophy: String = "Keep genuine human posts—whether informative, casual/funny, or a brief reply showing the other side of an opinion. Filter out engagement farming, reply-bait, rage-bait, DM funnels, and off-taste noise—even from authors I otherwise like.",
    val learnedRules: List<String> = emptyList(),
    val aiJudgeEnabled: Boolean = true,
    val reflectCadence: String = "weekly",
    val lastReflectedAt: String? = null
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("philosophy", philosophy)
        put("learnedRules", JSONArray(learnedRules))
        put("aiJudgeEnabled", aiJudgeEnabled)
        put("reflectCadence", reflectCadence)
        if (!lastReflectedAt.isNullOrBlank()) put("lastReflectedAt", lastReflectedAt)
    }

    companion object {
        fun fromJson(obj: JSONObject?): TasteProfile {
            if (obj == null) return TasteProfile()
            val arr = obj.optJSONArray("learnedRules")
            val rules = buildList {
                if (arr != null) {
                    for (i in 0 until arr.length()) {
                        add(arr.optString(i))
                    }
                }
            }
            return TasteProfile(
                philosophy = obj.optString("philosophy", TasteProfile().philosophy),
                learnedRules = rules,
                aiJudgeEnabled = obj.optBoolean("aiJudgeEnabled", true),
                reflectCadence = obj.optString("reflectCadence", "weekly"),
                lastReflectedAt = if (obj.has("lastReflectedAt") && !obj.isNull("lastReflectedAt")) {
                    obj.optString("lastReflectedAt")
                } else null
            )
        }
    }
}

data class TuningProfile(
    val version: Int = 1,
    val revision: Int = 1,
    val updatedAt: String = Instant.now().toString(),
    val rules: List<KeywordRule> = emptyList(),
    val authorWeights: Map<String, Double> = emptyMap(),
    val contentFilters: ContentFilters = ContentFilters(),
    val thresholds: Thresholds = Thresholds(),
    val uiOptions: UiOptions = UiOptions(),
    val tasteProfile: TasteProfile = TasteProfile(),
    val learnedModel: JSONObject = JSONObject(),
    val storySnoozes: JSONArray = JSONArray(),
    val customScorerConfig: JSONObject = JSONObject()
) {
    fun bumped(): TuningProfile = copy(
        revision = revision + 1,
        updatedAt = Instant.now().toString()
    )

    fun toJson(): JSONObject = JSONObject().apply {
        put("version", version)
        put("revision", revision)
        put("updatedAt", updatedAt)
        put("rules", JSONArray().apply { rules.forEach { put(it.toJson()) } })
        put("authorWeights", JSONObject().apply {
            authorWeights.forEach { (k, v) -> put(k, v) }
        })
        put("contentFilters", contentFilters.toJson())
        put("thresholds", thresholds.toJson())
        put("uiOptions", uiOptions.toJson())
        put("tasteProfile", tasteProfile.toJson())
        if (learnedModel.length() > 0) put("learnedModel", learnedModel)
        put("storySnoozes", storySnoozes)
        put("customScorerConfig", customScorerConfig)
    }

    companion object {
        fun fromJson(obj: JSONObject?): TuningProfile {
            if (obj == null) return TuningProfile()
            val rulesArr = obj.optJSONArray("rules")
            val rules = buildList {
                if (rulesArr != null) {
                    for (i in 0 until rulesArr.length()) {
                        add(KeywordRule.fromJson(rulesArr.getJSONObject(i)))
                    }
                }
            }
            val weightsObj = obj.optJSONObject("authorWeights")
            val weights = buildMap {
                if (weightsObj != null) {
                    val keys = weightsObj.keys()
                    while (keys.hasNext()) {
                        val key = keys.next()
                        put(key, weightsObj.optDouble(key, 0.0))
                    }
                }
            }
            return TuningProfile(
                version = obj.optInt("version", 1),
                revision = obj.optInt("revision", 1),
                updatedAt = obj.optString("updatedAt", Instant.now().toString()),
                rules = rules,
                authorWeights = weights,
                contentFilters = ContentFilters.fromJson(obj.optJSONObject("contentFilters")),
                thresholds = Thresholds.fromJson(obj.optJSONObject("thresholds")),
                uiOptions = UiOptions.fromJson(obj.optJSONObject("uiOptions")),
                tasteProfile = TasteProfile.fromJson(obj.optJSONObject("tasteProfile")),
                learnedModel = obj.optJSONObject("learnedModel") ?: JSONObject(),
                storySnoozes = obj.optJSONArray("storySnoozes") ?: JSONArray(),
                customScorerConfig = obj.optJSONObject("customScorerConfig") ?: JSONObject()
            )
        }
    }
}

data class FeedbackEvent(
    val id: String,
    val postId: String,
    val authorHandle: String,
    val action: String,
    val reasonTag: String? = null,
    val syncedToX: Boolean,
    val sourceClient: String,
    val createdAt: String,
    val postSnippet: String? = null,
    val quotedSnippet: String? = null,
    val terms: List<String> = emptyList()
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("id", id)
        put("postId", postId)
        put("authorHandle", authorHandle)
        put("action", action)
        if (!reasonTag.isNullOrBlank()) put("reasonTag", reasonTag)
        put("syncedToX", syncedToX)
        put("sourceClient", sourceClient)
        put("createdAt", createdAt)
        if (!postSnippet.isNullOrBlank()) put("postSnippet", postSnippet)
        if (!quotedSnippet.isNullOrBlank()) put("quotedSnippet", quotedSnippet)
        if (terms.isNotEmpty()) put("terms", JSONArray(terms))
    }

    companion object {
        fun fromJson(obj: JSONObject): FeedbackEvent {
            val termsArr = obj.optJSONArray("terms")
            val terms = buildList {
                if (termsArr != null) {
                    for (i in 0 until termsArr.length()) {
                        add(termsArr.optString(i))
                    }
                }
            }
            return FeedbackEvent(
                id = obj.optString("id", UUID.randomUUID().toString()),
                postId = obj.optString("postId", ""),
                authorHandle = obj.optString("authorHandle", ""),
                action = obj.optString("action", "downvote"),
                reasonTag = if (obj.has("reasonTag") && !obj.isNull("reasonTag")) {
                    obj.optString("reasonTag")
                } else null,
                syncedToX = obj.optBoolean("syncedToX", false),
                sourceClient = obj.optString("sourceClient", "android"),
                createdAt = obj.optString("createdAt", Instant.now().toString()),
                postSnippet = if (obj.has("postSnippet") && !obj.isNull("postSnippet")) {
                    obj.optString("postSnippet")
                } else null,
                quotedSnippet = if (obj.has("quotedSnippet") && !obj.isNull("quotedSnippet")) {
                    obj.optString("quotedSnippet")
                } else null,
                terms = terms
            )
        }
    }
}

data class SyncConfig(
    val endpointUrl: String = "",
    val apiToken: String = "",
    val enabled: Boolean = false,
    val deviceId: String = UUID.randomUUID().toString()
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("endpointUrl", endpointUrl)
        put("apiToken", apiToken)
        put("enabled", enabled)
        put("deviceId", deviceId)
    }

    companion object {
        fun fromJson(obj: JSONObject?): SyncConfig = if (obj == null) SyncConfig() else SyncConfig(
            endpointUrl = obj.optString("endpointUrl", ""),
            apiToken = obj.optString("apiToken", ""),
            enabled = obj.optBoolean("enabled", false),
            deviceId = obj.optString("deviceId", UUID.randomUUID().toString())
        )
    }
}

data class FeedStats(
    val seen: Int = 0,
    val hidden: Int = 0,
    val collapsed: Int = 0,
    val boosted: Int = 0
) {
    val filteredTotal: Int get() = hidden + collapsed

    companion object {
        fun fromJson(raw: String): FeedStats = try {
            val obj = JSONObject(raw)
            FeedStats(
                seen = obj.optInt("seen", 0),
                hidden = obj.optInt("hidden", 0),
                collapsed = obj.optInt("collapsed", 0),
                boosted = obj.optInt("boosted", 0)
            )
        } catch (_: Exception) {
            FeedStats()
        }
    }
}

data class PersistedAppState(
    val profile: TuningProfile = TuningProfile(),
    val feedbackHistory: List<FeedbackEvent> = emptyList(),
    val pendingFeedback: List<FeedbackEvent> = emptyList(),
    val syncConfig: SyncConfig = SyncConfig(),
    val lastSyncedAt: String? = null
)
