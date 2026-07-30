// A stateless "pick to fill" dropdown — always resets to its placeholder
// after firing, so it never has to stay in sync with whatever the user
// types afterward in the (always-editable) manual field(s) it fills.
export function QuickFillSelect<T>({
  placeholder, items, getLabel, onPick,
}: {
  placeholder: string;
  items: T[];
  getLabel: (item: T) => string;
  onPick: (item: T) => void;
}) {
  return (
    <select
      value=""
      onChange={(e) => {
        const idx = Number(e.target.value);
        if (!Number.isNaN(idx) && items[idx]) onPick(items[idx]);
        e.target.value = "";
      }}
      className="w-full rounded-md border border-dashed border-input bg-background px-2 py-1.5 text-xs text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition mb-1.5"
    >
      <option value="">{placeholder}</option>
      {items.map((item, i) => <option key={i} value={i}>{getLabel(item)}</option>)}
    </select>
  );
}
