import type { EmergencyCheckResult } from '../types/medmate';

interface EmergencyRule {
  category: string;
  patterns: RegExp[];
}

const EMERGENCY_RULES: EmergencyRule[] = [
  {
    category: 'Chest pain or suspected heart emergency',
    patterns: [
      /\b(chest pain|crushing chest|chest tightness|chest pressure|heart attack)\b/i,
      /\b(seene mein dard|chhati mein dard|dil ka daura)\b/i,
      /सीने में दर्द|छाती में दर्द|दिल का दौरा/i,
    ],
  },
  {
    category: 'Difficulty breathing or severe shortness of breath',
    patterns: [
      /\b(can'?t breathe|cannot breathe|difficulty breathing|shortness of breath|gasping|choking|blue lips)\b/i,
      /\b(saans lene mein takleef|saans phool|dum ghut)\b/i,
      /सांस लेने में तकलीफ|सांस फूल|दम घुट/i,
    ],
  },
  {
    category: 'Possible stroke signs',
    patterns: [
      /\b(face droop|slurred speech|sudden weakness|one side numb|stroke|sudden confusion)\b/i,
      /\b(lakwa|bolne mein dikkat|chehra tedha)\b/i,
      /लकवा|बोलने में दिक्कत/i,
    ],
  },
  {
    category: 'Severe bleeding, unconsciousness, or seizures',
    patterns: [
      /\b(severe bleeding|won'?t stop bleeding|unconscious|passed out|fainted and won'?t wake|seizure|convulsion)\b/i,
      /\b(behosh|daura pad|bahut khoon)\b/i,
      /बेहोश|दौरा पड़|बहुत खून/i,
    ],
  },
  {
    category: 'Severe allergic reaction or poisoning/overdose',
    patterns: [
      /\b(anaphylaxis|swollen throat|tongue swelling|overdose|took too many pills|poison)\b/i,
      /\b(gala sooj|zyada goli kha)\b/i,
      /गला सूज|ओवरडोज/i,
    ],
  },
  {
    category: 'Self-harm or mental health crisis',
    patterns: [
      /\b(suicidal|kill myself|end my life|self[- ]harm|want to die)\b/i,
      /\b(khudkushi|marna chahta|marna chahti)\b/i,
      /आत्महत्या|खुदकुशी/i,
    ],
  },
];

export const DEFAULT_HELPLINES = [
  { region: 'India', number: '112 / 108', label: 'National Emergency & Ambulance' },
  { region: 'India (Crisis)', number: '14416', label: 'Tele-MANAS 24/7 Support' },
  { region: 'US & Canada', number: '911 / 988', label: 'Emergency & Crisis Lifeline' },
  { region: 'UK', number: '999 / 111', label: 'Emergency & Urgent Medical Advice' },
];

export function detectEmergencyRedFlags(input: string): EmergencyCheckResult {
  const normalized = (input || '').trim();
  if (!normalized) {
    return {
      isEmergency: false,
      matchedCategories: [],
      title: '',
      guidance: '',
      helplines: [],
    };
  }

  const matchedCategories: string[] = [];
  for (const rule of EMERGENCY_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(normalized))) {
      matchedCategories.push(rule.category);
    }
  }

  if (matchedCategories.length === 0) {
    return {
      isEmergency: false,
      matchedCategories: [],
      title: '',
      guidance: '',
      helplines: [],
    };
  }

  return {
    isEmergency: true,
    matchedCategories,
    title: 'Possible Urgent Symptoms Detected — Seek Immediate Care',
    guidance:
      'Pharmer cannot assess medical emergencies. Please call emergency services or go to the nearest emergency department right away. Do not wait for an online answer.',
    helplines: DEFAULT_HELPLINES,
  };
}

export interface PiiRedactionResult {
  sanitizedText: string;
  redactionCount: number;
  redactedFields: string[];
}

export function redactPii(input: string): PiiRedactionResult {
  let sanitized = input || '';
  const redactedFields = new Set<string>();
  let redactionCount = 0;

  const replaceWithTrack = (
    regex: RegExp,
    replacement: string | ((...args: string[]) => string),
    fieldLabel: string
  ) => {
    sanitized = sanitized.replace(regex, (...args) => {
      redactionCount += 1;
      redactedFields.add(fieldLabel);
      if (typeof replacement === 'function') {
        return replacement(...args);
      }
      return replacement;
    });
  };

  // Patient / Doctor header lines
  replaceWithTrack(
    /^(\s*(?:patient\s*name|name|patient)\s*[:\-]\s*)(.+)$/gim,
    (_m, prefix) => `${prefix}[REDACTED PATIENT NAME]`,
    'Patient Name'
  );

  // Patient / Hospital / MRN / UHID / Aadhaar-like IDs
  replaceWithTrack(
    /(\b(?:mrn|uhid|patient\s*id|reg(?:istration)?\s*(?:no|id)|lab\s*id|aadhaar)\s*[:\-#]?\s*)([A-Z0-9\-\/]{4,})/gi,
    (_m, prefix) => `${prefix}[REDACTED ID]`,
    'Medical / ID Number'
  );

  // Email addresses
  replaceWithTrack(
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    '[REDACTED EMAIL]',
    'Email Address'
  );

  // Phone numbers (+91 5+5, US 3+3+4, or 10-digit formats)
  replaceWithTrack(
    /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b|\b\d{5}[\s.-]?\d{5}\b|\b\d{10}\b)/g,
    '[REDACTED PHONE]',
    'Phone Number'
  );

  // Explicit DOB lines
  replaceWithTrack(
    /(\b(?:dob|date\s*of\s*birth)\s*[:\-][ \t]*)([0-9A-Za-z\/\- ,]{4,20})/gi,
    (_m, prefix) => `${prefix}[REDACTED DOB]`,
    'Date of Birth'
  );

  // Address lines
  replaceWithTrack(
    /^(\s*(?:address|residence)\s*[:\-]\s*)(.+)$/gim,
    (_m, prefix) => `${prefix}[REDACTED ADDRESS]`,
    'Address'
  );

  return {
    sanitizedText: sanitized,
    redactionCount,
    redactedFields: Array.from(redactedFields),
  };
}
