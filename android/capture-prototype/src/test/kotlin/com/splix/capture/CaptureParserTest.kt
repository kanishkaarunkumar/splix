package com.splix.capture

import org.junit.Assert.*
import org.junit.Test

class CaptureParserTest {
    private val source = "com.phonepe.app"
    private val allowlist = setOf(source)

    @Test fun parsesOutgoingAmountAndFingerprintWithoutReturningRawText() {
        val result = CaptureParser.parse(source, allowlist, "Payment successful", "Paid ₹1,234.50 to Cafe UPI Ref No 123456789012", 100L)
        assertNotNull(result)
        assertEquals(123450L, result!!.amountPaise)
        assertEquals("Cafe", result.payeeLabel)
        assertNotNull(result.referenceFingerprint)
        assertFalse(result.toString().contains("123456789012"))
    }

    @Test fun ignoresUnselectedIncomingFailedAndPendingNotifications() {
        assertNull(CaptureParser.parse("unselected.app", allowlist, "Paid", "Paid ₹10 to Shop", 1L))
        assertNull(CaptureParser.parse(source, allowlist, "Money received", "Received ₹10", 1L))
        assertNull(CaptureParser.parse(source, allowlist, "Payment failed", "Failed, debited ₹10", 1L))
        assertNull(CaptureParser.parse(source, allowlist, "Payment pending", "Pending ₹10", 1L))
    }

    @Test fun rejectsMultipleAmountsMalformedCurrencyAndOverflow() {
        assertNull(CaptureParser.parse(source, allowlist, "Paid ₹10", "Balance ₹1000 to Shop", 1L))
        assertNull(CaptureParser.parse(source, allowlist, "Paid ₹1,00,000", "to Shop", 1L))
        assertNull(CaptureParser.parse(source, allowlist, "Paid ₹99999999999999999999", "to Shop", 1L))
    }
}
