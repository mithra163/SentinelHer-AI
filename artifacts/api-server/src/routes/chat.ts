import { Router } from "express";
import {
  SendMessageBody,
  GetChatHistoryQueryParams,
  TriggerSosBody,
  GetSafetyStatusQueryParams,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router = Router();

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const NORMAL_MODEL = "llama-3.1-8b-instant";
const EMERGENCY_MODEL = "llama-3.3-70b-versatile";

const EMERGENCY_WORDS = [
  "help",
  "unsafe",
  "follow",
  "danger",
  "scared",
  "attack",
  "kidnap",
  "emergency",
  "stalker",
  "blood",
  "save me",
];

type RiskLevel = "SAFE" | "MODERATE" | "HIGH RISK";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  risk_level?: RiskLevel | null;
  emergency?: boolean | null;
}

interface UserMemory {
  unsafeLocations: string[];
  travelPatterns: string[];
  emergencyHistory: string[];
  lastActive: string | null;
  emergencyCount: number;
  currentRiskLevel: RiskLevel;
}

const userMemories: Map<string, UserMemory> = new Map();
const chatHistories: Map<string, ChatMessage[]> = new Map();

function getOrCreateMemory(username: string): UserMemory {
  if (!userMemories.has(username)) {
    userMemories.set(username, {
      unsafeLocations: [],
      travelPatterns: [],
      emergencyHistory: [],
      lastActive: null,
      emergencyCount: 0,
      currentRiskLevel: "SAFE",
    });
  }
  return userMemories.get(username)!;
}

function detectEmergency(message: string): boolean {
  const lower = message.toLowerCase();
  return EMERGENCY_WORDS.some((word) => lower.includes(word));
}

function classifyRisk(message: string): RiskLevel {
  const lower = message.toLowerCase();
  const highRiskWords = [
    "follow",
    "stalker",
    "attack",
    "kidnap",
    "blood",
    "save me",
    "danger",
    "unsafe",
    "emergency",
    "scared",
  ];
  const moderateWords = [
    "alone",
    "night",
    "dark",
    "stranger",
    "uncomfortable",
    "worried",
    "nervous",
    "suspicious",
  ];

  if (highRiskWords.some((w) => lower.includes(w))) return "HIGH RISK";
  if (moderateWords.some((w) => lower.includes(w))) return "MODERATE";
  return "SAFE";
}

function extractLocationContext(message: string, memory: UserMemory): void {
  const locationPatterns = [
    /(?:at|near|in|around)\s+([A-Z][a-zA-Z\s]+(?:street|road|park|station|mall|area|block))/gi,
    /(?:at|near|in|around)\s+([A-Z][a-zA-Z\s]{2,20})/gi,
  ];
  for (const pattern of locationPatterns) {
    const matches = message.matchAll(pattern);
    for (const match of matches) {
      const location = match[1].trim();
      if (location.length > 2 && !memory.travelPatterns.includes(location)) {
        memory.travelPatterns.push(location);
        if (memory.travelPatterns.length > 10) memory.travelPatterns.shift();
      }
    }
  }
}

async function callGroq(
  messages: { role: string; content: string }[],
  model: string
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY not configured");
  }

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 512,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq API error ${response.status}: ${err}`);
  }

  const data = (await response.json()) as {
    choices: { message: { content: string } }[];
  };
  return data.choices[0]?.message?.content ?? "I'm here for you. Stay safe.";
}

router.post("/chat", async (req, res) => {
  const parseResult = SendMessageBody.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { message, username } = parseResult.data;
  const memory = getOrCreateMemory(username);
  const history = chatHistories.get(username) ?? [];

  const isEmergency = detectEmergency(message);
  const riskLevel = classifyRisk(message);

  memory.lastActive = new Date().toISOString();
  memory.currentRiskLevel = riskLevel;

  if (isEmergency) {
    memory.emergencyCount += 1;
    memory.emergencyHistory.push(
      `${new Date().toISOString()}: ${message.substring(0, 100)}`
    );
    if (memory.emergencyHistory.length > 20)
      memory.emergencyHistory.shift();
  }

  extractLocationContext(message, memory);

  const systemPrompt = buildSystemPrompt(memory, isEmergency, riskLevel);
  const recentHistory = history.slice(-10).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const groqMessages = [
    { role: "system", content: systemPrompt },
    ...recentHistory,
    { role: "user", content: message },
  ];

  const model = isEmergency ? EMERGENCY_MODEL : NORMAL_MODEL;

  let reply: string;
  try {
    reply = await callGroq(groqMessages, model);
  } catch (err) {
    req.log.error({ err }, "Groq API call failed");
    reply = isEmergency
      ? "I sense this is urgent. Please call emergency services (911) immediately if you are in danger. Stay in a well-lit public area and keep moving toward safety."
      : "I'm here with you. Tell me what's happening and I'll help you stay safe.";
  }

  const userMsg: ChatMessage = {
    role: "user",
    content: message,
    timestamp: new Date().toISOString(),
    risk_level: riskLevel,
    emergency: isEmergency,
  };
  const assistantMsg: ChatMessage = {
    role: "assistant",
    content: reply,
    timestamp: new Date().toISOString(),
    risk_level: riskLevel,
    emergency: isEmergency,
  };

  history.push(userMsg, assistantMsg);
  chatHistories.set(username, history);

  res.json({
    reply,
    emergency: isEmergency,
    risk_level: riskLevel,
    model,
    memory: {
      unsafeLocations: memory.unsafeLocations,
      emergencyCount: memory.emergencyCount,
      currentRiskLevel: memory.currentRiskLevel,
    },
  });
});

router.get("/chat/history", async (req, res) => {
  const parseResult = GetChatHistoryQueryParams.safeParse(req.query);
  if (!parseResult.success) {
    res.status(400).json({ error: "Missing username" });
    return;
  }
  const { username } = parseResult.data;
  const history = chatHistories.get(username) ?? [];

  res.json({
    username,
    messages: history,
  });
});

router.get("/safety/status", async (req, res) => {
  const parseResult = GetSafetyStatusQueryParams.safeParse(req.query);
  if (!parseResult.success) {
    res.status(400).json({ error: "Missing username" });
    return;
  }
  const { username } = parseResult.data;
  const memory = getOrCreateMemory(username);

  res.json({
    username,
    risk_level: memory.currentRiskLevel,
    emergency_count: memory.emergencyCount,
    unsafe_locations: memory.unsafeLocations,
    last_active: memory.lastActive,
  });
});

router.post("/sos", async (req, res) => {
  const parseResult = TriggerSosBody.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid SOS request" });
    return;
  }

  const { username, location } = parseResult.data;
  const memory = getOrCreateMemory(username);

  memory.emergencyCount += 1;
  memory.lastActive = new Date().toISOString();
  memory.currentRiskLevel = "HIGH RISK";
  memory.emergencyHistory.push(
    `SOS at ${new Date().toISOString()}${location ? ` from ${location}` : ""}`
  );

  if (location && !memory.unsafeLocations.includes(location)) {
    memory.unsafeLocations.push(location);
  }

  logger.warn({ username, location }, "SOS triggered");

  let reply: string;
  try {
    reply = await callGroq(
      [
        {
          role: "system",
          content:
            "You are AuraShield AI in emergency mode. The user has triggered an SOS. Provide calm, actionable safety instructions immediately. Be warm but decisive.",
        },
        {
          role: "user",
          content: `SOS triggered${location ? ` at ${location}` : ""}. I need help.`,
        },
      ],
      EMERGENCY_MODEL
    );
  } catch {
    reply =
      "SOS received! Call 911 NOW. Stay in a well-lit area with people around. Keep moving. Share your location with someone you trust. I'm tracking your situation.";
  }

  res.json({
    success: true,
    message: "SOS alert activated. Emergency protocol engaged.",
    reply,
  });
});

function buildSystemPrompt(
  memory: UserMemory,
  isEmergency: boolean,
  riskLevel: RiskLevel
): string {
  const basePersonality = `You are AuraShield AI — a warm, calm, intelligent, and deeply supportive women's safety companion. 
You speak like a wise, caring friend who also happens to be a safety expert. Never robotic. Never clinical. 
You remember context, adapt to situations, and always prioritize the user's safety and emotional wellbeing.
Keep responses concise but meaningful — 2-4 sentences unless the situation demands more.`;

  const memoryContext =
    memory.emergencyCount > 0
      ? `\nContext: This user has had ${memory.emergencyCount} previous emergency event(s). Be extra attentive.`
      : "";

  if (isEmergency || riskLevel === "HIGH RISK") {
    return `${basePersonality}
EMERGENCY PROTOCOL ACTIVE — Risk Level: HIGH RISK
${memoryContext}
Priority: Immediate safety. Provide calm, actionable instructions. Validate feelings, then guide to safety.
Suggest: moving to public places, calling trusted contacts, noting surroundings, calling emergency services if needed.
Do NOT panic. Be the calm in the storm.`;
  }

  if (riskLevel === "MODERATE") {
    return `${basePersonality}
Current Risk Level: MODERATE — Stay alert.
${memoryContext}
Gently check in, offer safety tips, and keep the conversation warm. Ask clarifying questions to better understand the situation.`;
  }

  return `${basePersonality}
Current Risk Level: SAFE
${memoryContext}
Be warm and conversational. Offer proactive safety tips when relevant. Build trust and rapport.`;
}

export default router;
