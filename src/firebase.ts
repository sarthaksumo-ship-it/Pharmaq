import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import type {
  Appointment,
  Doctor,
  Hospital,
  LanguageMode,
  MeetingSlot,
  UserProfile,
  UserRole,
} from './types/medmate';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();

export function makeSafeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? (snap.data() as UserProfile) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function upsertUserProfile(params: {
  uid: string;
  role: UserRole;
  displayName: string;
  preferredLanguage: LanguageMode;
  hospitalName?: string;
}): Promise<UserProfile> {
  const path = `users/${params.uid}`;
  try {
    const existing = await getDoc(doc(db, 'users', params.uid));
    const cleanName = params.displayName.trim().slice(0, 100) || 'Pharmer User';
    const cleanHospital = (params.hospitalName || '').trim().slice(0, 120);

    if (existing.exists()) {
      const updatePayload: Record<string, unknown> = {
        role: params.role,
        displayName: cleanName,
        preferredLanguage: params.preferredLanguage,
        updatedAt: serverTimestamp(),
      };
      if (cleanHospital) {
        updatePayload.hospitalName = cleanHospital;
      }
      await updateDoc(doc(db, 'users', params.uid), updatePayload);
    } else {
      const createPayload: Record<string, unknown> = {
        uid: params.uid,
        role: params.role,
        displayName: cleanName,
        preferredLanguage: params.preferredLanguage,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (cleanHospital) {
        createPayload.hospitalName = cleanHospital;
      }
      await setDoc(doc(db, 'users', params.uid), createPayload);
    }

    const updated = await getDoc(doc(db, 'users', params.uid));
    return updated.data() as UserProfile;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function createOrUpdateHospital(params: {
  id?: string;
  ownerUid: string;
  name: string;
  city: string;
  address: string;
  helpdeskPhone: string;
  departments: string[];
}): Promise<string> {
  const id = params.id || makeSafeId('hosp');
  const path = `hospitals/${id}`;
  try {
    const depts = params.departments
      .map((d) => d.trim())
      .filter(Boolean)
      .slice(0, 20);
    if (params.id) {
      await updateDoc(doc(db, 'hospitals', id), {
        name: params.name.trim().slice(0, 120),
        city: params.city.trim().slice(0, 80),
        address: params.address.trim().slice(0, 240),
        helpdeskPhone: params.helpdeskPhone.trim().slice(0, 40),
        departments: depts,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'hospitals', id), {
        id,
        ownerUid: params.ownerUid,
        name: params.name.trim().slice(0, 120),
        city: params.city.trim().slice(0, 80),
        address: params.address.trim().slice(0, 240),
        helpdeskPhone: params.helpdeskPhone.trim().slice(0, 40),
        departments: depts,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, params.id ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function addDoctorToHospital(params: {
  hospitalId: string;
  ownerUid: string;
  name: string;
  specialty: string;
  qualifications: string;
  floorWing: string;
  roomNumber: string;
  directionsNote: string;
  languages: string[];
}): Promise<string> {
  const id = makeSafeId('doc');
  const path = `hospitals/${params.hospitalId}/doctors/${id}`;
  try {
    await setDoc(doc(db, 'hospitals', params.hospitalId, 'doctors', id), {
      id,
      hospitalId: params.hospitalId,
      ownerUid: params.ownerUid,
      name: params.name.trim().slice(0, 100),
      specialty: params.specialty.trim().slice(0, 80),
      qualifications: params.qualifications.trim().slice(0, 100),
      floorWing: params.floorWing.trim().slice(0, 80),
      roomNumber: params.roomNumber.trim().slice(0, 40),
      directionsNote: params.directionsNote.trim().slice(0, 260),
      languages: params.languages.map((l) => l.trim()).filter(Boolean).slice(0, 10),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteDoctorFromHospital(hospitalId: string, doctorId: string): Promise<void> {
  const path = `hospitals/${hospitalId}/doctors/${doctorId}`;
  try {
    await deleteDoc(doc(db, 'hospitals', hospitalId, 'doctors', doctorId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function addMeetingSlot(params: {
  hospitalId: string;
  doctorId: string;
  doctorName: string;
  specialty: string;
  roomLocation: string;
  ownerUid: string;
  date: string;
  timeLabel: string;
}): Promise<string> {
  const id = makeSafeId('slot');
  const path = `hospitals/${params.hospitalId}/slots/${id}`;
  try {
    await setDoc(doc(db, 'hospitals', params.hospitalId, 'slots', id), {
      id,
      hospitalId: params.hospitalId,
      doctorId: params.doctorId,
      doctorName: params.doctorName.trim().slice(0, 100),
      specialty: params.specialty.trim().slice(0, 80),
      roomLocation: params.roomLocation.trim().slice(0, 180),
      ownerUid: params.ownerUid,
      date: params.date.trim().slice(0, 20),
      timeLabel: params.timeLabel.trim().slice(0, 50),
      status: 'available',
      lastAppointmentId: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteMeetingSlot(hospitalId: string, slotId: string): Promise<void> {
  const path = `hospitals/${hospitalId}/slots/${slotId}`;
  try {
    await deleteDoc(doc(db, 'hospitals', hospitalId, 'slots', slotId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function reopenMeetingSlot(hospitalId: string, slotId: string): Promise<void> {
  const path = `hospitals/${hospitalId}/slots/${slotId}`;
  try {
    await updateDoc(doc(db, 'hospitals', hospitalId, 'slots', slotId), {
      status: 'available',
      lastAppointmentId: '',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function bookSlotAtomically(params: {
  patientUid: string;
  patientName: string;
  hospital: Hospital;
  slot: MeetingSlot;
  symptomSummary: string;
}): Promise<Appointment> {
  const appointmentId = makeSafeId('appt');
  const apptPath = `appointments/${appointmentId}`;
  const slotRef = doc(db, 'hospitals', params.hospital.id, 'slots', params.slot.id);
  const apptRef = doc(db, 'appointments', appointmentId);

  try {
    const batch = writeBatch(db);
    const appointmentPayload = {
      id: appointmentId,
      patientUid: params.patientUid,
      patientName: params.patientName.trim().slice(0, 100) || 'Patient',
      hospitalId: params.hospital.id,
      hospitalName: params.hospital.name.slice(0, 120),
      hospitalOwnerUid: params.hospital.ownerUid,
      doctorId: params.slot.doctorId,
      doctorName: params.slot.doctorName.slice(0, 100),
      specialty: params.slot.specialty.slice(0, 80),
      roomLocation: params.slot.roomLocation.slice(0, 180),
      slotId: params.slot.id,
      date: params.slot.date.slice(0, 20),
      timeLabel: params.slot.timeLabel.slice(0, 50),
      symptomSummary: params.symptomSummary.trim().slice(0, 300) || 'General consultation',
      status: 'confirmed' as const,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    batch.set(apptRef, appointmentPayload);
    batch.update(slotRef, {
      status: 'booked',
      lastAppointmentId: appointmentId,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
    return appointmentPayload;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, apptPath);
  }
}

export async function updateAppointmentStatus(
  appointmentId: string,
  status: 'completed' | 'cancelled'
): Promise<void> {
  const path = `appointments/${appointmentId}`;
  try {
    await updateDoc(doc(db, 'appointments', appointmentId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function fetchHospitalsFromFirestore(): Promise<Hospital[]> {
  const path = 'hospitals';
  try {
    const snap = await getDocs(query(collection(db, 'hospitals'), orderBy('name')));
    return snap.docs.map((d) => d.data() as Hospital);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function fetchDoctorsAndSlots(hospitalId: string): Promise<{
  doctors: Doctor[];
  slots: MeetingSlot[];
}> {
  const doctorsPath = `hospitals/${hospitalId}/doctors`;
  const slotsPath = `hospitals/${hospitalId}/slots`;
  try {
    const [docSnap, slotSnap] = await Promise.all([
      getDocs(collection(db, 'hospitals', hospitalId, 'doctors')),
      getDocs(collection(db, 'hospitals', hospitalId, 'slots')),
    ]);
    return {
      doctors: docSnap.docs.map((d) => d.data() as Doctor),
      slots: slotSnap.docs.map((s) => s.data() as MeetingSlot),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `${doctorsPath} | ${slotsPath}`);
  }
}

export async function fetchMyAppointments(
  uid: string,
  role: UserRole
): Promise<Appointment[]> {
  const path = 'appointments';
  try {
    const field = role === 'hospital' ? 'hospitalOwnerUid' : 'patientUid';
    const q = query(collection(db, 'appointments'), where(field, '==', uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Appointment);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}
