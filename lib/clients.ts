import "server-only";

import {
  getDevelopmentWorkspaces,
  type Workspace,
  type WorkspaceDataSource,
  type WorkspaceStatus,
  type WorkspaceSummary,
} from "./tenant-repository.ts";
import { getWorkspaceCacheKey } from "./workspace-id.ts";

export type ClientId = string;
export type ClientStatus = WorkspaceStatus;
export type ClientDataSource = WorkspaceDataSource;
export type ClientWorkspace = Workspace;
export type ClientSummary = WorkspaceSummary;

export const getClientCacheKey = getWorkspaceCacheKey;

/** Development-fixture compatibility only. Runtime authorization uses tenant-repository.ts. */
export function getClients(environment: NodeJS.ProcessEnv = process.env) {
  return getDevelopmentWorkspaces(environment);
}

export function getClientById(clientId: string, environment: NodeJS.ProcessEnv = process.env) {
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
  return requireClientById("demo", environment);
}

export function getClientSummaries(environment: NodeJS.ProcessEnv = process.env) {
  return getClients(environment).map(({ id, name, status }) => ({ id, name, status }));
}

export function createClientEnvironment(
  client: ClientWorkspace,
  environment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const hasGa4Property = Boolean(client.ga4PropertyId);
  const hasSearchConsoleProperty = Boolean(client.searchConsolePropertyUrl);
  return {
    ...environment,
    GOOGLE_ADS_DATA_SOURCE: client.dataSource,
    GOOGLE_ADS_CUSTOMER_ID: client.googleAdsCustomerId,
    GOOGLE_ADS_LOGIN_CUSTOMER_ID: client.googleAdsLoginCustomerId,
    GA4_PROPERTY_ID: client.ga4PropertyId,
    GA4_CLIENT_EMAIL: hasGa4Property ? environment.GA4_CLIENT_EMAIL : undefined,
    GA4_PRIVATE_KEY: hasGa4Property ? environment.GA4_PRIVATE_KEY : undefined,
    SEARCH_CONSOLE_PROPERTY_URL: client.searchConsolePropertyUrl,
    SEARCH_CONSOLE_CLIENT_EMAIL: hasSearchConsoleProperty
      ? environment.SEARCH_CONSOLE_CLIENT_EMAIL
      : undefined,
    SEARCH_CONSOLE_PRIVATE_KEY: hasSearchConsoleProperty
      ? environment.SEARCH_CONSOLE_PRIVATE_KEY
      : undefined,
  };
}
