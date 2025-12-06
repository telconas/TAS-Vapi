# AI Voice Agent Dashboard

## Overview
This project is a full-stack web application designed for outbound AI voice calls, leveraging the Vapi.ai platform for ultra-low latency interactions. Its core purpose is to provide a sophisticated AI voice agent capable of real-time transcription, AI-generated call summaries with optional email delivery, post-call recordings, and advanced call handling features like DTMF navigation and call transfer. The application aims to offer a professional and efficient solution for automated voice interactions with sub-second response times, significantly improving upon traditional voice AI systems.

## User Preferences
I prefer iterative development with clear communication on progress. Please ask before making major architectural changes or introducing new external dependencies. I appreciate detailed explanations for complex features or decisions. Do not make changes to files or folders without explicit approval, especially those related to core Vapi.ai integration or database schemas.

## System Architecture
The application is built upon a modern full-stack architecture.

**UI/UX Decisions:**
- **Design:** Modern dark-themed UI with `#219ebc` accent color.
- **Typography:** Uses Inter for UI elements and JetBrains Mono for technical details like phone numbers and durations.
- **Component Styling:** Follows `shadcn` patterns with hover-elevate interactions, utilizing a consistent 6-unit spacing system.

**Technical Implementations:**
- **Frontend:** React, Tailwind CSS, Wouter (routing), and TanStack Query.
- **Backend:** Node.js with Express and a WebSocket server (`ws` package) for real-time UI updates.
- **Database:** PostgreSQL for persistent storage of call history and transcripts.
- **Real-time Communication:** WebSockets for continuous UI updates and Vapi.ai webhooks for call event notifications.
- **Voice ID Handling:** Correctly extracts voice names (e.g., "asteria" from "aura-2-asteria-en") for Vapi compatibility.
- **AI Instructions:** User-defined AI instructions are injected into a professional system prompt for customized AI behavior.
- **Call Transfer:** Implemented via Vapi's transfer API, ensuring recording and transcription continue post-transfer.
- **Barge-in Support:** The AI automatically stops speaking when the caller interrupts, facilitated by Vapi's architecture.
- **Silent Operator Instructions:** The system supports sending real-time, inaudible guidance to the AI during live calls.
- **AI Speaking Control:** The AI only speaks when directly addressed, initiating calls with silence.
- **Volume Boost:** Amazon Polly voices are enhanced using TwiML `<Prosody volume="x-loud">` for improved audibility.

**Feature Specifications:**
- **Call Summarization:** OpenAI GPT-4.1 generates copyable, bullet-point summaries of calls, including key details like account numbers and PINs, displayed in a dedicated UI window.
- **DTMF Navigation:** AI can press DTMF buttons (0-9, *, #) to navigate IVR menus based on prompt instructions.
- **Voice Providers:** Supports Deepgram Aura (ultra-fast, ~100ms latency), ElevenLabs (natural voices), and Amazon Polly (free, via Twilio).
- **Latency Optimizations:** Uses `speechTimeout="1"` for faster AI responses and detailed logging for performance monitoring.
- **Infinite Hold Time:** The system is designed to keep calls alive indefinitely during hold times (up to 4 hours) using gather loops and redirect fallbacks.
- **Dual Recording:** Utilizes both call-level and TwiML-based recording to capture all audio.

## External Dependencies
- **Vapi.ai:** The primary voice AI platform for orchestrating STT (Deepgram), LLM (GPT-4.1), and TTS (Deepgram/ElevenLabs) pipelines, handling real-time streaming and webhooks.
- **OpenAI:** Used for GPT-4.1 for AI call summarization and complex conversational logic.
- **SendGrid:** Integrated for optional email delivery of call summaries.
- **Deepgram:** Provides ultra-fast transcription and TTS services (Deepgram Aura) through Vapi.ai.
- **ElevenLabs:** Offers natural-sounding voices with emotional nuances, also integrated via Vapi.ai.
- **Twilio (Legacy/Specific Functions):** While largely replaced by Vapi.ai for core voice AI, Twilio's TwiML is still referenced for features like Amazon Polly TTS and for managing certain aspects of call flow.
- **Twilio Voice SDK:** Used for browser-based manual calling feature. Allows users to make direct phone calls from the browser without AI.

## Manual Calling Feature
The application includes a manual dialer that allows users to make phone calls directly from the browser using the Twilio Voice SDK (WebRTC). This bypasses the AI agent and lets users speak directly.

**Features:**
- Dial pad interface (0-9, *, #) for entering phone numbers
- Real-time DTMF tone sending during calls
- Mute/unmute functionality
- Call recording with automatic summary generation
- Email delivery of call summaries

**Required Twilio Configuration:**
To use the manual calling feature, you need to set up a TwiML App in your Twilio Console:
1. Go to Twilio Console > Voice > TwiML Apps
2. Create a new TwiML App
3. Set the Voice URL to: `https://<your-domain>/api/twilio/voice` (POST method)
4. Save and copy the TwiML App SID
5. Add the following environment variables:
   - `TWILIO_TWIML_APP_SID`: The TwiML App SID from step 4
   - `TWILIO_API_KEY_SID`: (Optional) API Key SID for enhanced security
   - `TWILIO_API_KEY_SECRET`: (Optional) API Key Secret for enhanced security

**Database:**
- `callType` field distinguishes AI calls ("ai") from manual calls ("manual")
- Both call types use the same recording and summary pipeline