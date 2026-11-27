import React, { useMemo, useState } from 'react';
import {
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  MapPin,
  Phone,
  ShieldAlert,
  Stethoscope,
  XCircle,
} from 'lucide-react';
import { AudioTranscribeButton } from './AudioTranscribeButton';
import { SpeakAloudButton } from './SpeakAloudButton';
import { detectEmergencyRedFlags } from '../utils/safety';
import type {
  Appointment,
  Doctor,
  EmergencyCheckResult,
  Hospital,
  LanguageMode,
  MeetingSlot,
  SymptomCarePlan,
  UserProfile,
} from '../types/medmate';

interface PatientPortalProps {
  hospitals: Hospital[];
  selectedHospitalId: string;
  onSelectHospital: (hospitalId: string) => void;
  doctors: Doctor[];
  slots: MeetingSlot[];
  appointments: Appointment[];
  language: LanguageMode;
  profile: UserProfile | null;
  isSignedIn: boolean;
  onEmergencyDetected: (emergency: EmergencyCheckResult) => void;
  onBookSlot: (params: {
    hospital: Hospital;
    slot: MeetingSlot;
    symptomSummary: string;
  }) => Promise<Appointment | null>;
  onCancelAppointment: (appointment: Appointment) => Promise<void>;
  onRequestAuth: () => void;
}

const SYMPTOM_PRESETS = [
  {
    label: 'Fever & sore throat',
    text: 'I have had mild fever, sore throat, and body ache since yesterday morning.',
  },
  {
    label: 'Dizziness & palpitations',
    text: 'I feel mild dizziness and occasional fast heartbeat when climbing stairs.',
  },
  {
    label: 'High sugar checkup',
    text: 'My fasting blood sugar came around 165 mg/dL and I feel very thirsty.',
  },
  {
    label: 'Earache & blocked nose',
    text: 'I have ear fullness, blocked nose, and cough for the last 4 days.',
  },
];

export const PatientPortal: React.FC<PatientPortalProps> = ({
  hospitals,
  selectedHospitalId,
  onSelectHospital,
  doctors,
  slots,
  appointments,
  language,
  profile,
  isSignedIn,
  onEmergencyDetected,
  onBookSlot,
  onCancelAppointment,
  onRequestAuth,
}) => {
  const [symptoms, setSymptoms] = useState('');
  const [isMatching, setIsMatching] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [carePlan, setCarePlan] = useState<SymptomCarePlan | null>(null);

  const [bookingSlotId, setBookingSlotId] = useState<string | null>(null);
  const [bookingMessage, setBookingMessage] = useState<string | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);

  const selectedHospital = useMemo(
    () => hospitals.find((h) => h.id === selectedHospitalId) || hospitals[0] || null,
    [hospitals, selectedHospitalId]
  );

  const availableSlots = useMemo(
    () => slots.filter((s) => s.status === 'available'),
    [slots]
  );

  const matchedDoctor = useMemo(() => {
    if (!carePlan?.matchedDoctorId) return null;
    return doctors.find((d) => d.id === carePlan.matchedDoctorId) || null;
  }, [carePlan, doctors]);

  const matchedDoctorSlots = useMemo(() => {
    if (!matchedDoctor) return [];
    return availableSlots.filter((s) => s.doctorId === matchedDoctor.id);
  }, [matchedDoctor, availableSlots]);

  const handleAnalyzeSymptoms = async () => {
    setMatchError(null);
    setBookingMessage(null);
    setBookingError(null);

    const trimmed = symptoms.trim();
    if (!trimmed) {
      setMatchError('Please type or speak your symptoms first.');
      return;
    }

    const localEmergency = detectEmergencyRedFlags(trimmed);
    if (localEmergency.isEmergency) {
      onEmergencyDetected(localEmergency);
      setCarePlan(null);
      return;
    }

    setIsMatching(true);
    try {
      const response = await fetch('/api/symptom-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symptoms: trimmed,
          language,
          hospitalName: selectedHospital?.name || 'Selected Hospital',
          doctors: doctors.map((d) => ({
            id: d.id,
            name: d.name,
            specialty: d.specialty,
            floorWing: d.floorWing,
            roomNumber: d.roomNumber,
            directionsNote: d.directionsNote,
          })),
          availableSlots: availableSlots.map((s) => ({
            id: s.id,
            doctorId: s.doctorId,
            date: s.date,
            timeLabel: s.timeLabel,
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Could not analyze symptoms right now.');
      }
      if (data.emergency?.isEmergency) {
        onEmergencyDetected(data.emergency);
        setCarePlan(null);
        return;
      }
      setCarePlan(data.carePlan as SymptomCarePlan);
    } catch (err) {
      setMatchError(err instanceof Error ? err.message : 'Unable to reach Pharmer companion.');
    } finally {
      setIsMatching(false);
    }
  };

  const handleConfirmBooking = async (slot: MeetingSlot) => {
    if (!selectedHospital) return;
    setBookingError(null);
    setBookingMessage(null);

    if (!selectedHospital.isDemo && !isSignedIn) {
      onRequestAuth();
      return;
    }

    setBookingSlotId(slot.id);
    try {
      const booked = await onBookSlot({
        hospital: selectedHospital,
        slot,
        symptomSummary: symptoms.trim() || 'Symptom consultation',
      });
      if (booked) {
        setBookingMessage(
          `Confirmed with ${booked.doctorName} (${booked.date} · ${booked.timeLabel}). Go to: ${booked.roomLocation}.`
        );
      }
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : 'Could not book this slot right now.');
    } finally {
      setBookingSlotId(null);
    }
  };

  const spokenCarePlanText = useMemo(() => {
    if (!carePlan) return '';
    const docText = matchedDoctor
      ? `Recommended doctor: ${matchedDoctor.name}, ${matchedDoctor.specialty}. You can find them at ${matchedDoctor.floorWing}, ${matchedDoctor.roomNumber}. ${matchedDoctor.directionsNote}`
      : '';
    return `${carePlan.possibleConditionsSummary}. Precautions: ${carePlan.precautions.join('. ')}. ${docText}. ${carePlan.nonDiagnosticNotice}`;
  }, [carePlan, matchedDoctor]);

  return (
    <div className="space-y-6">
      {/* Step 1: Select Hospital */}
      <section
        aria-labelledby="select-hospital-heading"
        className="bg-white border border-[#E2DCD0] rounded-2xl p-5 sm:p-7"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E2DCD0]">
          <div className="flex items-center gap-3">
            <img
              src="/assets/pharmer-favicon.png"
              alt="Pharmer emblem"
              className="w-8 h-8 object-contain rounded-md shrink-0"
            />
            <div>
              <div className="text-xs font-medium text-[#2864A0]">
                Step 1 · Hospital Directory
              </div>
              <h2 id="select-hospital-heading" className="font-display text-xl font-semibold text-[#1F1B18] mt-0.5">
                Choose a hospital for doctor wayfinding &amp; booking
              </h2>
            </div>
          </div>
          {!isSignedIn && (
            <button
              type="button"
              onClick={onRequestAuth}
              className="self-start sm:self-auto px-3.5 py-2 text-xs font-semibold text-[#2864A0] bg-[#EDF4FB] hover:bg-[#DFECFA] border border-[#BDD5EE] rounded-lg transition-colors whitespace-nowrap"
            >
              Sign in to save bookings permanently
            </button>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {hospitals.map((hospital) => {
            const isSelected = selectedHospital?.id === hospital.id;
            return (
              <button
                key={hospital.id}
                type="button"
                onClick={() => {
                  onSelectHospital(hospital.id);
                  setCarePlan(null);
                  setBookingMessage(null);
                }}
                aria-pressed={isSelected}
                className={`text-left p-4 rounded-xl border transition-colors ${
                  isSelected
                    ? 'border-[#2864A0] bg-[#EDF4FB]/70'
                    : 'border-[#E2DCD0] hover:border-[#2864A0]/70 hover:bg-[#FAF7F0]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 font-display font-semibold text-[#1F1B18]">
                    <Building2 className="w-4 h-4 text-[#2864A0] shrink-0" aria-hidden="true" />
                    <span>{hospital.name}</span>
                  </div>
                  <span className="text-xs text-[#5A564E] whitespace-nowrap shrink-0">
                    {hospital.city} {hospital.isDemo ? '· Sample' : '· Live'}
                  </span>
                </div>
                <div className="text-xs text-[#5A564E] mt-1.5 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#D78728] shrink-0" aria-hidden="true" />
                  <span>{hospital.address}</span>
                </div>
                <div className="text-xs text-[#5A564E] mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="inline-flex items-center gap-1">
                    <Phone className="w-3 h-3" aria-hidden="true" />
                    {hospital.helpdeskPhone}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{hospital.departments.slice(0, 3).join(', ')}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected Hospital Quick Roster */}
        {selectedHospital && (
          <div className="mt-4 pt-4 border-t border-[#E2DCD0] flex flex-wrap items-center justify-between gap-2 text-xs text-[#5A564E]">
            <div>
              Active hospital: <strong className="text-[#1F1B18]">{selectedHospital.name}</strong>
              <span aria-hidden="true"> · </span>
              <span className="tabular-nums">{doctors.length} doctors</span>
              <span aria-hidden="true"> · </span>
              <span className="tabular-nums text-[#267D40] font-semibold">
                {availableSlots.length} free appointment slot{availableSlots.length === 1 ? '' : 's'}
              </span>
            </div>
            {profile?.displayName && (
              <span>Signed in as {profile.displayName}</span>
            )}
          </div>
        )}
      </section>

      {/* Step 2: Tell or Speak Symptoms */}
      <section
        aria-labelledby="symptom-companion-heading"
        className="bg-white border border-[#E2DCD0] rounded-2xl p-5 sm:p-7"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-[#E2DCD0]">
          <div>
            <div className="text-xs font-medium text-[#2864A0]">
              Step 2 · Precision Symptom Guidance &amp; Precautions
            </div>
            <h2 id="symptom-companion-heading" className="font-display text-xl font-semibold text-[#1F1B18] mt-0.5">
              Tell or speak how you feel in any language
            </h2>
            <p className="text-sm text-[#5A564E] mt-1">
              Pharmer explains possible causes for educational awareness, shares safe precautions, points you to the right doctor room, and shows free booking times.
            </p>
          </div>
          <AudioTranscribeButton
            onTranscript={(spoken) =>
              setSymptoms((prev) => (prev ? `${prev} ${spoken}` : spoken))
            }
            label="Speak Symptoms (Any Language)"
          />
        </div>

        {/* Tap-friendly Symptom Presets */}
        <div className="mt-4">
          <p className="text-xs font-medium text-[#5A564E] mb-2">
            Or tap a common concern:
          </p>
          <div className="flex flex-wrap gap-2">
            {SYMPTOM_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => setSymptoms(preset.text)}
                className="px-3 py-2 text-xs font-medium text-[#1F1B18] bg-[#FAF7F0] hover:bg-[#EDF4FB] hover:text-[#2864A0] border border-[#E2DCD0] hover:border-[#2864A0] rounded-lg transition-colors"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <label htmlFor="patient-symptom-input" className="sr-only">
            Describe your symptoms in any language
          </label>
          <textarea
            id="patient-symptom-input"
            rows={3}
            value={symptoms}
            onChange={(e) => setSymptoms(e.target.value)}
            placeholder="Describe how you feel in English, Hindi, Hinglish, or any language (or press Speak Symptoms above)..."
            className="w-full rounded-xl border border-[#D5CCBC] bg-[#FAF7F0]/60 px-4 py-3 text-sm text-[#1F1B18] placeholder:text-[#7A7469] focus:bg-white focus:border-[#2864A0] focus:outline-none focus:ring-2 focus:ring-[#2864A0]/20"
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-[#5A564E]">
              Not a diagnosis or prescription · For chest pain or breathing trouble, call emergency services immediately.
            </p>
            <button
              type="button"
              onClick={handleAnalyzeSymptoms}
              disabled={isMatching || !symptoms.trim()}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-[#2864A0] hover:bg-[#1E5082] disabled:bg-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0 min-h-[44px]"
            >
              {isMatching ? 'Finding Precautions & Doctor...' : 'Get Precautions & Find Doctor'}
            </button>
          </div>
        </div>

        {matchError && (
          <div role="alert" className="mt-4 p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-900">
            {matchError}
          </div>
        )}
      </section>

      {/* Step 3: Precautions + Matched Doctor + Wayfinding + Booking */}
      {carePlan && (
        <section
          aria-labelledby="care-plan-heading"
          className="bg-white border border-[#BDD5EE] rounded-2xl p-5 sm:p-7 space-y-5"
        >
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-[#E2DCD0]">
            <div>
              <div className="text-xs font-semibold text-[#2864A0]">
                Step 3 · Educational Guidance &amp; Doctor Match
              </div>
              <h3 id="care-plan-heading" className="font-display text-xl font-semibold text-[#1F1B18] mt-0.5">
                What this might relate to &amp; safe next steps
              </h3>
            </div>
            <SpeakAloudButton
              text={spokenCarePlanText}
              language={language}
              label="Read Precautions & Directions Aloud"
            />
          </div>

          <div className="p-3.5 rounded-xl bg-[#FDF4E7] border border-[#F1D0A5] flex items-start gap-2.5 text-xs text-[#6B3C0A]">
            <ShieldAlert className="w-4 h-4 text-[#D78728] shrink-0 mt-0.5" aria-hidden="true" />
            <span>{carePlan.nonDiagnosticNotice}</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-[#1F1B18]">
                  Possible conditions a doctor may check
                </h4>
                <p className="text-sm text-[#5A564E] mt-1.5 leading-relaxed">
                  {carePlan.possibleConditionsSummary}
                </p>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-[#1F1B18]">
                  Safe precautions while waiting to see the doctor
                </h4>
                <ul className="mt-2 space-y-1.5 text-sm text-[#5A564E] list-disc list-inside">
                  {carePlan.precautions.map((item, idx) => (
                    <li key={idx} className="leading-relaxed">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {carePlan.suggestedQuestions.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-[#1F1B18]">
                    Questions to ask your doctor
                  </h4>
                  <ol className="mt-2 space-y-1 text-sm text-[#5A564E] list-decimal list-inside">
                    {carePlan.suggestedQuestions.map((q, idx) => (
                      <li key={idx}>{q}</li>
                    ))}
                  </ol>
                </div>
              )}
            </div>

            {/* Matched Doctor & Room Wayfinding */}
            <div className="space-y-4">
              {matchedDoctor ? (
                <div className="p-4 sm:p-5 rounded-xl bg-[#FAF7F0] border border-[#E2DCD0] space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold text-[#2864A0]">
                        Recommended Doctor at {selectedHospital?.name}
                      </div>
                      <h4 className="font-display text-lg font-bold text-[#1F1B18] mt-0.5 flex items-center gap-2">
                        <Stethoscope className="w-4 h-4 text-[#2864A0] shrink-0" aria-hidden="true" />
                        {matchedDoctor.name}
                      </h4>
                      <p className="text-xs text-[#5A564E] mt-0.5">
                        {matchedDoctor.specialty} · {matchedDoctor.qualifications}
                      </p>
                    </div>
                  </div>

                  {carePlan.matchReason && (
                    <p className="text-sm text-[#5A564E]">{carePlan.matchReason}</p>
                  )}

                  <div className="p-3 rounded-lg bg-white border border-[#E2DCD0] space-y-1">
                    <div className="text-xs font-semibold text-[#1F1B18] flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-[#D78728] shrink-0" aria-hidden="true" />
                      Where to find {matchedDoctor.name}:
                    </div>
                    <div className="text-sm font-semibold text-[#2864A0]">
                      {matchedDoctor.floorWing} · {matchedDoctor.roomNumber}
                    </div>
                    <div className="text-xs text-[#5A564E]">
                      {matchedDoctor.directionsNote}
                    </div>
                    <div className="text-xs text-[#7A7469] pt-1">
                      Speaks: {matchedDoctor.languages.join(', ')}
                    </div>
                  </div>

                  {/* Available Slots for Matched Doctor */}
                  <div>
                    <div className="text-xs font-semibold text-[#1F1B18] mb-2">
                      Free appointment times for {matchedDoctor.name}:
                    </div>
                    {matchedDoctorSlots.length === 0 ? (
                      <p className="text-xs text-[#5A564E]">
                        No open slots listed for this doctor right now. Check other open slots below or contact hospital helpdesk ({selectedHospital?.helpdeskPhone}).
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {matchedDoctorSlots.map((slot) => (
                          <div
                            key={slot.id}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-white border border-[#E2DCD0]"
                          >
                            <div className="text-xs text-[#1F1B18] flex items-center gap-2">
                              <Calendar className="w-3.5 h-3.5 text-[#267D40] shrink-0" aria-hidden="true" />
                              <span className="font-mono tabular-nums font-medium">{slot.date}</span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums font-semibold">{slot.timeLabel}</span>
                            </div>
                            <button
                              type="button"
                              disabled={bookingSlotId === slot.id}
                              onClick={() => handleConfirmBooking(slot)}
                              className="px-3.5 py-2 text-xs font-semibold text-white bg-[#2864A0] hover:bg-[#1E5082] disabled:bg-slate-400 rounded-lg transition-colors whitespace-nowrap min-h-[36px]"
                            >
                              {bookingSlotId === slot.id ? 'Booking...' : 'Book Appointment'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-[#FAF7F0] border border-[#E2DCD0] text-sm text-[#5A564E]">
                  Please check the open slots below or ask the hospital helpdesk to match you with an on-duty specialist.
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Booking Confirmation / Error Feedback */}
      {bookingMessage && (
        <div
          role="status"
          className="p-4 rounded-xl bg-[#ECF7EF] border border-[#B8DFC3] text-sm text-[#174D27] flex items-start gap-2.5"
        >
          <CheckCircle2 className="w-5 h-5 text-[#267D40] shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <div className="font-semibold">Appointment Booked</div>
            <div className="mt-0.5">{bookingMessage}</div>
          </div>
        </div>
      )}

      {bookingError && (
        <div role="alert" className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-900">
          {bookingError}
        </div>
      )}

      {/* Direct Hospital Doctor Directory & Open Slots */}
      {selectedHospital && (
        <section
          aria-labelledby="hospital-doctors-heading"
          className="bg-white border border-[#E2DCD0] rounded-2xl p-5 sm:p-7"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-[#E2DCD0]">
            <div>
              <h3 id="hospital-doctors-heading" className="font-display text-lg font-semibold text-[#1F1B18]">
                Doctors &amp; Free Slots at {selectedHospital.name}
              </h3>
              <p className="text-xs text-[#5A564E] mt-0.5">
                Exact room directions uploaded by the hospital team · Click any open slot to book
              </p>
            </div>
          </div>

          {doctors.length === 0 ? (
            <p className="text-sm text-[#5A564E] mt-4">
              No doctors have been uploaded for this hospital yet.
            </p>
          ) : (
            <div className="divide-y divide-[#E2DCD0] mt-2">
              {doctors.map((doc) => {
                const docSlots = availableSlots.filter((s) => s.doctorId === doc.id);
                return (
                  <div
                    key={doc.id}
                    className="py-4 first:pt-3 last:pb-0 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display font-semibold text-[#1F1B18]">{doc.name}</span>
                        <span className="text-xs font-medium text-[#2864A0]">{doc.specialty}</span>
                        {doc.qualifications && (
                          <span className="text-xs text-[#5A564E]">· {doc.qualifications}</span>
                        )}
                      </div>
                      <div className="text-xs text-[#1F1B18] flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-[#D78728] shrink-0" aria-hidden="true" />
                        <span>
                          <strong>{doc.floorWing}</strong> · <strong>{doc.roomNumber}</strong>
                        </span>
                      </div>
                      <p className="text-xs text-[#5A564E]">{doc.directionsNote}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {docSlots.length === 0 ? (
                        <span className="text-xs text-[#7A7469]">No free slots right now</span>
                      ) : (
                        docSlots.map((slot) => (
                          <button
                            key={slot.id}
                            type="button"
                            disabled={bookingSlotId === slot.id}
                            onClick={() => handleConfirmBooking(slot)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#2864A0] bg-[#EDF4FB] hover:bg-[#2864A0] hover:text-white border border-[#BDD5EE] rounded-lg transition-colors whitespace-nowrap min-h-[36px]"
                          >
                            <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            <span className="tabular-nums">{slot.date} · {slot.timeLabel}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* My Confirmed Appointments */}
      {appointments.length > 0 && (
        <section
          aria-labelledby="my-appointments-heading"
          className="bg-white border border-[#E2DCD0] rounded-2xl p-5 sm:p-7"
        >
          <h3 id="my-appointments-heading" className="font-display text-lg font-semibold text-[#1F1B18] pb-3 border-b border-[#E2DCD0]">
            My Appointments ({appointments.length})
          </h3>
          <div className="divide-y divide-[#E2DCD0] mt-1">
            {appointments.map((appt) => (
              <div
                key={appt.id}
                className="py-4 first:pt-3 last:pb-0 flex flex-col md:flex-row md:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[#1F1B18]">{appt.doctorName}</span>
                    <span className="text-xs text-[#5A564E]">· {appt.specialty}</span>
                    <span className="text-xs text-[#5A564E]">· {appt.hospitalName}</span>
                    {appt.isDemo && (
                      <span className="text-xs text-[#B86A14] font-medium">· Sample Preview</span>
                    )}
                  </div>
                  <div className="text-xs text-[#1F1B18] font-mono tabular-nums">
                    {appt.date} · {appt.timeLabel}
                  </div>
                  <div className="text-xs text-[#2864A0] flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-[#D78728] shrink-0" aria-hidden="true" />
                    <span>{appt.roomLocation}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <SpeakAloudButton
                    compact
                    language={language}
                    label="Hear Directions"
                    text={`Appointment with ${appt.doctorName} at ${appt.hospitalName} on ${appt.date} at ${appt.timeLabel}. Room location: ${appt.roomLocation}.`}
                  />
                  {appt.status === 'confirmed' ? (
                    <button
                      type="button"
                      onClick={() => onCancelAppointment(appt)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors min-h-[34px]"
                    >
                      <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                      Cancel
                    </button>
                  ) : (
                    <span className="text-xs font-medium text-[#5A564E] capitalize">
                      {appt.status}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
