/**
 * Client API Service for MixLearn Studio (Phase 1 & Phase 2)
 *
 * Uses relative URLs to route through the Vite proxy in development
 * and reverse proxies in production. Configurable via VITE_API_BASE_URL.
 */

import {
  AnalysisReport,
  ConsentState,
  GenreId,
  InterfaceMode,
  MixStage,
  validateAnalysisReport,
  validatePhase1AnalysisReport,
} from '../contracts/analysisContract';
import { generatePhase1DemoReport } from '../contracts/demoFixtures';

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
 * Checks backend health via GET /api/v1/health (proxied via relative URL)
 */
export async function checkBackendHealth(
  customFetch: typeof fetch = fetch
): Promise<{ online: boolean; data?: BackendHealthResponse; errorMessage?: string }> {
  try {
    const url = buildApiUrl('/api/v1/health');
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
      errorMessage: err.message || 'Network connection to backend failed',
    };
  }
}

/**
 * Executes genuine Phase 2 mathematical DSP analysis via POST /api/v1/analyze/dsp.
 * Streams multipart audio to backend.
 * Rule 2 & 3: Never falls back to synthetic demo reports on failure.
 */
export async function analyzeAudioWithDsp(
  formData: FormData,
  customFetch: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<ReportFetchResult> {
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
      try {
        const errJson = await res.json();
        if (errJson.detail?.message) {
          errMsg = errJson.detail.message;
        } else if (typeof errJson.detail === 'string') {
          errMsg = errJson.detail;
        }
      } catch {
        // ignore
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
    return {
      success: false,
      source: 'backend',
      errorMessage: `DSP analysis failed: ${err.message || 'Cannot reach backend server'}.`,
    };
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
