export type LanguageMode = 'en' | 'hi' | 'hinglish' | 'auto';
export type ReadingLevel = 'simple' | 'caregiver' | 'standard';

export type UserRole = 'patient' | 'hospital';

export interface UserProfile {
  uid: string;
  role: UserRole;
  displayName: string;
  preferredLanguage: LanguageMode;
  hospitalName?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Hospital {
  id: string;
  ownerUid: string;
  name: string;
  city: string;
  address: string;
  helpdeskPhone: string;
  departments: string[];
  isDemo?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Doctor {
  id: string;
  hospitalId: string;
  ownerUid: string;
  name: string;
  specialty: string;
  qualifications: string;
  floorWing: string;
  roomNumber: string;
  directionsNote: string;
  languages: string[];
  isDemo?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface MeetingSlot {
  id: string;
  hospitalId: string;
  doctorId: string;
  doctorName: string;
  specialty: string;
  roomLocation: string;
  ownerUid: string;
  date: string;
  timeLabel: string;
  status: 'available' | 'booked';
  lastAppointmentId: string;
  isDemo?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Appointment {
  id: string;
  patientUid: string;
  patientName: string;
  hospitalId: string;
  hospitalName: string;
  hospitalOwnerUid: string;
  doctorId: string;
  doctorName: string;
  specialty: string;
  roomLocation: string;
  slotId: string;
  date: string;
  timeLabel: string;
  symptomSummary: string;
  status: 'confirmed' | 'completed' | 'cancelled';
  isDemo?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
  precautions?: string[];
  recommendedDoctorId?: string;
  recommendedSlotId?: string;
  modelUsed?: string;
}

export type EasyAccessSectionId =
  | 'what_might_be_happening'
  | 'what_to_do_now'
  | 'what_to_avoid'
  | 'when_to_see_doctor'
  | 'when_urgent';

export interface EasyAccessSection {
  id: EasyAccessSectionId;
  heading: string;
  summary?: string;
  bullets?: string[];
}

export interface EasyAccessChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
  sections?: EasyAccessSection[];
  explainItBack?: TeachBackCheck | null;
  showHospitalPortalHint?: boolean;
  modelUsed?: string;
}

export interface SymptomCarePlan {
  possibleConditionsSummary: string;
  precautions: string[];
  nonDiagnosticNotice: string;
  matchedDoctorId: string;
  matchReason: string;
  recommendedSlotId: string;
  suggestedQuestions: string[];
}

export type LabStatus = 'normal' | 'borderline' | 'attention' | 'unclear';

export interface LabItem {
  name: string;
  value: string;
  unit: string;
  referenceRange: string;
  status: LabStatus;
  simpleExplanation: string;
  whyItMatters: string;
  rangePositionPercent?: number;
}

export type FoodTiming =
  | 'before_food'
  | 'after_food'
  | 'empty_stomach'
  | 'with_food'
  | 'as_needed';

export interface MedicineItem {
  name: string;
  strength: string;
  drugClass: string;
  rawInstruction: string;
  schedule: {
    morning: string;
    afternoon: string;
    night: string;
  };
  foodTiming: FoodTiming;
  purpose: string;
  keyPrecautions: string[];
  confidence: 'high' | 'check_label';
}

export interface TeachBackCheck {
  targetConcept: string;
  question: string;
  hint: string;
  quickOptions: string[];
}

export interface TeachBackEvaluation {
  understood: boolean;
  feedback: string;
  simplerAnalogy: string;
  followUpPrompt: string;
}

export interface MedicalSource {
  title: string;
  organization: string;
  url: string;
}

export interface DecodedDocument {
  documentType: 'lab_report' | 'prescription' | 'health_note';
  title: string;
  plainSummary: string;
  analogy: string;
  labItems: LabItem[];
  medicines: MedicineItem[];
  teachBack: TeachBackCheck;
  doctorQuestions: string[];
  sources: MedicalSource[];
  safetyNotice: string;
  redactionInfo: {
    redactionCount: number;
    redactedFields: string[];
    sanitizedText: string;
  };
}

export interface EmergencyCheckResult {
  isEmergency: boolean;
  matchedCategories: string[];
  title: string;
  guidance: string;
  helplines: Array<{
    region: string;
    number: string;
    label: string;
  }>;
}

export interface DoctorPrepResult {
  summary: string;
  questionsToAsk: string[];
  whatToBring: string[];
  whenToSeekUrgentCare: string[];
  sources: MedicalSource[];
}

export interface LiveTranscriptEntry {
  id: string;
  speaker: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: string;
}
