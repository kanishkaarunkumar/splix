package com.splix.capture

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CaptureParserMetricsTest {
    private val candidateSources = setOf("com.phonepe.app", "net.one97.paytm", "com.google.android.apps.nbu.paisa.user")
    @Test fun reportsSyntheticFixturePrecisionAndRecall() {
        val stream = javaClass.getResourceAsStream("/capture-parser-fixtures.tsv")
            ?: error("Sanitized parser fixtures are missing")
        val cases = stream.bufferedReader().useLines { lines ->
            lines.filter { it.isNotBlank() && !it.startsWith("#") }.map { it.split('|') }.toList()
        }
        var truePositive = 0
        var falsePositive = 0
        var falseNegative = 0
        cases.forEach { row ->
            require(row.size == 4) { "Fixture must have label, source, title, and body" }
            val expected = row[0] == "1"
            val predicted = CaptureParser.parse(row[1], candidateSources, row[2], row[3], 1L) != null
            if (expected && predicted) truePositive++
            if (!expected && predicted) falsePositive++
            if (expected && !predicted) falseNegative++
        }
        val precision = truePositive.toDouble() / (truePositive + falsePositive)
        val recall = truePositive.toDouble() / (truePositive + falseNegative)
        println("synthetic fixtures=${cases.size} TP=$truePositive FP=$falsePositive FN=$falseNegative precision=$precision recall=$recall")
        assertTrue("Fixtures need positive and negative examples", cases.any { it[0] == "1" } && cases.any { it[0] == "0" })
        assertEquals(1.0, precision, 0.0)
        assertEquals(1.0, recall, 0.0)
    }
}
