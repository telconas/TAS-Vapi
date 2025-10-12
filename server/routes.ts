import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import twilio from "twilio";
import OpenAI from "openai";
import { ElevenLabsClient } from "elevenlabs";
import { randomUUID } from "crypto";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, basename } from "path";

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

// Helper function to generate and save ElevenLabs audio
async function generateAndSaveAudio(text: string, voiceId: string, filename: string): Promise<string> {
  const audioStream = await elevenLabsClient.generate({
    voice: voiceId,
    text,
    model_id: "eleven_monolingual_v1",
  });

  // Convert stream to buffer
  const chunks: Buffer[] = [];
  for await (const chunk of audioStream) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);

  // Ensure audio cache directory exists
  const audioCacheDir = '/tmp/audio-cache';
  if (!existsSync(audioCacheDir)) {
    mkdirSync(audioCacheDir, { recursive: true });
  }

  // Save to file
  const audioPath = join(audioCacheDir, filename);
  writeFileSync(audioPath, buffer);
  
  return `/api/audio/${filename}`;
}

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

        // Handle operator instructions
        if (message.type === 'instruction') {
          const { callId, instruction } = message.data;
          const activeCall = activeCalls.get(callId);

          if (activeCall) {
            // Add instruction to AI conversation context as a system message
            // This won't be transcribed or played to caller
            activeCall.openaiConversation.push({
              role: "system",
              content: `[OPERATOR INSTRUCTION - Not for caller]: ${instruction}`,
            });

            console.log(`Instruction added for call ${callId}: ${instruction}`);

            // Send success response
            ws.send(JSON.stringify({
              type: 'instruction_response',
              data: {
                success: true,
                message: 'Instruction added to AI context',
              },
            }));
          } else {
            // Send error response
            ws.send(JSON.stringify({
              type: 'instruction_response',
              data: {
                success: false,
                message: 'Call not found or not active',
              },
            }));
          }
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });

    ws.on('close', () => {
      console.log('WebSocket client disconnected');
      wsClients.delete(sessionId);
    });
  });

  // Helper function to send call data to Make.com webhook
  async function sendToMakeWebhook(callId: string) {
    const webhookUrl = 'https://hook.us1.make.com/5ry41bqhkx973b9bglf7ixe7pfw8j3ix';
    
    try {
      const call = await storage.getCall(callId);
      const transcripts = await storage.getTranscriptByCallId(callId);
      
      if (!call) {
        console.error(`Call ${callId} not found for webhook`);
        return;
      }

      const webhookData = {
        callId: call.id,
        phoneNumber: call.phoneNumber,
        prompt: call.prompt,
        status: call.status,
        duration: call.duration,
        startedAt: call.startedAt,
        endedAt: call.endedAt,
        voiceId: call.voiceId,
        voiceName: call.voiceName,
        twilioCallSid: call.twilioCallSid,
        recordingUrl: call.recordingUrl,
        transcripts: transcripts.map(t => ({
          speaker: t.speaker,
          text: t.text,
          timestamp: t.timestamp,
        })),
      };

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(webhookData),
      });

      if (response.ok) {
        console.log(`Successfully sent call ${callId} data to Make.com webhook`);
      } else {
        console.error(`Make.com webhook failed with status ${response.status}`);
      }
    } catch (error) {
      console.error('Error sending to Make.com webhook:', error);
    }
  }

  // API: Get call details by ID
  app.get('/api/calls/:callId', async (req, res) => {
    try {
      const { callId } = req.params;
      const call = await storage.getCall(callId);
      
      if (!call) {
        return res.status(404).json({ error: 'Call not found' });
      }

      // Replace Twilio recording URL with our proxy URL
      if (call.recordingUrl) {
        call.recordingUrl = `/api/recording-proxy/${callId}`;
      }

      res.json(call);
    } catch (error) {
      console.error('Error fetching call:', error);
      res.status(500).json({ error: 'Failed to fetch call details' });
    }
  });

  // API: Proxy recording from Twilio with authentication
  app.get('/api/recording-proxy/:callId', async (req, res) => {
    try {
      const { callId } = req.params;
      const call = await storage.getCall(callId);
      
      if (!call || !call.recordingUrl) {
        return res.status(404).json({ error: 'Recording not found' });
      }

      // Fetch recording from Twilio with authentication
      const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
      const recordingResponse = await fetch(call.recordingUrl, {
        headers: {
          'Authorization': `Basic ${auth}`,
        },
      });

      if (!recordingResponse.ok) {
        throw new Error(`Twilio recording fetch failed: ${recordingResponse.status}`);
      }

      // Stream the recording to the client
      res.setHeader('Content-Type', 'audio/mpeg');
      const buffer = await recordingResponse.arrayBuffer();
      res.send(Buffer.from(buffer));
    } catch (error) {
      console.error('Error proxying recording:', error);
      res.status(500).json({ error: 'Failed to fetch recording' });
    }
  });

  // API: Serve generated audio files
  app.get('/api/audio/:filename', (req, res) => {
    const { filename } = req.params;
    
    // Validate filename to prevent path traversal
    const safeFilename = basename(filename);
    if (safeFilename !== filename || !safeFilename.endsWith('.mp3')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    
    const audioPath = join('/tmp/audio-cache', safeFilename);
    
    // Check if file exists
    if (!existsSync(audioPath)) {
      return res.status(404).json({ error: 'Audio file not found' });
    }
    
    res.sendFile(audioPath);
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

  // API: Generate voice preview audio
  app.get('/api/voices/:voiceId/preview', async (req, res) => {
    try {
      const { voiceId } = req.params;
      const previewText = "Hello! This is a preview of my voice. I'm an AI assistant powered by ElevenLabs.";
      
      // Generate preview audio
      const audioStream = await elevenLabsClient.generate({
        voice: voiceId,
        text: previewText,
        model_id: "eleven_monolingual_v1",
      });

      // Convert stream to buffer
      const chunks: Buffer[] = [];
      for await (const chunk of audioStream) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      // Send as audio response
      res.setHeader('Content-Type', 'audio/mpeg');
      res.send(buffer);
    } catch (error) {
      console.error('Error generating voice preview:', error);
      res.status(500).json({ error: 'Failed to generate voice preview' });
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

      // Make Twilio call with recording enabled
      const twilioCall = await twilioClient.calls.create({
        from: '+19134395811',
        to: phoneNumber,
        url: `https://${req.get('host')}/api/twiml/${call.id}`,
        statusCallback: `https://${req.get('host')}/api/call-status/${call.id}`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        record: true,
        recordingStatusCallback: `https://${req.get('host')}/api/recording/${call.id}`,
      });

      // Update with Twilio call SID in database and active calls
      await storage.updateCall(call.id, { twilioCallSid: twilioCall.sid });
      
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

    try {
      // Get call details to access voiceId
      const call = await storage.getCall(callId);
      
      if (!call) {
        return res.status(404).send('Call not found');
      }

      // Start recording immediately - AI only speaks when asked a question
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Record timeout="3" maxLength="30" playBeep="false" transcribe="true" transcribeCallback="https://${req.get('host')}/api/transcribe/${callId}" />
</Response>`;

      res.type('text/xml');
      res.send(twiml);
    } catch (error) {
      console.error('Error generating TwiML:', error);
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Record timeout="3" maxLength="30" playBeep="false" transcribe="true" transcribeCallback="https://${req.get('host')}/api/transcribe/${callId}" />
</Response>`;
      res.type('text/xml');
      res.send(twiml);
    }
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

      // AI only speaks when asked a question - no initial greeting

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

      // Note: Webhook will be sent from recording callback once recording URL is available
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
            content: activeCall.prompt + "\n\nKeep responses concise and conversational, suitable for text-to-speech.\n\nIMPORTANT: If you hear a phone menu (like 'Press 1 for Sales, Press 2 for Support'), use the press_button function to navigate the menu. You can press buttons 0-9, *, or #.",
          },
          ...activeCall.openaiConversation,
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "press_button",
              description: "Press a button (DTMF tone) on the phone keypad to navigate phone menus or IVR systems",
              parameters: {
                type: "object",
                properties: {
                  digit: {
                    type: "string",
                    description: "The digit or symbol to press: 0-9, *, or #",
                    enum: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "#"]
                  },
                  reason: {
                    type: "string",
                    description: "Brief explanation of why pressing this button (e.g., 'Selecting English language option')"
                  }
                },
                required: ["digit", "reason"]
              }
            }
          }
        ],
        tool_choice: "auto"
      });

      const message = completion.choices[0]?.message;
      let aiResponse = message?.content || "";
      
      // Check if AI wants to press a button
      if (message?.tool_calls && message.tool_calls.length > 0) {
        // Add the assistant's tool call to conversation
        activeCall.openaiConversation.push({
          role: "assistant",
          content: message.content || null,
          tool_calls: message.tool_calls
        });
        
        const toolResults = [];
        
        for (const toolCall of message.tool_calls) {
          if (toolCall.type === 'function' && toolCall.function.name === "press_button") {
            const args = JSON.parse(toolCall.function.arguments);
            let result = { success: false, message: "" };
            
            // Send DTMF tone through Twilio
            if (activeCall.twilioCallSid) {
              try {
                // Use playDtmf method which doesn't interrupt the call
                await twilioClient.calls(activeCall.twilioCallSid)
                  .update({ method: 'POST', url: `https://${req.get('host')}/api/dtmf/${callId}?digit=${args.digit}` });
                
                result = { success: true, message: `Pressed button ${args.digit} successfully` };
                
                // Log button press
                const buttonMessage = `[Pressed button: ${args.digit}] ${args.reason}`;
                await storage.addTranscriptMessage({
                  callId,
                  speaker: 'ai',
                  text: buttonMessage,
                });
                
                activeCall.ws.send(JSON.stringify({
                  type: 'transcription',
                  data: {
                    callId,
                    speaker: 'ai',
                    text: buttonMessage,
                    timestamp: Date.now(),
                  },
                }));
              } catch (dtmfError) {
                console.error('Error sending DTMF:', dtmfError);
                result = { success: false, message: `Failed to press button: ${dtmfError}` };
              }
            }
            
            toolResults.push({
              tool_call_id: toolCall.id,
              role: "tool" as const,
              content: JSON.stringify(result)
            });
          }
        }
        
        // Add tool results to conversation
        activeCall.openaiConversation.push(...toolResults);
        
        // Get follow-up response from AI after button press
        const followUpCompletion = await openaiClient.chat.completions.create({
          model: "gpt-4",
          messages: [
            {
              role: "system",
              content: activeCall.prompt + "\n\nKeep responses concise and conversational, suitable for text-to-speech.\n\nIMPORTANT: If you hear a phone menu (like 'Press 1 for Sales, Press 2 for Support'), use the press_button function to navigate the menu. You can press buttons 0-9, *, or #.",
            },
            ...activeCall.openaiConversation,
          ],
        });
        
        aiResponse = followUpCompletion.choices[0]?.message?.content || "Done.";
      }
      
      if (!aiResponse) {
        aiResponse = "I understand.";
      }
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

      // Generate ElevenLabs audio and play it back to caller
      const call = await storage.getCall(callId);
      if (call?.voiceId && activeCall.twilioCallSid) {
        try {
          // Generate and save audio
          const audioFilename = `${callId}-${Date.now()}.mp3`;
          const audioUrl = await generateAndSaveAudio(aiResponse, call.voiceId, audioFilename);

          // Update call to play the AI response
          await twilioClient.calls(activeCall.twilioCallSid)
            .update({ 
              method: 'POST', 
              url: `https://${req.get('host')}/api/twiml-response/${callId}?audioUrl=${encodeURIComponent(audioUrl)}` 
            });
        } catch (audioError) {
          console.error('Error playing AI audio:', audioError);
        }
      }

    } catch (error) {
      console.error('Transcription processing error:', error);
    }

    res.sendStatus(200);
  });

  // TwiML endpoint - Play AI response and continue recording
  app.post('/api/twiml-response/:callId', async (req, res) => {
    const { callId } = req.params;
    const { audioUrl } = req.query;

    // TwiML to play AI response and continue recording
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>https://${req.get('host')}${audioUrl}</Play>
  <Record timeout="3" maxLength="30" playBeep="false" transcribe="true" transcribeCallback="https://${req.get('host')}/api/transcribe/${callId}" />
</Response>`;

    res.type('text/xml');
    res.send(twiml);
  });

  // DTMF endpoint - Sends button press tones
  app.post('/api/dtmf/:callId', async (req, res) => {
    const { callId } = req.params;
    const { digit } = req.query;
    
    // Return TwiML that plays the DTMF tone and continues recording
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play digits="${digit}"/>
  <Pause length="1"/>
  <Record timeout="3" maxLength="30" playBeep="false" transcribe="true" transcribeCallback="https://${req.get('host')}/api/transcribe/${callId}" />
</Response>`;
    
    res.type('text/xml');
    res.send(twiml);
  });

  // Recording callback - Receives recording URL from Twilio
  app.post('/api/recording/:callId', async (req, res) => {
    const { callId } = req.params;
    const { RecordingUrl, RecordingSid } = req.body;
    
    console.log(`Recording callback for call ${callId}: ${RecordingUrl}`);

    try {
      // Append .mp3 to get actual audio file (Twilio's RecordingUrl points to metadata)
      const audioUrl = RecordingUrl + '.mp3';
      
      // Store recording URL in database
      await storage.updateCall(callId, { recordingUrl: audioUrl });
      
      // Send to Make.com webhook now that we have the recording URL
      sendToMakeWebhook(callId).catch(err => 
        console.error('Webhook send failed from recording callback:', err)
      );
      
      res.sendStatus(200);
    } catch (error) {
      console.error('Error processing recording callback:', error);
      res.sendStatus(500);
    }
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

      // Note: Webhook will be sent from recording callback once recording URL is available

      res.json({ success: true, duration });
    } catch (error) {
      console.error('Error hanging up call:', error);
      res.status(500).json({ error: 'Failed to hang up call' });
    }
  });

  return httpServer;
}
