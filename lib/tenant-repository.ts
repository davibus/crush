import "server-only";

import type { Pool } from "pg";

import { getDatabasePool, hasDatabaseConfiguration } from "./database.ts";

export type WorkspaceStatus = "active" | "configuration_required";
export type WorkspaceDataSource = "sample" | "live";
export type WorkspaceRole = "owner" | "member" | "viewer";

export type Workspace = {
  id: string;
  name: string;
  status: WorkspaceStatus;
  dataSource: WorkspaceDataSource;
  googleAdsCustomerId?: string;
  googleAdsLoginCustomerId?: string;
  ga4PropertyId?: string;
  searchConsolePropertyUrl?: string;
  integrationSecretRef?: string;
};

export type WorkspaceSummary = Pick<Workspace, "id" | "name" | "status">;

export interface TenantRepository {
  findWorkspaceById(workspaceId: string): Promise<Workspace | null>;
  findWorkspaceForUser(userId: string, workspaceId: string): Promise<Workspace | null>;
  listActiveWorkspaces(): Promise<readonly Workspace[]>;
  listWorkspacesForUser(userId: string): Promise<readonly Workspace[]>;
}

type WorkspaceRow = {
  id: string;
  name: string;
  status: WorkspaceStatus;
  data_source: WorkspaceDataSource;
  google_ads_customer_id: string | null;
  google_ads_login_customer_id: string | null;
  ga4_property_id: string | null;
  search_console_property_url: string | null;
  secret_ref: string | null;
};

const WORKSPACE_COLUMNS = `
  w.id,
  w.name,
  w.status,
  COALESCE(gads.config->>'dataSource', 'sample') AS data_source,
  gads.external_account_id AS google_ads_customer_id,
  gads.config->>'loginCustomerId' AS google_ads_login_customer_id,
  ga4.external_account_id AS ga4_property_id,
  search_console.external_account_id AS search_console_property_url,
  COALESCE(gads.secret_ref, ga4.secret_ref, search_console.secret_ref) AS secret_ref
`;

function mapWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    dataSource: row.data_source === "live" ? "live" : "sample",
    ...(row.google_ads_customer_id ? { googleAdsCustomerId: row.google_ads_customer_id } : {}),
    ...(row.google_ads_login_customer_id
      ? { googleAdsLoginCustomerId: row.google_ads_login_customer_id }
      : {}),
    ...(row.ga4_property_id ? { ga4PropertyId: row.ga4_property_id } : {}),
    ...(row.search_console_property_url
      ? { searchConsolePropertyUrl: row.search_console_property_url }
      : {}),
    ...(row.secret_ref ? { integrationSecretRef: row.secret_ref } : {}),
  };
}

export class PostgresTenantRepository implements TenantRepository {
  private readonly pool: Pick<Pool, "query">;

  constructor(pool: Pick<Pool, "query"> = getDatabasePool()) {
    this.pool = pool;
  }

  async findWorkspaceById(workspaceId: string): Promise<Workspace | null> {
    const result = await this.pool.query<WorkspaceRow>(`
      SELECT ${WORKSPACE_COLUMNS}
      FROM workspaces w
      LEFT JOIN workspace_integrations gads
        ON gads.workspace_id = w.id AND gads.provider = 'google_ads'
      LEFT JOIN workspace_integrations ga4
        ON ga4.workspace_id = w.id AND ga4.provider = 'ga4'
      LEFT JOIN workspace_integrations search_console
        ON search_console.workspace_id = w.id AND search_console.provider = 'search_console'
      WHERE w.id = $1
    `, [workspaceId]);
    return result.rows[0] ? mapWorkspace(result.rows[0]) : null;
  }

  async findWorkspaceForUser(userId: string, workspaceId: string): Promise<Workspace | null> {
    if (!/^\d+$/.test(userId)) return null;
    const result = await this.pool.query<WorkspaceRow>(`
      SELECT ${WORKSPACE_COLUMNS}
      FROM workspace_memberships membership
      JOIN workspaces w ON w.id = membership.workspace_id
      LEFT JOIN workspace_integrations gads
        ON gads.workspace_id = w.id AND gads.provider = 'google_ads'
      LEFT JOIN workspace_integrations ga4
        ON ga4.workspace_id = w.id AND ga4.provider = 'ga4'
      LEFT JOIN workspace_integrations search_console
        ON search_console.workspace_id = w.id AND search_console.provider = 'search_console'
      WHERE membership.user_id = $1 AND w.id = $2
    `, [userId, workspaceId]);
    return result.rows[0] ? mapWorkspace(result.rows[0]) : null;
  }

  async listActiveWorkspaces(): Promise<readonly Workspace[]> {
    const result = await this.pool.query<WorkspaceRow>(`
      SELECT ${WORKSPACE_COLUMNS}
      FROM workspaces w
      LEFT JOIN workspace_integrations gads
        ON gads.workspace_id = w.id AND gads.provider = 'google_ads'
      LEFT JOIN workspace_integrations ga4
        ON ga4.workspace_id = w.id AND ga4.provider = 'ga4'
      LEFT JOIN workspace_integrations search_console
        ON search_console.workspace_id = w.id AND search_console.provider = 'search_console'
      WHERE w.status = 'active'
      ORDER BY w.id
    `);
    return result.rows.map(mapWorkspace);
  }

  async listWorkspacesForUser(userId: string): Promise<readonly Workspace[]> {
    if (!/^\d+$/.test(userId)) return [];
    const result = await this.pool.query<WorkspaceRow>(`
      SELECT ${WORKSPACE_COLUMNS}
      FROM workspace_memberships membership
      JOIN workspaces w ON w.id = membership.workspace_id
      LEFT JOIN workspace_integrations gads
        ON gads.workspace_id = w.id AND gads.provider = 'google_ads'
      LEFT JOIN workspace_integrations ga4
        ON ga4.workspace_id = w.id AND ga4.provider = 'ga4'
      LEFT JOIN workspace_integrations search_console
        ON search_console.workspace_id = w.id AND search_console.provider = 'search_console'
      WHERE membership.user_id = $1
      ORDER BY w.name, w.id
    `, [userId]);
    return result.rows.map(mapWorkspace);
  }
}

function environmentValue(environment: NodeJS.ProcessEnv, name: string): string | undefined {
  return environment[name]?.trim() || undefined;
}

function configuredFixture(
  id: "client-a" | "client-b",
  prefix: "CLIENT_A" | "CLIENT_B",
  fallbackName: string,
  environment: NodeJS.ProcessEnv,
): Workspace {
  const dataSource = environmentValue(environment, `${prefix}_DATA_SOURCE`) === "sample"
    ? "sample"
    : "live";
  const googleAdsCustomerId = environmentValue(environment, `${prefix}_GOOGLE_ADS_CUSTOMER_ID`);
  const googleAdsLoginCustomerId = environmentValue(environment, `${prefix}_GOOGLE_ADS_LOGIN_CUSTOMER_ID`);
  const ga4PropertyId = environmentValue(environment, `${prefix}_GA4_PROPERTY_ID`);
  const searchConsolePropertyUrl = environmentValue(environment, `${prefix}_SEARCH_CONSOLE_PROPERTY_URL`);
  return {
    id,
    name: environmentValue(environment, `${prefix}_NAME`) ?? fallbackName,
    status: dataSource === "sample" || googleAdsCustomerId || ga4PropertyId || searchConsolePropertyUrl
      ? "active"
      : "configuration_required",
    dataSource,
    ...(googleAdsCustomerId ? { googleAdsCustomerId } : {}),
    ...(googleAdsLoginCustomerId ? { googleAdsLoginCustomerId } : {}),
    ...(ga4PropertyId ? { ga4PropertyId } : {}),
    ...(searchConsolePropertyUrl ? { searchConsolePropertyUrl } : {}),
  };
}

export function getDevelopmentWorkspaces(
  environment: NodeJS.ProcessEnv = process.env,
): readonly Workspace[] {
  const demoSource = environmentValue(environment, "DEMO_DATA_SOURCE") ??
    environmentValue(environment, "GOOGLE_ADS_DATA_SOURCE");
  const googleAdsCustomerId = environmentValue(environment, "DEMO_GOOGLE_ADS_CUSTOMER_ID") ??
    environmentValue(environment, "GOOGLE_ADS_CUSTOMER_ID");
  const googleAdsLoginCustomerId = environmentValue(environment, "DEMO_GOOGLE_ADS_LOGIN_CUSTOMER_ID") ??
    environmentValue(environment, "GOOGLE_ADS_LOGIN_CUSTOMER_ID");
  const ga4PropertyId = environmentValue(environment, "DEMO_GA4_PROPERTY_ID") ??
    environmentValue(environment, "GA4_PROPERTY_ID");
  const searchConsolePropertyUrl = environmentValue(environment, "DEMO_SEARCH_CONSOLE_PROPERTY_URL") ??
    environmentValue(environment, "SEARCH_CONSOLE_PROPERTY_URL");
  return [
    {
      id: "demo",
      name: environmentValue(environment, "DEMO_CLIENT_NAME") ?? "Crush Demo Workspace",
      status: "active",
      dataSource: demoSource === "live" ? "live" : "sample",
      ...(googleAdsCustomerId ? { googleAdsCustomerId } : {}),
      ...(googleAdsLoginCustomerId ? { googleAdsLoginCustomerId } : {}),
      ...(ga4PropertyId ? { ga4PropertyId } : {}),
      ...(searchConsolePropertyUrl ? { searchConsolePropertyUrl } : {}),
    },
    configuredFixture("client-a", "CLIENT_A", "Client A Workspace", environment),
    configuredFixture("client-b", "CLIENT_B", "Client B Workspace", environment),
  ];
}

export class DevelopmentTenantRepository implements TenantRepository {
  private readonly workspaces: readonly Workspace[];
  private readonly memberships: ReadonlyMap<string, readonly string[]>;

  constructor(
    workspaces: readonly Workspace[] = getDevelopmentWorkspaces(),
    memberships: ReadonlyMap<string, readonly string[]> = new Map([
      ["dev-user", workspaces.map(({ id }) => id)],
    ]),
  ) {
    this.workspaces = workspaces;
    this.memberships = memberships;
  }

  async findWorkspaceById(workspaceId: string) {
    return this.workspaces.find(({ id }) => id === workspaceId) ?? null;
  }

  async findWorkspaceForUser(userId: string, workspaceId: string) {
    if (!this.memberships.get(userId)?.includes(workspaceId)) return null;
    return this.findWorkspaceById(workspaceId);
  }

  async listActiveWorkspaces() {
    return this.workspaces.filter(({ status }) => status === "active");
  }

  async listWorkspacesForUser(userId: string) {
    const allowed = new Set(this.memberships.get(userId) ?? []);
    return this.workspaces.filter(({ id }) => allowed.has(id));
  }
}

export function isDevelopmentTenantMode(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return environment.NODE_ENV !== "production" &&
    environment.AUTH_ALLOW_DEV_LOGIN === "true" &&
    !hasDatabaseConfiguration(environment);
}

let repositoryOverride: TenantRepository | undefined;

export function getTenantRepository(): TenantRepository {
  if (repositoryOverride) return repositoryOverride;
  if (isDevelopmentTenantMode()) return new DevelopmentTenantRepository();
  return new PostgresTenantRepository();
}

export function setTenantRepositoryForTesting(repository?: TenantRepository): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Tenant repository overrides are only allowed while NODE_ENV=test.");
  }
  repositoryOverride = repository;
}

export function toWorkspaceSummary(workspace: Workspace): WorkspaceSummary {
  return { id: workspace.id, name: workspace.name, status: workspace.status };
}
