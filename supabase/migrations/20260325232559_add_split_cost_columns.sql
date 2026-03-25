/*
  # Add split cost tracking columns for transferred calls

  1. Modified Tables
    - `calls`
      - `vapi_cost_usd` (numeric(10,4), nullable) - Cost for the Vapi AI portion of the call (billed at $0.12/min)
      - `twilio_cost_usd` (numeric(10,4), nullable) - Cost for the Twilio portion after transfer (carrier rate)
      - `transferred_at` (timestamptz, nullable) - Timestamp when the call was transferred

  2. Notes
    - For non-transferred calls: vapi_cost_usd = cost_usd, twilio_cost_usd = null
    - For transferred calls: vapi_cost_usd = cost up to transfer point, twilio_cost_usd is informational (tracked separately by Twilio)
    - The existing cost_usd column is preserved as the total Vapi cost (only for the AI portion)
    - transferred_at allows precise cost splitting based on when AI handed off
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calls' AND column_name = 'vapi_cost_usd'
  ) THEN
    ALTER TABLE calls ADD COLUMN vapi_cost_usd numeric(10,4);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calls' AND column_name = 'twilio_cost_usd'
  ) THEN
    ALTER TABLE calls ADD COLUMN twilio_cost_usd numeric(10,4);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calls' AND column_name = 'transferred_at'
  ) THEN
    ALTER TABLE calls ADD COLUMN transferred_at timestamptz;
  END IF;
END $$;
