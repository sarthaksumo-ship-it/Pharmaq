import React, { useMemo, useState } from 'react';
import {
  Building2,
  CalendarPlus,
  CheckCircle2,
  Clock,
  MapPin,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  UserPlus,
} from 'lucide-react';
import {
  addDoctorToHospital,
  addMeetingSlot,
  createOrUpdateHospital,
  deleteDoctorFromHospital,
  deleteMeetingSlot,
  reopenMeetingSlot,
  updateAppointmentStatus,
} from '../firebase';
import type {
  Appointment,
  Doctor,
  Hospital,
  MeetingSlot,
  UserProfile,
} from '../types/medmate';

interface HospitalPortalProps {
  uid: string | null;
  profile: UserProfile | null;
  hospitals: Hospital[];
  selectedHospitalId: string;
  onSelectHospital: (id: string) => void;
  doctors: Doctor[];
  slots: MeetingSlot[];
  appointments: Appointment[];
  onRefreshData: (focusHospitalId?: string) => Promise<void>;
  onRequestHospitalAuth: () => void;
}

const TODAY_ISO = new Date().toISOString().slice(0, 10);

export const HospitalPortal: React.FC<HospitalPortalProps> = ({
  uid,
  profile,
  hospitals,
  selectedHospitalId,
  onSelectHospital,
  doctors,
  slots,
  appointments,
  onRefreshData,
  onRequestHospitalAuth,
}) => {
  const ownedHospitals = useMemo(
    () => (uid ? hospitals.filter((h) => !h.isDemo && h.ownerUid === uid) : []),
    [hospitals, uid]
  );

  const activeOwnedHospital = useMemo(
    () => ownedHospitals.find((h) => h.id === selectedHospitalId) || ownedHospitals[0] || null,
    [ownedHospitals, selectedHospitalId]
  );

  const [hospitalForm, setHospitalForm] = useState({
    name: profile?.hospitalName || '',
    city: '',
    address: '',
    helpdeskPhone: '',
    departments: 'General Medicine, Cardiology, ENT & Respiratory',
  });

  const [doctorForm, setDoctorForm] = useState({
    name: '',
    specialty: 'General Medicine',
    qualifications: 'MBBS, MD',
    floorWing: 'Ground Floor · OPD Wing A',
    roomNumber: 'Room 102',
    directionsNote: 'Walk straight past the main lobby reception and turn left.',
    languages: 'English, Hindi',
  });

  const [slotForm, setSlotForm] = useState({
    doctorId: '',
    date: TODAY_ISO,
    timeLabel: '10:00 AM – 10:20 AM',
  });

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!uid || profile?.role !== 'hospital') {
    return (
      <section className="bg-white border border-[#E2DCD0] rounded-2xl p-6 sm:p-10 text-center max-w-3xl mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-[#F3EFE6] border border-[#E2DCD0] flex items-center justify-center mx-auto p-2">
          <img
            src="/assets/pharmer-favicon.png"
            alt="Pharmer hospital portal emblem"
            className="w-full h-full object-contain"
          />
        </div>
        <h2 className="font-display text-2xl font-semibold text-[#1F1B18] mt-4">
          Pharmer Hospital Member Data Portal
        </h2>
        <p className="text-sm text-[#5A564E] mt-2 max-w-xl mx-auto leading-relaxed">
          Register or switch your account to <strong>Hospital Member</strong> to add your hospital details, upload doctors with exact floor/wing/room directions, publish free meeting time slots, and manage incoming patient appointments.
        </p>
        <div className="mt-6">
          <button
            type="button"
            onClick={onRequestHospitalAuth}
            className="px-6 py-3 text-sm font-semibold text-white bg-[#2864A0] hover:bg-[#1E5082] rounded-xl transition-colors min-h-[44px]"
          >
            {uid ? 'Switch Role to Hospital Member' : 'Sign In & Register as Hospital Member'}
          </button>
        </div>
      </section>
    );
  }

  const runAction = async (label: string, fn: () => Promise<void>) => {
    setErrorMessage(null);
    setStatusMessage(null);
    setBusyAction(label);
    try {
      await fn();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to save changes.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleImportSampleHospital = () =>
    runAction('import', async () => {
      const hospId = await createOrUpdateHospital({
        ownerUid: uid,
        name: profile.hospitalName || 'Pharmer Community Care Hospital',
        city: 'Bengaluru',
        address: '24 Health Avenue, Indiranagar',
        helpdeskPhone: '+91 80 4099 2211',
        departments: ['General Medicine', 'Cardiology', 'ENT & Respiratory'],
      });

      const doc1 = await addDoctorToHospital({
        hospitalId: hospId,
        ownerUid: uid,
        name: 'Dr. Kavita Nair',
        specialty: 'General Medicine',
        qualifications: 'MBBS, MD (Internal Medicine)',
        floorWing: 'Ground Floor · OPD Wing A',
        roomNumber: 'Room 104',
        directionsNote: 'Enter Main Lobby, turn right past Registration Counter 2.',
        languages: ['English', 'Hindi', 'Malayalam'],
      });

      const doc2 = await addDoctorToHospital({
        hospitalId: hospId,
        ownerUid: uid,
        name: 'Dr. Arjun Verma',
        specialty: 'Cardiology',
        qualifications: 'MD, DM (Cardiology)',
        floorWing: '2nd Floor · Heart Care Wing',
        roomNumber: 'Room 210',
        directionsNote: 'Take Lift B to 2nd Floor, walk straight past ECG Desk.',
        languages: ['English', 'Hindi'],
      });

      await addMeetingSlot({
        hospitalId: hospId,
        doctorId: doc1,
        doctorName: 'Dr. Kavita Nair',
        specialty: 'General Medicine',
        roomLocation: 'Ground Floor · OPD Wing A · Room 104',
        ownerUid: uid,
        date: TODAY_ISO,
        timeLabel: '10:30 AM – 10:50 AM',
      });
      await addMeetingSlot({
        hospitalId: hospId,
        doctorId: doc1,
        doctorName: 'Dr. Kavita Nair',
        specialty: 'General Medicine',
        roomLocation: 'Ground Floor · OPD Wing A · Room 104',
        ownerUid: uid,
        date: TODAY_ISO,
        timeLabel: '03:30 PM – 03:50 PM',
      });
      await addMeetingSlot({
        hospitalId: hospId,
        doctorId: doc2,
        doctorName: 'Dr. Arjun Verma',
        specialty: 'Cardiology',
        roomLocation: '2nd Floor · Heart Care Wing · Room 210',
        ownerUid: uid,
        date: TODAY_ISO,
        timeLabel: '11:30 AM – 11:50 AM',
      });

      onSelectHospital(hospId);
      await onRefreshData(hospId);
      setStatusMessage('Sample hospital, doctors, room directions, and 3 free slots saved to Firestore.');
    });

  const handleCreateHospital = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hospitalForm.name.trim() || !hospitalForm.city.trim()) {
      setErrorMessage('Please enter both hospital name and city.');
      return;
    }
    void runAction('createHospital', async () => {
      const hospId = await createOrUpdateHospital({
        ownerUid: uid,
        name: hospitalForm.name,
        city: hospitalForm.city,
        address: hospitalForm.address || 'Main Campus',
        helpdeskPhone: hospitalForm.helpdeskPhone || '+91 11 0000 0000',
        departments: hospitalForm.departments.split(','),
      });
      onSelectHospital(hospId);
      await onRefreshData(hospId);
      setHospitalForm({
        name: '',
        city: '',
        address: '',
        helpdeskPhone: '',
        departments: 'General Medicine, Cardiology, Pediatrics',
      });
      setStatusMessage('Hospital registered! Now add doctors and available meeting times below.');
    });
  };

  const handleAddDoctor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOwnedHospital) {
      setErrorMessage('Create or select one of your hospitals first.');
      return;
    }
    if (!doctorForm.name.trim() || !doctorForm.roomNumber.trim()) {
      setErrorMessage('Please enter doctor name and room number.');
      return;
    }
    void runAction('addDoctor', async () => {
      await addDoctorToHospital({
        hospitalId: activeOwnedHospital.id,
        ownerUid: uid,
        name: doctorForm.name,
        specialty: doctorForm.specialty,
        qualifications: doctorForm.qualifications,
        floorWing: doctorForm.floorWing,
        roomNumber: doctorForm.roomNumber,
        directionsNote: doctorForm.directionsNote,
        languages: doctorForm.languages.split(','),
      });
      await onRefreshData(activeOwnedHospital.id);
      setDoctorForm((prev) => ({ ...prev, name: '', roomNumber: '' }));
      setStatusMessage('Doctor and physical room directions saved.');
    });
  };

  const handleAddSlot = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOwnedHospital) return;
    const targetDocId = slotForm.doctorId || doctors[0]?.id;
    const targetDoc = doctors.find((d) => d.id === targetDocId);
    if (!targetDoc) {
      setErrorMessage('Please add at least one doctor before uploading meeting times.');
      return;
    }
    void runAction('addSlot', async () => {
      await addMeetingSlot({
        hospitalId: activeOwnedHospital.id,
        doctorId: targetDoc.id,
        doctorName: targetDoc.name,
        specialty: targetDoc.specialty,
        roomLocation: `${targetDoc.floorWing} · ${targetDoc.roomNumber}`,
        ownerUid: uid,
        date: slotForm.date,
        timeLabel: slotForm.timeLabel,
      });
      await onRefreshData(activeOwnedHospital.id);
      setStatusMessage(`Added free slot for ${targetDoc.name} (${slotForm.date} · ${slotForm.timeLabel}).`);
    });
  };

  const handleAddMorningPreset = () => {
    if (!activeOwnedHospital) return;
    const targetDocId = slotForm.doctorId || doctors[0]?.id;
    const targetDoc = doctors.find((d) => d.id === targetDocId);
    if (!targetDoc) {
      setErrorMessage('Add a doctor first to upload morning slots.');
      return;
    }
    void runAction('addPresetSlots', async () => {
      const times = ['09:30 AM – 09:50 AM', '10:30 AM – 10:50 AM', '11:30 AM – 11:50 AM'];
      for (const timeLabel of times) {
        await addMeetingSlot({
          hospitalId: activeOwnedHospital.id,
          doctorId: targetDoc.id,
          doctorName: targetDoc.name,
          specialty: targetDoc.specialty,
          roomLocation: `${targetDoc.floorWing} · ${targetDoc.roomNumber}`,
          ownerUid: uid,
          date: slotForm.date,
          timeLabel,
        });
      }
      await onRefreshData(activeOwnedHospital.id);
      setStatusMessage(`Uploaded 3 morning slots for ${targetDoc.name}.`);
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Hospital Admin Header & Quick Seeder */}
      <section className="bg-white border border-[#E2DCD0] rounded-2xl p-5 sm:p-7">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img
              src="/assets/pharmer-favicon.png"
              alt="Pharmer emblem"
              className="w-9 h-9 object-contain rounded-md shrink-0"
            />
            <div>
              <div className="text-xs font-semibold text-[#B86A14]">
                Pharmer Hospital Console · {profile.displayName}
              </div>
              <h2 className="font-display text-xl sm:text-2xl font-semibold text-[#1F1B18] mt-0.5">
                Upload Doctors, Room Locations &amp; Meeting Times
              </h2>
              <p className="text-sm text-[#5A564E] mt-1">
                Data entered here immediately powers Patient Symptom Matching, AI Chatbot wayfinding, and live slot booking.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={handleImportSampleHospital}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-[#6B3C0A] bg-[#FDF4E7] hover:bg-[#FAE7CE] border border-[#F1D0A5] rounded-lg transition-colors whitespace-nowrap shrink-0 min-h-[42px]"
          >
            <Sparkles className="w-4 h-4 text-[#D78728]" aria-hidden="true" />
            {busyAction === 'import' ? 'Importing...' : '1-Click Import Sample Hospital & Doctors'}
          </button>
        </div>

        {ownedHospitals.length > 0 && (
          <div className="mt-4 pt-4 border-t border-[#E2DCD0] flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-[#5A564E]">Your hospitals:</span>
            {ownedHospitals.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => onSelectHospital(h.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  activeOwnedHospital?.id === h.id
                    ? 'bg-[#2864A0] text-white border-[#2864A0]'
                    : 'bg-[#FAF7F0] text-[#1F1B18] border-[#E2DCD0] hover:border-[#2864A0]'
                }`}
              >
                {h.name} ({h.city})
              </button>
            ))}
          </div>
        )}

        {statusMessage && (
          <div role="status" className="mt-4 p-3 rounded-xl bg-[#ECF7EF] border border-[#B8DFC3] text-xs text-[#174D27] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#267D40] shrink-0" aria-hidden="true" />
            <span>{statusMessage}</span>
          </div>
        )}
        {errorMessage && (
          <div role="alert" className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-900">
            {errorMessage}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form 1: Register a Hospital */}
        <section className="bg-white border border-[#E2DCD0] rounded-2xl p-5 sm:p-6">
          <div className="flex items-center gap-2 pb-3 border-b border-[#E2DCD0]">
            <Building2 className="w-4 h-4 text-[#D78728]" aria-hidden="true" />
            <h3 className="font-display text-base font-semibold text-[#1F1B18]">
              Add / Register Hospital Profile
            </h3>
          </div>
          <form onSubmit={handleCreateHospital} className="mt-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="hosp-name" className="block text-xs font-medium text-[#1F1B18] mb-1">
                  Hospital Name *
                </label>
                <input
                  id="hosp-name"
                  type="text"
                  required
                  value={hospitalForm.name}
                  onChange={(e) => setHospitalForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g., Apex Care Hospital"
                  className="w-full rounded-lg border border-[#D5CCBC] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="hosp-city" className="block text-xs font-medium text-[#1F1B18] mb-1">
                  City *
                </label>
                <input
                  id="hosp-city"
                  type="text"
                  required
                  value={hospitalForm.city}
                  onChange={(e) => setHospitalForm((p) => ({ ...p, city: e.target.value }))}
                  placeholder="e.g., Bengaluru"
                  className="w-full rounded-lg border border-[#D5CCBC] px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label htmlFor="hosp-address" className="block text-xs font-medium text-[#1F1B18] mb-1">
                Street Address
              </label>
              <input
                id="hosp-address"
                type="text"
                value={hospitalForm.address}
                onChange={(e) => setHospitalForm((p) => ({ ...p, address: e.target.value }))}
                placeholder="42 Residency Road"
                className="w-full rounded-lg border border-[#D5CCBC] px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="hosp-phone" className="block text-xs font-medium text-[#1F1B18] mb-1">
                  Helpdesk Phone
                </label>
                <input
                  id="hosp-phone"
                  type="text"
                  value={hospitalForm.helpdeskPhone}
                  onChange={(e) => setHospitalForm((p) => ({ ...p, helpdeskPhone: e.target.value }))}
                  placeholder="+91 80 4123 7700"
                  className="w-full rounded-lg border border-[#D5CCBC] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="hosp-depts" className="block text-xs font-medium text-[#1F1B18] mb-1">
                  Departments (comma separated)
                </label>
                <input
                  id="hosp-depts"
                  type="text"
                  value={hospitalForm.departments}
                  onChange={(e) => setHospitalForm((p) => ({ ...p, departments: e.target.value }))}
                  className="w-full rounded-lg border border-[#D5CCBC] px-3 py-2 text-sm"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={busyAction !== null}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#1F1B18] hover:bg-[#342E29] rounded-lg transition-colors min-h-[40px]"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              Save Hospital
            </button>
          </form>
        </section>

        {/* Form 2: Add Doctor & Physical Wayfinding */}
        <section className="bg-white border border-[#E2DCD0] rounded-2xl p-5 sm:p-6">
          <div className="flex items-center gap-2 pb-3 border-b border-[#E2DCD0]">
            <UserPlus className="w-4 h-4 text-[#2864A0]" aria-hidden="true" />
            <h3 className="font-display text-base font-semibold text-[#1F1B18]">
              Add Doctor &amp; Where to Find Them
              {activeOwnedHospital ? ` · ${activeOwnedHospital.name}` : ''}
            </h3>
          </div>
          <form onSubmit={handleAddDoctor} className="mt-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="doc-name" className="block text-xs font-medium text-[#1F1B18] mb-1">
                  Doctor Name *
                </label>
                <input
                  id="doc-name"
                  type="text"
                  required
                  value={doctorForm.name}
                  onChange={(e) => setDoctorForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Dr. Meera Iyer"
                  className="w-full rounded-lg border border-[#D5CCBC] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="doc-spec" className="block text-xs font-medium text-[#1F1B18] mb-1">
                  Specialty *
                </label>
                <input
                  id="doc-spec"
                  type="text"
                  required
                  value={doctorForm.specialty}
                  onChange={(e) => setDoctorForm((p) => ({ ...p, specialty: e.target.value }))}
                  className="w-full rounded-lg border border-[#D5CCBC] px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="doc-floor" className="block text-xs font-medium text-[#1F1B18] mb-1">
                  Building / Floor / Wing *
                </label>
                <input
                  id="doc-floor"
                  type="text"
                  required
                  value={doctorForm.floorWing}
                  onChange={(e) => setDoctorForm((p) => ({ ...p, floorWing: e.target.value }))}
                  className="w-full rounded-lg border border-[#D5CCBC] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="doc-room" className="block text-xs font-medium text-[#1F1B18] mb-1">
                  Room Number *
                </label>
                <input
                  id="doc-room"
                  type="text"
                  required
                  value={doctorForm.roomNumber}
                  onChange={(e) => setDoctorForm((p) => ({ ...p, roomNumber: e.target.value }))}
                  placeholder="Room 204"
                  className="w-full rounded-lg border border-[#D5CCBC] px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label htmlFor="doc-directions" className="block text-xs font-medium text-[#1F1B18] mb-1">
                Step-by-step Walking Directions for Patients *
              </label>
              <input
                id="doc-directions"
                type="text"
                required
                value={doctorForm.directionsNote}
                onChange={(e) => setDoctorForm((p) => ({ ...p, directionsNote: e.target.value }))}
                className="w-full rounded-lg border border-[#D5CCBC] px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={!activeOwnedHospital || busyAction !== null}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#2864A0] hover:bg-[#1E5082] disabled:bg-slate-300 rounded-lg transition-colors min-h-[40px]"
            >
              <UserPlus className="w-4 h-4" aria-hidden="true" />
              Save Doctor &amp; Directions
            </button>
          </form>
        </section>
      </div>

      {/* Upload Meeting Time Slots + Existing Doctors/Slots */}
      {activeOwnedHospital && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="bg-white border border-[#E2DCD0] rounded-2xl p-5 sm:p-6">
            <div className="flex items-center gap-2 pb-3 border-b border-[#E2DCD0]">
              <CalendarPlus className="w-4 h-4 text-[#2864A0]" aria-hidden="true" />
              <h3 className="font-display text-base font-semibold text-[#1F1B18]">
                Upload Available Meeting Times
              </h3>
            </div>
            <form onSubmit={handleAddSlot} className="mt-4 space-y-3">
              <div>
                <label htmlFor="slot-doctor" className="block text-xs font-medium text-[#1F1B18] mb-1">
                  Select Doctor
                </label>
                <select
                  id="slot-doctor"
                  value={slotForm.doctorId || doctors[0]?.id || ''}
                  onChange={(e) => setSlotForm((p) => ({ ...p, doctorId: e.target.value }))}
                  className="w-full rounded-lg border border-[#D5CCBC] px-3 py-2 text-sm bg-white"
                >
                  {doctors.length === 0 ? (
                    <option value="">Add a doctor first</option>
                  ) : (
                    doctors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.specialty} · {d.roomNumber})
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="slot-date" className="block text-xs font-medium text-[#1F1B18] mb-1">
                    Date
                  </label>
                  <input
                    id="slot-date"
                    type="date"
                    required
                    value={slotForm.date}
                    onChange={(e) => setSlotForm((p) => ({ ...p, date: e.target.value }))}
                    className="w-full rounded-lg border border-[#D5CCBC] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="slot-time" className="block text-xs font-medium text-[#1F1B18] mb-1">
                    Time Slot Label
                  </label>
                  <input
                    id="slot-time"
                    type="text"
                    required
                    value={slotForm.timeLabel}
                    onChange={(e) => setSlotForm((p) => ({ ...p, timeLabel: e.target.value }))}
                    placeholder="10:00 AM – 10:20 AM"
                    className="w-full rounded-lg border border-[#D5CCBC] px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <button
                  type="submit"
                  disabled={doctors.length === 0 || busyAction !== null}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-[#2864A0] hover:bg-[#1E5082] disabled:bg-slate-300 rounded-lg transition-colors min-h-[40px]"
                >
                  <Clock className="w-4 h-4" aria-hidden="true" />
                  Upload Slot
                </button>
                <button
                  type="button"
                  disabled={doctors.length === 0 || busyAction !== null}
                  onClick={handleAddMorningPreset}
                  className="px-3.5 py-2 text-xs font-semibold text-[#2864A0] bg-[#EDF4FB] hover:bg-[#DFECFA] border border-[#BDD5EE] disabled:opacity-50 rounded-lg transition-colors min-h-[40px]"
                >
                  + Add 3 Morning Slots
                </button>
              </div>
            </form>

            {/* Uploaded Slots List */}
            <div className="mt-5 pt-4 border-t border-[#E2DCD0] space-y-2 max-h-64 overflow-y-auto">
              {slots.length === 0 ? (
                <p className="text-xs text-[#5A564E]">No meeting slots uploaded yet.</p>
              ) : (
                slots.map((slot) => (
                  <div
                    key={slot.id}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-[#E2DCD0] text-xs"
                  >
                    <div>
                      <div className="font-semibold text-[#1F1B18]">
                        {slot.doctorName} · <span className="font-mono tabular-nums">{slot.date} {slot.timeLabel}</span>
                      </div>
                      <div className="text-[#5A564E]">
                        Status:{' '}
                        <span className={slot.status === 'available' ? 'text-[#267D40] font-semibold' : 'text-[#B86A14] font-semibold'}>
                          {slot.status}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {slot.status === 'booked' && (
                        <button
                          type="button"
                          onClick={() =>
                            runAction('reopenSlot', async () => {
                              await reopenMeetingSlot(activeOwnedHospital.id, slot.id);
                              await onRefreshData(activeOwnedHospital.id);
                            })
                          }
                          title="Reopen slot"
                          className="p-1.5 text-[#5A564E] hover:text-[#2864A0] rounded hover:bg-[#FAF7F0]"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          runAction('deleteSlot', async () => {
                            await deleteMeetingSlot(activeOwnedHospital.id, slot.id);
                            await onRefreshData(activeOwnedHospital.id);
                          })
                        }
                        title="Delete slot"
                        className="p-1.5 text-[#5A564E] hover:text-red-700 rounded hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Uploaded Doctors + Incoming Patient Appointments */}
          <section className="bg-white border border-[#E2DCD0] rounded-2xl p-5 sm:p-6 space-y-5">
            <div>
              <h3 className="font-display text-base font-semibold text-[#1F1B18] pb-2 border-b border-[#E2DCD0]">
                Uploaded Doctors ({doctors.length})
              </h3>
              <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
                {doctors.length === 0 ? (
                  <p className="text-xs text-[#5A564E]">No doctors added to this hospital yet.</p>
                ) : (
                  doctors.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-start justify-between gap-2 p-2.5 rounded-lg border border-[#E2DCD0] text-xs"
                    >
                      <div>
                        <div className="font-semibold text-[#1F1B18]">
                          {doc.name} · {doc.specialty}
                        </div>
                        <div className="text-[#5A564E] flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 text-[#D78728] shrink-0" aria-hidden="true" />
                          {doc.floorWing} · {doc.roomNumber}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          runAction('deleteDoctor', async () => {
                            await deleteDoctorFromHospital(activeOwnedHospital.id, doc.id);
                            await onRefreshData(activeOwnedHospital.id);
                          })
                        }
                        title="Remove doctor"
                        className="p-1.5 text-[#5A564E] hover:text-red-700 rounded hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <h3 className="font-display text-base font-semibold text-[#1F1B18] pb-2 border-b border-[#E2DCD0]">
                Patient Bookings ({appointments.length})
              </h3>
              <div className="mt-3 space-y-2 max-h-56 overflow-y-auto">
                {appointments.length === 0 ? (
                  <p className="text-xs text-[#5A564E]">
                    When patients book your open slots, their appointments will appear here.
                  </p>
                ) : (
                  appointments.map((appt) => (
                    <div
                      key={appt.id}
                      className="p-3 rounded-lg border border-[#E2DCD0] text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[#1F1B18]">
                          {appt.patientName} → {appt.doctorName}
                        </span>
                        <span className="font-mono tabular-nums text-[#5A564E]">
                          {appt.date} · {appt.timeLabel}
                        </span>
                      </div>
                      <p className="text-[#5A564E]">Reason: {appt.symptomSummary}</p>
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="font-semibold capitalize text-[#2864A0]">{appt.status}</span>
                        {appt.status === 'confirmed' && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                runAction('completeAppt', async () => {
                                  await updateAppointmentStatus(appt.id, 'completed');
                                  await onRefreshData(activeOwnedHospital.id);
                                })
                              }
                              className="px-2.5 py-1 bg-[#ECF7EF] hover:bg-[#D9EFE0] text-[#174D27] border border-[#B8DFC3] rounded"
                            >
                              Mark Completed
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                runAction('cancelAppt', async () => {
                                  await updateAppointmentStatus(appt.id, 'cancelled');
                                  await onRefreshData(activeOwnedHospital.id);
                                })
                              }
                              className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
