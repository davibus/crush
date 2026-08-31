export type GA4Metrics = {
  sessions: number;
  totalUsers: number;
  activeUsers: number;
  keyEvents: number;
  engagedSessions: number;
  engagementRate: number;
};

export type GA4KeyEvent = {
  eventName: string;
  keyEvents: number;
  totalUsers: number;
};

export type GA4LandingPage = GA4Metrics & {
  landingPage: string;
  source: string;
  medium: string;
  channelGroup: string;
};

export type GA4TrafficSource = GA4Metrics & {
  source: string;
  medium: string;
  sourceMedium: string;
  campaignName: string;
  googleAdsCampaignId?: string;
  channelGroup: string;
};

export type GA4GoogleAdsCampaign = GA4Metrics & {
  campaignId: string;
  campaignName: string;
};

export type GA4Data = {
  propertyId: string;
  dateRange: {
    startDate: string;
    endDate: string;
  };
  summary: GA4Metrics;
  keyEvents: GA4KeyEvent[];
  landingPages: GA4LandingPage[];
  trafficSources: GA4TrafficSource[];
  googleAdsCampaigns: GA4GoogleAdsCampaign[];
};

export type GA4DataState =
  | { status: "unconfigured" }
  | { status: "available"; data: GA4Data }
  | { status: "error"; message: string };
