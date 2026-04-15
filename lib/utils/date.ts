/**
 * Get the first day of the next month (handles December → January)
 */
export function getNextMonthStart(mesic: string): string {
  const [y, m] = mesic.split("-").map(Number) as [number, number]
  const nextMonth = m === 12 ? 1 : m + 1
  const nextYear = m === 12 ? y + 1 : y
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`
}
