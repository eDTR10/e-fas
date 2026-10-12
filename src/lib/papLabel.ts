// PAP filter dropdowns list PAPs by name, but the same program name can be stored
// under more than one PAP code (e.g. a program re-coded between years). Those
// would show up as indistinguishable duplicates, so any name that appears more
// than once gets its code appended.
export function labelPapOptions<T extends { code: string; name: string }>(options: T[]): (T & { label: string })[] {
  const counts = new Map<string, number>();
  options.forEach((o) => counts.set(o.name.trim().toLowerCase(), (counts.get(o.name.trim().toLowerCase()) || 0) + 1));
  return options
    .map((o) => ({ ...o, label: (counts.get(o.name.trim().toLowerCase()) || 0) > 1 ? `${o.name} — ${o.code}` : o.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
