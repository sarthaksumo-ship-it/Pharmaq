import test from 'node:test';
import assert from 'node:assert/strict';
import { base64Pcm16ToFloat32, float32ToBase64Pcm16 } from './audioPcm';

test('float32ToBase64Pcm16 and base64Pcm16ToFloat32 round-trip within 16-bit quantization tolerance', () => {
  const input = new Float32Array([0, 0.5, -0.5, 0.25, -0.25, 1, -1]);
  const encoded = float32ToBase64Pcm16(input);
  assert.equal(typeof encoded, 'string');
  assert.ok(encoded.length > 0);

  const decoded = base64Pcm16ToFloat32(encoded);
  assert.equal(decoded.length, input.length);

  for (let i = 0; i < input.length; i++) {
    assert.ok(Math.abs(decoded[i] - input[i]) < 0.001, `Sample ${i} mismatch: ${decoded[i]} vs ${input[i]}`);
  }
});
