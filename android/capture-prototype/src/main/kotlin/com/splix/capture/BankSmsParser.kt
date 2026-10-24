package com.splix.capture

/** Conservative English bank-alert parser. Raw sender/body are transient and never returned. */
object BankSmsParser {
    private val senderId = Regex("(?:[A-Z]{2}-)?[A-Z0-9]{6}(?:-[A-Z])?", RegexOption.IGNORE_CASE)
    private val outgoing = Regex("\\b(debited|paid|sent|transferred)\\b", RegexOption.IGNORE_CASE)
    private val direction = Regex("\\b(debited|paid|sent|transferred|credited|received)\\b", RegexOption.IGNORE_CASE)
    private val reject = Regex("\\b(otp|one[ -]?time|verification|verify|password|failed|declined|pending|processing|refund|cashback|request|requested|collect)\\b", RegexOption.IGNORE_CASE)
    private val account = Regex("\\b(?:a/?c|acct|account)(?=\\b|[*x0-9])", RegexOption.IGNORE_CASE)
    private val upi = Regex("\\b(upi|vpa)\\b", RegexOption.IGNORE_CASE)
    private val balance = Regex("\\b(?:(?:avl\\.?|available|closing|remaining)\\s*(?:a/c\\s*)?(?:bal(?:ance)?|limit)|bal(?:ance)?\\s*[:.])", RegexOption.IGNORE_CASE)
    private val currency = Regex("(?:₹|INR\\.?|Rs\\.?)\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)(?![0-9,.])", RegexOption.IGNORE_CASE)
    private val grouped = Regex("(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+|[0-9]{1,2}(?:,[0-9]{2})*,[0-9]{3})(?:\\.[0-9]{1,2})?")
    private val reference = Regex("\\b(?:upi\\s*(?:ref(?:erence)?|rrn)|utr|rrn|ref(?:erence)?)(?:\\s*(?:no\\.?|number|id))?\\s*[:/#-]?\\s*([a-z0-9][a-z0-9/-]{7,30})\\b", RegexOption.IGNORE_CASE)

    fun supportsSender(sender: String?): Boolean = sender != null && senderId.matches(sender.trim())

    fun parse(source: String, allowlist: Set<String>, sender: String?, body: String?, observedAt: Long): CaptureCandidate? {
        if (source !in allowlist || !supportsSender(sender)) return null
        val text = body?.take(2000) ?: return null
        if (reject.containsMatchIn(text) || !outgoing.containsMatchIn(text) || !account.containsMatchIn(text) || !upi.containsMatchIn(text)) return null
        // Bank alerts may describe both sides: our debit and the recipient's credit.
        // The first movement distinguishes a debit with recipient-credit wording
        // from an incoming credit mentioning the sender's debit.
        val movement = direction.find(text)?.value ?: return null
        if (!outgoing.matches(movement)) return null
        // A balance is not the payment amount. Multiple remaining amounts are ambiguous.
        val payment = balance.find(text)?.let { text.take(it.range.first) } ?: text
        val amounts = currency.findAll(payment).toList()
        if (amounts.size != 1) return null
        val raw = amounts.single().groupValues[1]
        if (!grouped.matches(raw)) return null
        val parts = raw.replace(",", "").split('.', limit = 2)
        val rupees = parts[0].toLongOrNull() ?: return null
        val amount = try { Math.addExact(Math.multiplyExact(rupees, 100L), if (parts.size == 1) 0 else parts[1].padEnd(2, '0').toLong()) }
            catch (_: ArithmeticException) { return null }
        if (amount !in 1..1_000_000_000L) return null
        val fingerprint = reference.find(text)?.groupValues?.get(1)?.let { CaptureParser.sha256(it.uppercase(java.util.Locale.ROOT)) }
        return CaptureCandidate(source, amount, null, fingerprint, observedAt, "low")
    }
}
