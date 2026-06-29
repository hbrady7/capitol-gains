"use client";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BaselinePoint } from "@/lib/baselines";

/** The "is this actually working?" chart: the LLM portfolio vs SPY vs a dumb
 *  equal-weight version of the same convergence signal. */
export function BaselineChart({ series }: { series: BaselinePoint[] }) {
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--faint)" }} tickLine={false} axisLine={false} />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--faint)" }}
            tickLine={false}
            axisLine={false}
            domain={["auto", "auto"]}
            tickFormatter={(v) => `$${Math.round(v)}`}
          />
          <Tooltip
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              fontSize: 12,
              color: "var(--text)",
            }}
            formatter={(v) => `$${Number(v).toFixed(2)}`}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="llm" name="Claude" stroke="var(--accent)" strokeWidth={2.5} dot={false} />
          <Line type="monotone" dataKey="spy" name="SPY" stroke="var(--sky)" strokeWidth={2} dot={false} />
          <Line
            type="monotone"
            dataKey="naive"
            name="Naive basket"
            stroke="var(--sage)"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
