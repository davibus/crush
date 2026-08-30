export type GoogleAdsMetrics = {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  conversionValue: number;
};

export type CalculatedGoogleAdsMetrics = {
  spend: number;
  clicks: number;
  impressions: number;
  ctr: number;
  cpc: number;
  conversions: number;
  conversionRate: number;
  cpa: number;
  conversionValue: number;
  roas: number;
};

export const GOOGLE_ADS_METRIC_KEYS = [
  "spend",
  "impressions",
  "clicks",
  "ctr",
  "cpc",
  "conversions",
  "conversionRate",
  "cpa",
  "conversionValue",
  "roas",
] as const;

export type GoogleAdsMetricKey = (typeof GOOGLE_ADS_METRIC_KEYS)[number];
export type GoogleAdsMetricUnit = "currency" | "percent" | "count" | "ratio";
export type GoogleAdsCalculationInput = Omit<
  GoogleAdsMetrics,
  "conversionValue"
> & {
  conversionValue?: number | null;
};

export type GoogleAdsMetricCalculation = {
  metric: GoogleAdsMetricKey;
  label: string;
  formula: string;
  inputs: Array<{
    key: keyof GoogleAdsCalculationInput;
    label: string;
    value: number;
    unit: GoogleAdsMetricUnit;
  }>;
  unit: GoogleAdsMetricUnit;
} & (
  | { status: "calculated"; value: number }
  | { status: "insufficient_data"; reason: string }
);

export type GoogleAdsCampaign = {
  id: string;
  name: string;
  status: "ENABLED" | "PAUSED";
  channel: "SEARCH" | "PERFORMANCE_MAX";
  dailyBudget: number;
  metrics: GoogleAdsMetrics;
};

export type GoogleAdsAccount = {
  id: string;
  name: string;
  currency: string;
};

export type GoogleAdsSampleData = {
  account: GoogleAdsAccount;
  campaigns: GoogleAdsCampaign[];
};

export type GoogleAdsDimensionMetrics = GoogleAdsMetrics & {
  id: string;
  campaignId: string;
  campaignName: string;
};

export type GoogleAdsGeography = GoogleAdsDimensionMetrics & {
  location: string;
};

export type GoogleAdsDailyMetric = GoogleAdsMetrics & {
  date: string;
};

export type GoogleAdsKeyword = GoogleAdsDimensionMetrics & {
  adGroup: string;
  keyword: string;
  matchType: "EXACT" | "PHRASE" | "BROAD";
  status: "ENABLED" | "PAUSED";
};

export type GoogleAdsSearchTerm = GoogleAdsDimensionMetrics & {
  adGroup: string;
  searchTerm: string;
  matchedKeyword: string;
  matchType: "EXACT" | "PHRASE" | "BROAD";
};

export type GoogleAdsDevice = GoogleAdsDimensionMetrics & {
  device: string;
};

export type GoogleAdsLandingPage = GoogleAdsDimensionMetrics & {
  finalUrl: string;
};

export type GoogleAdsConversion = {
  id: string;
  campaignId: string;
  campaignName: string;
  conversionAction: string;
  conversions: number;
  conversionValue: number;
};

const METRIC_DEFINITIONS: Record<
  GoogleAdsMetricKey,
  {
    label: string;
    formula: string;
    unit: GoogleAdsMetricUnit;
    inputs: Array<keyof GoogleAdsCalculationInput>;
    denominator?: keyof GoogleAdsCalculationInput;
  }
> = {
  spend: {
    label: "Spend",
    formula: "cost",
    unit: "currency",
    inputs: ["cost"],
  },
  impressions: {
    label: "Impressions",
    formula: "impressions",
    unit: "count",
    inputs: ["impressions"],
  },
  clicks: {
    label: "Clicks",
    formula: "clicks",
    unit: "count",
    inputs: ["clicks"],
  },
  ctr: {
    label: "CTR",
    formula: "clicks / impressions × 100",
    unit: "percent",
    inputs: ["clicks", "impressions"],
    denominator: "impressions",
  },
  cpc: {
    label: "CPC",
    formula: "spend / clicks",
    unit: "currency",
    inputs: ["cost", "clicks"],
    denominator: "clicks",
  },
  conversions: {
    label: "Conversions",
    formula: "conversions",
    unit: "count",
    inputs: ["conversions"],
  },
  conversionRate: {
    label: "Conversion rate",
    formula: "conversions / clicks × 100",
    unit: "percent",
    inputs: ["conversions", "clicks"],
    denominator: "clicks",
  },
  cpa: {
    label: "CPA",
    formula: "spend / conversions",
    unit: "currency",
    inputs: ["cost", "conversions"],
    denominator: "conversions",
  },
  conversionValue: {
    label: "Conversion value",
    formula: "conversion value",
    unit: "currency",
    inputs: ["conversionValue"],
  },
  roas: {
    label: "ROAS",
    formula: "conversion value / spend",
    unit: "ratio",
    inputs: ["conversionValue", "cost"],
    denominator: "cost",
  },
};

const INPUT_LABELS: Record<keyof GoogleAdsCalculationInput, string> = {
  impressions: "Impressions",
  clicks: "Clicks",
  cost: "Spend",
  conversions: "Conversions",
  conversionValue: "Conversion value",
};

function inputUnit(
  key: keyof GoogleAdsCalculationInput,
): GoogleAdsMetricUnit {
  return key === "cost" || key === "conversionValue" ? "currency" : "count";
}

export function calculateGoogleAdsMetric(
  metrics: GoogleAdsCalculationInput,
  metric: GoogleAdsMetricKey,
): GoogleAdsMetricCalculation {
  const definition = METRIC_DEFINITIONS[metric];
  const missingInput = definition.inputs.find(
    (key) => !Number.isFinite(metrics[key]),
  );
  const inputs: GoogleAdsMetricCalculation["inputs"] = [];
  for (const key of definition.inputs) {
    const value = metrics[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      inputs.push({ key, label: INPUT_LABELS[key], value, unit: inputUnit(key) });
    }
  }
  const base = {
    metric,
    label: definition.label,
    formula: definition.formula,
    inputs,
    unit: definition.unit,
  };

  if (missingInput) {
    return {
      ...base,
      status: "insufficient_data",
      reason: `${INPUT_LABELS[missingInput]} is not available.`,
    };
  }

  if (definition.denominator && metrics[definition.denominator] === 0) {
    return {
      ...base,
      status: "insufficient_data",
      reason: `${INPUT_LABELS[definition.denominator]} is zero, so ${definition.label} is undefined.`,
    };
  }

  const value = (() => {
    switch (metric) {
      case "spend":
        return metrics.cost;
      case "impressions":
        return metrics.impressions;
      case "clicks":
        return metrics.clicks;
      case "ctr":
        return (metrics.clicks / metrics.impressions) * 100;
      case "cpc":
        return metrics.cost / metrics.clicks;
      case "conversions":
        return metrics.conversions;
      case "conversionRate":
        return (metrics.conversions / metrics.clicks) * 100;
      case "cpa":
        return metrics.cost / metrics.conversions;
      case "conversionValue":
        return metrics.conversionValue as number;
      case "roas":
        return (metrics.conversionValue as number) / metrics.cost;
    }
  })();

  if (!Number.isFinite(value)) {
    return {
      ...base,
      status: "insufficient_data",
      reason: `${definition.label} could not be calculated from the available values.`,
    };
  }

  return { ...base, status: "calculated", value };
}

export function getCtr(metrics: GoogleAdsMetrics) {
  const result = calculateGoogleAdsMetric(metrics, "ctr");
  return result.status === "calculated" ? result.value : 0;
}

export function getCpc(metrics: GoogleAdsMetrics) {
  const result = calculateGoogleAdsMetric(metrics, "cpc");
  return result.status === "calculated" ? result.value : 0;
}

export function getConversionRate(metrics: GoogleAdsMetrics) {
  const result = calculateGoogleAdsMetric(metrics, "conversionRate");
  return result.status === "calculated" ? result.value : 0;
}

export function getCpa(metrics: GoogleAdsMetrics) {
  const result = calculateGoogleAdsMetric(metrics, "cpa");
  return result.status === "calculated" ? result.value : 0;
}

export function getRoas(metrics: GoogleAdsMetrics) {
  const result = calculateGoogleAdsMetric(metrics, "roas");
  return result.status === "calculated" ? result.value : 0;
}

export function calculateGoogleAdsMetrics(
  metrics: GoogleAdsMetrics,
): CalculatedGoogleAdsMetrics {
  return {
    spend: metrics.cost,
    clicks: metrics.clicks,
    impressions: metrics.impressions,
    ctr: getCtr(metrics),
    cpc: getCpc(metrics),
    conversions: metrics.conversions,
    conversionRate: getConversionRate(metrics),
    cpa: getCpa(metrics),
    conversionValue: metrics.conversionValue,
    roas: getRoas(metrics),
  };
}

export function aggregateGoogleAdsMetrics(
  metrics: readonly GoogleAdsMetrics[],
): CalculatedGoogleAdsMetrics {
  const totals = metrics.reduce<GoogleAdsMetrics>(
    (total, current) => ({
      impressions: total.impressions + current.impressions,
      clicks: total.clicks + current.clicks,
      cost: total.cost + current.cost,
      conversions: total.conversions + current.conversions,
      conversionValue: total.conversionValue + current.conversionValue,
    }),
    {
      impressions: 0,
      clicks: 0,
      cost: 0,
      conversions: 0,
      conversionValue: 0,
    },
  );

  return calculateGoogleAdsMetrics(totals);
}
