# AI Voice Agent Dashboard

## Overview
A full-stack web application that enables outbound AI voice calls using Twilio for telephony, OpenAI for conversation logic, and ElevenLabs for text-to-speech. Features real-time transcription, live audio monitoring, and beautiful dark-themed UI.

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
- **External APIs**: Twilio (calls + Polly TTS), OpenAI GPT-4.1 (AI logic)
- **Real-time**: WebSocket for live transcription and audio streaming

## Environment Variables
The following secrets are configured and available:
- `TWILIO_ACCOUNT_SID` - Twilio Account SID
- `TWILIO_AUTH_TOKEN` - Twilio Auth Token  
- `TWILIO_PHONE_NUMBER` - Twilio phone number for outbound calls
- `OPENAI_API_KEY` - OpenAI API key
- `ELEVENLABS_API_KEY` - ElevenLabs API key

Note: User declined Replit's Twilio integration - using manual API credentials instead (documented for future reference).

## Architecture Notes
- WebSocket server runs on `/ws` path to avoid conflicts with Vite HMR
- Session-based WebSocket client management for multi-user support
- Twilio integration uses `<Gather>` with speech recognition for **barge-in support** (AI stops speaking when interrupted)
- Real-time speech recognition via Twilio's `<Gather>` verb with `speechTimeout="auto"`
- OpenAI GPT-4.1 for conversational AI logic
- ElevenLabs TTS generates audio responses from AI text

## Implementation Notes
- **Hard-coded System Prompt**: Professional virtual assistant "James Martin" prompt with call behavior guidelines, IVR navigation rules, task patterns, and call etiquette. User's AI Instructions are injected into the "ACCOUNT REFERENCE SECTION" placeholder.
- **Barge-in support**: Uses `<Gather>` with speech recognition instead of `<Record>` so AI stops speaking when caller interrupts
- **Amazon Polly TTS (FREE)**: AI uses Amazon Polly voices via Twilio's `<Say voice="Polly.Joanna">` verb:
  - 15 high-quality voices available (US, British, Indian, Australian accents)
  - No additional API costs - included in Twilio call pricing
  - Allowlist validation prevents TwiML injection attacks
  - Default voice: "Polly.Joanna" (female, US English)
  - ElevenLabs integration still available as fallback (if voiceId configured and credits available)
- Speech recognition with `speechTimeout="auto"` for natural conversation flow
- Extended `<Gather>` timeout to 60 seconds (max) to prevent premature call disconnection during conversations
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
- ✅ **Caller ID set to 913-439-5811** - All outbound calls use this phone number
- ✅ **AI only speaks when asked** - No initial greeting, call starts with silence until caller speaks
- ✅ **Silent operator instructions** - Send real-time guidance to AI during calls that caller never hears
- ✅ **GPT-4.1 upgrade** - Upgraded from GPT-4o to GPT-4.1 (21.4% better coding, 10.5% better instruction following, 20% cost reduction)
- ✅ **Make.com webhook** - Completed calls now send data to https://hook.us1.make.com/qomm4skpqxiyq40jxwwxcij4d1wl1psr
- ✅ **Barge-in support** - AI stops speaking immediately when service rep/caller starts talking (switched from `<Record>` to `<Gather>` with speech recognition)
- ✅ **Amazon Polly voices (FREE)** - Switched from ElevenLabs to Amazon Polly TTS (15 voices, no extra cost, included in Twilio pricing)
  - Allowlist validation for security (prevents TwiML injection)
  - ElevenLabs still available as fallback if configured and has credits
