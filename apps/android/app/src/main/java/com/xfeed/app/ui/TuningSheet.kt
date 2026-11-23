package com.xfeed.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.xfeed.app.data.FeedStats
import com.xfeed.app.data.KeywordRule
import com.xfeed.app.data.PersistedAppState
import com.xfeed.app.data.SyncConfig
import com.xfeed.app.data.TuningProfile

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TuningSheet(
    appState: PersistedAppState,
    stats: FeedStats,
    syncStatus: String,
    onDismiss: () -> Unit,
    onUpdateProfile: (TuningProfile) -> Unit,
    onSaveSyncConfig: (SyncConfig) -> Unit,
    onSyncNow: (SyncConfig) -> Unit,
    onReflectNow: () -> Unit
) {
    val profile = appState.profile
    var patternInput by remember { mutableStateOf("") }
    var isBoostRule by remember { mutableStateOf(false) }
    var isRegexRule by remember { mutableStateOf(false) }
    var philosophyInput by remember(profile.tasteProfile.philosophy) {
        mutableStateOf(profile.tasteProfile.philosophy)
    }

    var syncUrl by remember(appState.syncConfig.endpointUrl) {
        mutableStateOf(appState.syncConfig.endpointUrl)
    }
    var syncToken by remember(appState.syncConfig.apiToken) {
        mutableStateOf(appState.syncConfig.apiToken)
    }
    var syncEnabled by remember(appState.syncConfig.enabled) {
        mutableStateOf(appState.syncConfig.enabled)
    }

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "xfeed Tuning Engine",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "${stats.filteredTotal} filtered · ${stats.boosted} boosted · rev ${profile.revision}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Switch(
                    checked = profile.uiOptions.enabled,
                    onCheckedChange = { enabled ->
                        onUpdateProfile(
                            profile.copy(
                                uiOptions = profile.uiOptions.copy(enabled = enabled)
                            ).bumped()
                        )
                    }
                )
            }

            HorizontalDivider()

            Text("Feed Controls", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)

            ToggleRow(
                label = "Collapse filtered posts (reversible stub)",
                checked = profile.uiOptions.displayMode == "collapse",
                onCheckedChange = { collapse ->
                    onUpdateProfile(
                        profile.copy(
                            uiOptions = profile.uiOptions.copy(
                                displayMode = if (collapse) "collapse" else "hide"
                            )
                        ).bumped()
                    )
                }
            )
            ToggleRow(
                label = "Hide Promoted / Ads",
                checked = profile.contentFilters.hidePromoted,
                onCheckedChange = { checked ->
                    onUpdateProfile(
                        profile.copy(
                            contentFilters = profile.contentFilters.copy(hidePromoted = checked)
                        ).bumped()
                    )
                }
            )
            ToggleRow(
                label = "Hide Reposts",
                checked = profile.contentFilters.hideReposts,
                onCheckedChange = { checked ->
                    onUpdateProfile(
                        profile.copy(
                            contentFilters = profile.contentFilters.copy(hideReposts = checked)
                        ).bumped()
                    )
                }
            )
            ToggleRow(
                label = "Forward \"Not interested\" to X",
                checked = profile.uiOptions.forwardNotInterestedToX,
                onCheckedChange = { checked ->
                    onUpdateProfile(
                        profile.copy(
                            uiOptions = profile.uiOptions.copy(forwardNotInterestedToX = checked)
                        ).bumped()
                    )
                }
            )
            ToggleRow(
                label = "AI Taste Judge",
                checked = profile.tasteProfile.aiJudgeEnabled,
                onCheckedChange = { checked ->
                    onUpdateProfile(
                        profile.copy(
                            tasteProfile = profile.tasteProfile.copy(aiJudgeEnabled = checked)
                        ).bumped()
                    )
                }
            )

            HorizontalDivider()

            Text("Feed Philosophy & Learned Taste", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            OutlinedTextField(
                value = philosophyInput,
                onValueChange = { philosophyInput = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Describe what you value vs. engagement farming") },
                minLines = 3
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                OutlinedButton(
                    modifier = Modifier.weight(1f),
                    onClick = {
                        onUpdateProfile(
                            profile.copy(
                                tasteProfile = profile.tasteProfile.copy(philosophy = philosophyInput.trim())
                            ).bumped()
                        )
                    }
                ) {
                    Text("Save Philosophy")
                }
                Button(
                    modifier = Modifier.weight(1f),
                    onClick = onReflectNow
                ) {
                    Text("Reflect / Learn")
                }
            }
            profile.tasteProfile.learnedRules.forEachIndexed { idx, ruleText ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "• $ruleText",
                        modifier = Modifier.weight(1f),
                        style = MaterialTheme.typography.bodySmall
                    )
                    TextButton(
                        onClick = {
                            val updated = profile.tasteProfile.learnedRules.filterIndexed { i, _ -> i != idx }
                            onUpdateProfile(
                                profile.copy(
                                    tasteProfile = profile.tasteProfile.copy(learnedRules = updated)
                                ).bumped()
                            )
                        }
                    ) {
                        Text("×")
                    }
                }
            }

            HorizontalDivider()

            Text("Keyword & Regex Rules", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            OutlinedTextField(
                value = patternInput,
                onValueChange = { patternInput = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Keyword or regex pattern") },
                singleLine = true
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                FilterChip(
                    selected = !isBoostRule,
                    onClick = { isBoostRule = false },
                    label = { Text("Filter (-5)") }
                )
                FilterChip(
                    selected = isBoostRule,
                    onClick = { isBoostRule = true },
                    label = { Text("Boost (+3.5)") }
                )
                FilterChip(
                    selected = isRegexRule,
                    onClick = { isRegexRule = !isRegexRule },
                    label = { Text("/regex/") }
                )
                Spacer(modifier = Modifier.weight(1f))
                Button(
                    onClick = {
                        val trimmed = patternInput.trim()
                        if (trimmed.isNotEmpty()) {
                            val newRule = KeywordRule(
                                pattern = trimmed,
                                isRegex = isRegexRule,
                                weight = if (isBoostRule) 3.5 else -5.0
                            )
                            onUpdateProfile(
                                profile.copy(rules = listOf(newRule) + profile.rules).bumped()
                            )
                            patternInput = ""
                        }
                    }
                ) {
                    Text("Add")
                }
            }

            if (profile.rules.isEmpty()) {
                Text(
                    "No keyword rules yet.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            } else {
                profile.rules.forEach { rule ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        val prefix = if (rule.isRegex) "/" else ""
                        val sign = if (rule.weight >= 0) "+" else ""
                        Text("$prefix${rule.pattern}$prefix ($sign${rule.weight})")
                        TextButton(
                            onClick = {
                                onUpdateProfile(
                                    profile.copy(
                                        rules = profile.rules.filterNot { it.id == rule.id }
                                    ).bumped()
                                )
                            }
                        ) {
                            Text("Remove")
                        }
                    }
                }
            }

            if (profile.authorWeights.isNotEmpty()) {
                HorizontalDivider()
                Text("Learned Author Weights", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                profile.authorWeights.entries.sortedBy { it.value }.take(12).forEach { (handle, weight) ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        val tag = if (weight <= -10.0) "MUTED" else String.format("%+.1f", weight)
                        Text("@$handle ($tag)")
                        TextButton(
                            onClick = {
                                val updated = profile.authorWeights.toMutableMap().apply { remove(handle) }
                                onUpdateProfile(profile.copy(authorWeights = updated).bumped())
                            }
                        ) {
                            Text("Reset")
                        }
                    }
                }
            }

            HorizontalDivider()

            Text("Remote Sync ($0 Cloudflare Worker)", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            OutlinedTextField(
                value = syncUrl,
                onValueChange = { syncUrl = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Worker URL (or http://10.0.2.2:8787)") },
                singleLine = true
            )
            OutlinedTextField(
                value = syncToken,
                onValueChange = { syncToken = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Personal SYNC_API_TOKEN") },
                visualTransformation = PasswordVisualTransformation(),
                singleLine = true
            )
            ToggleRow(
                label = "Enable Remote Sync",
                checked = syncEnabled,
                onCheckedChange = { syncEnabled = it }
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                OutlinedButton(
                    modifier = Modifier.weight(1f),
                    onClick = {
                        onSaveSyncConfig(
                            appState.syncConfig.copy(
                                endpointUrl = syncUrl.trim(),
                                apiToken = syncToken.trim(),
                                enabled = syncEnabled
                            )
                        )
                    }
                ) {
                    Text("Save Sync")
                }
                Button(
                    modifier = Modifier.weight(1f),
                    onClick = {
                        onSyncNow(
                            appState.syncConfig.copy(
                                endpointUrl = syncUrl.trim(),
                                apiToken = syncToken.trim(),
                                enabled = syncEnabled
                            )
                        )
                    }
                ) {
                    Text("Sync Now")
                }
            }
            Text(
                text = syncStatus,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            if (appState.feedbackHistory.isNotEmpty()) {
                HorizontalDivider()
                Text("Recent Feedback", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                appState.feedbackHistory.take(6).forEach { ev ->
                    val xNote = if (ev.syncedToX) " · synced to X" else ""
                    Text(
                        text = "@${ev.authorHandle} — ${ev.action} (${ev.sourceClient}$xNote)",
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}

@Composable
private fun ToggleRow(
    label: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(text = label, modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}
