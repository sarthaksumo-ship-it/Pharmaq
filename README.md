# Pharmer — Precision Guidance

**Pharmer** is an accessible, multilingual healthcare guidance and hospital navigation web application built with React, TypeScript, Tailwind CSS, Express, Google Gemini API, Firebase Authentication, and Cloud Firestore.

## Official Brand Identity
- **Name**: Pharmer
- **Tagline**: Precision Guidance
- **Brand Assets**:
  - `public/assets/pharmer-logo.png` — Official full brand logo
  - `public/assets/pharmer-logo-lockup.png` — Official brand lockup (hexagonal orange/blue emblem, cream circle with green sprout, wordmark, and tagline)
  - `public/assets/pharmer-favicon.png` & `public/assets/favicon-64.png` — Cropped hexagonal symbol icon

## Core Features
1. **Patient Companion Portal**
   - Hospital directory selection with live slot counts
   - Voice-first (`Speak Symptoms (Any Language)`) and preset symptom input
   - Educational symptom guidance, safe precautions, and read-aloud TTS
   - Matched specialist recommendation with exact floor/wing/room walking directions
   - Atomic appointment slot booking and appointment management
2. **Hospital Member Portal**
   - Hospital profile creation and editing
   - 1-click sample hospital, doctors, and slots import
   - Doctor management with room numbers and walking directions
   - Appointment slot upload, reopening, and patient booking status updates
3. **24/7 Pharmer AI Chatbot & Real-Time Live Voice**
   - Multi-turn multilingual chatbot (`POST /api/chat`) with inline doctor room cards and booking
   - Real-time bidirectional voice companion over WebSocket (`/live`)
4. **Medical Report & Prescription Decoder**
   - Upload photo or paste lab reports / prescriptions
   - Client- and server-side PII masking before AI analysis
   - Closed-loop **Explain-It-Back** comprehension check and **Doctor Visit Preparation** checklist
5. **Medical Safety Guardrails**
   - Deterministic emergency red-flag detector (`detectEmergencyRedFlags`) with local emergency numbers (`112 / 108`, `911 / 988`, `999 / 111`)
   - Non-diagnostic educational disclaimers across all patient-facing outputs

## Local Setup
1. Configure `GEMINI_API_KEY` in environment secrets (see `.env.example`).
2. Install dependencies: `npm install`
3. Start development server: `npm run dev` (serves Express + Vite on port `3000`)
4. Build production bundle: `npm run build`
