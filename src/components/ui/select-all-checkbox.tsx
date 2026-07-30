import { useEffect, useRef } from "react"

// A plain checkbox with the native `indeterminate` visual state wired up —
// that property can't be set via a React prop, only imperatively on the DOM
// node, so this is the one place that boilerplate lives instead of being
// copy-pasted into every table's header row.
export function SelectAllCheckbox({
  checked,
  indeterminate,
  onChange,
  ...props
}: {
  checked: boolean
  indeterminate: boolean
  onChange: () => void
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "checked" | "onChange" | "type">) {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate && !checked
  }, [indeterminate, checked])

  return <input ref={ref} type="checkbox" checked={checked} onChange={onChange} {...props} />
}
