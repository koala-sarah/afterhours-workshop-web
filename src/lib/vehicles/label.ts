/** "Toyota Corolla (2015)", or "Vehicle" when only a registration is known. */
export function vehicleName(v: { make: string | null; model: string | null; year?: number | null }) {
  const name = [v.make, v.model].filter((s) => s && s.trim()).join(" ") || "Vehicle";
  return v.year ? `${name} (${v.year})` : name;
}
