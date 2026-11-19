/**
 * Client API Service for MixLearn Studio (Phase 3 Studio Workbench)
 *
 * Uses relative URLs for local dev routing and reverse proxies in production.
 * Configurable via VITE_API_BASE_URL.
 */

import {
  AiMentorResponse,
  AnalysisReport,
  ArtistVisionTag,
  ConsentState,
  createDefaultConsentState,
  GenreId,
  InterfaceMode,
  MixStage,
  RevisionDeltaReport,
  StemBandKey,
  StemMultitrackReport,
  UserReportedDawContext,
  validateAnalysisReport,
} from '../contracts/analysisContract';
import { generatePhase1DemoReport } from '../contracts/demoFixtures';
import {
  analyzeAudioWithClientWebAudio,
  analyzeStemsWithClientWebAudio,
  measureSixBandsFromFileClient,
} from './clientWebAudioDsp';
import { compareRevisionReportsPure, validateOriginalStemFiles } from '../audio/phase4Logic';
import {
  buildDeterministicClientMentorResponse,
  buildSanitizedAiMentorRequest,
} from '../audio/phase5MentorLogic';

const RAW_BASE_URL = typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL
  ? import.meta.env.VITE_API_BASE_URL
  : '';

export const API_BASE_URL = RAW_BASE_URL.replace(/\/$/, '');

export function buildApiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${cleanPath}`;
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
  source: 'backend' | 'offline_fallback';
  report?: AnalysisReport;
  statusCode?: number;
  errorMessage?: string;
}

/**
 * Checks backend health via GET /api/v1/health (proxied via relative URL).
 * Uses a 12,000 ms timeout and 1 automatic retry after 2,500 ms so Render cold starts
 * stay on "Connecting to DSP..." instead of prematurely dropping to Local Web Audio.
 */
export async function checkBackendHealth(
  customFetch: typeof fetch = fetch,
  options?: {
    timeoutMs?: number;
    retryDelayMs?: number;
    maxRetries?: number;
  }
): Promise<{ online: boolean; data?: BackendHealthResponse; errorMessage?: string }> {
  const timeoutMs = options?.timeoutMs ?? 12000;
  const retryDelayMs = options?.retryDelayMs ?? 2500;
  const maxRetries = options?.maxRetries ?? 1;
  const url = buildApiUrl('/api/v1/health');

  let lastError = 'Network connection to backend failed';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await customFetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      if (res.ok) {
        const data: BackendHealthResponse = await res.json();
        const isOnline =
          (data.status === 'ok' || data.status === 'online' || (data as any).state === 'ok') &&
          data.phase >= 1;
        if (isOnline) {
          return { online: true, data };
        }
        lastError = `Backend health returned unexpected status: ${data.status}`;
      } else {
        lastError = `Backend returned HTTP ${res.status}: ${res.statusText}`;
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        lastError = `Backend health check timed out after ${timeoutMs} ms`;
      } else {
        lastError = err?.message || 'Network connection to backend failed';
      }
    } finally {
      clearTimeout(timeoutId);
    }

    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  return {
    online: false,
    errorMessage: lastError,
  };
}

/**
 * Executes genuine Phase 2 mathematical DSP analysis via POST /api/v1/analyze/dsp.
 * If backend is unreachable or returns HTTP 405 (Vercel static host) / 404 / 50x,
 * seamlessly falls back to the in-browser Web Audio API DSP engine.
 * Rule 2 & 3: Never falls back to fake/synthetic demonstration data on failure.
 */
export async function analyzeAudioWithDsp(
  formData: FormData,
  customFetch: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<ReportFetchResult> {
  const tryClientWebAudio = async (
    reasonMsg: string,
    fallbackStatusCode?: number
  ): Promise<ReportFetchResult> => {
    const rawFile = (formData.get('audio_file') || formData.get('file')) as File | null;
    const rawGenre = (formData.get('genre') as GenreId) || 'indie_rock';
    const rawStage = ((formData.get('mix_stage') || formData.get('stage')) as MixStage) || 'unmastered_mix';
    const rawConsentJson = (formData.get('consent_state_json') || formData.get('consent_state')) as string;
    let consentObj: ConsentState;
    try {
      consentObj = rawConsentJson ? JSON.parse(rawConsentJson) : createDefaultConsentState();
    } catch {
      consentObj = createDefaultConsentState();
    }
    const interfaceMode = (formData.get('interface_mode') as InterfaceMode) || 'simple';

    if (rawFile && typeof window !== 'undefined' && (window.AudioContext || (window as any).webkitAudioContext)) {
      try {
        const clientReport = await analyzeAudioWithClientWebAudio(
          rawFile,
          rawGenre,
          rawStage,
          consentObj,
          interfaceMode
        );
        return {
          success: true,
          source: 'backend',
          report: clientReport,
          statusCode: 200,
        };
      } catch (clientErr: any) {
        return {
          success: false,
          source: 'backend',
          statusCode: fallbackStatusCode,
          errorMessage: `Client DSP analysis error: ${clientErr.message || 'Failed to decode audio.'}`,
        };
      }
    }

    return {
      success: false,
      source: 'backend',
      statusCode: fallbackStatusCode,
      errorMessage: reasonMsg,
    };
  };

  try {
    const url = buildApiUrl('/api/v1/analyze/dsp');
    const res = await customFetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
      },
      body: formData,
      signal,
    });

    if (res.ok) {
      const data: AnalysisReport = await res.json();
      const validation = validateAnalysisReport(data, { expectedMode: 'dsp' });

      if (validation.valid) {
        return {
          success: true,
          source: 'backend',
          report: data,
          statusCode: res.status,
        };
      } else {
        return {
          success: false,
          source: 'backend',
          statusCode: res.status,
          errorMessage: `Backend DSP report failed validation: ${validation.errors.join('; ')}`,
        };
      }
    } else {
      let errMsg = `Backend HTTP ${res.status}: ${res.statusText}`;
      let hasCustomServerJson = false;
      try {
        const errJson = await res.json();
        if (errJson.detail?.message) {
          errMsg = errJson.detail.message;
          hasCustomServerJson = true;
        } else if (typeof errJson.detail === 'string') {
          errMsg = errJson.detail;
          hasCustomServerJson = true;
        }
      } catch {
        // ignore non-json error responses
      }

      // If backend returned a structured JSON error response (e.g. 500 OOM, 403 Consent, 413, 422),
      // respect the server's error response directly (exclude 401/405 from non-FastAPI proxies/static hosts)
      if (hasCustomServerJson && res.status !== 405 && res.status !== 401) {
        return {
          success: false,
          source: 'backend',
          statusCode: res.status,
          errorMessage: errMsg,
        };
      }

      // If hosting/proxy returned 401, 404, 405, 502, 503, 504, or unhandled 5xx without FastAPI JSON,
      // and a real audio file is present, decode with client Web Audio DSP engine!
      const rawFile = (formData.get('audio_file') || formData.get('file')) as File | null;
      if (
        rawFile &&
        (res.status === 401 ||
          res.status === 405 ||
          (!hasCustomServerJson &&
            (res.status === 404 ||
              res.status === 502 ||
              res.status === 503 ||
              res.status === 504 ||
              res.status >= 500)))
      ) {
        return await tryClientWebAudio(
          `Backend returned HTTP ${res.status}. Falling back to Web Audio DSP.`,
          res.status
        );
      }

      return {
        success: false,
        source: 'backend',
        statusCode: res.status,
        errorMessage: errMsg,
      };
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return {
        success: false,
        source: 'backend',
        errorMessage: 'Analysis request was cancelled.',
      };
    }

    // Network error (e.g. offline, connection refused) -> fallback to client-side Web Audio DSP engine
    return await tryClientWebAudio(`Network connection failed: ${err.message || 'Cannot reach backend'}.`);
  }
}

/**
 * Fetches an analysis report from the backend demonstration endpoint with deterministic local offline fallback.
 * Preserves genre, mix stage, and consent state.
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
  // If audio analysis consent is false, respect Rule 4 immediately without sending audio data
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
        if (params.custom_filename) {
          data.file_metadata.filename = params.custom_filename;
        }
        if (params.custom_file_size_bytes) {
          data.file_metadata.file_size_bytes = params.custom_file_size_bytes;
        }
        if (params.custom_duration_sec) {
          data.file_metadata.duration_seconds = params.custom_duration_sec;
        }
        if (params.custom_sample_rate) {
          data.file_metadata.sample_rate_hz = params.custom_sample_rate;
        }

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
      success: true, // Graceful degradation
      source: 'offline_fallback',
      report: fallback,
      errorMessage: `Backend offline (${err.message || 'connection refused'}). Using local demonstration fallback.`,
    };
  }
}

export interface StemAnalysisFetchResult {
  success: boolean;
  source: 'backend' | 'client_webaudio';
  report?: StemMultitrackReport;
  statusCode?: number;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Phase 4: Analyzes 2–8 genuine user-uploaded original DAW stems via POST /api/v1/analyze/stems,
 * with deterministic in-browser Web Audio API fallback when FastAPI is offline.
 * Strictly enforces Rule 1 (no AI stem separation) and <=50 ms duration alignment.
 */
export async function analyzeStemsWithDsp(
  params: {
    stemFiles: File[];
    primaryMixFile?: File | null;
    consent: ConsentState;
  },
  customFetch: typeof fetch = fetch
): Promise<StemAnalysisFetchResult> {
  if (!params.consent.audio_analysis_consent) {
    return {
      success: false,
      source: 'backend',
      statusCode: 403,
      errorCode: 'CONSENT_REQUIRED',
      errorMessage: 'Permission 1 (audio_analysis_consent) is required before measuring stems.',
    };
  }

  const clientCheck = validateOriginalStemFiles(params.stemFiles);
  if (!clientCheck.valid) {
    return {
      success: false,
      source: 'client_webaudio',
      statusCode: clientCheck.errorCode?.includes('TOO_LARGE') ? 413 : 422,
      errorCode: clientCheck.errorCode ?? 'INVALID_STEM_UPLOAD',
      errorMessage: clientCheck.errorMessage ?? 'Invalid original stem selection.',
    };
  }

  const runClientFallback = async (): Promise<StemAnalysisFetchResult> => {
    try {
      const clientReport = await analyzeStemsWithClientWebAudio(
        params.stemFiles,
        params.primaryMixFile ?? null
      );
      return {
        success: true,
        source: 'client_webaudio',
        report: clientReport,
        statusCode: 200,
      };
    } catch (err: any) {
      return {
        success: false,
        source: 'client_webaudio',
        statusCode: 422,
        errorCode: err?.errorCode || 'STEM_ANALYSIS_ERROR',
        errorMessage: err?.message || 'Unable to analyze uploaded stems in browser Web Audio.',
      };
    }
  };

  const fd = new FormData();
  fd.append('stem_source_type', 'user_uploaded_original');
  fd.append('consent_state_json', JSON.stringify(params.consent));
  for (const file of params.stemFiles) {
    fd.append('stems', file);
  }
  if (params.primaryMixFile) {
    fd.append('primary_mix', params.primaryMixFile);
  }

  try {
    const res = await customFetch(buildApiUrl('/api/v1/analyze/stems'), {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: fd,
    });

    if (res.ok) {
      const data: StemMultitrackReport = await res.json();
      return { success: true, source: 'backend', report: data, statusCode: res.status };
    }

    let errMsg = `Backend HTTP ${res.status}: ${res.statusText}`;
    let errCode: string | undefined;
    let hasFastApiDetail = false;
    try {
      const errJson = await res.json();
      if (errJson?.detail?.message) {
        errMsg = errJson.detail.message;
        errCode = errJson.detail.error_code;
        hasFastApiDetail = true;
      } else if (typeof errJson?.detail === 'string') {
        errMsg = errJson.detail;
        hasFastApiDetail = true;
      }
    } catch {
      // ignore non-json error bodies
    }

    if (hasFastApiDetail && res.status !== 401 && res.status !== 405) {
      return {
        success: false,
        source: 'backend',
        statusCode: res.status,
        errorCode: errCode,
        errorMessage: errMsg,
      };
    }

    // Backend unavailable / static host / proxy 401 -> deterministic Web Audio fallback
    return await runClientFallback();
  } catch {
    return await runClientFallback();
  }
}

export interface RevisionComparisonFetchResult {
  success: boolean;
  source: 'backend' | 'client_webaudio';
  comparison?: RevisionDeltaReport;
  statusCode?: number;
  errorMessage?: string;
}

/**
 * Phase 4: Compares Mix v1 against Revised Mix v2 via POST /api/v1/compare/revisions,
 * with deterministic in-browser Web Audio API fallback when FastAPI is offline.
 */
export async function compareRevisionsWithDsp(
  params: {
    v1Report: AnalysisReport;
    v2File: File;
    v1File?: File | null;
    v1SixBands?: Record<StemBandKey, number | null> | null;
    genre: GenreId;
    mixStage: MixStage;
    consent: ConsentState;
    interfaceMode?: InterfaceMode;
  },
  customFetch: typeof fetch = fetch
): Promise<RevisionComparisonFetchResult> {
  if (!params.consent.audio_analysis_consent) {
    return {
      success: false,
      source: 'backend',
      statusCode: 403,
      errorMessage: 'Permission 1 (audio_analysis_consent) is required to compare revisions.',
    };
  }

  const runClientFallback = async (): Promise<RevisionComparisonFetchResult> => {
    try {
      const [v2Report, v2SixBands] = await Promise.all([
        analyzeAudioWithClientWebAudio(
          params.v2File,
          params.genre,
          params.mixStage,
          params.consent,
          params.interfaceMode ?? 'advanced'
        ),
        measureSixBandsFromFileClient(params.v2File),
      ]);
      const v1SixBands =
        params.v1SixBands ??
        (params.v1File ? await measureSixBandsFromFileClient(params.v1File) : null);

      const comparison = compareRevisionReportsPure(
        params.v1Report,
        v2Report,
        v1SixBands,
        v2SixBands
      );
      return {
        success: true,
        source: 'client_webaudio',
        comparison,
        statusCode: 200,
      };
    } catch (err: any) {
      return {
        success: false,
        source: 'client_webaudio',
        statusCode: 422,
        errorMessage: `Revision v2 analysis failed: ${err?.message || 'Could not decode audio.'}`,
      };
    }
  };

  const fd = new FormData();
  fd.append('mix_v2', params.v2File);
  fd.append('v1_report_json', JSON.stringify(params.v1Report));
  if (params.v1SixBands) {
    fd.append('v1_six_band_spectrum_json', JSON.stringify(params.v1SixBands));
  }
  fd.append('genre', params.genre);
  fd.append('mix_stage', params.mixStage);
  fd.append('interface_mode', params.interfaceMode ?? 'advanced');
  fd.append('consent_state_json', JSON.stringify(params.consent));

  try {
    const res = await customFetch(buildApiUrl('/api/v1/compare/revisions'), {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: fd,
    });

    if (res.ok) {
      const comparison: RevisionDeltaReport = await res.json();
      return {
        success: true,
        source: 'backend',
        comparison,
        statusCode: res.status,
      };
    }

    let errMsg = `Backend HTTP ${res.status}: ${res.statusText}`;
    let hasFastApiDetail = false;
    try {
      const errJson = await res.json();
      if (errJson?.detail?.message) {
        errMsg = errJson.detail.message;
        hasFastApiDetail = true;
      } else if (typeof errJson?.detail === 'string') {
        errMsg = errJson.detail;
        hasFastApiDetail = true;
      }
    } catch {
      // ignore
    }

    if (hasFastApiDetail && res.status !== 401 && res.status !== 405) {
      return {
        success: false,
        source: 'backend',
        statusCode: res.status,
        errorMessage: errMsg,
      };
    }

    return await runClientFallback();
  } catch {
    return await runClientFallback();
  }
}

export interface AiMentorFetchResult {
  success: boolean;
  source: 'backend' | 'local_offline_fallback';
  mentor?: AiMentorResponse;
  statusCode?: number;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Phase 5: Requests evidence-bound Gemini AI Mentor interpretation via POST /api/v1/interpret/ai.
 * - Enforces Toggle A consent (`external_ai_transfer_consent`) strictly before making any external request.
 * - Transmits ONLY sanitized numerical DSP JSON + genre/stage/artist_vision + optional user_reported_context
 *   (ZERO raw audio bytes).
 * - Never masks explicit backend HTTP 403 (consent) or HTTP 429 (rate limit) responses.
 * - Gracefully degrades to Deterministic Offline Mentor when backend is unreachable/401/405.
 */
export async function requestAiMentorInterpretation(
  params: {
    report: AnalysisReport;
    genre: GenreId;
    mixStage: MixStage;
    interfaceMode: InterfaceMode;
    artistVision: ArtistVisionTag[];
    consent: ConsentState;
    dawContext?: UserReportedDawContext | null;
  },
  customFetch: typeof fetch = fetch
): Promise<AiMentorFetchResult> {
  const sanitizedBody = buildSanitizedAiMentorRequest(params);

  if (!sanitizedBody.allow_ai_interpretation) {
    return {
      success: false,
      source: 'backend',
      statusCode: 403,
      errorCode: 'AI_TRANSFER_CONSENT_REQUIRED',
      errorMessage:
        'Toggle A (Metrics-Only AI Mentor consent) is OFF. Enable Toggle A to request Gemini AI Mentor coaching, or view Deterministic Offline Guidance locally.',
    };
  }

  const runOfflineFallback = (reason: string): AiMentorFetchResult => ({
    success: true,
    source: 'local_offline_fallback',
    statusCode: 200,
    mentor: buildDeterministicClientMentorResponse({
      report: params.report,
      genre: params.genre,
      mixStage: params.mixStage,
      artistVision: params.artistVision,
      consent: params.consent,
      fallbackReason: reason,
    }),
  });

  try {
    const res = await customFetch(buildApiUrl('/api/v1/interpret/ai'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(sanitizedBody),
    });

    if (res.ok) {
      const mentor: AiMentorResponse = await res.json();
      return {
        success: true,
        source: 'backend',
        mentor,
        statusCode: res.status,
      };
    }

    let errMsg = `Backend HTTP ${res.status}: ${res.statusText}`;
    let errCode: string | undefined;
    let hasFastApiDetail = false;
    try {
      const errJson = await res.json();
      if (errJson?.detail?.message) {
        errMsg = errJson.detail.message;
        errCode = errJson.detail.error_code;
        hasFastApiDetail = true;
      } else if (typeof errJson?.detail === 'string') {
        errMsg = errJson.detail;
        hasFastApiDetail = true;
      }
    } catch {
      // ignore non-json responses
    }

    if (hasFastApiDetail && (res.status === 403 || res.status === 429 || res.status === 422)) {
      return {
        success: false,
        source: 'backend',
        statusCode: res.status,
        errorCode: errCode,
        errorMessage: errMsg,
      };
    }

    return runOfflineFallback(
      'FastAPI backend is currently offline in this preview; running Deterministic Offline Mentor locally (0 audio bytes sent).'
    );
  } catch {
    return runOfflineFallback(
      'FastAPI backend unreachable; running Deterministic Offline Mentor locally (0 audio bytes sent).'
    );
  }
}
