package com.splix.capture

import org.junit.Assert.*
import org.junit.Test

class BankSmsParserTest {
    private val source = "any.phone.messages"
    private val selected = setOf(source)
    private fun parse(text: String, sender: String = "AD-HDFCBK") = BankSmsParser.parse(source, selected, sender, text, 100L)

    @Test fun debitAlertMayAlsoDescribeRecipientCredit() {
        val result = parse("Your a/c no. XXXXXXX is debited for Rs.1.00 on 24-10-2026 and credited to a/c no. XXXXXX (UPI Ref no 436200001234)")!!
        assertEquals(100L, result.amountPaise)
        assertEquals(CaptureParser.sha256("436200001234"), result.referenceFingerprint)
        assertNull(parse("Your a/c no. XXXXXXX is credited for Rs.1.00 on 24-10-2026 and debited from a/c no. XXXXXX (UPI Ref no 436200001234)"))
        assertNull(parse("Received Rs.1.00 in your account from sender a/c debited via UPI Ref 436200001234"))
        assertEquals(100L, parse("Sent Rs.1.00 from A/CXX1234 via UPI to beneficiary account credited (UPI Ref 436200001234)")!!.amountPaise)
    }

    @Test fun detectsDebitAndIgnoresAvailableBalanceWithoutRetainingSms() {
        val result = parse("A/c XX1234 debited by Rs.450.00 via UPI. Ref No 123456789012. Avl Bal Rs.9,550.00")!!
        assertEquals(45000L, result.amountPaise)
        assertEquals(CaptureParser.sha256("123456789012"), result.referenceFingerprint)
        assertNull(result.payeeLabel)
        assertFalse(result.toString().contains("XX1234"))
        assertFalse(result.toString().contains("123456789012"))
    }

    @Test fun acceptsSenderTagsAndDifferentCurrenciesAndIndianGrouping() {
        assertEquals(10000000L, parse("Your account debited INR 1,00,000.00 through UPI ref 123456789012", "VM-ICICIB-S")!!.amountPaise)
        assertEquals(123450L, parse("A/c debited ₹1,234.50 UPI Ref 123456789012", "SBIINB")!!.amountPaise)
        assertEquals(1000L, parse("Rs 10 debited from acct via VPA UTR 123456789012", "AX-AXISBK")!!.amountPaise)
        assertEquals(45000L, parse("Sent Rs.450.00 from A/CXX1234 using UPI Ref 123456789012", "VM-HDFCBK-S")!!.amountPaise)
    }

    @Test fun rejectsOtpIncomingFailureCollectAndPersonalChat() {
        for (text in listOf(
            "OTP 123456 for UPI payment Rs.450 debited from account",
            "One-time password for UPI account debited Rs.450",
            "UPI payment failed. Account debited Rs.450 will be reversed",
            "A/c credited Rs.450 via UPI",
            "A/c debited Rs.450 UPI collect request",
            "A/c debited Rs.450 UPI payment pending",
            "A/c debited Rs.450 UPI refund",
            "I paid Rs.450 via UPI for dinner",
        )) assertNull(text, parse(text))
        assertNull(parse("A/c debited Rs.450 UPI", "+919999999999"))
        assertNull(parse("A/c debited Rs.450 UPI", "Alex"))
    }

    @Test fun requiresSelectedSourceUpiMarkerAndUnambiguousPositiveAmount() {
        assertNull(BankSmsParser.parse(source, emptySet(), "AD-HDFCBK", "A/c debited Rs.450 UPI", 1))
        for (text in listOf("A/c debited Rs.450 card", "A/c debited Rs.450 and Rs.500 UPI", "A/c debited Rs.0 UPI", "A/c debited Rs.1,2,34 UPI", "A/c debited Rs.99999999999999999999 UPI")) assertNull(text, parse(text))
    }
}
