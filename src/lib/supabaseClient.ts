import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '';
const supabaseAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export interface MixSessionSummaryRecord {
  id?: string;
  user_id: string;
  track_name: string;
  genre: string;
  stage: string;
  summary_metrics: {
    integrated_lufs: number | null;
    true_peak_dbtp: number | null;
    loudness_range_lu: number | null;
    phase_correlation_mean: number | null;
    issue_count: number;
    objective_issue_count: number;
    duration_seconds: number;
    is_demonstration_data: boolean;
  };
  created_at?: string;
}

/**
 * Persists lightweight DSP summary metadata ONLY (zero raw audio files)
 * into the authenticated user's isolated `mix_sessions` table under RLS.
 */
export async function saveMixSessionSummary(
  record: Omit<MixSessionSummaryRecord, 'id' | 'created_at'>
): Promise<{ saved: boolean; error?: string }> {
  if (!supabase) {
    return { saved: false };
  }
  try {
    const { error } = await supabase.from('mix_sessions').insert({
      user_id: record.user_id,
      track_name: record.track_name,
      genre: record.genre,
      stage: record.stage,
      summary_metrics: record.summary_metrics,
    });
    if (error) {
      return { saved: false, error: error.message };
    }
    return { saved: true };
  } catch (err) {
    return {
      saved: false,
      error: err instanceof Error ? err.message : 'Unable to save session summary.',
    };
  }
}

export async function fetchRecentMixSessions(
  limit = 6
): Promise<MixSessionSummaryRecord[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('mix_sessions')
      .select('id, user_id, track_name, genre, stage, summary_metrics, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data as MixSessionSummaryRecord[];
  } catch {
    return [];
  }
}
