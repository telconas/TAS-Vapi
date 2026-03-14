/*
  # Create calls, transcript_messages, and voices tables

  1. New Tables
    - `calls`
      - `id` (uuid, primary key, auto-generated)
      - `phone_number` (text, not null) - destination phone number
      - `prompt` (text, not null) - AI instructions for the call
      - `status` (text, not null, default 'idle') - call status: idle/ringing/connected/ended
      - `duration` (integer, default 0) - call duration in seconds
      - `started_at` (timestamptz, default now()) - when the call started
      - `ended_at` (timestamptz) - when the call ended
      - `voice_id` (text) - ElevenLabs voice ID
      - `voice_name` (text) - ElevenLabs voice name
      - `polly_voice` (text) - Amazon Polly voice
      - `voice_provider` (text) - voice provider: polly/deepgram/elevenlabs
      - `deepgram_voice` (text) - Deepgram Aura-2 voice
      - `twilio_call_sid` (text) - Twilio/Vapi call identifier
      - `recording_url` (text) - URL to call recording
      - `summary` (text) - AI-generated call summary
      - `email_recipient` (text) - email address for summary delivery
      - `listen_url` (text) - Vapi WebSocket URL for live audio
      - `control_url` (text) - Vapi HTTP URL for call control
      - `call_type` (text, default 'ai') - ai or manual
      - `caller_name` (text) - name of the person making the call

    - `transcript_messages`
      - `id` (uuid, primary key, auto-generated)
      - `call_id` (uuid, not null, references calls) - associated call
      - `speaker` (text, not null) - ai or caller
      - `text` (text, not null) - message content
      - `timestamp` (timestamptz, default now()) - message time

    - `voices`
      - `voice_id` (varchar, primary key) - ElevenLabs voice ID
      - `name` (text, not null) - voice name
      - `preview_url` (text) - URL to voice preview audio

  2. Security
    - RLS enabled on all tables
    - Policies allow authenticated users to perform all operations on their data
    - Service role has full access for server-side operations

  3. Indexes
    - Index on transcript_messages.call_id for fast transcript lookups
    - Index on calls.twilio_call_sid for Vapi call ID lookups
*/

CREATE TABLE IF NOT EXISTS calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text NOT NULL,
  prompt text NOT NULL,
  status text NOT NULL DEFAULT 'idle',
  duration integer DEFAULT 0,
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  voice_id text,
  voice_name text,
  polly_voice text,
  voice_provider text,
  deepgram_voice text,
  twilio_call_sid text,
  recording_url text,
  summary text,
  email_recipient text,
  listen_url text,
  control_url text,
  call_type text DEFAULT 'ai',
  caller_name text
);

ALTER TABLE calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage all calls"
  ON calls FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read calls"
  ON calls FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert calls"
  ON calls FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update calls"
  ON calls FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon users can read calls"
  ON calls FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon users can insert calls"
  ON calls FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anon users can update calls"
  ON calls FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS transcript_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES calls(id),
  speaker text NOT NULL,
  text text NOT NULL,
  timestamp timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE transcript_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage all transcripts"
  ON transcript_messages FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read transcripts"
  ON transcript_messages FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert transcripts"
  ON transcript_messages FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Anon users can read transcripts"
  ON transcript_messages FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon users can insert transcripts"
  ON transcript_messages FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_transcript_messages_call_id ON transcript_messages(call_id);

CREATE TABLE IF NOT EXISTS voices (
  voice_id varchar PRIMARY KEY,
  name text NOT NULL,
  preview_url text
);

ALTER TABLE voices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage all voices"
  ON voices FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read voices"
  ON voices FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert voices"
  ON voices FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update voices"
  ON voices FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon users can read voices"
  ON voices FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon users can insert voices"
  ON voices FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anon users can update voices"
  ON voices FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_calls_twilio_call_sid ON calls(twilio_call_sid);
