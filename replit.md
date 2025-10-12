# AI Voice Agent Dashboard

## Overview
A full-stack web application that enables outbound AI voice calls using Twilio for telephony, OpenAI for conversation logic, and ElevenLabs for text-to-speech. Features real-time transcription, live audio monitoring, and beautiful dark-themed UI.

## Current State
**Phase 1: Schema & Frontend** ✅ Completed
- Data models defined in `shared/schema.ts` for calls, transcripts, and voice configuration
- Design tokens configured with Inter font and JetBrains Mono for phone numbers
- All React components built with stunning dark theme (#219ebc accent):
  - Phone input form with country code selector
  - Call status display with animated indicators
  - Real-time transcription panel with message bubbles
  - Audio player with waveform visualization
  - Voice selector dropdown (ElevenLabs voices)
  - Post-call summary card
  - Main dashboard page with responsive layout

**Phase 2: Backend** 🔄 In Progress
- Need to implement Twilio integration for outbound calls with Media Streams
- Need to implement OpenAI integration for conversation logic
- Need to implement ElevenLabs API for TTS with voice selection
- Need to set up WebSocket server for bidirectional audio/transcription streaming
- Need to create API endpoints for call management

**Phase 3: Integration & Testing** ⏳ Pending

## Tech Stack
- **Frontend**: React, Tailwind CSS, Wouter (routing), TanStack Query
- **Backend**: Node.js, Express, WebSocket (ws package)
- **External APIs**: Twilio (calls), OpenAI (AI logic), ElevenLabs (TTS)
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
- WebSocket server will run on `/ws` path to avoid conflicts with Vite HMR
- Audio streaming handled via Twilio Media Streams
- Real-time transcription using OpenAI's Realtime API or streaming completions
- ElevenLabs TTS generates audio responses from AI text

## Design System
- Dark theme based on design_guidelines.md
- Primary accent: #219ebc (194 75% 43%)
- Fonts: Inter (UI), JetBrains Mono (phone numbers, durations)
- Spacing: Consistent 6-unit system
- Components follow shadcn patterns with hover-elevate interactions
