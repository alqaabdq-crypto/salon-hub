// Catalog rows carry paired `<field>En` / `<field>Ar` columns rather than a
// translations table (see README). This resolves the pair for the active locale,
// falling back to English when a translation is missing or empty.
//
// Typing the row as an exact Record of the two keys (rather than a generic R
// constrained to it) keeps the indexed access resolving to `string | null`;
// structural assignability still lets full model rows be passed in.
export function localized<F extends string>(
  row: Record<`${F}En` | `${F}Ar`, string | null>,
  field: F,
  locale: string,
): string {
  const en = row[`${field}En` as `${F}En`];
  const ar = row[`${field}Ar` as `${F}Ar`];
  return (locale === "ar" ? ar || en : en) ?? "";
}
