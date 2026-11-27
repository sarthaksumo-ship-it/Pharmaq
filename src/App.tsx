import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { ArrowLeft, Building2, MessageSquare, Mic, UserCheck } from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Header } from './components/Header';
import { EasyAccessHome } from './components/EasyAccessHome';
import { EmergencyBanner } from './components/EmergencyBanner';
import { PatientPortal } from './components/PatientPortal';
import { HospitalPortal } from './components/HospitalPortal';
import { AiChatbotPanel } from './components/AiChatbotPanel';
import { LiveVoicePanel } from './components/LiveVoicePanel';
import { DocumentInputPanel } from './components/DocumentInputPanel';
import { DecodedResultsView } from './components/DecodedResultsView';
import { DoctorPrepPanel } from './components/DoctorPrepPanel';
import { AuthRoleModal } from './components/AuthRoleModal';
import { SafetyGuideFooter } from './components/SafetyGuideFooter';
import { DEMO_DOCTORS, DEMO_HOSPITALS, DEMO_SLOTS } from './data/hospitalDirectory';
import {
  auth,
  bookSlotAtomically,
  fetchDoctorsAndSlots,
  fetchHospitalsFromFirestore,
  fetchMyAppointments,
  getUserProfile,
  makeSafeId,
  signInWithGoogle,
  signOutUser,
  updateAppointmentStatus,
  upsertUserProfile,
} from './firebase';
import { detectEmergencyRedFlags } from './utils/safety';
import type {
  Appointment,
  DecodedDocument,
  Doctor,
  EmergencyCheckResult,
  Hospital,
  LanguageMode,
  MeetingSlot,
  ReadingLevel,
  TeachBackEvaluation,
  UserProfile,
  UserRole,
} from './types/medmate';

function PharmerAppContent() {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authDefaultRole, setAuthDefaultRole] = useState<UserRole>('patient');

  const [activeView, setActiveView] = useState<'easy' | 'platform'>('easy');
  const [activePortal, setActivePortal] = useState<UserRole>('patient');
  const [aiTab, setAiTab] = useState<'chat' | 'voice'>('chat');
  const [language, setLanguage] = useState<LanguageMode>('auto');
  const [readingLevel, setReadingLevel] = useState<ReadingLevel>('simple');
  const routeOnLoginRef = useRef(false);

  // Hospitals, doctors, slots, appointments
  const [firestoreHospitals, setFirestoreHospitals] = useState<Hospital[]>([]);
  const [selectedHospitalId, setSelectedHospitalId] = useState<string>(DEMO_HOSPITALS[0].id);
  const [firestoreDoctors, setFirestoreDoctors] = useState<Doctor[]>([]);
  const [firestoreSlots, setFirestoreSlots] = useState<MeetingSlot[]>([]);
  const [firestoreAppointments, setFirestoreAppointments] = useState<Appointment[]>([]);

  // Local preview bookings for sample hospitals
  const [demoBookedSlotIds, setDemoBookedSlotIds] = useState<Record<string, boolean>>({});
  const [demoAppointments, setDemoAppointments] = useState<Appointment[]>([]);

  // Report & Prescription Decoder state
  const [text, setText] = useState('');
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string>('image/jpeg');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [decoded, setDecoded] = useState<DecodedDocument | null>(null);
  const [emergency, setEmergency] = useState<EmergencyCheckResult | null>(null);
  const [, setIsLiveConnected] = useState(false);
  const [voiceConnectSignal, setVoiceConnectSignal] = useState(0);

  const hospitals = useMemo(
    () => [...firestoreHospitals, ...DEMO_HOSPITALS],
    [firestoreHospitals]
  );

  const selectedHospital = useMemo(
    () => hospitals.find((h) => h.id === selectedHospitalId) || hospitals[0] || null,
    [hospitals, selectedHospitalId]
  );

  const doctors = useMemo(() => {
    if (!selectedHospital) return [];
    if (selectedHospital.isDemo) {
      return DEMO_DOCTORS.filter((d) => d.hospitalId === selectedHospital.id);
    }
    return firestoreDoctors;
  }, [selectedHospital, firestoreDoctors]);

  const slots = useMemo(() => {
    if (!selectedHospital) return [];
    if (selectedHospital.isDemo) {
      return DEMO_SLOTS.filter((s) => s.hospitalId === selectedHospital.id).map((s) =>
        demoBookedSlotIds[s.id] ? { ...s, status: 'booked' as const } : s
      );
    }
    return firestoreSlots;
  }, [selectedHospital, firestoreSlots, demoBookedSlotIds]);

  const appointments = useMemo(
    () => [...firestoreAppointments, ...demoAppointments],
    [firestoreAppointments, demoAppointments]
  );

  const loadDirectoryAndBookings = useCallback(
    async (focusHospitalId?: string, currentUid?: string | null, currentRole?: UserRole) => {
      try {
        const liveHosp = await fetchHospitalsFromFirestore();
        setFirestoreHospitals(liveHosp);

        const targetId = focusHospitalId || selectedHospitalId;
        const isLiveTarget = liveHosp.some((h) => h.id === targetId);
        if (isLiveTarget) {
          const { doctors: docs, slots: sls } = await fetchDoctorsAndSlots(targetId);
          setFirestoreDoctors(docs);
          setFirestoreSlots(sls);
        } else if (focusHospitalId && !DEMO_HOSPITALS.some((h) => h.id === focusHospitalId)) {
          const { doctors: docs, slots: sls } = await fetchDoctorsAndSlots(focusHospitalId);
          setFirestoreDoctors(docs);
          setFirestoreSlots(sls);
        } else {
          setFirestoreDoctors([]);
          setFirestoreSlots([]);
        }

        const effectiveUid = currentUid !== undefined ? currentUid : firebaseUser?.uid;
        const effectiveRole = currentRole || profile?.role || activePortal;
        if (effectiveUid) {
          const appts = await fetchMyAppointments(effectiveUid, effectiveRole);
          setFirestoreAppointments(appts);
        } else {
          setFirestoreAppointments([]);
        }
      } catch (err) {
        console.error('Directory sync error:', err);
      }
    },
    [selectedHospitalId, firebaseUser?.uid, profile?.role, activePortal]
  );

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        try {
          const prof = await getUserProfile(user.uid);
          setProfile(prof);
          if (prof) {
            setActivePortal(prof.role);
            setLanguage(prof.preferredLanguage || 'auto');
            if (routeOnLoginRef.current) {
              routeOnLoginRef.current = false;
              setActiveView('platform');
              setAuthModalOpen(false);
            }
            await loadDirectoryAndBookings(undefined, user.uid, prof.role);
          } else {
            setAuthModalOpen(true);
            await loadDirectoryAndBookings(undefined, user.uid, 'patient');
          }
        } catch {
          await loadDirectoryAndBookings(undefined, user.uid, 'patient');
        }
      } else {
        setProfile(null);
        await loadDirectoryAndBookings(undefined, null, 'patient');
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const isLive = firestoreHospitals.some((h) => h.id === selectedHospitalId);
    if (isLive) {
      void fetchDoctorsAndSlots(selectedHospitalId)
        .then(({ doctors: docs, slots: sls }) => {
          setFirestoreDoctors(docs);
          setFirestoreSlots(sls);
        })
        .catch(() => {
          setFirestoreDoctors([]);
          setFirestoreSlots([]);
        });
    } else {
      setFirestoreDoctors([]);
      setFirestoreSlots([]);
    }
  }, [selectedHospitalId, firestoreHospitals]);

  const handleGoogleSignIn = async () => {
    routeOnLoginRef.current = true;
    await signInWithGoogle();
  };

  const handleSaveProfile = async (data: {
    role: UserRole;
    displayName: string;
    preferredLanguage: LanguageMode;
    hospitalName?: string;
  }) => {
    if (!firebaseUser) return;
    const saved = await upsertUserProfile({
      uid: firebaseUser.uid,
      ...data,
    });
    setProfile(saved);
    setActivePortal(saved.role);
    setActiveView('platform');
    setLanguage(saved.preferredLanguage);
    await loadDirectoryAndBookings(undefined, firebaseUser.uid, saved.role);
  };

  const handleSignOut = async () => {
    await signOutUser();
    setProfile(null);
    setFirestoreAppointments([]);
  };

  const handleBookSlot = async (params: {
    hospital: Hospital;
    slot: MeetingSlot;
    symptomSummary: string;
  }): Promise<Appointment | null> => {
    if (params.hospital.isDemo) {
      const previewAppt: Appointment = {
        id: makeSafeId('demo_appt'),
        patientUid: firebaseUser?.uid || 'guest',
        patientName: profile?.displayName || 'Guest Patient',
        hospitalId: params.hospital.id,
        hospitalName: params.hospital.name,
        hospitalOwnerUid: params.hospital.ownerUid,
        doctorId: params.slot.doctorId,
        doctorName: params.slot.doctorName,
        specialty: params.slot.specialty,
        roomLocation: params.slot.roomLocation,
        slotId: params.slot.id,
        date: params.slot.date,
        timeLabel: params.slot.timeLabel,
        symptomSummary: params.symptomSummary,
        status: 'confirmed',
        isDemo: true,
      };
      setDemoBookedSlotIds((prev) => ({ ...prev, [params.slot.id]: true }));
      setDemoAppointments((prev) => [previewAppt, ...prev]);
      return previewAppt;
    }

    if (!firebaseUser) {
      setAuthDefaultRole('patient');
      setAuthModalOpen(true);
      return null;
    }

    const created = await bookSlotAtomically({
      patientUid: firebaseUser.uid,
      patientName: profile?.displayName || firebaseUser.displayName || 'Patient',
      hospital: params.hospital,
      slot: params.slot,
      symptomSummary: params.symptomSummary,
    });
    await loadDirectoryAndBookings(params.hospital.id, firebaseUser.uid, profile?.role || 'patient');
    return created;
  };

  const handleCancelAppointment = async (appt: Appointment) => {
    if (appt.isDemo) {
      setDemoAppointments((prev) =>
        prev.map((a) => (a.id === appt.id ? { ...a, status: 'cancelled' } : a))
      );
      setDemoBookedSlotIds((prev) => {
        const next = { ...prev };
        delete next[appt.slotId];
        return next;
      });
      return;
    }
    await updateAppointmentStatus(appt.id, 'cancelled');
    await loadDirectoryAndBookings(appt.hospitalId);
  };

  const hospitalContextString = useMemo(() => {
    if (!selectedHospital) return '';
    const available = slots.filter((s) => s.status === 'available');
    const doctorLines = doctors.map((d) => {
      const openSlots = available
        .filter((s) => s.doctorId === d.id)
        .map((s) => `[slotId=${s.id}: ${s.date} ${s.timeLabel}]`)
        .join(', ');
      return `doctorId=${d.id} | ${d.name} (${d.specialty}) | Location: ${d.floorWing}, ${d.roomNumber} (${d.directionsNote}) | Open Slots: ${openSlots || 'None'}`;
    });
    return `Hospital: ${selectedHospital.name} (${selectedHospital.city}) · Helpdesk: ${selectedHospital.helpdeskPhone}\nDoctors & Slots:\n${doctorLines.join('\n')}`;
  }, [selectedHospital, doctors, slots]);

  // Document Decoder Handlers
  const handleImageSelect = (file: File) => {
    setImageName(file.name);
    setImageMimeType(file.type || 'image/jpeg');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImageBase64(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleClearImage = () => {
    setImageBase64(null);
    setImageName(null);
  };

  const handleAnalyze = async () => {
    setAnalyzeError(null);
    const localEmergency = detectEmergencyRedFlags(text);
    if (localEmergency.isEmergency) {
      setEmergency(localEmergency);
      setDecoded(null);
      return;
    }

    setEmergency(null);
    setIsAnalyzing(true);
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          imageBase64: imageBase64 || '',
          imageMimeType,
          language,
          readingLevel,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Could not explain this document right now.');
      }
      if (data.emergency?.isEmergency) {
        setEmergency(data.emergency);
        setDecoded(null);
        return;
      }
      setDecoded(data.decoded);
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleEvaluateTeachBack = async (answer: string): Promise<TeachBackEvaluation | null> => {
    if (!decoded) return null;
    const response = await fetch('/api/teachback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetConcept: decoded.teachBack.targetConcept,
        question: decoded.teachBack.question,
        userAnswer: answer,
        documentSummary: decoded.plainSummary,
        language,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Unable to verify your answer right now.');
    }
    if (data.emergency?.isEmergency) {
      setEmergency(data.emergency);
      return null;
    }
    return data.evaluation as TeachBackEvaluation;
  };

  const scrollToAndStartVoice = () => {
    setAiTab('voice');
    const el = document.getElementById('ai-companion');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setVoiceConnectSignal((prev) => prev + 1);
  };

  const liveDocumentContext = useMemo(() => {
    if (!decoded) return '';
    const labs = decoded.labItems
      .map((l) => `${l.name}: ${l.value} ${l.unit} (Ref: ${l.referenceRange})`)
      .join('; ');
    const meds = decoded.medicines
      .map((m) => `${m.name} ${m.strength} (${m.rawInstruction}, ${m.foodTiming})`)
      .join('; ');
    return `Title: ${decoded.title}\nSummary: ${decoded.plainSummary}\n${labs ? `Labs: ${labs}\n` : ''}${meds ? `Medicines: ${meds}` : ''}`;
  }, [decoded]);

  const openSpecialisedPortal = (portal: UserRole) => {
    setActivePortal(portal);
    setActiveView('platform');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openEasyAccessHome = () => {
    setActiveView('easy');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div id="top" className="min-h-screen flex flex-col bg-[#F3EFE6] text-[#1F1B18]">
      <Header
        profile={profile}
        activeView={activeView}
        activePortal={activePortal}
        onSelectEasyAccess={openEasyAccessHome}
        onSelectPortal={openSpecialisedPortal}
        onOpenAuthModal={() => {
          setAuthDefaultRole(activePortal);
          setAuthModalOpen(true);
        }}
      />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-8">
        {/* Urgent Care Alert (always appears prominently above active experience when triggered) */}
        {emergency?.isEmergency && (
          <EmergencyBanner emergency={emergency} onDismiss={() => setEmergency(null)} />
        )}

        {activeView === 'easy' ? (
          <EasyAccessHome
            language={language}
            onLanguageChange={setLanguage}
            onEmergencyDetected={(em) => setEmergency(em)}
            onOpenPortal={openSpecialisedPortal}
          />
        ) : (
          <>
            {/* Hero with Official Pharmer Logo Lockup & Role Portal Switcher */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              <div className="lg:col-span-7 space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={openEasyAccessHome}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#2864A0] bg-white border border-[#E2DCD0] hover:border-[#2864A0] rounded-lg transition-colors whitespace-nowrap"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                    Easy Access Home
                  </button>
                  <p className="text-xs font-semibold text-[#2864A0]">
                    Pharmer · Precision Guidance · Specialised Platform
                  </p>
                </div>
                <h1
                  className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-[#1F1B18] leading-tight"
                  style={{ textWrap: 'balance' }}
                >
                  Right precautions, right doctor, exact room — spoken or typed in your language.
                </h1>
                <p className="text-base text-[#5A564E] leading-relaxed">
                  Patients can describe or speak symptoms to get safe precautions, doctor directions, and free appointment bookings. Hospital teams can publish doctors, room locations, and open meeting times.
                </p>

                {/* Portal & Language Switcher */}
                <div className="flex flex-wrap items-center gap-4 pt-1">
                  <div
                    role="tablist"
                    aria-label="Choose Pharmer portal"
                    className="inline-flex p-1 bg-[#E7E1D4] rounded-xl"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activePortal === 'patient'}
                      onClick={() => setActivePortal('patient')}
                      className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap min-h-[42px] ${
                        activePortal === 'patient'
                          ? 'bg-white text-[#2864A0] shadow-xs'
                          : 'text-[#5A564E] hover:text-[#1F1B18]'
                      }`}
                    >
                      <UserCheck className="w-4 h-4 text-[#2864A0]" aria-hidden="true" />
                      Patient Portal
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activePortal === 'hospital'}
                      onClick={() => setActivePortal('hospital')}
                      className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap min-h-[42px] ${
                        activePortal === 'hospital'
                          ? 'bg-white text-[#B86A14] shadow-xs'
                          : 'text-[#5A564E] hover:text-[#1F1B18]'
                      }`}
                    >
                      <Building2 className="w-4 h-4 text-[#D78728]" aria-hidden="true" />
                      Hospital Portal
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-[#5A564E]">
                    <span>Language:</span>
                    {(
                      [
                        { id: 'auto', label: 'Any' },
                        { id: 'en', label: 'English' },
                        { id: 'hi', label: 'हिन्दी' },
                        { id: 'hinglish', label: 'Hinglish' },
                      ] as const
                    ).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setLanguage(item.id)}
                        className={`px-2.5 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap ${
                          language === item.id
                            ? 'bg-[#2864A0] text-white'
                            : 'bg-white border border-[#E2DCD0] text-[#1F1B18] hover:border-[#2864A0]'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Official Pharmer Brand Lockup */}
              <div className="lg:col-span-5 flex justify-center lg:justify-end">
                <div className="bg-[#F3EFE6] border border-[#E2DCD0] rounded-2xl p-5 sm:p-6 flex items-center justify-center w-full max-w-sm">
                  <img
                    src="/assets/pharmer-logo-lockup.png"
                    alt="Pharmer — Precision Guidance"
                    className="w-52 sm:w-60 h-auto object-contain"
                  />
                </div>
              </div>
            </section>

            {/* Dual-Role Workspace */}
            <div id="portal-workspace">
              {activePortal === 'patient' ? (
                <PatientPortal
                  hospitals={hospitals}
                  selectedHospitalId={selectedHospital?.id || ''}
                  onSelectHospital={setSelectedHospitalId}
                  doctors={doctors}
                  slots={slots}
                  appointments={appointments}
                  language={language}
                  profile={profile}
                  isSignedIn={Boolean(firebaseUser)}
                  onEmergencyDetected={(em) => setEmergency(em)}
                  onBookSlot={handleBookSlot}
                  onCancelAppointment={handleCancelAppointment}
                  onRequestAuth={() => {
                    setAuthDefaultRole('patient');
                    setAuthModalOpen(true);
                  }}
                />
              ) : (
                <HospitalPortal
                  uid={firebaseUser?.uid || null}
                  profile={profile}
                  hospitals={hospitals}
                  selectedHospitalId={selectedHospital?.id || ''}
                  onSelectHospital={setSelectedHospitalId}
                  doctors={doctors}
                  slots={slots}
                  appointments={appointments}
                  onRefreshData={(focusId) => loadDirectoryAndBookings(focusId)}
                  onRequestHospitalAuth={() => {
                    setAuthDefaultRole('hospital');
                    setAuthModalOpen(true);
                  }}
                />
              )}
            </div>

            {/* Multilingual AI Chatbot + Real-Time Live Voice Hub */}
            <section
              id="ai-companion"
              aria-label="Pharmer AI Chatbot and Live Voice Companion"
              className="space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl font-semibold text-[#1F1B18]">
                    24/7 Pharmer Chatbot &amp; Live Voice Companion
                  </h2>
                  <p className="text-sm text-[#5A564E]">
                    Built for everyone — type, tap to speak in any language, or have a real-time voice conversation.
                  </p>
                </div>
                <div className="inline-flex p-1 bg-[#E7E1D4] rounded-xl self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setAiTab('chat')}
                    className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap min-h-[38px] ${
                      aiTab === 'chat'
                        ? 'bg-white text-[#2864A0] shadow-xs'
                        : 'text-[#5A564E] hover:text-[#1F1B18]'
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-[#2864A0]" aria-hidden="true" />
                    AI Chatbot
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiTab('voice')}
                    className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap min-h-[38px] ${
                      aiTab === 'voice'
                        ? 'bg-white text-[#2864A0] shadow-xs'
                        : 'text-[#5A564E] hover:text-[#1F1B18]'
                    }`}
                  >
                    <Mic className="w-3.5 h-3.5 text-[#D78728]" aria-hidden="true" />
                    Real-Time Voice
                  </button>
                </div>
              </div>

              {aiTab === 'chat' ? (
                <div className="bg-white border border-[#E2DCD0] rounded-2xl p-5 sm:p-7">
                  <AiChatbotPanel
                    roleMode={activePortal}
                    language={language}
                    onLanguageChange={setLanguage}
                    selectedHospital={selectedHospital}
                    hospitalContext={hospitalContextString}
                    doctors={doctors}
                    slots={slots}
                    onEmergencyDetected={(em) => setEmergency(em)}
                    onBookSlot={handleBookSlot}
                  />
                </div>
              ) : (
                <LiveVoicePanel
                  language={language}
                  readingLevel={readingLevel}
                  documentContext={liveDocumentContext}
                  hospitalContext={hospitalContextString}
                  onConnectionChange={setIsLiveConnected}
                  onEmergencyDetected={(em) => setEmergency(em)}
                  connectSignal={voiceConnectSignal}
                />
              )}
            </section>

            {/* Report & Prescription Decoder */}
            <DocumentInputPanel
              text={text}
              onTextChange={setText}
              imagePreviewUrl={imageBase64}
              imageName={imageName}
              onImageSelect={handleImageSelect}
              onClearImage={handleClearImage}
              language={language}
              onLanguageChange={setLanguage}
              readingLevel={readingLevel}
              onReadingLevelChange={setReadingLevel}
              onAnalyze={handleAnalyze}
              isAnalyzing={isAnalyzing}
              error={analyzeError}
            />

            {isAnalyzing && (
              <section
                aria-label="Analyzing medical information"
                className="bg-white border border-[#E2DCD0] rounded-2xl p-6 sm:p-8 flex items-center gap-5"
              >
                <img
                  src="/assets/pharmer-favicon.png"
                  alt="Pharmer loading"
                  className="w-12 h-12 object-contain shrink-0"
                />
                <div className="flex-1 space-y-2.5 animate-pulse">
                  <div className="h-4 w-48 bg-[#E7E1D4] rounded" />
                  <div className="h-3.5 w-full bg-[#F3EFE6] rounded" />
                  <div className="h-3.5 w-4/5 bg-[#F3EFE6] rounded" />
                </div>
              </section>
            )}

            {decoded && !isAnalyzing && (
              <DecodedResultsView
                decoded={decoded}
                language={language}
                onAskByVoice={scrollToAndStartVoice}
                onEvaluateTeachBack={handleEvaluateTeachBack}
              />
            )}

            <DoctorPrepPanel
              language={language}
              onEmergencyDetected={(em) => setEmergency(em)}
            />
          </>
        )}
      </main>

      <AuthRoleModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        firebaseUser={firebaseUser}
        profile={profile}
        defaultRole={authDefaultRole}
        onGoogleSignIn={handleGoogleSignIn}
        onSaveProfile={handleSaveProfile}
        onSignOut={handleSignOut}
      />

      <SafetyGuideFooter />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <PharmerAppContent />
    </ErrorBoundary>
  );
}
