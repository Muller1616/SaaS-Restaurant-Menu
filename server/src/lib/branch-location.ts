/** Compose street + city + region + country for display. */
export function formatBranchLocation(branch: {
  location: string;
  city?: string | null;
  region?: string | null;
  country?: string | null;
}) {
  return [branch.location, branch.city, branch.region, branch.country]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(", ");
}
