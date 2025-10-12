import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import twilio from "twilio";
import OpenAI from "openai";
import { ElevenLabsClient } from "elevenlabs";
import { randomUUID } from "crypto";

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const elevenLabsClient = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

interface ActiveCall {
  callId: string;
  phoneNumber: string;
  prompt: string;
  twilioCallSid?: string;
  openaiConversation: any[];
  ws: WebSocket;
  startTime: number;
}

const activeCalls = new Map<string, ActiveCall>();

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // Map to track WebSocket connections per session
  const wsClients = new Map<string, WebSocket>();

  // WebSocket server for real-time communication
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    console.log('WebSocket client connected');
    
    // Generate session ID for this connection
    const sessionId = randomUUID();
    wsClients.set(sessionId, ws);

    // Send session ID to client
    ws.send(JSON.stringify({
      type: 'session',
      data: { sessionId },
    }));

    ws.on('message', async (data: string) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('Received WebSocket message:', message.type);
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });

    ws.on('close', () => {
      console.log('WebSocket client disconnected');
      wsClients.delete(sessionId);
    });
  });

  // API: Get ElevenLabs voices
  app.get('/api/voices', async (req, res) => {
    try {
      const voicesResponse = await elevenLabsClient.voices.getAll();
      const voices = voicesResponse.voices.map((voice: any) => ({
        voiceId: voice.voice_id,
        name: voice.name,
        previewUrl: voice.preview_url,
      }));

      // Cache voices in database
      for (const voice of voices) {
        await storage.upsertVoice(voice);
      }

      res.json(voices);
    } catch (error) {
      console.error('Error fetching voices:', error);
      res.status(500).json({ error: 'Failed to fetch voices' });
    }
  });

  // API: Start a new call
  app.post('/api/calls/start', async (req, res) => {
    try {
      const { phoneNumber, prompt, voiceId, voiceName, sessionId } = req.body;

      // Validate request
      if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number is required' });
      }

      if (!prompt) {
        return res.status(400).json({ error: 'AI prompt is required' });
      }

      // Validate environment variables
      if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
        return res.status(500).json({ error: 'Twilio credentials not configured' });
      }

      // Get WebSocket client for this session
      const wsClient = sessionId ? wsClients.get(sessionId) : Array.from(wsClients.values())[0];
      
      if (!wsClient || wsClient.readyState !== WebSocket.OPEN) {
        return res.status(500).json({ error: 'No WebSocket connection available' });
      }

      // Create call record in database
      const call = await storage.createCall({
        phoneNumber,
        prompt,
        status: 'ringing',
        voiceId,
        voiceName,
        duration: 0,
      });

      // Store active call info
      activeCalls.set(call.id, {
        callId: call.id,
        phoneNumber,
        prompt,
        openaiConversation: [],
        ws: wsClient,
        startTime: Date.now(),
      });

      // Make Twilio call with Media Streams
      const twilioCall = await twilioClient.calls.create({
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phoneNumber,
        url: `https://${req.get('host')}/api/twiml/${call.id}`,
        statusCallback: `https://${req.get('host')}/api/call-status/${call.id}`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      });

      // Update with Twilio call SID
      const activeCall = activeCalls.get(call.id);
      if (activeCall) {
        activeCall.twilioCallSid = twilioCall.sid;
      }

      // Send status update via WebSocket
      wsClient.send(JSON.stringify({
        type: 'call_status',
        data: {
          callId: call.id,
          status: 'ringing',
        },
      }));

      res.json({ callId: call.id, twilioCallSid: twilioCall.sid });
    } catch (error) {
      console.error('Error starting call:', error);
      res.status(500).json({ error: 'Failed to start call' });
    }
  });

  // TwiML endpoint - Called by Twilio when call connects
  app.post('/api/twiml/:callId', async (req, res) => {
    const { callId } = req.params;
    const activeCall = activeCalls.get(callId);

    if (!activeCall) {
      return res.status(404).send('Call not found');
    }

    // TwiML to start the call with initial greeting
    // Note: Full media streaming implementation would require Twilio Media Streams
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Hello! I'm your AI assistant. How can I help you today?</Say>
  <Record timeout="3" maxLength="30" playBeep="false" transcribe="true" transcribeCallback="https://${req.get('host')}/api/transcribe/${callId}" />
</Response>`;

    res.type('text/xml');
    res.send(twiml);
  });

  // Call status callback
  app.post('/api/call-status/:callId', async (req, res) => {
    const { callId } = req.params;
    const { CallStatus } = req.body;
    
    const activeCall = activeCalls.get(callId);
    
    if (CallStatus === 'in-progress' && activeCall) {
      await storage.updateCallStatus(callId, 'connected');
      
      activeCall.ws.send(JSON.stringify({
        type: 'call_status',
        data: {
          callId,
          status: 'connected',
        },
      }));

      // Start AI conversation with greeting
      const greeting = "Hello! I'm your AI assistant. How can I help you today?";
      
      // Generate TTS audio
      const audioStream = await elevenLabsClient.generate({
        voice: activeCall.openaiConversation.length > 0 ? 
          (await storage.getCall(callId))?.voiceId || "EXAVITQu4vr4xnSDxMaL" : 
          "EXAVITQu4vr4xnSDxMaL",
        text: greeting,
        model_id: "eleven_monolingual_v1",
      });

      // Save transcript
      await storage.addTranscriptMessage({
        callId,
        speaker: 'ai',
        text: greeting,
      });

      // Send transcription to frontend
      activeCall.ws.send(JSON.stringify({
        type: 'transcription',
        data: {
          callId,
          speaker: 'ai',
          text: greeting,
          timestamp: Date.now(),
        },
      }));

    } else if (CallStatus === 'completed' && activeCall) {
      const duration = Math.floor((Date.now() - activeCall.startTime) / 1000);
      
      await storage.updateCallStatus(callId, 'ended', duration, new Date());
      
      activeCall.ws.send(JSON.stringify({
        type: 'call_status',
        data: {
          callId,
          status: 'ended',
          duration,
        },
      }));

      activeCalls.delete(callId);
    }

    res.sendStatus(200);
  });

  // Transcription callback from Twilio
  app.post('/api/transcribe/:callId', async (req, res) => {
    const { callId } = req.params;
    const { TranscriptionText, RecordingUrl } = req.body;
    
    const activeCall = activeCalls.get(callId);
    
    if (!activeCall || !TranscriptionText) {
      return res.sendStatus(200);
    }

    try {
      // Save caller's transcribed speech
      await storage.addTranscriptMessage({
        callId,
        speaker: 'caller',
        text: TranscriptionText,
      });

      // Send to frontend
      activeCall.ws.send(JSON.stringify({
        type: 'transcription',
        data: {
          callId,
          speaker: 'caller',
          text: TranscriptionText,
          timestamp: Date.now(),
        },
      }));

      // Generate AI response using the provided prompt
      activeCall.openaiConversation.push({ role: "user", content: TranscriptionText });

      const completion = await openaiClient.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: activeCall.prompt + "\n\nKeep responses concise and conversational, suitable for text-to-speech.",
          },
          ...activeCall.openaiConversation,
        ],
      });

      const aiResponse = completion.choices[0]?.message?.content || "I understand.";
      activeCall.openaiConversation.push({ role: "assistant", content: aiResponse });

      // Save AI response
      await storage.addTranscriptMessage({
        callId,
        speaker: 'ai',
        text: aiResponse,
      });

      // Send to frontend
      activeCall.ws.send(JSON.stringify({
        type: 'transcription',
        data: {
          callId,
          speaker: 'ai',
          text: aiResponse,
          timestamp: Date.now(),
        },
      }));

      // Generate TTS (note: audio playback in production would require Twilio Media Streams or SIP)
      const call = await storage.getCall(callId);
      if (call?.voiceId) {
        const audioStream = await elevenLabsClient.generate({
          voice: call.voiceId,
          text: aiResponse,
          model_id: "eleven_monolingual_v1",
        });
        // Audio would be played back through Twilio in production
      }

    } catch (error) {
      console.error('Transcription processing error:', error);
    }

    res.sendStatus(200);
  });

  // API: Hang up an active call
  app.post('/api/calls/:callId/hangup', async (req, res) => {
    const { callId } = req.params;
    const activeCall = activeCalls.get(callId);

    if (!activeCall) {
      return res.status(404).json({ error: 'Call not found' });
    }

    try {
      // End the Twilio call if we have a call SID
      if (activeCall.twilioCallSid) {
        await twilioClient.calls(activeCall.twilioCallSid).update({ status: 'completed' });
      }

      // Calculate duration
      const duration = Math.floor((Date.now() - activeCall.startTime) / 1000);

      // Update call status in database
      await storage.updateCallStatus(callId, 'ended', duration, new Date());

      // Send WebSocket update
      activeCall.ws.send(JSON.stringify({
        type: 'call_status',
        data: {
          callId,
          status: 'ended',
          duration,
        },
      }));

      // Clean up active call
      activeCalls.delete(callId);

      res.json({ success: true, duration });
    } catch (error) {
      console.error('Error hanging up call:', error);
      res.status(500).json({ error: 'Failed to hang up call' });
    }
  });

  return httpServer;
}
