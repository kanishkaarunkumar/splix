package com.splix.capture

/** A reply describes a draft; it never authorizes a ledger write. */
object PaymentPromptInput {
    fun title(value: CharSequence?): String? {
        val text = value?.toString()?.trim()?.replace(Regex("\\s+"), " ") ?: return null
        return text.takeIf { it.isNotEmpty() && it.length <= 120 }
    }
}
