package com.paymentgate.cashier.ui

/** Counter keypad amount — major units, max 2 decimal places. */
object AmountEntry {
    fun apply(current: String, key: String): String {
        return when (key) {
            "del" -> current.dropLast(1)
            "." -> {
                if (current.isEmpty()) "0."
                else if (current.contains('.')) current
                else "$current."
            }
            else -> appendDigit(current, key)
        }
    }

    private fun appendDigit(current: String, digit: String): String {
        if (digit.length != 1 || digit[0] !in '0'..'9') return current
        if (current.contains('.')) {
            val frac = current.substringAfter('.')
            if (frac.length >= 2) return current
            return current + digit
        }
        if (current == "0") return digit
        if (current.length >= 9) return current
        return current + digit
    }
}
