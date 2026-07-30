import { useEffect, useState } from "react"

// Theme is toggled by ThemeProvider adding/removing a "dark" class on <html>
// (see src/components/theme-provider.tsx) — mirror that here so chart colors
// (plain hex, not Tailwind classes) stay in sync with the rest of the UI.
export function useIsDarkMode(): boolean {
  const [isDark, setIsDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  )

  useEffect(() => {
    const root = document.documentElement
    const observer = new MutationObserver(() => setIsDark(root.classList.contains("dark")))
    observer.observe(root, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [])

  return isDark
}
