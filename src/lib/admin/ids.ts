const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Route ids are checked before querying, so a bad URL is a 404 rather than a database error. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
