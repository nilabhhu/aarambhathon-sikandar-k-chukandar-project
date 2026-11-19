PHASE 2 — MATHEMATICAL DSP ARCHITECTURE & IMPLEMENTATION CONTRACT
Target Repository: https://github.com/nilabhhu/aarambhathon-sikandar-k-chukandar-project
Canonical Phase 1 Baseline: Commit 1f6bf907fcf7dc8171542e60e3417bbee1fbcbf7
Phase Boundary: Phase 2 Only — Real Mathematical DSP Engine (POST /api/v1/analyze/dsp) and Schema Migration (1.0.0 → 2.0.0). Phases 3, 4, 5, and 6 remain NOT_IMPLEMENTED.
Workspace & Repository Verification Disclosure:
All references to the Phase 1 codebase (contracts/analysis_report.schema.json, src/contracts/analysisContract.ts, src/services/apiService.ts, src/App.tsx, src/components/SimpleMixCheckView.tsx, src/components/AdvancedMixCheckView.tsx, src/components/WaveformInspector.tsx, backend/app/main.py, backend/tests/test_phase1_contracts.py, backend/requirements.txt, scripts/validate_schema.js, .github/workflows/ci.yml, docs/api-contracts.md, docs/phase-gates.md) are grounded in direct workspace file inspection. Remote GitHub repository state at commit 1f6bf907fcf7dc8171542e60e3417bbee1fbcbf7 was not fetched over the network, and no Phase 2 code or Phase 2 tests have been written or executed yet.
1. Architecture and Processing Sequence
Phase 2 implements a stateless, memory-bounded, synchronous Python DSP pipeline behind POST /api/v1/analyze/dsp while preserving Phase 1's /api/v1/demo/report and /api/v1/analyze/demo endpoints as explicit demonstration-mode routes. Both SimpleMixCheckView and AdvancedMixCheckView consume the identical real AudioMixAnalysisReport payload.
Deterministic Execution Sequence
Text
Browser (React 19 + Vite)
  └── User selects Genre, Mix Stage, Audio File, and confirms ConsentState
      (Permission 1: audio_analysis_consent = true required)
  ▼
src/services/apiService.ts :: analyzeAudioWithDsp(FormData)
  │ POST /api/v1/analyze/dsp (multipart/form-data via Vite proxy -> :8000)
  ▼
FastAPI Endpoint (backend/app/main.py -> backend/app/dsp/pipeline.py)
  │ Acquire concurrency guard: asyncio.Semaphore(2) (prevents OOM on low-RAM hosts)
  │
  ├─ Step 1 [Consent & Form Validation]:
  │    Parse `consent_state_json` & `input_context`. Return HTTP 403 if
  │    `audio_analysis_consent !== true`; HTTP 400 if malformed JSON.
  │
  ├─ Step 2 [Streamed Ingest + SHA-256]:
  │    Open `EphemeralAudioWorkspace` (`/tmp/mixlearn-<uuid>`).
  │    Stream `audio_file` in 64 KiB chunks to `<tmp>/input.bin` while hashing SHA-256.
  │    Abort immediately with HTTP 413 if `bytes_read > MAX_UPLOAD_BYTES` (100 MiB).
  │    Reject 0-byte uploads with HTTP 400.
  │
  ├─ Step 3 [Authoritative Media Probing]:
  │    Execute `ffprobe -v error -print_format json -show_format -show_streams <tmp>/input.bin`
  │    (`shell=False`, `timeout=10s`). Never trust frontend filename extensions or duration.
  │    Validate audio stream presence, container/codec allowlist (HTTP 415 if unsupported),
  │    channel count `1 <= channels <= 2` (HTTP 422 if 0 or > 2), and duration
  │    `0.05s <= duration <= 600.0s` (HTTP 422 if outside bounds or unreadable).
  │
  ├─ Step 4 [Standards Loudness & 4x True Peak Pass]:
  │    Execute `ffmpeg -nostdin -hide_banner -i <tmp>/input.bin -vn -sn -dn
  │      -filter_complex ebur128=peak=true:framelog=verbose -f null -`
  │    (`shell=False`, `timeout=45s`). Parse integrated LUFS, LRA, 400 ms momentary history,
  │    3 s short-term history, and 4x oversampled True Peak (dBTP).
  │
  ├─ Step 5 [Canonical Unaltered Float32 PCM Decode]:
  │    Execute `ffmpeg -nostdin -hide_banner -y -i <tmp>/input.bin -vn -sn -dn
  │      -acodec pcm_f32le -f wav <tmp>/decoded.wav`
  │    (`shell=False`, `timeout=45s`). Preserves original sample rate and channel count;
  │    applies zero resampling, normalization, limiting, or EQ.
  │
  ├─ Step 6 [Block-Streaming NumPy / SciPy DSP Pass]:
  │    Stream `<tmp>/decoded.wav` via `soundfile.blocks(blocksize=65536, dtype='float64')`:
  │    - Sample peak (dBFS), consecutive sample clipping events & timestamps, near-FS regions.
  │    - Global RMS, Crest Factor (dB), and window-aligned PLR / PSR.
  │    - Silence-gated Stereo Phase Correlation (400 ms windows) & Mid/Side Width Index.
  │    - Welch PSD band power integration (20–60 Hz, 200–500 Hz, 2–5 kHz, 10–20 kHz).
  │    - Uniformly downsampled `timeline` buckets (<= 240 buckets) aligned with ebur128 frames.
  │
  ├─ Step 7 [Diagnostic Rule Engine]:
  │    Generate strictly separated `objective_technical` issues and `subjective_stylistic`
  │    observations with sample-accurate timestamps and dual-audience recommendations.
  │
  ├─ Step 8 [Finite-Number Sanitization & Schema v2.0.0 Validation]:
  │    Recursively verify no `NaN`/`Infinity`/`-Infinity`; serialize with `allow_nan=False`.
  │    Set `is_demonstration_data = false` and `measurements.*.source = "mathematical_dsp"`.
  │
  └─ Step 9 [Guaranteed Ephemeral Cleanup]:
       `EphemeralAudioWorkspace.__exit__` unconditionally deletes `<tmp>` via `shutil.rmtree`
       in `finally` on both success and every error/timeout path.
2. Approved Libraries and Dependencies
Use this exact stack with zero redundant wrappers, databases, or task queues:
System Binaries (Docker / Ubuntu CI)
ffmpeg & ffprobe (>= 4.4): Authoritative container probing, lossy/lossless decoding to pcm_f32le, and libebur128 (ebur128=peak=true:framelog=verbose) loudness + 4x oversampled true-peak engine.
libsndfile1: Required system library for soundfile.
Python Backend (backend/requirements.txt)
Retain fastapi>=0.110.0, pydantic>=2.0.0, uvicorn>=0.28.0, httpx>=0.27.0, pytest>=8.0.0, jsonschema>=4.20.0, and add:
python-multipart>=0.0.9: Multipart file upload parsing in FastAPI.
numpy>=1.26.0,<3.0.0: Vectorized block-level peak, RMS, clipping, correlation, and M/S calculations.
scipy>=1.12.0: scipy.signal.welch spectral density estimation.
soundfile>=0.12.1: Chunked sf.blocks() streaming reader for pcm_f32le WAV files.
pyloudnorm>=0.1.1: Independent ITU-R BS.1770-4 validation meter used in automated numerical verification tests (and as a cross-check reference, never replacing FFmpeg's 4x oversampled true peak).
Frontend (package.json)
No new npm packages are required. Keep React 19, Vite, TypeScript, Tailwind CSS, and lucide-react. Any optional local audio auditioning in browser uses native HTML5 <audio> / Web Audio API on the local File blob URL without sending audio to external APIs.
3. Exact Formulas and Measurement Definitions
Let 
 be float64 PCM samples for channel 
, 
, sample rate 
 (Hz), total frames 
, and duration 
.
A. Audio Metadata
Extracted exclusively on the backend after upload streaming and ffprobe:
filename: Path-stripped, sanitized basename (
 chars); never logged.
format: Mapped from ffprobe format_name + codec_name into "WAV" | "FLAC" | "AIFF" | "MP3" | "OGG". Never inferred from filename extension.
codec: Exact streams[0].codec_name (e.g., pcm_s24le, pcm_f32le, flac, mp3, vorbis, opus).
sample_rate_hz: int(streams[0].sample_rate).
channels: int(streams[0].channels) (strictly 1 or 2).
duration_seconds: Exact decoded duration 
 from decoded.wav frames (cross-checked against ffprobe).
bit_depth: int(bits_per_raw_sample or bits_per_sample) ONLY for lossless PCM/FLAC/AIFF when 
; strictly null for lossy codecs (MP3, OGG) with bit_depth_note: "Not applicable to lossy transform codecs".
file_size_bytes: Exact streamed byte count.
sha256_checksum: Lowercase 64-char hex digest of raw uploaded bytes.
B. Loudness Analysis (ITU-R BS.1770-4 / EBU R128 / Tech 3342)
Computed via FFmpeg ebur128=peak=true:framelog=verbose:
Integrated Loudness (
, LUFS): Gated loudness over 
 blocks (
 hop), 
 absolute gate, 
 relative gate:

Returns null (unavailable_reason: "signal_below_absolute_gate") if FFmpeg reports -70.0 / -inf (digital silence or insufficient gated blocks).
Momentary Max Loudness (
, LUFS): Maximum across 
 ungated K-weighted blocks (
 hop). Requires 
; otherwise null (insufficient_duration_under_400ms).
Short-Term Max Loudness (
, LUFS): Maximum across 
 ungated K-weighted blocks (
 hop). Requires 
; otherwise null (insufficient_duration_under_3s).
Loudness Range (
, LU): EBU Tech 3342 difference between the 95th and 10th percentiles of 
 short-term loudness blocks above 
 and 
 relative threshold. Requires 
 and 
 gated blocks; otherwise null.
Independent Validation (pyloudnorm): Automated validation tests cross-check FFmpeg ebur128 integrated LUFS against pyloudnorm.Meter(fs).integrated_loudness(x) within 
.
C. Peak and Clipping Analysis
Sample Peak Max (sample_peak_max, dBFS):

If 
, return null (digital_silence_zero_peak).
True Peak Max (true_peak_max, dBTP): Strictly from FFmpeg ebur128=peak=true (ITU-R BS.1770-4 4x oversampled 48-tap polyphase FIR filter). Never use linear interpolation. If linear true peak is 
, return null (digital_silence_zero_peak).
Sample Clipping Events (sample_clipping_events, count) & Timestamps:
Count contiguous runs of 
 consecutive samples in any channel where 
 (
). Record exact { start_sec = start_idx / f_s, end_sec = end_idx / f_s } for each run (merging runs within 
 for UI issue markers while preserving exact total run count).
Near-Full-Scale Regions:
Count 
 windows where 
 (
) and record contiguous intervals in evidence.
Explicit Distinction in Diagnostics:
Sample Clipping: sample_clipping_events > 0 (flat-topped consecutive full-scale samples).
Inter-Sample Peak (ISP): sample_peak_max <= 0.0 dBFS and sample_clipping_events == 0, while true_peak_max > 0.0 dBTP on lossless inputs.
Codec Artifacts: true_peak_max > 0.0 dBTP on MP3/OGG with sample_clipping_events == 0—explicitly labeled as lossy-codec overshoot risk rather than PCM clipping.
Intentional Saturation / Limiting: Elevated loudness / low crest factor (
) with sample_clipping_events == 0 and true_peak_max <= -1.0 dBTP—reported as dynamic density (subjective_stylistic), not a clipping defect.
D. Dynamics
Global RMS:
Crest Factor (crest_factor, dB):

Requires 
 (
); otherwise null (signal_below_noise_floor).
Loudness Range (loudness_range_lra, LU): Per Section 3.B.
Peak-to-Loudness Ratio (plr, dB, optional metric):

Defined only when both true_peak_max and integrated_loudness are non-null. Undefined subjective scores (e.g., "punch index") are forbidden.
E. Stereo Imaging and Phase
Mono Input Rule: If channels == 1, phase_correlation_mean, phase_correlation_min, and stereo_width_index MUST all return value: null, status: "unavailable", unavailable_reason: "mono_input_no_stereo_field".
Silence-Gated Windowed Correlation (channels == 2):
Partition into non-overlapping 
 windows (
). For each window 
, compute:

Exclude window 
 if 
 (
) OR 
 OR 
. For each active window:
phase_correlation_mean: Arithmetic mean of 
 across active windows; null (no_active_stereo_windows) if zero active windows exist.
phase_correlation_min: Minimum 
 across active windows; if 
, emit an objective_technical mono-compatibility warning citing exact [start_sec, end_sec] timestamps of contiguous negative-correlation windows.
Orthonormal Mid/Side Stereo Width Index (stereo_width_index, percent):
Over samples inside active (non-silent) windows (
):


Strictly bounded in 
: 
; uncorrelated 
; 
. Never divides by zero even when 
.
F. Frequency Balance (Welch Spectral Power Density)
Method: scipy.signal.welch per channel (window='hann', nperseg=8192 if 
 else largest power of 2 
, noverlap=nperseg//2, scaling='density', average='mean'). Return null if 
.
Stereo Aggregation: Power-average across channels:
Band Power Integration & Normalization:
Integrate over 
 via np.trapezoid:
Primary Metric (dBFS): Normalized to digital full-scale power 
:

(If 
, return null for silence; if track is active and a single band 
, floor to -120.0 dBFS.)
Relative Band Ratio (Denominator = 
): Compute 
 (dB rel. broadband) and record in algorithm_detail and evidence[].method.
Bands & Nyquist Guard:
sub_bass_energy_20_60hz: 
mud_band_energy_200_500hz (UI display label: "Low-Mid Region (200–500 Hz)"): 
presence_band_energy_2k_5khz: 
air_band_energy_10k_20khz: 
 — if 
 (i.e. 
), MUST return value: null, status: "unavailable", unavailable_reason: "nyquist_limit_below_band_upper_bound".
Non-Diagnostic Guard: Never diagnose "muddy" or "harsh" merely because band energy in dBFS is high. Spectral balance comments are strictly subjective_stylistic and framed around relative band share 
.
G. Timeline and Evidence
Downsample full audio duration 
 into 
 uniform buckets of width 
:
Each bucket stores { start_sec, end_sec, peak_dbfs, rms_dbfs, momentary_lufs, short_term_lufs, phase_correlation, clipped }.
momentary_lufs and short_term_lufs are mapped from FFmpeg ebur128 framelog=verbose timestamps (t: lines); silent buckets use null for peak_dbfs/rms_dbfs if 
 (<= -120 dBFS or 0 amplitude).
Every issues[].timestamps[] region derives strictly from sample indices or ebur128 frame timestamps.
4. Standards Compliance and Limitations
ITU-R BS.1770-4 vs. BS.1770-5 Disclosure: FFmpeg libebur128 and pyloudnorm 0.1.1 implement ITU-R BS.1770-4 and EBU R128 / Tech 3342. For 1-channel mono and 2-channel stereo audio (
), K-weighting, 
/
 gating, and 4x oversampled true peak equations are unchanged in BS.1770-5 (whose updates target immersive/multichannel layouts). Phase 2 restricts inputs to channels in {1, 2} and MUST record "standard": "ITU-R BS.1770-4 (1ch/2ch compatible with BS.1770-5); EBU R128"—never claiming full BS.1770-5 multichannel compliance.
Silence, Short Clips, and Low Sample Rates: Never fabricate 0.0 or fallback numbers when a quantity is mathematically undefined; serialize value: null with status: "unavailable" and unavailable_reason.
JSON Numeric Safety: Python serialization enforces json.dumps(..., allow_nan=False) (or FastAPI custom sanitizer converting any non-finite float to None before validation) so NaN, Infinity, and -Infinity can never reach the wire.
5. File / Folder / Module Implementation Plan
Files to Create
backend/app/dsp/__init__.py — Exposes analyze_audio_file.
backend/app/dsp/media_probe.py — Streaming upload writer + SHA-256, ffprobe validation, codec/channel/duration caps, and pcm_f32le decoder.
backend/app/dsp/loudness.py — ffmpeg ebur128=peak=true:framelog=verbose execution and frame-log parser.
backend/app/dsp/waveform_metrics.py — soundfile.blocks() streaming peak, clipping runs, near-FS regions, crest factor, PLR, silence-gated correlation, M/S width, and downsampled timeline.
backend/app/dsp/spectral.py — Welch PSD band integration, total-power denominator normalization, and Nyquist check.
backend/app/dsp/diagnostics.py — Deterministic issue/recommendation generator keeping objective_technical separate from subjective_stylistic.
backend/app/dsp/pipeline.py — End-to-end orchestrator inside EphemeralAudioWorkspace, finite-number sanitizer, and schema v2.0.0 self-validation.
backend/tests/fixtures_generator.py — Deterministic NumPy/SciPy WAV/FLAC/corrupt/ISP signal generator.
backend/tests/test_dsp_validation.py — Numerical ground-truth & pyloudnorm cross-check suite.
backend/tests/test_dsp_endpoint.py — Multipart HTTP upload, error-code, consent, cleanup, and dual-interface parity tests.
Files to Modify
contracts/analysis_report.schema.json — Bump 1.0.0 → 2.0.0.
contracts/fixtures/demo_report.json — Migrate fixture to 2.0.0 (is_demonstration_data: true, source: "phase1_demo_fixture", timeline: null).
backend/requirements.txt — Add python-multipart, numpy, scipy, soundfile, pyloudnorm.
backend/app/main.py — Wire POST /api/v1/analyze/dsp (asyncio.Semaphore(2)), update /api/v1/health (phase: 2, active_contract_version: "2.0.0") and /api/v1/capabilities (dsp_core_measurements: "IMPLEMENTED"), keep Phases 3–5 at 501.
backend/tests/test_phase1_contracts.py — Update health/capabilities assertions to Phase 2 / schema 2.0.0 and delegate /api/v1/analyze/dsp tests to test_dsp_endpoint.py.
src/contracts/analysisContract.ts, src/contracts/demoFixtures.ts, src/contracts/analysisContract.test.ts, src/contracts/backendIntegration.test.ts — Update to 2.0.0, nullable MeasurementValue.value, unavailable status, timeline type, and mode-aware validateAnalysisReport(report, { expectedMode }).
src/services/apiService.ts — Fix checkBackendHealth (data.phase >= 1) and add analyzeAudioWithDsp().
src/App.tsx, src/components/SimpleMixCheckView.tsx, src/components/AdvancedMixCheckView.tsx, src/components/WaveformInspector.tsx — Wire real file upload, loading/error states, null metric rendering, and real timeline.buckets plotting.
scripts/validate_schema.js & .github/workflows/ci.yml — Install ffmpeg + libsndfile1, validate 2.0.0 schema, run all backend & frontend tests.
6. API Request / Response Contract
POST /api/v1/analyze/dsp
Request (multipart/form-data):
audio_file: UploadFile (Required, max 104,857,600 bytes / 100 MiB)
interface_mode: "simple" | "advanced" (Required)
genre: "indie_rock" | "electronic_club" | "hip_hop_trap" | "pop_vocal" | "acoustic_folk" | "cinematic_orchestral" (Required)
mix_stage: "unmastered_mix" | "final_master" (Required)
consent_state_json: JSON-encoded ConsentState (Required; audio_analysis_consent must be true)
user_notes: Optional string (
 chars)
plugin_chain_metadata_json: Optional JSON array of PluginChainItem
Responses:
200 OK: AudioMixAnalysisReport (schema_version: "2.0.0", is_demonstration_data: false, measurements.*.source: "mathematical_dsp", non-null timeline).
400 Bad Request: Malformed JSON form fields or empty 0-byte upload.
403 Forbidden: audio_analysis_consent is false (error_code: "CONSENT_REQUIRED").
413 Content Too Large: File exceeds MAX_UPLOAD_BYTES (100 MiB).
415 Unsupported Media Type: Probed container/codec outside {WAV, FLAC, AIFF, MP3, OGG}.
422 Unprocessable Entity: Corrupt/truncated audio (CORRUPT_AUDIO), channels == 0 or channels > 2 (UNSUPPORTED_CHANNEL_LAYOUT), or duration 
 / 
 (DURATION_OUT_OF_BOUNDS).
504 Gateway Timeout: ffprobe/ffmpeg exceeded timeout (10s/45s).
Status & Legacy Endpoints
GET /api/v1/health → { status: "ok", phase: 2, mode: "mathematical_dsp_active", is_demonstration_mode: false, active_contract_version: "2.0.0" }.
GET /api/v1/capabilities → dsp_core_measurements: "IMPLEMENTED"; Phases 3–5 endpoints remain 501 Not Implemented (422 on AI stems, 403 on missing AI consent).
GET /api/v1/demo/report & POST /api/v1/analyze/demo → Retained for no-upload demonstration with is_demonstration_data: true.
7. JSON Schema Migration Specification (1.0.0 → 2.0.0)
Because making measurements.*.value nullable and permitting is_demonstration_data: false breaks 1.0.0 consumers, bump schema_version to "2.0.0":
schema_version: "const": "2.0.0".
is_demonstration_data: "type": "boolean". Cross-field validator rules:
DSP Mode (false): All measurements.* must have source === "mathematical_dsp", capabilities.dsp_core_measurements.status === "IMPLEMENTED", and timeline !== null.
Demo Mode (true): All measurements.* must have source === "phase1_demo_fixture" and data_source_notice must contain "DEMONSTRATION".
file_metadata:
Add required "codec": { "type": "string", "minLength": 1 }.
Add "bit_depth_note": { "type": ["string", "null"] }.
Relax sample_rate_hz from closed enum to { "type": "integer", "minimum": 8000, "maximum": 384000 }.
$defs.measurementValue:
"value": { "type": ["number", "null"] }
"status": { "type": "string", "enum": ["optimal", "warning", "critical", "unavailable"] }
"unavailable_reason": { "type": ["string", "null"] } (required non-null when value === null).
"algorithm_detail": { "type": "string", "minLength": 5 } (documents exact window, gating, and normalization).
Add "sample_peak_max" (dBFS) to measurements alongside true_peak_max (dBTP).
Add required top-level "timeline" (object | null): Contains bucket_duration_sec, total_duration_sec, and buckets[] (<= 240 items of { start_sec, end_sec, peak_dbfs, rms_dbfs, momentary_lufs, short_term_lufs, phase_correlation, clipped }).
extensions: All 6 slots remain strictly null in Phase 2.
Validator Migration: Replace validatePhase1AnalysisReport with validateAnalysisReport(report, { expectedMode: 'dsp' | 'demo' | 'any' }) so dsp mode never accepts demo fixtures and neither mode silently bypasses consent, finite-number, or Rule 1/2/8 checks.
8. Numerical Validation Strategy
Verify against analytical equations and pyloudnorm 0.1.1 (never arbitrary hardcoded LUFS guesses):
Loudness Parity: Compare ffmpeg ebur128 against pyloudnorm.Meter(fs).integrated_loudness(audio) on synthetic 1 kHz tones, pink noise, and multi-amplitude gated sequences; assert 
.
True Peak vs. Sample Peak Analytical Ground Truth: Generate 
 sine 
 with 
. Sample peaks equal 
 (
), while continuous waveform peak is 
: assert sample_peak_max = -2.01 ± 0.05 dBFS, sample_clipping_events == 0, and true_peak_max = +1.00 ± 0.15 dBTP.
Phase & M/S Width Ground Truth: Verify 
; 
; independent Gaussian noise 
.
Welch PSD Parseval Conservation: Assert sum of trapezoidal integral across 
 equals 
 within 
.
9. Resource and Privacy Safeguards
Bounded Streaming & Memory: Stream uploads in 64 KiB chunks (MAX_UPLOAD_BYTES = 104,857,600), reject duration > 600s or channels > 2 via ffprobe before decoding, and iterate decoded.wav via soundfile.blocks(blocksize=65536) (~512 KiB RAM/block).
Concurrency & Timeout: Guard POST /api/v1/analyze/dsp with asyncio.Semaphore(2); enforce timeout=10s on ffprobe and timeout=45s on ffmpeg with shell=False.
Zero Retention & Zero PII Logging: EphemeralAudioWorkspace unconditionally removes /tmp/mixlearn-<uuid> in finally. Logs record only report_id, sha256[:12], duration_seconds, and HTTP code—never raw filenames, notes, or audio data.
Zero External AI Calls: backend/app/dsp/* has no AI SDK imports and makes no outbound network requests.
10. Frontend Integration Instructions
src/services/apiService.ts: Update checkBackendHealth from data.phase === 1 to data.phase >= 1. Add analyzeAudioWithDsp() posting FormData to /api/v1/analyze/dsp and validating via validateAnalysisReport(data, { expectedMode: 'dsp' }). Never overwrite backend-authoritative file_metadata.
src/App.tsx: Store selectedAudioFile: File | null. On file selection when consent.audio_analysis_consent === true, call analyzeAudioWithDsp(). Render [DEMONSTRATION DATA] banners only when activeReport.is_demonstration_data === true; when false, display [MATHEMATICAL DSP ANALYSIS · REAL AUDIO MEASUREMENTS] with sha256_checksum and codec.
src/components/SimpleMixCheckView.tsx & src/components/AdvancedMixCheckView.tsx: Add analyzing loading state, surface HTTP 413/415/422/504 errors cleanly, rename "Low-Mid / Mud" display label to "Low-Mid Region (200–500 Hz)", and display "N/A" + unavailable_reason whenever measurement.value === null.
src/components/WaveformInspector.tsx: Accept timeline: AnalysisReport['timeline']. When timeline !== null && !isDemonstrationData, plot real timeline.buckets (peak_dbfs, rms_dbfs, clipped, phase_correlation) and label the view "Measured Time-Domain Envelope (FFmpeg/PCM)". Reserve synthetic bars strictly for is_demonstration_data === true.
11. Test Fixtures and Expected Behaviors
Implement all 18 deterministic test cases in backend/tests/test_dsp_validation.py and backend/tests/test_dsp_endpoint.py:
Digital Silence (5s zeros): Peak/crest/loudness/phase metrics null with explicit unavailable_reason; valid finite JSON (allow_nan=False).
Constant Sine (1 kHz, -20 dBFS peak, 5s): sample_peak_max = -20.0 ± 0.05 dBFS, crest_factor = 3.01 ± 0.05 dB, loudness within ±0.15 LU of pyloudnorm.
Near-Full-Scale (-0.3 dBFS peak): sample_clipping_events == 0, near-FS region detected, sample_peak_max = -0.3 ± 0.05 dBFS.
Clipped Waveform (+3 dB hard-clipped burst): sample_clipping_events >= 1 with timestamps matching injected clip window within ±0.05s.
Inter-Sample True-Peak (
, 
 phase, 
 samples): sample_peak_max = -2.01 ± 0.05 dBFS, sample_clipping_events == 0, true_peak_max = +1.00 ± 0.15 dBTP.
Identical Stereo (
): phase_correlation_mean/min = +1.0 ± 0.005, stereo_width_index = 0.0 ± 0.1%.
Opposite-Polarity Stereo (
): phase_correlation_mean = -1.0 ± 0.005, stereo_width_index = 100.0 ± 0.1%, emits objective mono-compatibility warning.
Mono Signal (channels=1): All 3 stereo/phase metrics null (mono_input_no_stereo_field).
Short Audio (0.25s and 1.5s): 0.25s returns null for momentary/short-term/LRA; 1.5s computes momentary, returns null for short-term/LRA.
Different Sample Rates (44.1, 48, 96, 22.05 kHz): Exact sample_rate_hz reported; 22.05 kHz sets air_band_energy_10k_20khz = null (nyquist_limit_below_band_upper_bound).
40 Hz & 15 kHz Tones: 40 Hz isolates energy in 20–60 Hz; 15 kHz isolates energy in 10–20 kHz.
Truncated / Malformed Audio: Corrupt WAV header / truncated bytes return HTTP 422.
Oversized Upload: Stream exceeding 100 MiB aborts with HTTP 413.
Unsupported Codec / Multichannel: Non-audio (e.g., PNG) returns HTTP 415; 5.1 surround WAV returns HTTP 422.
Consent Refusal: audio_analysis_consent: false returns HTTP 403 before processing.
Workspace Cleanup on Success & Failure: Zero mixlearn-* directories remain in /tmp after 200 and error responses.
Schema Conformance: Every 200 payload passes jsonschema.validate(report, schema_v2) with is_demonstration_data is False.
Dual-Interface Equivalence: interface_mode="simple" vs "advanced" on identical audio yields identical measurements and issues.
12. CI Modifications (.github/workflows/ci.yml)
backend-contract-checks: Install sudo apt-get update && sudo apt-get install -y ffmpeg libsndfile1, install backend/requirements.txt, and run PYTHONPATH=. pytest backend/tests/test_phase1_contracts.py backend/tests/test_dsp_validation.py backend/tests/test_dsp_endpoint.py.
contract-and-frontend-checks: Update inline check & scripts/validate_schema.js to validate schema_version === "2.0.0", Rule 1/5 invariants, and demo_report.json compatibility; run npm run lint, npm test, and npm run build.
13. Dependency Risks
FFmpeg ebur128 Log Format Differences: Container FFmpeg versions (4.4 vs 6.x) can slightly alter summary/frame-log whitespace. Mitigation: Unit-test parser against multi-version log fixtures and pin Ubuntu FFmpeg in CI.
Lossy Codec Support (MP3/OGG) in libsndfile: Older libsndfile builds lack native MP3/Opus decoding. Mitigation: Always decode through ffmpeg to pcm_f32le WAV before calling soundfile.blocks().
Low-Memory Container OOM: Concurrent 10-minute 96 kHz WAV decodes can exceed 512 MB RAM. Mitigation: 100 MiB / 600s caps, block-streaming, and asyncio.Semaphore(2).
14. Definition of Done
Schema migrated to 2.0.0 across contracts/analysis_report.schema.json, Pydantic models, and TypeScript validators.
POST /api/v1/analyze/dsp performs genuine mathematical DSP with zero AI calls, zero persistent audio retention, and is_demonstration_data: false.
All 18 backend DSP/endpoint tests and all frontend contract/integration/build checks pass in CI.
Both Simple and Advanced UIs consume the same real DSP output, plot real timeline buckets, and render null metrics honestly.
Phases 3–5 remain strictly 501 NOT_IMPLEMENTED.
15. Phase 3 Handoff Boundaries
extensions.streaming_estimates and extensions.reference_comparison remain null (NOT_IMPLEMENTED) in Phase 2.
Phase 2's verified integrated_loudness, true_peak_max, loudness_range_lra, and spectral outputs serve as the immutable mathematical inputs for Phase 3's LUFS-matched reference track delta engine and documented streaming-platform gain estimator (Rule 7).
FINAL DELIVERABLE SUMMARY
Required Files to Create: backend/app/dsp/__init__.py, backend/app/dsp/media_probe.py, backend/app/dsp/loudness.py, backend/app/dsp/waveform_metrics.py, backend/app/dsp/spectral.py, backend/app/dsp/diagnostics.py, backend/app/dsp/pipeline.py, backend/tests/fixtures_generator.py, backend/tests/test_dsp_validation.py, backend/tests/test_dsp_endpoint.py
Required Files to Modify: contracts/analysis_report.schema.json, contracts/fixtures/demo_report.json, backend/requirements.txt, backend/app/main.py, backend/tests/test_phase1_contracts.py, src/contracts/analysisContract.ts, src/contracts/demoFixtures.ts, src/contracts/analysisContract.test.ts, src/contracts/backendIntegration.test.ts, src/services/apiService.ts, src/App.tsx, src/components/SimpleMixCheckView.tsx, src/components/AdvancedMixCheckView.tsx, src/components/WaveformInspector.tsx, scripts/validate_schema.js, .github/workflows/ci.yml
Exact API Contracts: POST /api/v1/analyze/dsp (multipart/form-data) → 200 (AudioMixAnalysisReport v2.0.0, is_demonstration_data: false) | 400 | 403 | 413 | 415 | 422 | 504; GET /api/v1/health (phase: 2); GET /api/v1/capabilities (dsp_core_measurements: "IMPLEMENTED"); Phases 3–5 routes unchanged (501/422/403).
Expected Tests: PYTHONPATH=. pytest backend/tests/test_phase1_contracts.py backend/tests/test_dsp_validation.py backend/tests/test_dsp_endpoint.py (all 18 cases) + npm run lint && npm test && node scripts/validate_schema.js && npm run build.
Acceptance Criteria: Real uploaded audio yields schema-v2.0.0-valid DSP reports (is_demonstration_data: false) matching pyloudnorm (±0.15 LU) and analytical true-peak/phase/PSD tolerances; undefined metrics serialize cleanly as null without NaN/Infinity; zero temp-file leakage; zero external AI calls; identical metrics across Simple and Advanced UIs.
Unresolved Risks: (1) FFmpeg ebur128 log formatting variance across 4.4.x vs 6.x builds; (2) tight RAM/CPU headroom under concurrent 96 kHz uploads on free-tier hosting; (3) remote GitHub commit 1f6bf907fcf7dc8171542e60e3417bbee1fbcbf7 state outside local workspace files could not be verified over the network.
Suggestions
