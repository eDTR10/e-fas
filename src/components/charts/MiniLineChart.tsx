import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts"
import { useIsDarkMode } from "@/lib/useIsDarkMode"
import { compactNumber } from "@/lib/formatters"

// Categorical slots 1-3 from the validated reference palette (blue / orange / aqua).
const SERIES_COLORS = {
  light: ["#2a78d6", "#eb6834", "#1baf7a"],
  dark: ["#3987e5", "#d95926", "#199e70"],
}

const CHROME = {
  light: { grid: "#e1e0d9", axis: "#898781", text: "#52514e", surface: "#fcfcfb" },
  dark: { grid: "#2c2c2a", axis: "#898781", text: "#c3c2b7", surface: "#1a1a19" },
}

export interface MiniLineSeries {
  key: string
  name: string
}

export function MiniLineChart({
  data,
  xKey,
  series,
  height = 200,
  valueFormatter,
}: {
  data: Record<string, string | number>[]
  xKey: string
  series: MiniLineSeries[]
  height?: number
  valueFormatter?: (v: number) => string
}) {
  const isDark = useIsDarkMode()
  const palette = isDark ? SERIES_COLORS.dark : SERIES_COLORS.light
  const chrome = isDark ? CHROME.dark : CHROME.light
  const fmt = valueFormatter || compactNumber

  if (data.length < 2) {
    return (
      <div className="h-[120px] flex items-center justify-center text-xs text-muted-foreground border border-dashed border-border rounded-lg">
        Not enough data points to chart.
      </div>
    )
  }

  // Callers like the RAOD/Received SARO breakdowns repeat the same object
  // code across several rows. Recharts resolves hover/tooltip lookups by
  // matching the XAxis category's label text, so duplicate labels make it
  // show the FIRST row sharing that label instead of the one under the
  // cursor. Plotting against the row's index (guaranteed unique) instead of
  // the raw label — while still displaying the original label on the axis
  // and in the tooltip — sidesteps that collision entirely.
  const indexedData = data.map((d, i) => ({ ...d, __idx: i }))
  const labelAt = (i: number) => String(data[Number(i)]?.[xKey] ?? "")

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={indexedData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={chrome.grid} strokeDasharray="3 3" />
        <XAxis
          dataKey="__idx"
          tickFormatter={labelAt}
          tick={{ fontSize: 11, fill: chrome.text }}
          tickLine={false}
          axisLine={{ stroke: chrome.grid }}
        />
        <YAxis
          tick={{ fontSize: 11, fill: chrome.text }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => fmt(Number(v))}
          width={48}
        />
        <Tooltip
          contentStyle={{
            background: chrome.surface,
            border: `1px solid ${chrome.grid}`,
            borderRadius: 8,
            fontSize: 12,
          }}
          labelStyle={{ color: chrome.text, fontWeight: 600 }}
          labelFormatter={(label) => labelAt(Number(label))}
          formatter={(value, name) => [fmt(Number(value)), String(name)]}
        />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {series.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stroke={palette[i % palette.length]}
            strokeWidth={2}
            dot={{ r: 4, strokeWidth: 0, fill: palette[i % palette.length] }}
            activeDot={{ r: 6 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
