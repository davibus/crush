import "server-only";

export const CLIENT_IDS = ["demo", "client-a", "client-b"] as const;

export type ClientId = (typeof CLIENT_IDS)[number];
export type ClientStatus = "active" | "configuration_required";
export type ClientDataSource = "sample" | "live";

export type ClientWorkspace = {
  id: ClientId;
  name: string;
  status: ClientStatus;
  dataSource: ClientDataSource;
  googleAdsCustomerId?: string;
  googleAdsLoginCustomerId?: string;
  ga4PropertyId?: string;
};

export type ClientSummary = Pick<ClientWorkspace, "id" | "name" | "status">;

export function getClientCacheKey(
  clientId: string,
  source: "google-ads" | "ga4",
  identity: readonly string[],
): string {
  const client = requireClientById(clientId);
  return ["client", client.id, source, ...identity].join(":");
}

function value(environment: NodeJS.ProcessEnv, name: string): string | undefined {
  return environment[name]?.trim() || undefined;
}

function dataSource(value: string | undefined, fallback: ClientDataSource): ClientDataSource {
  const normalized = value?.trim().toLowerCase();
  return normalized === "sample" || normalized === "live" ? normalized : fallback;
}

function configuredClient(
  id: "client-a" | "client-b",
  prefix: "CLIENT_A" | "CLIENT_B",
  placeholderName: string,
  environment: NodeJS.ProcessEnv,
): ClientWorkspace {
  const selectedSource = dataSource(value(environment, `${prefix}_DATA_SOURCE`), "live");
  const googleAdsCustomerId = value(environment, `${prefix}_GOOGLE_ADS_CUSTOMER_ID`);
  const googleAdsLoginCustomerId = value(environment, `${prefix}_GOOGLE_ADS_LOGIN_CUSTOMER_ID`);
  const ga4PropertyId = value(environment, `${prefix}_GA4_PROPERTY_ID`);
  return Object.freeze({
    id,
    name: value(environment, `${prefix}_NAME`) ?? placeholderName,
    status: selectedSource === "sample" || googleAdsCustomerId || ga4PropertyId
      ? "active"
      : "configuration_required",
    dataSource: selectedSource,
    ...(googleAdsCustomerId ? { googleAdsCustomerId } : {}),
    ...(googleAdsLoginCustomerId ? { googleAdsLoginCustomerId } : {}),
    ...(ga4PropertyId ? { ga4PropertyId } : {}),
  });
}

export function getClients(environment: NodeJS.ProcessEnv = process.env): readonly ClientWorkspace[] {
  const demoSource = dataSource(
    value(environment, "DEMO_DATA_SOURCE") ?? value(environment, "GOOGLE_ADS_DATA_SOURCE"),
    "sample",
  );
  const demoCustomerId = value(environment, "DEMO_GOOGLE_ADS_CUSTOMER_ID") ??
    value(environment, "GOOGLE_ADS_CUSTOMER_ID");
  const demoLoginCustomerId = value(environment, "DEMO_GOOGLE_ADS_LOGIN_CUSTOMER_ID") ??
    value(environment, "GOOGLE_ADS_LOGIN_CUSTOMER_ID");
  const demoGa4PropertyId = value(environment, "DEMO_GA4_PROPERTY_ID") ??
    value(environment, "GA4_PROPERTY_ID");

  return Object.freeze([
    Object.freeze({
      id: "demo",
      name: value(environment, "DEMO_CLIENT_NAME") ?? "Crush Demo Workspace",
      status: "active",
      dataSource: demoSource,
      ...(demoCustomerId ? { googleAdsCustomerId: demoCustomerId } : {}),
      ...(demoLoginCustomerId ? { googleAdsLoginCustomerId: demoLoginCustomerId } : {}),
      ...(demoGa4PropertyId ? { ga4PropertyId: demoGa4PropertyId } : {}),
    }),
    configuredClient("client-a", "CLIENT_A", "Client A Workspace", environment),
    configuredClient("client-b", "CLIENT_B", "Client B Workspace", environment),
  ]);
}

export function getClientById(
  clientId: string,
  environment: NodeJS.ProcessEnv = process.env,
): ClientWorkspace | undefined {
  return getClients(environment).find((client) => client.id === clientId);
}

export function requireClientById(
  clientId: string,
  environment: NodeJS.ProcessEnv = process.env,
): ClientWorkspace {
  const client = getClientById(clientId, environment);
  if (!client) throw new Error(`Unknown client workspace: ${clientId}`);
  return client;
}

export function getDefaultClient(environment: NodeJS.ProcessEnv = process.env): ClientWorkspace {
  return getClientById("demo", environment) as ClientWorkspace;
}

export function getClientSummaries(
  environment: NodeJS.ProcessEnv = process.env,
): readonly ClientSummary[] {
  return getClients(environment).map(({ id, name, status }) => ({ id, name, status }));
}

export function createClientEnvironment(
  client: ClientWorkspace,
  environment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const hasGa4Property = Boolean(client.ga4PropertyId);
  return {
    ...environment,
    GOOGLE_ADS_DATA_SOURCE: client.dataSource,
    GOOGLE_ADS_CUSTOMER_ID: client.googleAdsCustomerId,
    GOOGLE_ADS_LOGIN_CUSTOMER_ID: client.googleAdsLoginCustomerId,
    GA4_PROPERTY_ID: client.ga4PropertyId,
    GA4_CLIENT_EMAIL: hasGa4Property ? environment.GA4_CLIENT_EMAIL : undefined,
    GA4_PRIVATE_KEY: hasGa4Property ? environment.GA4_PRIVATE_KEY : undefined,
  };
}
