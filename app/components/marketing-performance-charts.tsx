"use client";

import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type {
  ComparisonPoint,
  TimeSeriesPoint,
} from "@/lib/chart-data";

type MarketingPerformanceChartsProps = {
  currency: string;
  timeSeries: TimeSeriesPoint[];
  campaigns: ComparisonPoint[];
  geographies: ComparisonPoint[];
  dataSourceLabel?: string;
  dateRangeLabel?: string;
};

type ChartCardProps = {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  hasData?: boolean;
};

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

function ChartCard({
  title,
  description,
  children,
  footer,
  wide = false,
  hasData = true,
}: ChartCardProps) {
  return (
    <article
      className={`rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm shadow-zinc-200/40 ${wide ? "xl:col-span-2" : ""}`}
    >
      <div className="mb-5">
        <h3 className="font-semibold text-zinc-950">{title}</h3>
        <p className="mt-1 text-sm leading-5 text-zinc-500">{description}</p>
      </div>
      {hasData ? (
        <>
          <div className="h-64 min-w-0 w-full sm:h-80">{children}</div>
          {footer ? <div className="mt-5">{footer}</div> : null}
        </>
      ) : (
        <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-5 text-center sm:h-80">
          <div>
            <p className="text-sm font-semibold text-zinc-800">No chart data available</p>
            <p className="mt-1 max-w-sm text-sm leading-6 text-zinc-500">
              This view will populate when the selected source returns data for the reporting window.
            </p>
          </div>
        </div>
      )}
    </article>
  );
}

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCompactCurrency(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatMetricValue(
  value: number | null,
  kind: "currency" | "number" | "roas",
  currency: string,
) {
  if (value === null) return "—";
  if (kind === "currency") return formatCurrency(value, currency);
  if (kind === "roas") return `${numberFormatter.format(value)}x`;
  return numberFormatter.format(value);
}

function TimeSeriesTooltip({
  active,
  payload,
  metric,
  metricLabel,
  currency,
  valueKind,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: TimeSeriesPoint }>;
  metric: keyof Pick<TimeSeriesPoint, "spend" | "conversions" | "cpa" | "roas">;
  metricLabel: string;
  currency: string;
  valueKind: "currency" | "number" | "roas";
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-lg">
      <p className="font-medium text-zinc-900">
        {point.label}, {point.date.slice(0, 4)}
      </p>
      <p className="mt-1 text-zinc-600">
        {metricLabel}: {formatMetricValue(point[metric], valueKind, currency)}
      </p>
    </div>
  );
}

function ComparisonTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: ComparisonPoint }>;
  currency: string;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-lg">
      <p className="font-medium text-zinc-900">{point.name}</p>
      <dl className="mt-2 grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-zinc-600">
        <dt>Spend</dt>
        <dd className="text-right tabular-nums">
          {formatCurrency(point.spend, currency)}
        </dd>
        <dt>Conversion value</dt>
        <dd className="text-right tabular-nums">
          {formatCurrency(point.conversionValue, currency)}
        </dd>
        <dt>Conversions</dt>
        <dd className="text-right tabular-nums">
          {numberFormatter.format(point.conversions)}
        </dd>
        <dt>CPA</dt>
        <dd className="text-right tabular-nums">
          {formatMetricValue(point.cpa, "currency", currency)}
        </dd>
        <dt>ROAS</dt>
        <dd className="text-right tabular-nums">
          {formatMetricValue(point.roas, "roas", currency)}
        </dd>
      </dl>
    </div>
  );
}

function ComparisonSummary({
  points,
  currency,
  label,
}: {
  points: ComparisonPoint[];
  currency: string;
  label: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-xl text-left text-xs">
        <caption className="sr-only">{label} detailed metric comparison</caption>
        <thead className="text-zinc-500">
          <tr>
            <th className="pb-2 font-medium">{label}</th>
            <th className="pb-2 text-right font-medium">Conversions</th>
            <th className="pb-2 text-right font-medium">CPA</th>
            <th className="pb-2 text-right font-medium">ROAS</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr className="border-t border-zinc-100" key={point.id}>
              <th className="py-2 pr-4 font-medium text-zinc-700">
                {point.name}
              </th>
              <td className="py-2 text-right tabular-nums text-zinc-600">
                {numberFormatter.format(point.conversions)}
              </td>
              <td className="py-2 text-right tabular-nums text-zinc-600">
                {formatMetricValue(point.cpa, "currency", currency)}
              </td>
              <td className="py-2 text-right tabular-nums text-zinc-600">
                {formatMetricValue(point.roas, "roas", currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const gridColor = "#e4e4e7";
const axisColor = "#71717a";
const spendColor = "#2563eb";
const conversionColor = "#14b8a6";
const efficiencyColor = "#7c3aed";
const valueColor = "#0f766e";

export default function MarketingPerformanceCharts({
  currency,
  timeSeries,
  campaigns,
  geographies,
  dataSourceLabel = "Google Ads data",
  dateRangeLabel = "Current reporting period",
}: MarketingPerformanceChartsProps) {
  return (
    <section aria-labelledby="performance-charts-heading">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2
            className="text-lg font-semibold text-zinc-950"
            id="performance-charts-heading"
          >
            Marketing performance
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Daily trends and campaign and location comparisons from {dataSourceLabel.toLowerCase()}
          </p>
        </div>
        <p className="text-xs font-medium text-zinc-500">
          {dateRangeLabel}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard
          hasData={timeSeries.length > 0}
          title="Spend over time"
          description="Daily account spend; hover or focus a point for the exact value."
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              accessibilityLayer
              data={timeSeries}
              margin={{ top: 8, right: 8, left: 4, bottom: 0 }}
            >
              <defs>
                <linearGradient id="spend-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={spendColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={spendColor} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" stroke={axisColor} tickLine={false} />
              <YAxis
                stroke={axisColor}
                tickFormatter={(value: number) =>
                  formatCompactCurrency(value, currency)
                }
                tickLine={false}
                width={62}
              />
              <Tooltip
                content={
                  <TimeSeriesTooltip
                    currency={currency}
                    metric="spend"
                    metricLabel="Spend"
                    valueKind="currency"
                  />
                }
              />
              <Area
                dataKey="spend"
                fill="url(#spend-fill)"
                name="Spend"
                stroke={spendColor}
                strokeWidth={3}
                type="monotone"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          hasData={timeSeries.length > 0}
          title="Conversions over time"
          description="Daily conversions show changes in account outcome volume."
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              accessibilityLayer
              data={timeSeries}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" stroke={axisColor} tickLine={false} />
              <YAxis allowDecimals={false} stroke={axisColor} tickLine={false} width={44} />
              <Tooltip
                content={
                  <TimeSeriesTooltip
                    currency={currency}
                    metric="conversions"
                    metricLabel="Conversions"
                    valueKind="number"
                  />
                }
              />
              <Bar
                dataKey="conversions"
                fill={conversionColor}
                name="Conversions"
                radius={[5, 5, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          hasData={timeSeries.length > 0}
          title="CPA over time"
          description="Daily spend divided by conversions; days without conversions show no point."
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              accessibilityLayer
              data={timeSeries}
              margin={{ top: 8, right: 12, left: 4, bottom: 0 }}
            >
              <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" stroke={axisColor} tickLine={false} />
              <YAxis
                domain={[0, "auto"]}
                stroke={axisColor}
                tickFormatter={(value: number) =>
                  formatCompactCurrency(value, currency)
                }
                tickLine={false}
                width={62}
              />
              <Tooltip
                content={
                  <TimeSeriesTooltip
                    currency={currency}
                    metric="cpa"
                    metricLabel="CPA"
                    valueKind="currency"
                  />
                }
              />
              <Line
                activeDot={{ r: 6 }}
                connectNulls={false}
                dataKey="cpa"
                dot={{ r: 3 }}
                name="CPA"
                stroke={efficiencyColor}
                strokeWidth={3}
                type="monotone"
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          hasData={timeSeries.length > 0}
          title="ROAS over time"
          description="Daily conversion value divided by spend; higher values indicate greater return."
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              accessibilityLayer
              data={timeSeries}
              margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
            >
              <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" stroke={axisColor} tickLine={false} />
              <YAxis
                domain={[0, "auto"]}
                stroke={axisColor}
                tickFormatter={(value: number) => `${numberFormatter.format(value)}x`}
                tickLine={false}
                width={48}
              />
              <Tooltip
                content={
                  <TimeSeriesTooltip
                    currency={currency}
                    metric="roas"
                    metricLabel="ROAS"
                    valueKind="roas"
                  />
                }
              />
              <Line
                activeDot={{ r: 6 }}
                connectNulls={false}
                dataKey="roas"
                dot={{ r: 3 }}
                name="ROAS"
                stroke={valueColor}
                strokeWidth={3}
                type="monotone"
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          hasData={campaigns.length > 0}
          wide
          title="Campaign comparison"
          description="Spend and conversion value by campaign, ordered by conversion value; efficiency metrics are shown below and in the tooltip."
          footer={
            <ComparisonSummary
              currency={currency}
              label="Campaign"
              points={campaigns}
            />
          }
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              accessibilityLayer
              data={campaigns}
              layout="vertical"
              margin={{ top: 0, right: 12, left: 8, bottom: 0 }}
            >
              <CartesianGrid stroke={gridColor} strokeDasharray="3 3" horizontal={false} />
              <XAxis
                stroke={axisColor}
                tickFormatter={(value: number) =>
                  formatCompactCurrency(value, currency)
                }
                tickLine={false}
                type="number"
              />
              <YAxis
                dataKey="name"
                stroke={axisColor}
                tickLine={false}
                type="category"
                width={128}
              />
              <Tooltip content={<ComparisonTooltip currency={currency} />} />
              <Legend />
              <Bar dataKey="spend" fill={spendColor} name="Spend" radius={[0, 4, 4, 0]} />
              <Bar
                dataKey="conversionValue"
                fill={conversionColor}
                name="Conversion value"
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          hasData={geographies.length > 0}
          wide
          title="Geographic performance"
          description="Spend and conversion value for the locations represented in the loaded geographic data."
          footer={
            <ComparisonSummary
              currency={currency}
              label="Location"
              points={geographies}
            />
          }
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              accessibilityLayer
              data={geographies}
              layout="vertical"
              margin={{ top: 0, right: 12, left: 8, bottom: 0 }}
            >
              <CartesianGrid stroke={gridColor} strokeDasharray="3 3" horizontal={false} />
              <XAxis
                stroke={axisColor}
                tickFormatter={(value: number) =>
                  formatCompactCurrency(value, currency)
                }
                tickLine={false}
                type="number"
              />
              <YAxis
                dataKey="name"
                stroke={axisColor}
                tickLine={false}
                type="category"
                width={118}
              />
              <Tooltip content={<ComparisonTooltip currency={currency} />} />
              <Legend />
              <Bar dataKey="spend" fill={spendColor} name="Spend" radius={[0, 4, 4, 0]} />
              <Bar
                dataKey="conversionValue"
                fill={conversionColor}
                name="Conversion value"
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </section>
  );
}
