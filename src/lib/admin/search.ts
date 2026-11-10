/**
 * Turn a free-text admin search into safe PostgREST `ilike` terms.
 * Only characters that can't break a filter expression are kept.
 */
export function searchTerms(raw: string) {
  const text = raw
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}@.\s'_-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("64") && digits.length > 8) digits = `0${digits.slice(2)}`;
  const registration = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return { text, digits, registration };
}

/**
 * `or` filter for name / email / phone / registration columns.
 * Returns null when nothing searchable is left.
 */
export function searchFilter(
  raw: string,
  columns: { name: string; email: string; phone: string; registration: string },
) {
  const { text, digits, registration } = searchTerms(raw);
  const filters: string[] = [];
  if (text) {
    filters.push(`${columns.name}.ilike.*${text}*`);
    filters.push(`${columns.email}.ilike.*${text.toLowerCase()}*`);
  }
  if (digits.length >= 3) filters.push(`${columns.phone}.ilike.*${digits}*`);
  if (registration.length >= 2) filters.push(`${columns.registration}.ilike.*${registration}*`);
  return filters.length ? filters.join(",") : null;
}
