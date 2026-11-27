# MedMate AI Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. `/users/{userId}`: Only the authenticated, verified owner (`request.auth.uid == userId`) can read, create, or update their profile. `uid` and `createdAt` are immutable. `role` is restricted to `'patient'` or `'hospital'`.
2. `/hospitals/{hospitalId}`: Publicly readable directory (no PII). Only a verified user whose `/users/{uid}.role == 'hospital'` can create a hospital, and `ownerUid` must match `request.auth.uid`. Only the `ownerUid` can update or delete it.
3. `/hospitals/{hospitalId}/doctors/{doctorId}`: Publicly readable directory (no PII). Master Gate enforces that the parent hospital exists and `ownerUid == request.auth.uid`.
4. `/hospitals/{hospitalId}/slots/{slotId}`: Publicly readable schedule availability (no patient PII). Hospital owners can create/delete slots and reopen/update them. Patients can ONLY transition a slot from `status == 'available'` to `status == 'booked'` when atomically creating a matching `/appointments/{appointmentId}` via `getAfter`.
5. `/appointments/{appointmentId}`: Private medical booking record. Readable/listable ONLY where `resource.data.patientUid == request.auth.uid || resource.data.hospitalOwnerUid == request.auth.uid`. Once `status` reaches `'completed'` or `'cancelled'`, it is locked.

## 2. Adversarial "Dirty Dozen" Payloads (All Must Fail with PERMISSION_DENIED)
1. Unauthenticated write to `/hospitals/h1`.
2. Patient-role user attempting to create `/hospitals/h2`.
3. Hospital user A attempting to create a doctor under Hospital B (`/hospitals/hB/doctors/d1`).
4. Hospital user A attempting to update `/hospitals/hB`.
5. Shadow-field injection (`isAdmin: true`) on `/users/{uid}` create or update.
6. Reading another user's `/users/{otherUid}` profile.
7. Listing `/appointments` without filtering by `patientUid == auth.uid` or `hospitalOwnerUid == auth.uid`.
8. Patient attempting to create `/appointments/a1` referencing a non-existent slot.
9. Patient attempting to book an already-booked slot (`status: 'booked' -> 'booked'`).
10. Patient attempting to overwrite a slot's `timeLabel` or `doctorName` during booking.
11. Unverified email account (`email_verified == false`) attempting to write `/hospitals/h1`.
12. Oversized string (> 260 chars in `directionsNote` or > 128 chars in document ID) attempting resource exhaustion.
