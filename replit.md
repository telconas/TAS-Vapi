# AI Voice Agent Dashboard

## Overview
A full-stack web application that enables outbound AI voice calls using **Vapi.ai platform** for ultra-low latency voice AI (<1 second response time). Features real-time transcription display, AI-generated call summaries with one-click copy and optional email delivery via SendGrid, post-call recordings, professional system prompt, DTMF button pressing for IVR navigation, call transfer capability, and barge-in support. Supports Deepgram Aura (ultra-fast, ~100ms latency) and ElevenLabs voice providers. Modern dark-themed UI with #219ebc accent color. Calls originate from 913-300-9959, AI only speaks when asked questions.

**Migration Note**: Successfully migrated from direct Twilio+TwiML architecture to Vapi.ai platform (October 2025) for real-time streaming, sub-second latency, and simplified voice AI orchestration.

## Current State
**Phase 1: Schema & Frontend** ✅ Completed
- Data models defined in `shared/schema.ts` for calls, transcripts, and voice configuration
- Design tokens configured with Inter font and JetBrains Mono for phone numbers
- All React components built with stunning dark theme (#219ebc accent):
  - Phone input form with country code selector and provider dropdown (24+ carriers)
  - Call status display with animated indicators
  - Real-time transcription panel with message bubbles
  - Audio player with waveform visualization
  - Voice selector dropdown (ElevenLabs voices)
  - Post-call summary card
  - Main dashboard page with responsive layout

**Phase 2: Backend** ✅ Completed
- PostgreSQL database created and schema pushed successfully
- Database storage interface implemented with methods for calls, transcripts, and voices
- Twilio integration implemented for outbound calls with transcription
- OpenAI GPT-4 integration for conversation logic
- ElevenLabs API integration for TTS with voice selection
- WebSocket server set up on /ws path for real-time communication
- Session management implemented for WebSocket clients
- API endpoints created:
  - GET /api/voices - Fetch ElevenLabs voices
  - POST /api/calls/start - Initiate outbound call
  - POST /api/twiml/:callId - TwiML response for Twilio
  - POST /api/call-status/:callId - Call status callbacks
  - POST /api/transcribe/:callId - Transcription callbacks
- Request validation and environment variable checks added

**Phase 3: Integration & Testing** ✅ Completed
- Frontend successfully integrated with backend via WebSocket
- Session-based client management working correctly
- Real-time status updates flowing to UI
- Transcription display working as expected
- Database persistence verified
- All API endpoints functional
- Application runs without errors
- See IMPLEMENTATION_STATUS.md for detailed feature status and known limitations

## Tech Stack
- **Frontend**: React, Tailwind CSS, Wouter (routing), TanStack Query
- **Backend**: Node.js, Express, WebSocket (ws package)
- **Voice AI Platform**: Vapi.ai (orchestrates STT, LLM, TTS pipeline)
- **External APIs**: Vapi.ai (voice orchestration), OpenAI GPT-4.1 (call summaries), SendGrid (email delivery)
- **Real-time**: WebSocket for UI updates, Vapi webhooks for call events
- **Voice Providers**: Deepgram Aura (12 ultra-fast voices, ~100ms latency), ElevenLabs (natural voices with emotion)

## Environment Variables
The following secrets are configured and available:
- `VAPI_API_KEY` - Vapi.ai API key for voice AI orchestration ✅
- `PHONE_NUMBER_ID` - Vapi phone number ID for outbound calls (required)
- `OPENAI_API_KEY` - OpenAI API key for GPT-4.1 call summaries
- `ELEVENLABS_API_KEY` - ElevenLabs API key (optional, for voice preview)
- SendGrid API credentials via Replit connector for email delivery

**Legacy (Twilio-based system, kept for reference)**:
- `TWILIO_ACCOUNT_SID` - Twilio Account SID (legacy)
- `TWILIO_AUTH_TOKEN` - Twilio Auth Token (legacy)
- `TWILIO_PHONE_NUMBER` - Twilio phone number (legacy)
- `DEEPGRAM_API_KEY` - Deepgram API key (legacy, Vapi handles this now)

## Architecture Notes
**Vapi.ai Integration** (October 2025):
- Vapi.ai handles complete voice AI pipeline: STT (Deepgram) → LLM (GPT-4.1) → TTS (Deepgram/ElevenLabs)
- Real-time streaming with sub-second latency (~500-800ms end-to-end)
- Webhooks for transcripts, status updates, and end-of-call reports
- Function calling support for DTMF button pressing and call transfers
- Automatic barge-in handling (AI stops speaking when interrupted)
- Assistant-waits-for-user mode (AI only speaks when asked)

**Legacy Architecture** (pre-October 2025):
- Direct Twilio+TwiML integration with `<Gather>` for speech recognition
- OpenAI GPT-4.1 for conversation logic
- Manual TTS generation (Polly, Deepgram, ElevenLabs)
- Higher latency (~2-4 seconds response time)

**Preserved Features**:
- WebSocket server on `/ws` path for real-time UI updates
- Session-based WebSocket client management for multi-user support
- PostgreSQL database for call history and transcripts
- OpenAI GPT-4.1 for AI-generated call summaries (separate from Vapi)
- SendGrid email delivery for call summaries

## Implementation Notes
- **Hard-coded System Prompt**: Professional virtual assistant "James Martin" prompt with call behavior guidelines, IVR navigation rules, task patterns, and call etiquette. User's AI Instructions are injected into the "ACCOUNT REFERENCE SECTION" placeholder.
- **Barge-in support**: Uses `<Gather>` with speech recognition instead of `<Record>` so AI stops speaking when caller interrupts
- **Amazon Polly TTS (FREE)**: AI uses Amazon Polly voices via Twilio's `<Say voice="Polly.Joanna">` verb:
  - 15 high-quality voices available (US, British, Indian, Australian accents)
  - No additional API costs - included in Twilio call pricing
  - Allowlist validation prevents TwiML injection attacks
  - Default voice: "Polly.Joanna" (female, US English)
  - ElevenLabs integration still available as fallback (if voiceId configured and credits available)
- **Infinite hold time support**: `<Redirect method="POST">` fallbacks ensure calls stay alive indefinitely during long hold times (up to Twilio's 4-hour maximum call duration)
  - Gather loops continue automatically when no speech detected
  - AI can wait on hold for 5-10+ minutes without timeout
  - Logged gather loops for debugging and monitoring
- Speech recognition with `speechTimeout="auto"` for natural conversation flow
- Extended `<Gather>` timeout to 60 seconds (max) combined with redirect fallbacks for continuous listening
- Database persistence ensures call history and transcripts are saved
- Dual recording approach: Both call-level and TwiML-based recording to ensure both sides are captured
- TwiML `<Start><Record>` captures AI voice and DTMF tones that call-level recording might miss

## Design System
- Dark theme based on design_guidelines.md
- Primary accent: #219ebc (194 75% 43%)
- Fonts: Inter (UI), JetBrains Mono (phone numbers, durations)
- Spacing: Consistent 6-unit system
- Components follow shadcn patterns with hover-elevate interactions

## Recent Updates
- Added AI Instructions field for customizing what the AI does on calls
- Added provider dropdown with 24+ carrier phone numbers (All Stream, ATT, Comcast, Spectrum, Verizon, etc.)
- Added Hang Up button to disconnect active calls
- Added DTMF button pressing capability (AI can press 0-9, *, #) to navigate phone menus
- AI automatically enters zip codes digit-by-digit from the prompt when asked
- Auto-fill phone number when provider is selected
- Manual phone entry clears provider selection
- All inputs disabled during active calls
- Prompt is used as OpenAI system message for personalized AI behavior
- Hang up properly terminates Twilio calls and updates call status
- AI uses OpenAI function calling to intelligently decide when to press buttons
- ✅ **Caller ID set to 913-300-9959** - All outbound calls use this phone number
- ✅ **AI only speaks when asked** - No initial greeting, call starts with silence until caller speaks
- ✅ **Silent operator instructions** - Send real-time guidance to AI during calls that caller never hears
- ✅ **GPT-4.1 upgrade** - Upgraded from GPT-4o to GPT-4.1 (21.4% better coding, 10.5% better instruction following, 20% cost reduction)
- ✅ **AI Call Summarization** - OpenAI GPT-4.1 generates copyable call summaries after each call
  - Custom prompt: Caller referred to as "JPM" (Jim Martin), representative name extraction, bullet-point format
  - Includes account numbers, PINs, service addresses, phone numbers when mentioned
  - Displayed in copyable summary window with one-click clipboard copy
  - Auto-polling frontend fetches summary once generated (up to 30 seconds)
- ✅ **Barge-in support** - AI stops speaking immediately when service rep/caller starts talking (switched from `<Record>` to `<Gather>` with speech recognition)
- ✅ **Triple Voice Providers** - Support for Amazon Polly (FREE), Deepgram Aura (FAST), and ElevenLabs
  - **Amazon Polly**: 15 voices via Twilio's `<Say voice="Polly.Joanna">` (included in call costs, fastest response)
  - **Deepgram Aura**: 12 ultra-fast voices (~100ms latency, 5-10x faster than previous OpenAI TTS)
  - **ElevenLabs**: Natural voices with emotion and intonation, includes voice preview feature
  - Tabbed voice selector UI for easy provider switching
  - Voice preview playback for ElevenLabs voices (click speaker icon to hear samples)
  - Allowlist validation for Polly and Deepgram prevents TwiML injection
- ✅ **Deepgram Aura TTS Integration** - Ultra-low latency voice synthesis (replaced OpenAI TTS)
  - ~100ms response time vs 500-1000ms with OpenAI TTS (5-10x performance improvement)
  - 12 high-quality Aura-2 voices (Asteria, Luna, Stella, Athena, Hera, Orion, Arcas, Perseus, Angus, Orpheus, Helios, Zeus)
  - Audio files generated server-side via Deepgram API and served through `/api/audio/:filename` endpoint
  - Proper caching headers for Twilio compatibility
  - Works with existing barge-in and infinite hold time features
  - Detailed latency logging for performance monitoring
- ✅ **Latency Optimizations** - Reduced AI response time delay
  - Changed speechTimeout from "auto" (2-4s delay) to "1" second for faster response
  - Added detailed latency logging at each pipeline stage (speech detection, GPT call, TTS generation)
  - Logs show millisecond timing for bottleneck identification
  - Maintains infinite hold time support (timeout=60s with redirect)
- ✅ **Webhook Callback Fix** - Fixed Twilio callbacks to use public domain
  - Issue: Twilio callbacks used `req.get("host")` which returned `localhost:5000` (unreachable by Twilio)
  - Solution: Created `getPublicHost()` helper that uses `REPLIT_DEV_DOMAIN` environment variable for public URLs
  - All Twilio callback URLs now use the proper public Replit domain
  - Recording callbacks now successfully trigger summary generation
  - Added comprehensive logging for debugging recording callbacks and summary generation
- ✅ **Email Summary Delivery** - SendGrid integration for optional email delivery of call summaries
  - Optional email field in call form - users can provide an email address to receive summaries
  - SendGrid integration via Replit connector for secure API key management
  - Email sent automatically after summary generation (if email address provided)
  - Email includes call details: phone number, duration, recording link, and full AI-generated summary
  - Professional HTML formatting with clear layout and branding
  - Default email: jpm@telconassociates.com (pre-filled in form)
  - **Bullet-point formatting**: Each sentence displayed as separate bullet point for easy copying
    - Handles natural line breaks from AI-generated summaries
    - Protects common abbreviations (Mr., Dr., U.S., Ph.D., etc.) from incorrect splits
    - Preserves original punctuation (periods, exclamation marks, question marks)
- ✅ **Call Transfer** - Transfer active calls to another number with one click
  - "Transfer Call" button appears during active calls alongside "Hang Up" button
  - Hardcoded transfer destination: 616-617-0915
  - Cold transfer: Caller is immediately connected to transfer number, AI drops from call
  - TwiML `<Dial>` verb redirects active call seamlessly
  - Call status updates to "transferred" with proper UI indication
  - Transfer endpoint: POST /api/calls/:callId/transfer
- ✅ **Volume Boost for Polly Voices** - Enhanced AI voice volume for better audibility
  - Uses TwiML `<Prosody volume="x-loud">` tag for maximum loudness
  - Only applies to Amazon Polly voices (default voice provider)
  - Deepgram and ElevenLabs audio levels remain at provider defaults
