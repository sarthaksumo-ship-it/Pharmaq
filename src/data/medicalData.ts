import type { MedicalSource } from '../types/medmate';

export interface SampleCase {
  id: string;
  label: string;
  category: string;
  summaryHint: string;
  text: string;
}

export const ANONYMIZED_SAMPLE_CASES: SampleCase[] = [
  {
    id: 'lab-hba1c-cbc',
    label: 'Lab Report: HbA1c & Blood Count',
    category: 'Blood Test',
    summaryHint: 'Shows borderline blood sugar (HbA1c) & hemoglobin with synthetic PII to test privacy masking',
    text: `Patient Name: Ramesh Verma (Fictional Sample)
UHID: LAB-884920
Phone: +91 98765 43210
Lab Panel: Routine Wellness Check

1. HbA1c (Glycated Hemoglobin): 6.1 %  [Lab Reference: < 5.7 Normal | 5.7 - 6.4 Prediabetes range | >= 6.5 Diabetes range]
2. Fasting Blood Glucose: 108 mg/dL [Lab Reference: 70 - 99 mg/dL]
3. Hemoglobin (Hb): 11.8 g/dL [Lab Reference: 13.0 - 17.0 g/dL]
4. Total Cholesterol: 186 mg/dL [Lab Reference: < 200 mg/dL]`,
  },
  {
    id: 'rx-antibiotic-antacid',
    label: 'Prescription: Antibiotic & Antacid',
    category: 'Prescription',
    summaryHint: 'Decodes BD PC, OD AC, SOS codes and explains why timing matters',
    text: `Patient Name: Priya Nair (Fictional Sample)
Reg No: OPD-2026-419
Diagnosis Note: Acute throat infection (sample)

Rx:
1. Tab. Amoxicillin + Clavulanic Acid 625 mg — 1-0-1 (BD PC) x 5 days. Complete full course.
2. Cap. Pantoprazole 40 mg — 1-0-0 (OD AC, 30 mins before breakfast) x 5 days.
3. Tab. Paracetamol 650 mg — SOS for fever > 100.4 F (max 3 tablets/24 hrs).`,
  },
  {
    id: 'caregiver-thyroid-bp',
    label: 'Caregiver Note: Thyroid & Blood Pressure',
    category: 'Caregiver Guide',
    summaryHint: 'Helps family caregivers organize empty-stomach morning pills safely',
    text: `Patient Name: Meena Devi (Fictional Sample)
DOB: 12/04/1958
Phone: 9123456789

Ongoing Medications & Follow-up Lab:
- Tab. Levothyroxine 50 mcg: 1 tab OD early morning empty stomach (wait 30-45 mins before tea/breakfast or calcium/antacids).
- Tab. Amlodipine 5 mg: 1 tab OD after breakfast.
- Lab Result: TSH 4.8 mIU/L [Lab Reference: 0.4 - 4.5 mIU/L].`,
  },
];

export const VERIFIED_MEDICAL_SOURCES: MedicalSource[] = [
  {
    title: 'Understanding Lab Test Results',
    organization: 'MedlinePlus (U.S. National Library of Medicine)',
    url: 'https://medlineplus.gov/lab-tests/',
  },
  {
    title: 'A1C Test & Blood Sugar Education',
    organization: 'NIDDK / NIH',
    url: 'https://www.niddk.nih.gov/health-information/diagnostic-tests/a1c-test',
  },
  {
    title: 'Safe Use of Antibiotics',
    organization: 'World Health Organization (WHO)',
    url: 'https://www.who.int/news-room/fact-sheets/detail/antibiotic-resistance',
  },
  {
    title: 'Medicines Information & Precautions',
    organization: 'NHS Medicines A-Z',
    url: 'https://www.nhs.uk/medicines/',
  },
];
