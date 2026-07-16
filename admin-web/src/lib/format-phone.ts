/**
 * Format phone number - removes +960/960 prefix and formats as local number
 */
export function formatPhone(phone: string | number | null | undefined): string {
  if (!phone) return ""
  let str = String(phone)
  // Remove +960 or 960 prefix
  str = str.replace(/^\+?960/, "")
  // Remove any remaining + or spaces
  str = str.replace(/[\s+]/g, "")
  // Format as 7-digit local number with space
  if (str.length === 7) return `${str.slice(0, 3)} ${str.slice(3)}`
  return str
}
