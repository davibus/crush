import type {
  CalculatedGoogleAdsMetrics,
  GoogleAdsMetrics,
} from "@/lib/google-ads";

export type KpiComparison =
  | { status: "unavailable"; label: string }
  | { status: "not-comparable"; label: string }
  | { status: "change"; label: string; percentChange: number };

export type DashboardKpi = {
  id:
    | "spend"
    | "conversion-value"
    | "roas"
    | "conversions"
    | "cpa"
    | "conversion-rate";
  label: string;
  value: number | null;
  formattedValue: string;
  unavailableReason?: string;
  comparison: KpiComparison;
};

type KpiValue = {
  value: number | null;
  unavailableReason?: string;
};

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

const percentFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function hasUsableDashboardData(
  campaignMetrics: readonly GoogleAdsMetrics[],
): boolean {
  return campaignMetrics.length > 0;
}

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function getComparison(
  currentValue: number | null,
  previousValue: number | null | undefined,
  hasComparisonPeriod: boolean,
): KpiComparison {
  if (!hasComparisonPeriod) {
    return { status: "unavailable", label: "No comparison period" };
  }

  if (currentValue === null || previousValue == null) {
    return {
      status: "not-comparable",
      label: "Not comparable to prior period",
    };
  }

  if (previousValue === 0) {
    if (currentValue === 0) {
      return { status: "change", label: "No change vs prior period", percentChange: 0 };
    }

    return {
      status: "not-comparable",
      label: "Not comparable to a zero prior value",
    };
  }

  const percentChange = ((currentValue - previousValue) / previousValue) * 100;
  const direction = percentChange > 0 ? "higher" : "lower";
  const label =
    percentChange === 0
      ? "No change vs prior period"
      : `${percentFormatter.format(Math.abs(percentChange))}% ${direction} vs prior period`;

  return { status: "change", label, percentChange };
}

function getKpiValues(metrics: CalculatedGoogleAdsMetrics) {
  return {
    spend: { value: metrics.spend },
    conversionValue: { value: metrics.conversionValue },
    roas:
      metrics.spend === 0
        ? { value: null, unavailableReason: "No spend in this period" }
        : { value: metrics.roas },
    conversions: { value: metrics.conversions },
    cpa:
      metrics.conversions === 0
        ? { value: null, unavailableReason: "No conversions in this period" }
        : { value: metrics.cpa },
    conversionRate:
      metrics.clicks === 0
        ? { value: null, unavailableReason: "No clicks in this period" }
        : { value: metrics.conversionRate },
  } satisfies Record<string, KpiValue>;
}

export function buildDashboardKpis(
  metrics: CalculatedGoogleAdsMetrics,
  currency: string,
  comparisonMetrics?: CalculatedGoogleAdsMetrics,
): DashboardKpi[] {
  const values = getKpiValues(metrics);
  const comparisonValues = comparisonMetrics
    ? getKpiValues(comparisonMetrics)
    : undefined;
  const hasComparisonPeriod = comparisonMetrics !== undefined;

  return [
    {
      id: "spend",
      label: "Spend",
      ...values.spend,
      formattedValue: formatCurrency(metrics.spend, currency),
      comparison: getComparison(
        values.spend.value,
        comparisonValues?.spend.value,
        hasComparisonPeriod,
      ),
    },
    {
      id: "conversion-value",
      label: "Revenue / conversion value",
      ...values.conversionValue,
      formattedValue: formatCurrency(metrics.conversionValue, currency),
      comparison: getComparison(
        values.conversionValue.value,
        comparisonValues?.conversionValue.value,
        hasComparisonPeriod,
      ),
    },
    {
      id: "roas",
      label: "ROAS",
      ...values.roas,
      formattedValue:
        values.roas.value === null
          ? "—"
          : `${percentFormatter.format(values.roas.value)}x`,
      comparison: getComparison(
        values.roas.value,
        comparisonValues?.roas.value,
        hasComparisonPeriod,
      ),
    },
    {
      id: "conversions",
      label: "Conversions",
      ...values.conversions,
      formattedValue: numberFormatter.format(metrics.conversions),
      comparison: getComparison(
        values.conversions.value,
        comparisonValues?.conversions.value,
        hasComparisonPeriod,
      ),
    },
    {
      id: "cpa",
      label: "CPA",
      ...values.cpa,
      formattedValue:
        values.cpa.value === null
          ? "—"
          : formatCurrency(values.cpa.value, currency),
      comparison: getComparison(
        values.cpa.value,
        comparisonValues?.cpa.value,
        hasComparisonPeriod,
      ),
    },
    {
      id: "conversion-rate",
      label: "Conversion rate",
      ...values.conversionRate,
      formattedValue:
        values.conversionRate.value === null
          ? "—"
          : `${percentFormatter.format(values.conversionRate.value)}%`,
      comparison: getComparison(
        values.conversionRate.value,
        comparisonValues?.conversionRate.value,
        hasComparisonPeriod,
      ),
    },
  ];
}
