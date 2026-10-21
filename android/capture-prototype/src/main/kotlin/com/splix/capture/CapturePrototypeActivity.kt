package com.splix.capture

import android.app.Activity
import android.os.Bundle
import android.view.ViewGroup
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast

/** Feasibility harness only. The real app must pass its authenticated account/membership values. */
class CapturePrototypeActivity : Activity() {
    private lateinit var store: CaptureStore
    private lateinit var accountId: EditText
    private lateinit var groupId: EditText
    private lateinit var consent: CheckBox
    private val sourceChecks = mutableMapOf<String, CheckBox>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        store = CaptureStore(this)
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(24, 24, 24, 24) }
        root.addView(TextView(this).apply {
            text = "Optional private capture prototype\n\nAndroid notification access is broad. This harness reads only the app sources selected below while one group session is active. It parses candidate amount/payee/reference fields locally, stores a private review draft, and never posts an expense. Raw notification text is not saved or sent. Stop here or revoke access in Android Settings at any time. Source parsing is experimental and may miss or misread notifications."
        }, fullWidth())
        accountId = EditText(this).apply { hint = "Test account UUID (prototype only)" }
        groupId = EditText(this).apply { hint = "Test group UUID (membership is not verified here)" }
        root.addView(accountId, fullWidth()); root.addView(groupId, fullWidth())
        CaptureStore.CANDIDATE_SOURCES.forEach { source ->
            val check = CheckBox(this).apply { text = "Allow source candidate: $source" }
            sourceChecks[source] = check; root.addView(check, fullWidth())
        }
        consent = CheckBox(this).apply { text = "I understand and consent to the optional capture above" }
        root.addView(consent, fullWidth())
        root.addView(Button(this).apply {
            text = "Save consent and open Android notification settings"
            setOnClickListener { requestAccess() }
        }, fullWidth())
        root.addView(Button(this).apply {
            text = "Start this group for 30 minutes"
            setOnClickListener { activate() }
        }, fullWidth())
        root.addView(Button(this).apply {
            text = "Stop capture"
            setOnClickListener {
                accountId.text.toString().trim().takeIf(String::isNotEmpty)?.let { store.stop(it) }
                toast("Capture stopped")
            }
        }, fullWidth())
        root.addView(TextView(this).apply {
            text = "This test screen has no login, membership validation, draft review UI, or production source support. Use only a test account/group and sanitized notifications."
        }, fullWidth())
        setContentView(root)
    }

    private fun requestAccess() {
        val account = accountId.text.toString().trim()
        val sources = sourceChecks.filterValues { it.isChecked }.keys
        if (!consent.isChecked || account.isEmpty() || sources.isEmpty()) {
            toast("Confirm the disclosure, enter a test account, and select at least one source")
            return
        }
        runCatching { CaptureControl.requestAccess(this, store, account, sources) }
            .onFailure { toast("Could not save consent") }
    }

    private fun activate() {
        val account = accountId.text.toString().trim()
        val group = groupId.text.toString().trim()
        if (account.isEmpty() || group.isEmpty()) { toast("Enter the test account and group IDs") ; return }
        runCatching {
            store.setCurrentAccount(account)
            CaptureControl.activate(this, account, group, 30 * 60 * 1000L)
        }.onSuccess { toast("Capture active for 30 minutes") }
            .onFailure { toast(it.message ?: "Could not activate capture") }
    }

    private fun toast(message: String) = Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    private fun fullWidth() = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
}
