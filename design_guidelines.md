# Vapi.ai Call Dashboard - Design Guidelines

## Design Approach
**System**: Modern Dashboard Design inspired by Linear and Vercel's dark interfaces
**Rationale**: Utility-focused application requiring clarity, real-time data visibility, and professional aesthetics for a productivity tool.

## Core Design Elements

### A. Color Palette

**Dark Mode Foundation** (Primary):
- Background: 15 8% 8% (deep charcoal)
- Surface: 15 8% 12% (elevated cards)
- Border: 15 8% 20% (subtle divisions)

**Brand & Accent**:
- Primary Accent: 194 75% 43% (#219ebc - user specified)
- Primary Hover: 194 75% 38%
- Success: 142 76% 36% (call connected)
- Warning: 38 92% 50% (ringing state)
- Error: 0 84% 60% (call failed)

**Text Hierarchy**:
- Primary Text: 0 0% 98%
- Secondary Text: 0 0% 71%
- Tertiary Text: 0 0% 50%

### B. Typography

**Font Stack**: 
- Primary: 'Inter', system-ui, sans-serif (via Google Fonts)
- Monospace: 'JetBrains Mono' for phone numbers and call IDs

**Scale**:
- Display: text-4xl font-bold (call status headers)
- Headings: text-2xl font-semibold (section titles)
- Body: text-base font-normal (transcription, descriptions)
- Small: text-sm font-medium (metadata, timestamps)
- Micro: text-xs font-medium (labels, status badges)

### C. Layout System

**Spacing Primitives**: Use Tailwind units of 3, 4, 6, 8, 12, 16
- Micro spacing: p-3, gap-3 (within components)
- Standard spacing: p-6, gap-6 (between elements)
- Section spacing: p-8, py-12 (major sections)
- Page margins: px-6 md:px-12, max-w-7xl mx-auto

**Grid Structure**:
- Single column mobile (< 768px)
- Two-column tablet/desktop: 2/5 (controls) + 3/5 (transcription/audio)

### D. Component Library

**Call Control Card**:
- Rounded-xl border with surface background
- Phone input: Large text field (h-12) with country code dropdown
- Primary CTA: Large pill button (h-12, px-8) with accent color
- Status badge: Inline flex with colored dot + text

**Real-Time Transcription Panel**:
- Fixed height scrollable container (h-96)
- Message bubbles: AI (left-aligned, accent bg with 10% opacity) vs Caller (right-aligned, surface bg)
- Auto-scroll to latest message
- Timestamps in tertiary text (text-xs)

**Audio Player Component**:
- Horizontal flex layout with play/pause icon button
- Custom waveform visualization using accent color
- Volume control slider with accent thumb
- Duration display in monospace font

**Status Indicator**:
- Animated pulse dot for active states
- Color-coded: Idle (tertiary), Ringing (warning), Connected (success), Ended (error)
- Large text status with icon prefix

**Post-Call Summary Card**:
- Elevated surface with border-t in accent color
- Metrics row: Duration, total messages, sentiment (if available)
- Action buttons: Download transcript (outline), Save recording (outline)

### E. Interactive Elements

**Buttons**:
- Primary: bg-accent with white text, hover lift effect (hover:-translate-y-0.5)
- Secondary: border with accent color, transparent bg, accent text
- Icon buttons: p-3 rounded-lg with hover bg-surface

**Forms**:
- Input fields: bg-surface, border-subtle, focus ring in accent
- Disabled state: opacity-50 with cursor-not-allowed

**Real-Time Animations**:
- Typing indicator: Three bouncing dots in accent color
- Waveform: Subtle amplitude animation during active call
- Status transitions: Smooth color fade (transition-colors duration-300)

## Layout Specifications

**Dashboard Structure**:
1. **Header Bar** (h-16): Logo, connection status indicator, settings icon
2. **Main Content** (min-h-screen): 
   - Left Panel: Call controls and phone input
   - Right Panel: Live transcription stream
3. **Bottom Panel** (conditional): Audio player when call active
4. **Modal Overlays**: Schedule call form, call history

**Responsive Breakpoints**:
- Mobile: Stack vertically, full-width controls
- Tablet (768px+): Side-by-side 40/60 split
- Desktop (1024px+): Centered max-w-7xl with generous padding

## Images

**Hero/Dashboard Illustration**: Modern abstract communication visual showing sound waves or call flow (placed in empty state of transcription panel)
- Style: Minimal line art with accent color gradient
- Position: Center of transcription area when no active call
- Size: max-w-md mx-auto

**Empty State Icons**: Simple iconography for idle states (microphone crossed out, waiting for call)

## Key UX Patterns

- **Progressive Disclosure**: Hide advanced features (schedule call) behind secondary actions
- **Optimistic Updates**: Show "Initiating call..." immediately on button click
- **Error Recovery**: Clear error messages with retry CTAs
- **Accessibility**: ARIA labels on all interactive elements, keyboard navigation support
- **Loading States**: Skeleton screens for transcription, spinner for call initiation