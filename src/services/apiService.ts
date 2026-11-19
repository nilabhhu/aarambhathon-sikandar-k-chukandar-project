/**
 * Client API Service for MixLearn Studio (Phase 2 Real Mathematical DSP)
 *
 * Sends direct HTTPS multipart uploads to `${VITE_API_BASE_URL}/api/v1/analyze/dsp`
 * when VITE_API_BASE_URL is configured (bypassing Vercel's 4.5 MB serverless payload limit),
 * or relative `/api/v1/analyze/dsp` via Vite dev proxy locally.
 * Falls back to local Web Audio mathematical DSP (`clientWebAudioDsp.ts`) ONLY when
 * the FastAPI backend is unreachable.
 */

import {
  AnalysisReport,
  ConsentState,
  createDefaultConsentState,
  GenreId,
  InterfaceMode,
  MixStage,
  validateAnalysisReport,
} from '../contracts/analysisContract';
import { generatePhase1DemoReport } from '../contracts/demoFixtures';
import { analyzeAudioLocallyWithWebAudio } from './clientWebAudioDsp';

export const MAX_UPLOAD_FILE_BYTES = 100 * 1024 * 1024; // 100 MB
export const ALLOWED_AUDIO_EXTENSIONS = ['.wav', '.flac', '.aiff', '.mp3', '.ogg'] as const;

export interface UploadValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Explicit client-side upload guard enforced BEFORE uploading:
 * - Allowed formats: .wav, .flac, .aiff, .mp3, .ogg
 * - Maximum file size: 100 MB
 */
export function validateAudioUploadFile(file: {
  name: string;
  size: number;
  type?: string;
}): UploadValidationResult {
  const name = (file.name || '').trim();
  const dotIdx = name.lastIndexOf('.');
  const ext = dotIdx >= 0 ? name.slice(dotIdx).toLowerCase() : '';

  if (!ext || !(ALLOWED_AUDIO_EXTENSIONS as readonly string[]).includes(ext)) {
    return {
      valid: false,
      error: `Unsupported file format "${ext || 'unknown'}". Allowed formats: ${ALLOWED_AUDIO_EXTENSIONS.join(', ')}.`,
    };
  }

  if (file.size <= 0) {
    return {
      valid: false,
      error: 'Selected audio file is empty (0 bytes). Please choose a valid audio export.',
    };
  }

  if (file.size > MAX_UPLOAD_FILE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File size (${sizeMb} MB) exceeds the 100 MB maximum upload limit.`,
    };
  }

  return { valid: true };
}

const RAW_BASE_URL =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL
    ? String(import.meta.env.VITE_API_BASE_URL)
    : '';

export const API_BASE_URL = RAW_BASE_URL.trim().replace(/\/$/, '');

export function buildApiUrl(path: string, baseOverride?: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const base = (baseOverride !== undefined ? baseOverride : API_BASE_URL).trim().replace(/\/$/, '');
  return `${base}${cleanPath}`;
}

export interface BackendHealthResponse {
  status: string;
  phase: number;
  mode?: string;
  is_demonstration_mode: boolean;
  active_contract_version?: string;
  timestamp?: string;
}

export interface ReportFetchResult {
  success: boolean;
  source: 'backend' | 'local_web_audio' | 'offline_fallback';
  report: AnalysisReport;
  statusCode?: number;
  errorMessage?: string;
}

export interface DspAnalysisResult {
  success: boolean;
  source: 'backend' | 'local_web_audio';
  report: AnalysisReport | null;
  statusCode?: number;
  errorMessage?: string;
}

function parseConsentFromFormData(formData: FormData): ConsentState {
  const raw = formData.get('consent_state_json');
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as ConsentState;
    } catch {
      // fall through
    }
  }
  return createDefaultConsentState();
}

/**
 * Checks backend health via GET /api/v1/health.
 */
export async function checkBackendHealth(
  customFetch: typeof fetch = fetch,
  baseOverride?: string
): Promise<{ online: boolean; data?: BackendHealthResponse; errorMessage?: string }> {
  try {
    const url = buildApiUrl('/api/v1/health', baseOverride);
    const res = await customFetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      return {
        online: false,
        errorMessage: `Backend returned HTTP ${res.status}: ${res.statusText}`,
      };
    }

    const data: BackendHealthResponse = await res.json();
    return {
      online: data.status === 'ok' && data.phase >= 1,
      data,
    };
  } catch (err: any) {
    return {
      online: false,
      errorMessage: err?.message || 'Network connection to backend failed',
    };
  }
}

/**
 * Executes genuine Phase 2 mathematical DSP analysis via direct HTTPS multipart POST
 * to `${VITE_API_BASE_URL}/api/v1/analyze/dsp` (or `/api/v1/analyze/dsp` in dev).
 *
 * Falls back to `clientWebAudioDsp.ts` ONLY when the FastAPI backend is unreachable.
 */
export async function analyzeAudioWithDsp(
  formData: FormData,
  customFetch: typeof fetch = fetch,
  options?: {
    baseOverride?: string;
    localAnalyzer?: typeof analyzeAudioLocallyWithWebAudio;
  }
): Promise<DspAnalysisResult> {
  const consent = parseConsentFromFormData(formData);
  const genre = (formData.get('genre') as GenreId) || 'indie_rock';
  const mixStage = (formData.get('mix_stage') as MixStage) || 'unmastered_mix';
  const interfaceMode = (formData.get('interface_mode') as InterfaceMode) || 'advanced';
  const audioEntry = formData.get('audio_file');

  // Rule 4 consent guard before upload or local decoding
  if (!consent.audio_analysis_consent) {
    return {
      success: false,
      source: 'local_web_audio',
      report: null,
      statusCode: 403,
      errorMessage:
        'Permission 1 (audio_analysis_consent) is required before examining or measuring audio.',
    };
  }

  // Client-side upload validation guard before network transfer
  if (audioEntry && typeof audioEntry === 'object' && 'name' in audioEntry && 'size' in audioEntry) {
    const fileValidation = validateAudioUploadFile(audioEntry as File);
    if (!fileValidation.valid) {
      return {
        success: false,
        source: 'local_web_audio',
        report: null,
        statusCode: 400,
        errorMessage: fileValidation.error,
      };
    }
  }

  const runLocalFallback = async (reason: string): Promise<DspAnalysisResult> => {
    if (audioEntry && typeof audioEntry === 'object' && 'arrayBuffer' in audioEntry) {
      try {
        const analyzer = options?.localAnalyzer ?? analyzeAudioLocallyWithWebAudio;
        const localReport = await analyzer(audioEntry as File, {
          interface_mode: interfaceMode,
          genre,
          mix_stage: mixStage,
          consent_state: consent,
        });
        return {
          success: true,
          source: 'local_web_audio',
          report: localReport,
          errorMessage: reason,
        };
      } catch (decodeErr: any) {
        return {
          success: false,
          source: 'local_web_audio',
          report: null,
          errorMessage: `${reason} Local Web Audio decoding also failed: ${decodeErr?.message || 'unsupported codec in browser'}.`,
        };
      }
    }
    return {
      success: false,
      source: 'local_web_audio',
      report: null,
      errorMessage: reason,
    };
  };

  try {
    const url = buildApiUrl('/api/v1/analyze/dsp', options?.baseOverride);
    const res = await customFetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
      },
      body: formData,
    });

    const contentType = (res.headers?.get?.('content-type') || '').toLowerCase();

    if (res.ok) {
      if (contentType && !contentType.includes('json')) {
        return runLocalFallback(
          'FastAPI backend URL did not return JSON (verify VITE_API_BASE_URL). Computed locally using Web Audio DSP fallback.'
        );
      }

      let data: AnalysisReport;
      try {
        data = (await res.json()) as AnalysisReport;
      } catch {
        return runLocalFallback(
          'FastAPI backend returned an unreadable response. Computed locally using Web Audio DSP fallback.'
        );
      }

      const validation = validateAnalysisReport(data, { expectedMode: 'dsp' });

      if (validation.valid) {
        return {
          success: true,
          source: 'backend',
          report: data,
          statusCode: res.status,
        };
      }

      return {
        success: false,
        source: 'backend',
        report: null,
        statusCode: res.status,
        errorMessage: `Backend DSP report failed contract validation: ${validation.errors.join('; ')}`,
      };
    }

    // Attempt to parse structured FastAPI error payload
    let errJson: any = null;
    if (!contentType || contentType.includes('json')) {
      try {
        errJson = await res.json();
      } catch {
        errJson = null;
      }
    }

    const hasFastApiDetail =
      errJson !== null && typeof errJson === 'object' && 'detail' in errJson;

    // Genuine FastAPI 4xx validation/consent errors (400, 403, 413, 415, 422):
    // surface cleanly inline without faking data.
    const isGenuineFastApiValidationError =
      hasFastApiDetail &&
      (res.status === 400 ||
        res.status === 403 ||
        res.status === 413 ||
        res.status === 415 ||
        res.status === 422);

    if (isGenuineFastApiValidationError) {
      let errMsg = `Backend HTTP ${res.status}: ${res.statusText}`;
      if (errJson?.detail?.message) errMsg = errJson.detail.message;
      else if (typeof errJson?.detail === 'string') errMsg = errJson.detail;

      return {
        success: false,
        source: 'backend',
        report: null,
        statusCode: res.status,
        errorMessage: errMsg,
      };
    }

    // Unreachable FastAPI backend (500/502/503/504, static-host 404/405, or non-FastAPI proxy response):
    // fall back to genuine local Web Audio mathematical DSP.
    return runLocalFallback(
      `FastAPI backend unreachable (HTTP ${res.status}). Computed locally using Web Audio DSP fallback.`
    );
  } catch (err: any) {
    // Backend network unreachable -> genuine local Web Audio DSP fallback
    return runLocalFallback(
      `FastAPI backend unreachable (${err?.message || 'offline'}). Analyzed locally with Web Audio DSP fallback.`
    );
  }
}

/**
 * Fetches an analysis report from the Phase 1 demo endpoint (retained for contract/integration tests).
 */
export async function fetchAnalysisReport(
  params: {
    interface_mode: InterfaceMode;
    genre: GenreId;
    mix_stage: MixStage;
    consent_state: ConsentState;
    custom_filename?: string;
    custom_file_size_bytes?: number;
    custom_duration_sec?: number;
    custom_sample_rate?: number;
  },
  customFetch: typeof fetch = fetch
): Promise<ReportFetchResult> {
  if (!params.consent_state.audio_analysis_consent) {
    const fallbackReport = generatePhase1DemoReport(params);
    return {
      success: false,
      source: 'offline_fallback',
      report: fallbackReport,
      statusCode: 403,
      errorMessage: 'Permission 1 (audio_analysis_consent) is required to view report.',
    };
  }

  try {
    const url = buildApiUrl('/api/v1/analyze/demo');
    const res = await customFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        interface_mode: params.interface_mode,
        genre: params.genre,
        mix_stage: params.mix_stage,
        consent_state: params.consent_state,
      }),
    });

    if (res.ok) {
      const data: AnalysisReport = await res.json();
      const validation = validateAnalysisReport(data, { expectedMode: 'demo' });

      if (validation.valid) {
        if (params.custom_filename) data.file_metadata.filename = params.custom_filename;
        if (params.custom_file_size_bytes) data.file_metadata.file_size_bytes = params.custom_file_size_bytes;
        if (params.custom_duration_sec) data.file_metadata.duration_seconds = params.custom_duration_sec;
        if (params.custom_sample_rate) data.file_metadata.sample_rate_hz = params.custom_sample_rate;

        return {
          success: true,
          source: 'backend',
          report: data,
          statusCode: res.status,
        };
      } else {
        const fallback = generatePhase1DemoReport(params);
        return {
          success: false,
          source: 'offline_fallback',
          report: fallback,
          statusCode: res.status,
          errorMessage: `Backend response failed schema validation: ${validation.errors.join('; ')}`,
        };
      }
    } else {
      let errMsg = `Backend HTTP ${res.status}: ${res.statusText}`;
      try {
        const errJson = await res.json();
        if (errJson.detail?.message) errMsg = errJson.detail.message;
      } catch {
        // ignore JSON parse error
      }

      const fallback = generatePhase1DemoReport(params);
      return {
        success: false,
        source: 'offline_fallback',
        report: fallback,
        statusCode: res.status,
        errorMessage: errMsg,
      };
    }
  } catch (err: any) {
    const fallback = generatePhase1DemoReport(params);
    return {
      success: true,
      source: 'offline_fallback',
      report: fallback,
      errorMessage: `Backend offline (${err?.message || 'connection refused'}). Using local demonstration fallback.`,
    };
  }
}
