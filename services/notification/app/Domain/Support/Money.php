<?php

declare(strict_types=1);

namespace App\Domain\Support;

class Money
{
    /**
     * Format minor units into currency string without float arithmetic.
     *
     * Rules per §15 U-03:
     * - 0 -> "₹0.00"
     * - 5 -> "₹0.05"
     * - 100000 -> "₹1,000.00"
     * - 99999 -> "₹999.99"
     * - No float math
     * - Non-INR prints code (e.g., "10.00 USD")
     */
    public static function format(int $amountMinor, string $currency = 'INR'): string
    {
        $isNegative = $amountMinor < 0;
        $absAmount = abs($amountMinor);

        $major = intdiv($absAmount, 100);
        $minor = $absAmount % 100;

        $majorStr = (string) $major;
        $minorStr = str_pad((string) $minor, 2, '0', STR_PAD_LEFT);

        // Format major with commas
        // For INR: Indian numbering system (e.g. 1,00,000) or standard 3-digit comma
        // The spec specifies: 100000 -> "₹1,000.00"
        $formattedMajor = number_format($major, 0, '', ',');

        $formatted = $formattedMajor.'.'.$minorStr;
        if ($isNegative) {
            $formatted = '-'.$formatted;
        }

        $upperCurrency = strtoupper(trim($currency));
        if ($upperCurrency === 'INR') {
            return '₹'.$formatted;
        }

        return $formatted.' '.$upperCurrency;
    }
}
