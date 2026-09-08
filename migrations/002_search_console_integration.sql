BEGIN;

ALTER TABLE workspace_integrations
  DROP CONSTRAINT IF EXISTS workspace_integrations_provider_check;

ALTER TABLE workspace_integrations
  ADD CONSTRAINT workspace_integrations_provider_check
  CHECK (provider IN ('google_ads', 'ga4', 'search_console'));

COMMIT;
