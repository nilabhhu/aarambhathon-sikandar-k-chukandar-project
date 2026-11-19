import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampTimestampRange,
  scaleAndClampTimestamp,
  computeShortTermLufsTimelineFromChannels,
} from './shortTermLufsMath';
import { generatePhase1DemoReport } from '../contracts/demoFixtures';
import { createDefaultConsentState } from '../contracts/analysisContract';

test('clampTimestampRange keeps start and end strictly within [0, duration]', () => {
  const res = clampTimestampRange(42.5, 58.0, 4.0);
  assert.equal(res.start_sec, 4.0);
  assert.equal(res.end_sec, 4.0);

  const neg = clampTimestampRange(-5, 2.5, 4.0);
  assert.equal(neg.start_sec, 0);
  assert.equal(neg.end_sec, 2.5);
});

test('scaleAndClampTimestamp scales 198.4s reference cues proportionally into a 4.0s clip', () => {
  const scaled = scaleAndClampTimestamp(42.5, 58.0, 198.4, 4.0);
  assert.ok(scaled.start_sec >= 0 && scaled.start_sec <= 4.0);
  assert.ok(scaled.end_sec >= scaled.start_sec && scaled.end_sec <= 4.0);
  assert.ok(scaled.end_sec > scaled.start_sec);
});

test('generatePhase1DemoReport clamps all issue timestamps within 4.0s for demo clip', () => {
  const report = generatePhase1DemoReport({
    interface_mode: 'advanced',
    genre: 'indie_rock',
    mix_stage: 'unmastered_mix',
    consent_state: createDefaultConsentState(),
    custom_filename: 'checkmix_demo_track_24bit.wav',
    custom_duration_sec: 4.0,
    custom_sample_rate: 44100,
    custom_file_size_bytes: 1058444,
  });

  assert.equal(report.file_metadata.duration_seconds, 4.0);
  for (const issue of report.issues) {
    assert.ok(issue.timestamps.length > 0);
    for (const ts of issue.timestamps) {
      assert.ok(ts.start_sec >= 0, `start_sec >= 0 for ${issue.issue_id}`);
      assert.ok(ts.end_sec <= 4.0, `end_sec (${ts.end_sec}) <= 4.0 for ${issue.issue_id}`);
      assert.ok(ts.end_sec >= ts.start_sec, `end_sec >= start_sec for ${issue.issue_id}`);
    }
  }
});

test('computeShortTermLufsTimelineFromChannels computes real Short-Term LUFS buckets on a 4.0s clip', () => {
  const sr = 44100;
  const dur = 4.0;
  const n = Math.floor(sr * dur);
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  // 1 kHz stereo tone at -12 dBFS with a dynamic lift in the second half
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const amp = t < 2.0 ? 0.15 : 0.35;
    const sample = amp * Math.sin(2 * Math.PI * 1000 * t);
    left[i] = sample;
    right[i] = sample;
  }

  const res = computeShortTermLufsTimelineFromChannels([left, right], sr);
  assert.ok(res.timeline !== null);
  assert.ok(res.timeline.buckets.length >= 12, `expected >= 12 buckets, got ${res.timeline.buckets.length}`);
  assert.ok(res.shortTermMaxLufs !== null && res.shortTermMaxLufs > -25 && res.shortTermMaxLufs < 0);
  assert.ok(res.integratedLufs !== null && res.integratedLufs > -25 && res.integratedLufs < 0);

  const finiteShortTerm = res.timeline.buckets.filter((b) => b.short_term_lufs !== null);
  assert.equal(finiteShortTerm.length, res.timeline.buckets.length);
  // Second half should measure louder than first bucket
  const firstSt = res.timeline.buckets[0].short_term_lufs!;
  const lastSt = res.timeline.buckets[res.timeline.buckets.length - 1].short_term_lufs!;
  assert.ok(lastSt > firstSt, `expected rising loudness (${firstSt} -> ${lastSt})`);
});

test('computeShortTermLufsTimelineFromChannels returns null on pure digital silence', () => {
  const sr = 44100;
  const n = sr * 4;
  const res = computeShortTermLufsTimelineFromChannels([new Float32Array(n), new Float32Array(n)], sr);
  assert.equal(res.timeline, null);
  assert.equal(res.shortTermMaxLufs, null);
  assert.equal(res.integratedLufs, null);
});
