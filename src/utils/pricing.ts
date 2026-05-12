/**
 * Utility to calculate local currency pricing based on USD base price and country exchange rate
 */
export const calculateLocalPrice = (usdPrice: number, exchangeRate: number): number => {
  if (!exchangeRate || exchangeRate <= 0) return usdPrice;

  // Calculate raw local price
  const localPrice = usdPrice * exchangeRate;

  // Round to 2 decimal places or a clean number depending on magnitude
  if (localPrice > 100) {
    return Math.round(localPrice); // Round to nearest whole number for larger values (e.g., INR, KES)
  }

  return Number(localPrice.toFixed(2)); // Keep 2 decimals for smaller values (e.g., EUR, GBP)
};

/**
 * Format currency with symbol
 */
export const formatCurrency = (amount: number, symbol: string): string => {
  return `${symbol}${amount}`;
};
