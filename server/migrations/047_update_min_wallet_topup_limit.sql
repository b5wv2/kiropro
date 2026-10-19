-- Migration 047: Update minimum wallet topup limits to allow any amount > 1 SDG
-- Eliminates the legacy $1 USD minimum requirement and enforces minimum > 1 SDG

BEGIN;

UPDATE "platform_settings"
SET "value" = jsonb_set(
  jsonb_set(
    jsonb_set(
      "value",
      '{min_topup}',
      '0.01'::jsonb
    ),
    '{min_topup_sdg}',
    '2'::jsonb
  ),
  '{min_admin_sdg}',
  '2'::jsonb
),
"updated_at" = CURRENT_TIMESTAMP
WHERE "key" = 'exchange_rate';

COMMIT;
