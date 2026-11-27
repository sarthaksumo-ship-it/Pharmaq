import test from 'node:test';
import assert from 'node:assert/strict';
import { detectEmergencyRedFlags, redactPii } from './safety';

test('detectEmergencyRedFlags detects English urgent chest pain and breathing symptoms', () => {
  const res = detectEmergencyRedFlags('My father has crushing chest pain and difficulty breathing');
  assert.equal(res.isEmergency, true);
  assert.ok(res.matchedCategories.length >= 2);
  assert.ok(res.helplines.length > 0);
});

test('detectEmergencyRedFlags detects Hindi/Hinglish urgent symptoms', () => {
  const res = detectEmergencyRedFlags('Mujhe seene mein dard aur saans lene mein takleef ho rahi hai');
  assert.equal(res.isEmergency, true);
  assert.ok(res.matchedCategories.some((c) => c.toLowerCase().includes('chest')));
});

test('detectEmergencyRedFlags does not falsely flag routine lab reports or prescriptions', () => {
  const res = detectEmergencyRedFlags(
    'HbA1c is 6.1%. Tab. Amoxicillin 625 mg BD PC for 5 days and Pantoprazole 40 mg OD AC.'
  );
  assert.equal(res.isEmergency, false);
  assert.equal(res.matchedCategories.length, 0);
});

test('redactPii masks patient names, phone numbers, emails, DOB, and medical IDs', () => {
  const sample = `Patient Name: Ramesh Verma
UHID: LAB-884920
DOB: 12/04/1958
Phone: +91 98765 43210
Email: ramesh.verma@example.com
HbA1c: 6.1 %`;

  const result = redactPii(sample);
  assert.equal(result.redactionCount, 5);
  assert.ok(!result.sanitizedText.includes('Ramesh Verma'));
  assert.ok(!result.sanitizedText.includes('LAB-884920'));
  assert.ok(!result.sanitizedText.includes('98765 43210'));
  assert.ok(!result.sanitizedText.includes('ramesh.verma@example.com'));
  assert.ok(!result.sanitizedText.includes('12/04/1958'));
  assert.ok(result.sanitizedText.includes('HbA1c: 6.1 %'));
});
