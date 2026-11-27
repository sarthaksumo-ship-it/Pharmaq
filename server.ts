import dotenv from 'dotenv';
import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, LiveServerMessage, Modality, ThinkingLevel, Type } from '@google/genai';
import { detectEmergencyRedFlags, redactPii } from './src/utils/safety.ts';
import { VERIFIED_MEDICAL_SOURCES } from './src/data/medicalData.ts';
import type { LanguageMode, ReadingLevel } from './src/types/medmate.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

function getAiClient(apiVersion?: string): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    ...(apiVersion ? { apiVersion } : {}),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getLanguageInstruction(language: LanguageMode): string {
  if (language === 'auto') {
    return 'Detect the language used in the user message automatically and reply in that exact same language using simple, warm, everyday vocabulary suitable for someone without medical training.';
  }
  if (language === 'hi') {
    return 'Write all user-facing explanations, analogies, medicine purposes, precautions, Teach-Back questions, and doctor questions in warm, everyday conversational Hindi (Devanagari script) — avoid overly formal Sanskritized medical jargon so an elderly parent or family caregiver can understand easily.';
  }
  if (language === 'hinglish') {
    return 'Write all user-facing explanations, analogies, medicine purposes, precautions, Teach-Back questions, and doctor questions in clear, friendly Hinglish (conversational Hindi written in Roman script mixed with simple everyday English medical words).';
  }
  return 'Write all user-facing explanations in warm, crystal-clear everyday English at a 6th-to-8th grade reading level.';
}

function getReadingLevelInstruction(level: ReadingLevel): string {
  if (level === 'caregiver') {
    return 'Address a family caregiver helping a loved one (practical, calm, action-oriented reminders like timing, food, and what to double-check with the pharmacist).';
  }
  if (level === 'standard') {
    return 'Provide clear plain-language context along with brief physiological intuition behind each lab or medicine item.';
  }
  return 'Keep sentences short, reassuring, and bite-sized using everyday analogies.';
}

function formatGeminiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('GEMINI_API_KEY is not configured')) {
    return {
      status: 500,
      message: 'API key is not configured on the server. Please add GEMINI_API_KEY in Settings > Secrets.',
    };
  }
  if (raw.includes('403') || raw.includes('PERMISSION_DENIED') || raw.includes('API_KEY_INVALID')) {
    return {
      status: 403,
      message: 'The configured API key was rejected. Please verify GEMINI_API_KEY in Settings > Secrets.',
    };
  }
  if (raw.includes('429') || raw.includes('RESOURCE_EXHAUSTED')) {
    return {
      status: 429,
      message: 'Too many requests right now. Please wait a few seconds and try again.',
    };
  }
  if (raw.includes('503') || raw.includes('UNAVAILABLE')) {
    return {
      status: 503,
      message: 'The AI service is experiencing temporary high demand right now. Please wait a few seconds and try again.',
    };
  }
  return {
    status: 500,
    message: 'Unable to process your request right now. Please try again in a moment.',
  };
}

async function callWithRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const raw = err instanceof Error ? err.message : String(err);
      const isTransient = raw.includes('503') || raw.includes('UNAVAILABLE');
      if (!isTransient || attempt === maxRetries) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
    }
  }
  throw lastErr;
}

async function callWithModelFallback<T>(
  runner: (model: string) => Promise<T>
): Promise<{ result: T; modelUsed: string }> {
  try {
    const result = await callWithRetry(() => runner('gemini-4-hydrogen'), 1);
    return { result, modelUsed: 'gemini-4-hydrogen' };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const shouldFallback =
      raw.includes('503') ||
      raw.includes('UNAVAILABLE') ||
      raw.includes('429') ||
      raw.includes('RESOURCE_EXHAUSTED');
    if (!shouldFallback) throw err;
    const result = await callWithRetry(() => runner('gemini-3.1-flash-lite'), 1);
    return { result, modelUsed: 'gemini-3.1-flash-lite' };
  }
}

const HEALTH_EDUCATOR_SAFETY_RULES = `
Non-negotiable healthcare safety rules:
1. You are a compassionate health-literacy educator, NOT a licensed doctor.
2. NEVER diagnose any disease or condition.
3. NEVER prescribe medications, recommend individual dosage changes, or advise stopping/modifying prescribed treatment.
4. For laboratory results, always remind the user that reference ranges vary across laboratories, age, and clinical history, and must be reviewed with a qualified doctor.
5. For medicines, distinguish general medicine education from personal treatment decisions, and advise confirming exact strip/label details with a pharmacist or prescriber if any text is unclear.
6. If any item looks unclear or incomplete, mark confidence as "check_label" or status as "unclear" rather than guessing.
`;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '12mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // 1. Analyze Medical Report / Prescription / Text / Image
  app.post('/api/analyze', async (req, res) => {
    try {
      const {
        text = '',
        imageBase64 = '',
        imageMimeType = 'image/jpeg',
        language = 'en',
        readingLevel = 'simple',
      } = req.body as {
        text?: string;
        imageBase64?: string;
        imageMimeType?: string;
        language?: LanguageMode;
        readingLevel?: ReadingLevel;
      };

      const trimmedText = text.trim();
      if (!trimmedText && !imageBase64) {
        return res.status(400).json({ error: 'Please paste report/prescription text or upload a clear image.' });
      }

      // Deterministic pre-LLM emergency check
      const emergency = detectEmergencyRedFlags(trimmedText);
      if (emergency.isEmergency) {
        return res.json({ emergency });
      }

      // Deterministic PII scrubbing on text
      const redactionInfo = redactPii(trimmedText);
      const ai = getAiClient();

      const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];
      if (imageBase64) {
        const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
        parts.push({
          inlineData: {
            data: cleanBase64,
            mimeType: imageMimeType || 'image/jpeg',
          },
        });
      }

      const userPrompt = `Analyze the following medical report, prescription, or health note and produce a structured, easy-to-understand educational breakdown.
${getLanguageInstruction(language)}
${getReadingLevelInstruction(readingLevel)}

${redactionInfo.sanitizedText ? `Text content (PII masked):\n"""\n${redactionInfo.sanitizedText}\n"""` : 'Extract the medical details carefully from the attached image. Do not output any personal patient identifiers (names, phone numbers, IDs).'}
`;
      parts.push({ text: userPrompt });

      const response = await callWithRetry(() =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: { parts },
          config: {
            systemInstruction: `${HEALTH_EDUCATOR_SAFETY_RULES}\n${getLanguageInstruction(language)}\n${getReadingLevelInstruction(readingLevel)}`,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                documentType: {
                  type: Type.STRING,
                  description: 'One of: lab_report, prescription, health_note',
                },
                title: { type: Type.STRING, description: 'Short friendly title for this report or prescription.' },
                plainSummary: {
                  type: Type.STRING,
                  description: '2-3 calm, reassuring sentences summarizing what this document is about without diagnosing.',
                },
                analogy: {
                  type: Type.STRING,
                  description: 'One memorable everyday analogy that helps a layperson understand the main concept.',
                },
                labItems: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      value: { type: Type.STRING },
                      unit: { type: Type.STRING },
                      referenceRange: { type: Type.STRING },
                      status: {
                        type: Type.STRING,
                        description: 'One of: normal, borderline, attention, unclear',
                      },
                      simpleExplanation: { type: Type.STRING },
                      whyItMatters: { type: Type.STRING },
                      rangePositionPercent: {
                        type: Type.NUMBER,
                        description: 'Approximate visual position 0-100 where 15-85 represents the printed reference range.',
                      },
                    },
                  },
                },
                medicines: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      strength: { type: Type.STRING },
                      drugClass: { type: Type.STRING, description: 'e.g., Antibiotic, Antacid, Pain/Fever reliever' },
                      rawInstruction: { type: Type.STRING },
                      schedule: {
                        type: Type.OBJECT,
                        properties: {
                          morning: { type: Type.STRING, description: 'Dose count/text or "None"' },
                          afternoon: { type: Type.STRING, description: 'Dose count/text or "None"' },
                          night: { type: Type.STRING, description: 'Dose count/text or "None"' },
                        },
                      },
                      foodTiming: {
                        type: Type.STRING,
                        description: 'One of: before_food, after_food, empty_stomach, with_food, as_needed',
                      },
                      purpose: { type: Type.STRING },
                      keyPrecautions: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                      confidence: {
                        type: Type.STRING,
                        description: 'One of: high, check_label',
                      },
                    },
                  },
                },
                teachBack: {
                  type: Type.OBJECT,
                  properties: {
                    targetConcept: { type: Type.STRING },
                    question: {
                      type: Type.STRING,
                      description: 'One practical scenario question checking the single most important safety or comprehension takeaway.',
                    },
                    hint: { type: Type.STRING },
                    quickOptions: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: '3 short realistic options (including a common misconception so we can teach gently if picked).',
                    },
                  },
                },
                doctorQuestions: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: '3 to 5 specific practical questions the patient or caregiver can ask their doctor.',
                },
                safetyNotice: {
                  type: Type.STRING,
                  description: 'Brief non-diagnostic safety reminder.',
                },
              },
            },
          },
        })
      );

      const parsed = JSON.parse((response.text ?? '{}').trim());
      return res.json({
        emergency: null,
        decoded: {
          documentType: parsed.documentType || 'health_note',
          title: parsed.title || 'Your Health Explanation',
          plainSummary: parsed.plainSummary || '',
          analogy: parsed.analogy || '',
          labItems: Array.isArray(parsed.labItems) ? parsed.labItems : [],
          medicines: Array.isArray(parsed.medicines) ? parsed.medicines : [],
          teachBack: parsed.teachBack || {
            targetConcept: 'Key Takeaway',
            question: 'In your own words, what is the main thing to confirm with your doctor or pharmacist?',
            hint: 'Think about timing or follow-up testing.',
            quickOptions: [],
          },
          doctorQuestions: Array.isArray(parsed.doctorQuestions) ? parsed.doctorQuestions : [],
          sources: VERIFIED_MEDICAL_SOURCES,
          safetyNotice:
            parsed.safetyNotice ||
            'Educational guide only. Lab reference ranges vary by lab, and medicines should only be changed by your prescribing doctor.',
          redactionInfo: {
            redactionCount: redactionInfo.redactionCount,
            redactedFields: redactionInfo.redactedFields,
            sanitizedText: redactionInfo.sanitizedText,
          },
        },
      });
    } catch (err) {
      const formatted = formatGeminiError(err);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 2. Closed-Loop Explain-It-Back Evaluator
  app.post('/api/teachback', async (req, res) => {
    try {
      const {
        targetConcept,
        question,
        userAnswer,
        documentSummary,
        language = 'en',
      } = req.body as {
        targetConcept: string;
        question: string;
        userAnswer: string;
        documentSummary: string;
        language?: LanguageMode;
      };

      if (!userAnswer || !userAnswer.trim()) {
        return res.status(400).json({ error: 'Please select an option or type a short answer first.' });
      }

      const emergency = detectEmergencyRedFlags(userAnswer);
      if (emergency.isEmergency) {
        return res.json({ emergency });
      }

      const ai = getAiClient();
      const response = await callWithRetry(() =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `Target concept: ${targetConcept}
Question asked: ${question}
Document context: ${documentSummary}
User's answer: "${userAnswer.trim()}"

Evaluate whether the user understood the core safe takeaway. Be warm, encouraging, and never judgmental.`,
          config: {
            systemInstruction: `${HEALTH_EDUCATOR_SAFETY_RULES}\n${getLanguageInstruction(language)}`,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                understood: { type: Type.BOOLEAN },
                feedback: {
                  type: Type.STRING,
                  description: 'Warm, encouraging feedback explaining why their answer is right or gently correcting the misconception.',
                },
                simplerAnalogy: {
                  type: Type.STRING,
                  description: 'If not fully understood, provide an even simpler everyday analogy; if understood, reinforce with a brief memory tip.',
                },
                followUpPrompt: {
                  type: Type.STRING,
                  description: 'Short prompt encouraging them to try again if needed, or confirming they are ready.',
                },
              },
            },
          },
        })
      );

      const evaluation = JSON.parse((response.text ?? '{}').trim());
      return res.json({ evaluation });
    } catch (err) {
      const formatted = formatGeminiError(err);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 3. Doctor Visit Prep (Replaces risky symptom-checker chatbot)
  app.post('/api/doctor-prep', async (req, res) => {
    try {
      const { concern = '', language = 'en' } = req.body as {
        concern?: string;
        language?: LanguageMode;
      };

      const trimmed = concern.trim();
      if (!trimmed) {
        return res.status(400).json({ error: 'Please describe what you want to ask your doctor about.' });
      }

      const emergency = detectEmergencyRedFlags(trimmed);
      if (emergency.isEmergency) {
        return res.json({ emergency });
      }

      const scrubbed = redactPii(trimmed);
      const ai = getAiClient();
      const response = await callWithRetry(() =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `A patient or caregiver wants help preparing for a doctor visit regarding:
"${scrubbed.sanitizedText}"

Do NOT diagnose or name likely diseases as a conclusion. Instead, help them organize their thoughts into practical questions for their doctor, what details/records to bring, and clear urgent warning signs that mean seeking care sooner.`,
          config: {
            systemInstruction: `${HEALTH_EDUCATOR_SAFETY_RULES}\n${getLanguageInstruction(language)}`,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                summary: { type: Type.STRING },
                questionsToAsk: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                whatToBring: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                whenToSeekUrgentCare: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
            },
          },
        })
      );

      const prep = JSON.parse((response.text ?? '{}').trim());
      return res.json({
        emergency: null,
        prep: {
          ...prep,
          sources: VERIFIED_MEDICAL_SOURCES,
        },
      });
    } catch (err) {
      const formatted = formatGeminiError(err);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 4. Audio Transcription (gemini-3.5-transcribe with multimodal fallback)
  app.post('/api/transcribe', async (req, res) => {
    try {
      const { audioBase64 = '', mimeType = 'audio/webm' } = req.body as {
        audioBase64?: string;
        mimeType?: string;
      };
      if (!audioBase64) {
        return res.status(400).json({ error: 'No audio recording was provided.' });
      }
      const cleanBase64 = audioBase64.includes(',') ? audioBase64.split(',')[1] : audioBase64;
      const cleanMime = (mimeType.split(';')[0] || 'audio/webm').trim();
      const ai = getAiClient();

      const transcribeModels = ['gemini-3.5-transcribe', 'gemini-4-hydrogen', 'gemini-3.1-flash-lite'];
      let transcript = '';
      let lastErr: unknown = null;

      for (const model of transcribeModels) {
        try {
          const response = await callWithRetry(() =>
            ai.models.generateContent({
              model,
              contents: {
                parts: [
                  {
                    inlineData: {
                      mimeType: cleanMime,
                      data: cleanBase64,
                    },
                  },
                  {
                    text: 'Transcribe the spoken speech in this audio accurately in the original language spoken. Output only the clean spoken transcript text (or empty string if there is only silence).',
                  },
                ],
              },
            }),
            1
          );
          transcript = (response.text ?? '').trim();
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          console.error(`/api/transcribe attempt with ${model} failed:`, err instanceof Error ? err.message : err);
        }
      }

      if (lastErr) {
        throw lastErr;
      }

      return res.json({ transcript });
    } catch (err) {
      console.error('/api/transcribe final error:', err);
      const formatted = formatGeminiError(err);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 5. Multi-turn Gemini Chatbot (gemini-4-hydrogen with conversation history + hospital context + Easy Access mode)
  app.post('/api/chat', async (req, res) => {
    try {
      const {
        messages = [],
        roleMode = 'patient',
        language = 'auto',
        hospitalContext = '',
        easyAccess = false,
      } = req.body as {
        messages?: Array<{ role: 'user' | 'model'; text: string }>;
        roleMode?: 'patient' | 'hospital';
        language?: LanguageMode;
        hospitalContext?: string;
        easyAccess?: boolean;
      };

      const latest = messages[messages.length - 1];
      if (!latest || latest.role !== 'user' || !latest.text.trim()) {
        return res.status(400).json({ error: 'Please enter or speak a message first.' });
      }

      const emergency = detectEmergencyRedFlags(latest.text);
      if (emergency.isEmergency) {
        return res.json({ emergency });
      }

      const ai = getAiClient();
      const history = messages.slice(0, -1).map((m) => ({
        role: m.role,
        parts: [{ text: m.role === 'user' ? redactPii(m.text).sanitizedText : m.text }],
      }));

      const roleSystemInstruction = easyAccess
        ? `You are Pharmer Easy Access ("Precision Guidance · Understand your health. Make informed decisions."), a calm, compassionate, non-judgmental health education assistant built for ordinary people, elderly users, and people with limited digital or medical literacy.
${HEALTH_EDUCATOR_SAFETY_RULES}
Communication & Adaptability Rules:
1. Keep the tone warm, reassuring (never giving false guarantees), respectful, and clear. Never embarrass anyone about their language or health knowledge.
2. Explain everything in short, simple everyday sentences. If you mention a medical word, immediately explain it in plain words.
3. Understand English, Hindi, Hinglish, or any other language automatically and respond naturally in that language (unless a specific language mode is selected below).
4. ADAPTIVE SECTIONS: Do NOT output all 5 sections mechanically for every message! Choose ONLY the sections that genuinely help with the user's specific message:
   - "what_might_be_happening" ("What might be happening?" / equivalent in user language): cautious general possibilities, NEVER a confirmed diagnosis.
   - "what_to_do_now" ("What can you do now?"): safe everyday precautions and gentle self-care.
   - "what_to_avoid" ("What should you avoid?"): relevant things to avoid (only include infection-spread prevention if symptoms actually suggest a contagious illness like fever/cough/cold, NOT for a simple headache or strain).
   - "when_to_see_doctor" ("When should you see a doctor?"): practical signs showing when professional care is wise.
   - "when_urgent" ("When is it urgent?"): warning signs requiring immediate emergency care (mentioning local emergency numbers like 112/108 in India, 911 in US/Canada, 999 in UK when relevant).
   For short follow-up questions or clarifications, you can answer directly in "reply" with 0–2 relevant sections instead of repeating all 5.
5. EXPLAIN-IT-BACK ("Do you understand?"): Include "explainItBack" ONLY when you just shared important safety precautions or next steps (and omit/leave empty for simple greetings or follow-ups). Keep the question warm, simple, and non-intimidating, with 2–3 short practical choices.
6. Set "showHospitalPortalHint" to true ONLY if the user asks about booking a doctor, hospital room directions, or reading a lab report/prescription photo.`
        : roleMode === 'hospital'
        ? `You are Pharmer Hospital Assistant ("Precision Guidance") helping hospital staff write clear patient-friendly wayfinding instructions, doctor profiles, and multilingual summaries. Keep replies concise and practical.`
        : `You are Pharmer Patient Companion ("Precision Guidance") helping patients and caregivers in simple, welcoming language (including users who may struggle with formal medical text).
${HEALTH_EDUCATOR_SAFETY_RULES}
When a patient describes symptoms:
1. Mention general educational possibilities a doctor commonly considers (explicitly stating this is NOT a confirmed diagnosis).
2. Share 2-4 safe, practical everyday precautions (rest, hydration, avoiding self-medicating antibiotics, watching for warning signs).
3. If hospital doctors & free slots are listed in the Hospital Context below, recommend the best matching doctor by name, explain exactly where to find them (floor/wing/room), and reference their available slot ID so the patient can book with one click!`;

      const sanitizedLatest = redactPii(latest.text).sanitizedText;
      const { result: response, modelUsed } = await callWithModelFallback((model) => {
        const chat = ai.chats.create({
          model,
          history,
          config: {
            ...(model === 'gemini-4-hydrogen'
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : {}),
            systemInstruction: `${roleSystemInstruction}
${getLanguageInstruction(language)}
${hospitalContext && !easyAccess ? `\nSelected Hospital Directory & Available Slots:\n${hospitalContext}` : ''}`,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                reply: {
                  type: Type.STRING,
                  description:
                    'Warm, plain-language opening or conversational answer in the user language (2-4 short sentences).',
                },
                precautions: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: 'Optional 0-4 short everyday precautions.',
                },
                recommendedDoctorId: {
                  type: Type.STRING,
                  description: 'Matching doctor ID from the provided hospital directory if relevant, else empty string.',
                },
                recommendedSlotId: {
                  type: Type.STRING,
                  description: 'Matching available slot ID for that doctor if relevant, else empty string.',
                },
                sections: {
                  type: Type.ARRAY,
                  description:
                    'Only populated in easyAccess mode when helpful. Adaptively include only sections relevant to the user question.',
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: {
                        type: Type.STRING,
                        description:
                          'One of: what_might_be_happening, what_to_do_now, what_to_avoid, when_to_see_doctor, when_urgent',
                      },
                      heading: {
                        type: Type.STRING,
                        description:
                          'Friendly localized section heading (e.g., What might be happening?, What can you do now?, What should you avoid?, When should you see a doctor?, When is it urgent?).',
                      },
                      summary: {
                        type: Type.STRING,
                        description: 'Optional 1-2 short plain sentences.',
                      },
                      bullets: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                        description: '2-4 crisp bullet points in simple everyday words.',
                      },
                    },
                    required: ['id', 'heading'],
                  },
                },
                explainItBack: {
                  type: Type.OBJECT,
                  description:
                    'Optional friendly comprehension check when sharing key precautions. Leave targetConcept empty if not needed.',
                  properties: {
                    targetConcept: { type: Type.STRING },
                    question: { type: Type.STRING },
                    hint: { type: Type.STRING },
                    quickOptions: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                  },
                },
                showHospitalPortalHint: {
                  type: Type.BOOLEAN,
                  description:
                    'True if user asks to book an appointment, find a hospital doctor room, or scan a prescription/lab report.',
                },
              },
            },
          },
        });
        return chat.sendMessage({ message: sanitizedLatest });
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      const rawExplain = parsed.explainItBack;
      const cleanExplain =
        rawExplain && typeof rawExplain.question === 'string' && rawExplain.question.trim()
          ? {
              targetConcept: rawExplain.targetConcept || 'Key Safety Step',
              question: rawExplain.question.trim(),
              hint: rawExplain.hint || '',
              quickOptions: Array.isArray(rawExplain.quickOptions) ? rawExplain.quickOptions : [],
            }
          : null;

      return res.json({
        emergency: null,
        reply: parsed.reply || 'I am here to help. Could you share a little more detail?',
        precautions: Array.isArray(parsed.precautions) ? parsed.precautions : [],
        recommendedDoctorId: typeof parsed.recommendedDoctorId === 'string' ? parsed.recommendedDoctorId : '',
        recommendedSlotId: typeof parsed.recommendedSlotId === 'string' ? parsed.recommendedSlotId : '',
        sections: Array.isArray(parsed.sections) ? parsed.sections : [],
        explainItBack: cleanExplain,
        showHospitalPortalHint: Boolean(parsed.showHospitalPortalHint),
        modelUsed,
      });
    } catch (err) {
      const formatted = formatGeminiError(err);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 6. Patient Symptom -> Precautions -> Hospital Doctor & Free Slot Matcher
  app.post('/api/symptom-match', async (req, res) => {
    try {
      const {
        symptoms = '',
        language = 'auto',
        hospitalName = '',
        doctors = [],
        availableSlots = [],
      } = req.body as {
        symptoms?: string;
        language?: LanguageMode;
        hospitalName?: string;
        doctors?: Array<{ id: string; name: string; specialty: string; floorWing: string; roomNumber: string; directionsNote: string }>;
        availableSlots?: Array<{ id: string; doctorId: string; date: string; timeLabel: string }>;
      };

      const trimmed = symptoms.trim();
      if (!trimmed) {
        return res.status(400).json({ error: 'Please describe or speak your symptoms first.' });
      }

      const emergency = detectEmergencyRedFlags(trimmed);
      if (emergency.isEmergency) {
        return res.json({ emergency });
      }

      const scrubbed = redactPii(trimmed);
      const ai = getAiClient();

      const directoryText = doctors.length
        ? doctors
            .map((d) => {
              const docSlots = availableSlots
                .filter((s) => s.doctorId === d.id)
                .map((s) => `[slotId=${s.id}: ${s.date} ${s.timeLabel}]`)
                .join(', ');
              return `- doctorId=${d.id} | ${d.name} (${d.specialty}) | Location: ${d.floorWing}, ${d.roomNumber} (${d.directionsNote}) | Free slots: ${docSlots || 'None right now'}`;
            })
            .join('\n')
        : 'No doctors listed yet for this hospital.';

      const { result: response } = await callWithModelFallback((model) =>
        ai.models.generateContent({
          model,
          contents: `Patient symptom description (PII masked):
"${scrubbed.sanitizedText}"

Selected Hospital: ${hospitalName || 'Selected Hospital'}
Hospital Doctors & Available Slots:
${directoryText}

Provide calm, simple educational guidance: general possibilities a doctor may check (NOT a confirmed diagnosis), immediate safe precautions, and pick the best matching doctorId and available slotId from the list above.`,
          config: {
            ...(model === 'gemini-4-hydrogen'
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : {}),
            systemInstruction: `${HEALTH_EDUCATOR_SAFETY_RULES}\n${getLanguageInstruction(language)}`,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                possibleConditionsSummary: {
                  type: Type.STRING,
                  description: 'Simple, non-alarming explanation of general possibilities a doctor may evaluate (never a confirmed diagnosis).',
                },
                precautions: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: '3 to 5 clear everyday precautions and what NOT to do without a doctor.',
                },
                nonDiagnosticNotice: {
                  type: Type.STRING,
                  description: 'Clear 1-sentence reminder that only a licensed doctor can diagnose or prescribe.',
                },
                matchedDoctorId: {
                  type: Type.STRING,
                  description: 'The exact doctorId from the provided list that fits best, or empty string if none.',
                },
                matchReason: {
                  type: Type.STRING,
                  description: 'Plain-language reason why this specialist is a good fit.',
                },
                recommendedSlotId: {
                  type: Type.STRING,
                  description: 'The exact slotId from the matched doctor free slots, or empty string if none.',
                },
                suggestedQuestions: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: '3 simple questions to ask this doctor.',
                },
              },
            },
          },
        })
      );

      const carePlan = JSON.parse((response.text ?? '{}').trim());
      return res.json({ emergency: null, carePlan });
    } catch (err) {
      const formatted = formatGeminiError(err);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  function wrapPcm16ToWav(pcmBuffer: Buffer, sampleRate = 24000): Buffer {
    const wavHeader = Buffer.alloc(44);
    wavHeader.write('RIFF', 0);
    wavHeader.writeUInt32LE(36 + pcmBuffer.length, 4);
    wavHeader.write('WAVE', 8);
    wavHeader.write('fmt ', 12);
    wavHeader.writeUInt32LE(16, 16);
    wavHeader.writeUInt16LE(1, 20);
    wavHeader.writeUInt16LE(1, 22);
    wavHeader.writeUInt32LE(sampleRate, 24);
    wavHeader.writeUInt32LE(sampleRate * 2, 28);
    wavHeader.writeUInt16LE(2, 32);
    wavHeader.writeUInt16LE(16, 34);
    wavHeader.write('data', 36);
    wavHeader.writeUInt32LE(pcmBuffer.length, 40);
    return Buffer.concat([wavHeader, pcmBuffer]);
  }

  async function synthesizeViaLiveTurn(textToSpeak: string, language: LanguageMode): Promise<string> {
    const ai = getAiClient('v1beta');
    const langRule =
      language === 'hi'
        ? 'Speak in clear, warm, natural Hindi.'
        : language === 'hinglish'
        ? 'Speak in clear, warm, natural Hinglish / Indian English.'
        : 'Speak clearly in the exact same language as the provided text.';

    return new Promise((resolve, reject) => {
      const pcmChunks: Buffer[] = [];
      let settled = false;
      let session: Awaited<ReturnType<GoogleGenAI['live']['connect']>> | null = null;

      const errors: string[] = [];

      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        try {
          session?.close();
        } catch {
          // ignore
        }
        if (err) {
          reject(err);
          return;
        }
        const pcm = Buffer.concat(pcmChunks);
        if (pcm.length === 0) {
          reject(new Error('Live TTS returned empty audio.'));
          return;
        }
        resolve(wrapPcm16ToWav(pcm, 24000).toString('base64'));
      };

      const timeout = setTimeout(() => {
        if (pcmChunks.length > 0) {
          finish();
        } else {
          finish(new Error('Live TTS timed out.'));
        }
      }, 15000);

      void ai.live
        .connect({
          model: 'gemini-3.8-live',
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
            },
            systemInstruction: `You are a verbatim text-to-speech reader for Pharmer. Read the exact message given to you aloud word-for-word without adding commentary or changing languages. ${langRule}`,
          },
          callbacks: {
            onopen: () => {},
            onmessage: (message: LiveServerMessage) => {
              const content = message.serverContent;
              for (const part of content?.modelTurn?.parts ?? []) {
                if (part.inlineData?.data) {
                  pcmChunks.push(Buffer.from(part.inlineData.data, 'base64'));
                }
              }
              if (content?.turnComplete) {
                finish();
              }
            },
            onerror: (e: unknown) => {
              const eObj = e as { message?: string; error?: { message?: string } };
              const msg = eObj?.message || eObj?.error?.message || JSON.stringify(e) || 'Live TTS socket error';
              errors.push(msg);
              finish(new Error(`Live TTS error: ${msg}`));
            },
            onclose: (ev?: { reason?: string; code?: number }) => {
              if (!settled) {
                if (pcmChunks.length > 0) finish();
                else finish(new Error(`Live TTS closed (${ev?.code || ''}: ${ev?.reason || errors.join('; ')})`));
              }
            },
          },
        })
        .then((s) => {
          session = s;
          if (!settled) {
            s.sendRealtimeInput({ text: `Read aloud verbatim:\n${textToSpeak}` });
          }
        })
        .catch((err) => {
          finish(err instanceof Error ? err : new Error(String(err)));
        });
    });
  }

  // 7. Read-Aloud TTS (gemini-3.8-flash-lite-tts on v1beta/v1alpha + live audio WAV fallback)
  app.post('/api/tts', async (req, res) => {
    const attemptLog: string[] = [];
    try {
      const { text = '', language = 'auto' } = req.body as {
        text?: string;
        language?: LanguageMode;
      };
      const trimmed = text.trim().slice(0, 1200);
      if (!trimmed) {
        return res.status(400).json({ error: 'No text provided to read aloud.' });
      }
      const effectiveLanguage: LanguageMode =
        language === 'auto' && /[\u0900-\u097F]/.test(trimmed) ? 'hi' : language;
      const attempts: Array<{ model: string; apiVersion: string }> = [
        { model: 'gemini-3.8-flash-lite-tts', apiVersion: 'v1beta' },
        { model: 'gemini-3.8-flash-lite-tts', apiVersion: 'v1alpha' },
        { model: 'gemini-3.8-flash-tts', apiVersion: 'v1beta' },
      ];
      let audioBase64: string | undefined;
      let audioMimeType = 'audio/wav';

      for (const { model, apiVersion } of attempts) {
        try {
          const ai = getAiClient(apiVersion);
          const response = await callWithRetry(
            () =>
              ai.models.generateContent({
                model,
                contents: [{ role: 'user', parts: [{ text: trimmed }] }],
                config: {
                  responseModalities: [Modality.AUDIO],
                  speechConfig: {
                    voiceConfig: {
                      prebuiltVoiceConfig: { voiceName: 'Kore' },
                    },
                  },
                },
              }),
            0
          );
          const parts = response.candidates?.[0]?.content?.parts ?? [];
          const audioPart = parts.find((p) => Boolean(p.inlineData?.data));
          if (audioPart?.inlineData?.data) {
            audioBase64 = audioPart.inlineData.data;
            audioMimeType = audioPart.inlineData.mimeType || 'audio/wav';
            break;
          }
          attemptLog.push(`${model}@${apiVersion}: no inlineData`);
        } catch (err) {
          const m = err instanceof Error ? err.message : String(err);
          attemptLog.push(`${model}@${apiVersion}: ${m}`);
          console.error(`/api/tts attempt ${model}@${apiVersion} failed:`, m);
        }
      }

      if (!audioBase64) {
        audioBase64 = await synthesizeViaLiveTurn(trimmed, effectiveLanguage);
        audioMimeType = 'audio/wav';
      }

      return res.json({ audioBase64, mimeType: audioMimeType });
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      attemptLog.push(`live: ${rawMsg}`);
      console.error('/api/tts final error:', attemptLog.join(' | '));
      const formatted = formatGeminiError(err);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  const server = http.createServer(app);

  // 8. Gemini Live API WebSocket Bridge (/live) using gemini-3.8-live
  const wss = new WebSocketServer({ server, path: '/live' });

  wss.on('connection', (clientWs: WebSocket) => {
    let liveSession: Awaited<ReturnType<GoogleGenAI['live']['connect']>> | null = null;
    let isConnecting = false;

    const sendSafe = (payload: Record<string, unknown>) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    const initLiveSession = async (
      language: LanguageMode,
      readingLevel: ReadingLevel,
      documentContext: string,
      hospitalContext: string
    ) => {
      if (liveSession || isConnecting) return;
      isConnecting = true;
      try {
        const ai = getAiClient('v1beta');
        const scrubbedDoc = documentContext ? redactPii(documentContext).sanitizedText : '';
        const scrubbedHospital = hospitalContext ? redactPii(hospitalContext).sanitizedText : '';
        const systemInstruction = `You are Pharmer ("Precision Guidance"), a calm, warm, voice-first healthcare companion speaking directly with a patient, caregiver, or user who may not be able to read easily.
${HEALTH_EDUCATOR_SAFETY_RULES}
${getLanguageInstruction(language)}
${getReadingLevelInstruction(readingLevel)}
Voice style rules:
- Speak in whichever language the user speaks to you.
- Keep spoken answers warm, concise, and clear (2-4 short sentences at a time).
- If they describe symptoms, share general precautions, explain which specialist to consult, and tell them the exact doctor name, room/floor directions, and free appointment times from the selected hospital context below.
- If the user describes any emergency red-flag symptom (chest pain, trouble breathing, stroke signs, severe bleeding, fainting, overdose, self-harm), immediately tell them to call emergency services (112/108 in India, 911 in US/Canada, 999 in UK) right now.
${scrubbedHospital ? `\nSelected Hospital Doctors, Room Locations & Free Times:\n${scrubbedHospital}` : ''}
${scrubbedDoc ? `\nCurrently open report/prescription summary (PII removed):\n${scrubbedDoc}` : ''}`;

        liveSession = await ai.live.connect({
          model: 'gemini-3.8-live',
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            systemInstruction,
          },
          callbacks: {
            onopen: () => {
              sendSafe({ type: 'ready' });
            },
            onmessage: (message: LiveServerMessage) => {
              const content = message.serverContent;
              if (content?.inputTranscription?.text) {
                sendSafe({ type: 'inputTranscript', text: content.inputTranscription.text });
              }
              if (content?.outputTranscription?.text) {
                sendSafe({ type: 'outputTranscript', text: content.outputTranscription.text });
              }
              for (const part of content?.modelTurn?.parts ?? []) {
                if (part.inlineData?.data) {
                  sendSafe({ type: 'audio', audio: part.inlineData.data });
                }
              }
              if (content?.interrupted) {
                sendSafe({ type: 'interrupted' });
              }
              if (content?.turnComplete) {
                sendSafe({ type: 'turnComplete' });
              }
            },
            onerror: (err) => {
              const msg = err instanceof Error ? err.message : 'Voice session encountered an error.';
              sendSafe({ type: 'error', error: msg });
            },
            onclose: () => {
              sendSafe({ type: 'closed' });
            },
          },
        });
      } catch (err) {
        const formatted = formatGeminiError(err);
        sendSafe({ type: 'error', error: formatted.message });
      } finally {
        isConnecting = false;
      }
    };

    clientWs.on('message', async (rawData) => {
      try {
        const msg = JSON.parse(rawData.toString()) as {
          type?: string;
          audio?: string;
          text?: string;
          language?: LanguageMode;
          readingLevel?: ReadingLevel;
          documentContext?: string;
          hospitalContext?: string;
        };

        if (msg.type === 'setup') {
          await initLiveSession(
            msg.language || 'auto',
            msg.readingLevel || 'simple',
            msg.documentContext || '',
            msg.hospitalContext || ''
          );
          return;
        }

        if (!liveSession) {
          await initLiveSession('auto', 'simple', '', '');
        }

        if (msg.audio && liveSession) {
          liveSession.sendRealtimeInput({
            audio: { data: msg.audio, mimeType: 'audio/pcm;rate=16000' },
          });
        } else if (msg.text && liveSession) {
          const emergency = detectEmergencyRedFlags(msg.text);
          if (emergency.isEmergency) {
            sendSafe({ type: 'emergency', emergency });
          }
          liveSession.sendRealtimeInput({
            text: redactPii(msg.text).sanitizedText,
          });
        }
      } catch (err) {
        const formatted = formatGeminiError(err);
        sendSafe({ type: 'error', error: formatted.message });
      }
    });

    clientWs.on('close', () => {
      try {
        liveSession?.close();
      } catch {
        // Ignore cleanup errors on closed session
      }
      liveSession = null;
    });
  });

  // Vite dev middleware or production static build
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build.');
      }
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Pharmer server listening on http://localhost:${PORT}`);
  });
}

startServer();
