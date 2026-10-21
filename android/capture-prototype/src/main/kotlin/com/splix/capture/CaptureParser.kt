package com.splix.capture

import java.security.MessageDigest

data class CaptureCandidate(
    val sourcePackage: String, val amountPaise: Long, val payeeLabel: String?,
    val referenceFingerprint: String?, val observedAtEpochMs: Long, val confidence: String,
)

/** Parses only a caller-approved source. Input strings are transient and never returned or logged. */
object CaptureParser {
    private const val MAX_AMOUNT_PAISE = 1_000_000_000L
    private val amountPattern = Regex("(?:₹|INR)\\s*([0-9]+(?:,[0-9]{3})*(?:\\.[0-9]{1,2})?)(?![0-9,.])", RegexOption.IGNORE_CASE)
    private val outgoingPattern = Regex("\\b(paid|debited|sent|transferred|payment successful|successfully paid)\\b", RegexOption.IGNORE_CASE)
    private val rejectedPattern = Regex("\\b(received|credited|refund|cashback|failed|declined|pending|processing|requested|request)\\b", RegexOption.IGNORE_CASE)
    private val referencePattern = Regex("\\b(?:upi\\s*(?:ref(?:erence)?|id)|utr|transaction\\s*id)\\s*(?:no\\.?|number|[:#-])?\\s*([a-z0-9][a-z0-9/-]{7,30})", RegexOption.IGNORE_CASE)
    private val payeePattern = Regex("\\bto\\s+([^,;\\n.]{1,60})", RegexOption.IGNORE_CASE)
    private val phoneLike = Regex("[+()0-9 -]{8,}")

    fun parse(sourcePackage: String, allowlistedPackages: Set<String>, title: String?, body: String?, observedAtEpochMs: Long): CaptureCandidate? {
        if (sourcePackage !in allowlistedPackages) return null
        val transientText = listOfNotNull(title, body).joinToString(" ").take(2_000)
        if (!outgoingPattern.containsMatchIn(transientText) || rejectedPattern.containsMatchIn(transientText)) return null
        val amounts = amountPattern.findAll(transientText).toList()
        if (amounts.size != 1) return null
        val amountPaise = toPaise(amounts.single().groupValues[1]) ?: return null
        if (amountPaise <= 0 || amountPaise > MAX_AMOUNT_PAISE) return null
        val reference = referencePattern.find(transientText)?.groupValues?.get(1)?.let { sha256(it.trim().uppercase()) }
        val payee = payeePattern.find(transientText)?.groupValues?.get(1)
            ?.let { referencePattern.replace(it, "") }
            ?.trim()?.replace(Regex("\\s+"), " ")
            ?.takeIf { it.isNotBlank() && '@' !in it && !phoneLike.matches(it) }?.take(60)
        val confidence = if (reference != null && payee != null) "moderate" else "low"
        return CaptureCandidate(sourcePackage, amountPaise, payee, reference, observedAtEpochMs, confidence)
    }

    private fun toPaise(raw: String): Long? {
        val parts = raw.replace(",", "").split('.', limit = 2)
        val rupees = parts[0].toLongOrNull() ?: return null
        val paise = if (parts.size == 1) 0L else parts[1].padEnd(2, '0').toLongOrNull() ?: return null
        return try { Math.addExact(Math.multiplyExact(rupees, 100L), paise) } catch (_: ArithmeticException) { null }
    }

    internal fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
        .digest(value.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
}
