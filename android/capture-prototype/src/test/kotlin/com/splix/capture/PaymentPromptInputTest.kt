package com.splix.capture

import org.junit.Assert.*
import org.junit.Test

class PaymentPromptInputTest {
    @Test fun keepsUserDescriptionAndNormalizesKeyboardWhitespace() {
        assertEquals("Dinner and drinks 🍜", PaymentPromptInput.title("  Dinner\nand\t drinks 🍜  "))
        assertEquals("Groceries ₹500", PaymentPromptInput.title("Groceries ₹500"))
    }

    @Test fun rejectsBlankAndOverlongRepliesWithoutSilentlyTruncating() {
        assertNull(PaymentPromptInput.title(null))
        assertNull(PaymentPromptInput.title(" \n\t "))
        assertEquals("x".repeat(120), PaymentPromptInput.title("x".repeat(120)))
        assertNull(PaymentPromptInput.title("x".repeat(121)))
    }
}
