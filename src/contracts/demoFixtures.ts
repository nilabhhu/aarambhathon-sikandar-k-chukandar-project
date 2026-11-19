import {
  AnalysisReport,
  ConsentState,
  GenreId,
  InterfaceMode,
  MixStage,
} from './analysisContract';

export const GENRE_LABELS: Record<GenreId, string> = {
  indie_rock: 'Indie Rock / Alternative',
  electronic_club: 'Electronic / Club',
  hip_hop_trap: 'Hip-Hop / Trap',
  pop_vocal: 'Modern Pop / Vocal',
  acoustic_folk: 'Acoustic / Singer-Songwriter',
  cinematic_orchestral: 'Cinematic / Instrumental',
};

export const MIX_STAGE_LABELS: Record<MixStage, { title: string; subtitle: string; headroomTarget: string }> = {
  unmastered_mix: {
    title: 'Unmastered Mix',
    subtitle: 'Pre-limiter mixdown exported from your DAW mix bus',
    headroomTarget: '-18.0 to -14.0 LUFS · True Peak <= -3.0 dBTP',
  },
  final_master: {
    title: 'Final Master',
    subtitle: 'Post-limiting release master prepared for distribution',
    headroomTarget: '-14.0 to -8.5 LUFS · True Peak <= -1.0 dBTP',
  },
};

export function generatePhase1DemoReport(params: {
  interface_mode: InterfaceMode;
  genre: GenreId;
  mix_stage: MixStage;
  consent_state: ConsentState;
  custom_filename?: string;
  custom_duration_sec?: number;
  custom_sample_rate?: number;
  custom_file_size_bytes?: number;
}): AnalysisReport {
  const isUnmastered = params.mix_stage === 'unmastered_mix';

  return {
    schema_version: '2.0.0',
    report_id: `demo-p1-${params.genre}-${params.mix_stage}`,
    created_at: '2026-11-10T18:00:00.000Z',
    is_demonstration_data: true,
    data_source_notice:
      'DEMONSTRATION DATA — CANONICAL CONTRACT FIXTURE: All numeric values below are deterministic schema fixtures for architectural verification.',
    input_context: {
      interface_mode: params.interface_mode,
      genre: params.genre,
      mix_stage: params.mix_stage,
      user_notes: 'Checking chorus low-mid clarity and master bus true-peak headroom before revision.',
      plugin_chain_metadata: [
        {
          slot_index: 1,
          plugin_name: 'Parametric Bus EQ (8-Band)',
          category: 'eq',
          settings_summary: 'High-pass @ 28 Hz (12 dB/oct), +1.5 dB shelf @ 12 kHz',
          bypassed: false,
        },
        {
          slot_index: 2,
          plugin_name: 'VCA Mix Bus Compressor',
          category: 'compression',
          settings_summary: 'Ratio 2:1, Attack 30 ms, Release Auto, Gain Reduction ~2.5 dB',
          bypassed: false,
        },
        {
          slot_index: 3,
          plugin_name: 'Brickwall True-Peak Limiter',
          category: 'limiting',
          settings_summary: isUnmastered
            ? 'Ceiling -0.1 dBTP (Active on pre-master bus causing premature clipping)'
            : 'Ceiling -0.2 dBTP, Lookahead 1.5 ms, ISP Oversampling Off',
          bypassed: false,
        },
      ],
    },
    consent_state: params.consent_state,
    file_metadata: {
      filename:
        params.custom_filename ||
        (isUnmastered
          ? 'glass_harbor_mix_v3_premaster_24bit.wav'
          : 'glass_harbor_master_candidate_v1.wav'),
      format: 'WAV',
      duration_seconds: params.custom_duration_sec || 198.4,
      sample_rate_hz: params.custom_sample_rate || 48000,
      bit_depth: 24,
      channels: 2,
      file_size_bytes: params.custom_file_size_bytes || 57139200,
      sha256_checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      codec: 'pcm_s24le',
      bit_depth_note: '24-bit fixed-point PCM',
    },
    capabilities: {
      dsp_core_measurements: {
        status: 'DEMO_FIXTURE_ONLY',
        phase_target: 2,
        disclosure:
          'Demonstration mode displays schema-validated fixtures. Live DSP connects FFmpeg/libebur128, pyloudnorm, and SciPy or local Web Audio.',
      },
      streaming_normalization_estimates: {
        status: 'NOT_IMPLEMENTED',
        phase_target: 3,
        disclosure:
          'Rule 7: Streaming loudness predictions will be presented in Phase 3 as estimates based on documented playback modes, not universal platform output.',
      },
      reference_track_comparison: {
        status: 'NOT_IMPLEMENTED',
        phase_target: 3,
        disclosure:
          'Loudness-matched reference track delta analysis is scheduled for Phase 3.',
      },
      original_stem_multitrack_analysis: {
        status: 'NOT_IMPLEMENTED',
        phase_target: 4,
        disclosure:
          'Rule 1: Analyzes genuine user-uploaded original stems/multitracks only (Phase 4). AI stem splitting is permanently prohibited.',
      },
      device_translation_preview: {
        status: 'NOT_IMPLEMENTED',
        phase_target: 4,
        disclosure:
          'Rule 6: Playback-device translation previews will be implemented in Phase 4 strictly as linear impulse/filter approximations, not physical hardware replicas.',
      },
      mix_revision_comparison: {
        status: 'NOT_IMPLEMENTED',
        phase_target: 5,
        disclosure:
          'Before/after mix revision delta comparison is scheduled for Phase 5.',
      },
      ai_educational_interpretation: {
        status: 'NOT_IMPLEMENTED',
        phase_target: 5,
        disclosure:
          'Rule 2 & 4: Consent-gated Gemini educational interpretation of deterministic DSP metrics is scheduled for Phase 5.',
      },
      ai_stem_separation: {
        status: 'PROHIBITED_BY_PRODUCT_RULE',
        phase_target: null,
        disclosure:
          'Rule 1: AI stem separation, automatic stem splitting, and pseudo-stem generation are permanently forbidden. Only genuine user-uploaded original stems are accepted.',
      },
    },
    measurements: {
      sample_peak_max: {
        value: isUnmastered ? -0.05 : 0.0,
        unit: 'dBFS',
        standard: 'AES17 / IEC 60268-10',
        target_min: null,
        target_max: -0.5,
        status: 'warning',
        source: 'phase1_demo_fixture',
        unavailable_reason: null,
        algorithm_detail: 'Peak absolute sample value in linear PCM converted to dBFS',
      },
      integrated_loudness: {
        value: isUnmastered ? -11.8 : -9.4,
        unit: 'LUFS',
        standard: 'ITU-R BS.1770-4 / EBU R128',
        target_min: isUnmastered ? -18.0 : -14.0,
        target_max: isUnmastered ? -14.0 : -9.0,
        status: 'warning',
        source: 'phase1_demo_fixture',
      },
      short_term_max_loudness: {
        value: isUnmastered ? -8.9 : -6.8,
        unit: 'LUFS',
        standard: 'EBU R128 (3s window)',
        target_min: -16.0,
        target_max: isUnmastered ? -11.0 : -7.5,
        status: 'warning',
        source: 'phase1_demo_fixture',
      },
      momentary_max_loudness: {
        value: isUnmastered ? -7.4 : -5.6,
        unit: 'LUFS',
        standard: 'EBU R128 (400ms window)',
        target_min: null,
        target_max: isUnmastered ? -9.5 : -6.0,
        status: 'warning',
        source: 'phase1_demo_fixture',
      },
      true_peak_max: {
        value: isUnmastered ? -0.4 : 0.6,
        unit: 'dBTP',
        standard: 'ITU-R BS.1770-4 (4x Oversampled)',
        target_min: isUnmastered ? -6.0 : -2.0,
        target_max: isUnmastered ? -3.0 : -1.0,
        status: 'critical',
        source: 'phase1_demo_fixture',
      },
      sample_clipping_events: {
        value: isUnmastered ? 14 : 42,
        unit: 'count',
        standard: 'Consecutive >=3 Full-Scale Samples',
        target_min: 0,
        target_max: 0,
        status: 'critical',
        source: 'phase1_demo_fixture',
      },
      loudness_range_lra: {
        value: 4.2,
        unit: 'LU',
        standard: 'EBU Tech 3342',
        target_min: 5.5,
        target_max: 11.0,
        status: 'warning',
        source: 'phase1_demo_fixture',
      },
      crest_factor: {
        value: 8.1,
        unit: 'dB',
        standard: 'Peak-to-RMS Ratio',
        target_min: 9.5,
        target_max: 14.5,
        status: 'warning',
        source: 'phase1_demo_fixture',
      },
      phase_correlation_mean: {
        value: 0.72,
        unit: 'correlation',
        standard: 'Pearson L/R Time-Domain Correlation (-1 to +1)',
        target_min: 0.35,
        target_max: 0.95,
        status: 'optimal',
        source: 'phase1_demo_fixture',
      },
      phase_correlation_min: {
        value: -0.18,
        unit: 'correlation',
        standard: '100ms Windowed Minimum Correlation',
        target_min: 0.0,
        target_max: 1.0,
        status: 'warning',
        source: 'phase1_demo_fixture',
      },
      stereo_width_index: {
        value: 68,
        unit: 'percent',
        standard: 'Side-to-Mid RMS Energy Ratio',
        target_min: 35,
        target_max: 75,
        status: 'optimal',
        source: 'phase1_demo_fixture',
      },
      sub_bass_energy_20_60hz: {
        value: -15.8,
        unit: 'dBFS',
        standard: 'Welch PSD Band Integration (20-60 Hz)',
        target_min: -21.0,
        target_max: -14.5,
        status: 'optimal',
        source: 'phase1_demo_fixture',
      },
      mud_band_energy_200_500hz: {
        value: -11.2,
        unit: 'dBFS',
        standard: 'Welch PSD Band Integration (200-500 Hz)',
        target_min: -18.5,
        target_max: -14.0,
        status: 'warning',
        source: 'phase1_demo_fixture',
      },
      presence_band_energy_2k_5khz: {
        value: -12.1,
        unit: 'dBFS',
        standard: 'Welch PSD Band Integration (2-5 kHz)',
        target_min: -19.0,
        target_max: -15.0,
        status: 'warning',
        source: 'phase1_demo_fixture',
      },
      air_band_energy_10k_20khz: {
        value: -24.5,
        unit: 'dBFS',
        standard: 'Welch PSD Band Integration (10-20 kHz)',
        target_min: -26.0,
        target_max: -19.0,
        status: 'optimal',
        source: 'phase1_demo_fixture',
      },
    },
    issues: [
      {
        issue_id: 'iss-true-peak-exceeded',
        classification: 'objective_technical',
        domain: 'true_peak_clipping',
        severity: 'critical',
        confidence: 0.99,
        title: isUnmastered
          ? 'Insufficient Pre-Master True-Peak Headroom (-0.4 dBTP)'
          : 'Inter-Sample True-Peak Clipping Detected (+0.6 dBTP)',
        timestamps: [
          { start_sec: 42.5, end_sec: 58.0, label: 'Chorus 1 Drum & Vocal Transient Peak' },
          { start_sec: 134.0, end_sec: 152.5, label: 'Chorus 2 Full Mix Climax' },
        ],
        evidence: [
          {
            metric_key: 'true_peak_max',
            measured_value: isUnmastered ? -0.4 : 0.6,
            unit: 'dBTP',
            target_range: isUnmastered ? '<= -3.0 dBTP' : '<= -1.0 dBTP',
            method: 'ITU-R BS.1770-4 4x oversampled polyphase FIR interpolation',
          },
          {
            metric_key: 'sample_clipping_events',
            measured_value: isUnmastered ? 14 : 42,
            unit: 'count',
            target_range: '0 events',
            method: 'Sample-level consecutive full-scale detection',
          },
        ],
        learning_guide: {
          what_was_detected: isUnmastered
            ? 'Your unmastered mix peaks at -0.4 dBTP with a limiter active on the master bus, leaving almost no headroom for mastering.'
            : 'Your master exceeds 0.0 dBTP (+0.6 dBTP) during both chorus sections, causing inter-sample distortion when converted to AAC/OGG.',
          why_it_matters:
            'Lossy encoders (Spotify OGG, Apple Music AAC, YouTube Opus) reconstruct continuous waveforms that clip audibly when True Peak exceeds -1.0 dBTP.',
          what_to_try: isUnmastered
            ? 'Bypass the brickwall limiter on your mix bus and lower the mix bus input trim by 3.5 dB so peaks sit safely between -6.0 and -3.0 dBTP.'
            : 'Enable True-Peak (ISP) oversampling on your final limiter and set the output ceiling to -1.0 dBTP.',
          how_to_verify:
            'Export a 24-bit WAV bounce of Chorus 1 (00:42–00:58), re-upload it, and confirm True Peak reads at or below your target ceiling with zero audible crunch on snare hits.',
        },
      },
      {
        issue_id: 'iss-low-mid-phase-dip',
        classification: 'objective_technical',
        domain: 'phase_polarity',
        severity: 'warning',
        confidence: 0.91,
        title: 'Momentary Stereo Phase Cancellation in Bridge (-0.18 correlation)',
        timestamps: [
          { start_sec: 108.0, end_sec: 124.5, label: 'Bridge Wide Synth Pad & Chorus Bass' },
        ],
        evidence: [
          {
            metric_key: 'phase_correlation_min',
            measured_value: -0.18,
            unit: 'correlation',
            target_range: '>= 0.00 correlation',
            method: '100ms sliding window Pearson L/R correlation',
          },
        ],
        learning_guide: {
          what_was_detected:
            'Between 01:48 and 02:04, the left and right channels pull out of phase (-0.18 correlation) when the widened synth pad and stereo bass chorus enter together.',
          why_it_matters:
            'When played back on mono speakers (smart speakers, phone speakers, club PA systems), out-of-phase stereo signals partially cancel out, causing the synth and bass body to hollow out.',
          what_to_try:
            'Use a Mid/Side EQ or stereo imaging plugin to keep frequencies below 140 Hz in mono, and reduce the stereo widener depth on the bridge pad by 20–30%.',
          how_to_verify:
            'Toggle Mono Listening while looping 01:48–02:04. Verify that the bass and pad maintain steady volume and warmth when summed to mono.',
        },
      },
      {
        issue_id: 'iss-stylistic-low-mid-density',
        classification: 'subjective_stylistic',
        domain: 'frequency_balance',
        severity: 'notice',
        confidence: 0.78,
        title: 'Warm Low-Mid Density in 200–500 Hz Band (-11.2 dBFS)',
        timestamps: [
          { start_sec: 18.0, end_sec: 42.0, label: 'Verse 1 Layered Rhythm Guitars & Keys' },
        ],
        evidence: [
          {
            metric_key: 'mud_band_energy_200_500hz',
            measured_value: -11.2,
            unit: 'dBFS',
            target_range: '-18.5 to -14.0 dBFS (Genre Context Profile)',
            method: 'Welch Power Spectral Density integration (200-500 Hz)',
          },
        ],
        learning_guide: {
          what_was_detected:
            'Energy between 250 Hz and 480 Hz measures -11.2 dBFS (+4.2 dB above target), creating a muddy lower-midrange buildup.',
          why_it_matters:
            'Rule 3 & 8 Note: Excess energy in the 250–480 Hz region clouds lead vocal intelligibility and makes guitars and keys feel boxy.',
          what_to_try:
            'Try a -2.5 dB bell cut around 320Hz (Q=1.8) on the rhythm guitars and keys bus to unmask the vocal.',
          how_to_verify:
            'Level-match before and after in the Verse (00:18–00:42) and listen for whether lead vocal consonants feel clearer while the guitars still sound full.',
        },
      },
      {
        issue_id: 'iss-harsh-presence-peak',
        classification: 'subjective_stylistic',
        domain: 'frequency_balance',
        severity: 'warning',
        confidence: 0.86,
        title: 'Harsh Upper-Mid Peak Near 4.0 kHz (-12.1 dBFS)',
        timestamps: [
          { start_sec: 44.0, end_sec: 61.5, label: 'Chorus 1 Cymbals & Lead Vocal Bite' },
        ],
        evidence: [
          {
            metric_key: 'presence_band_energy_2k_5khz',
            measured_value: -12.1,
            unit: 'dBFS',
            target_range: '-19.0 to -15.0 dBFS (Genre Context Profile)',
            method: 'Welch Power Spectral Density integration (2-5 kHz)',
          },
        ],
        learning_guide: {
          what_was_detected:
            'Measured upper-mid energy around 3.2–4.8 kHz spikes to -12.1 dBFS (+3.8 dB above target), creating fatiguing harshness on loud playback.',
          why_it_matters:
            'Human hearing is maximally sensitive between 2.5 kHz and 5 kHz; excess energy here makes vocals and hi-hats sound brittle on phones and earbuds.',
          what_to_try:
            'Apply a -2.0 dB dynamic bell cut around 4.0kHz (Q=2.4) on cymbals or the vocal bus.',
          how_to_verify:
            'Audition Chorus 1 in Smartphone translation mode and confirm vocal transients sound crisp without ear fatigue.',
        },
      },
      {
        issue_id: 'iss-stylistic-chorus-macrodynamics',
        classification: 'subjective_stylistic',
        domain: 'dynamics',
        severity: 'notice',
        confidence: 0.82,
        title: 'Compact Loudness Range Across Arrangement (4.2 LU)',
        timestamps: [
          { start_sec: 42.5, end_sec: 95.0, label: 'Chorus 1 into Verse 2 Transition' },
        ],
        evidence: [
          {
            metric_key: 'loudness_range_lra',
            measured_value: 4.2,
            unit: 'LU',
            target_range: '5.5 to 11.0 LU',
            method: 'EBU Tech 3342 Loudness Range statistical distribution',
          },
        ],
        learning_guide: {
          what_was_detected:
            'The loudness difference between verses and choruses measures 4.2 LU, indicating a consistently dense dynamic envelope from start to finish.',
          why_it_matters:
            'Consistent loudness keeps energy steady in noisy environments, though a wider 6–8 LU contrast can make the chorus impact feel larger by comparison.',
          what_to_try:
            'If you want the chorus entrance at 00:42.5 to hit harder, try automating the verse drum room and rhythm bus down by 1.0 to 1.5 dB during the final four bars of the pre-chorus.',
          how_to_verify:
            'Play from 00:34 to 00:50 with your eyes closed and check whether the downbeat of Chorus 1 feels noticeably wider and taller.',
        },
      },
    ],
    recommendations: [
      {
        recommendation_id: 'rec-1-headroom',
        priority_rank: 1,
        linked_issue_id: 'iss-true-peak-exceeded',
        classification: 'objective_technical',
        action_title: isUnmastered
          ? 'Restore 3–6 dB of Pre-Master True-Peak Headroom'
          : 'Eliminate +0.6 dBTP Inter-Sample Clipping',
        beginner_summary: isUnmastered
          ? 'Turn off your master bus limiter and lower your mix level so the loudest chorus peaks sit around -4 dB.'
          : 'Lower your final limiter output ceiling to -1.0 dB and turn on True Peak limiting so streaming encoders do not distort.',
        advanced_dsp_guidance: isUnmastered
          ? 'Bypass Slot 3 (Brickwall True-Peak Limiter) on the stereo bus and apply -3.5 dB input trim ahead of the VCA Mix Bus Compressor so ITU-R BS.1770-4 True Peak stays <= -3.0 dBTP.'
          : 'Enable 4x ISP oversampling in Slot 3 and reduce Ceiling from -0.2 dBTP to -1.0 dBTP to prevent post-codec reconstruction overshoots.',
        verification_check:
          'Re-upload Chorus 1 bounce and confirm True Peak Max <= -3.0 dBTP (Unmastered) or <= -1.0 dBTP (Master) with 0 sample clipping events.',
      },
      {
        recommendation_id: 'rec-2-low-mid-carve',
        priority_rank: 2,
        linked_issue_id: 'iss-stylistic-low-mid-density',
        classification: 'subjective_stylistic',
        action_title: 'Carve 250–480 Hz Low-Mid Mud Around 320 Hz',
        beginner_summary:
          'Try a -2.5 dB bell cut around 320Hz on rhythm guitars and keys so the lead vocal sits clearly up front.',
        advanced_dsp_guidance:
          'Insert a dynamic bell EQ (-2.5 dB attenuation, Q=1.8 at 320 Hz) on the instrument bus to reduce 250–480 Hz buildup.',
        verification_check:
          'Compare Verse 1 vocal intelligibility at matched LUFS loudness to confirm vocal presence improved without thinning the rhythm section.',
      },
      {
        recommendation_id: 'rec-3-harsh-peak',
        priority_rank: 3,
        linked_issue_id: 'iss-harsh-presence-peak',
        classification: 'subjective_stylistic',
        action_title: 'Tame 4.0 kHz Harsh Presence Peak',
        beginner_summary:
          'Apply a -2.0 dB dynamic bell cut around 4.0kHz on cymbals or vocals to remove ear fatigue.',
        advanced_dsp_guidance:
          'Use a dynamic EQ or de-esser centered at 4.0 kHz (-2.0 dB max cut, Q=2.4) during Chorus 1 cymbal and vocal peaks.',
        verification_check:
          'Check Chorus 1 (00:44–01:01) on Smartphone preview to verify brittle upper-mid bite is controlled.',
      },
      {
        recommendation_id: 'rec-4-bridge-phase',
        priority_rank: 4,
        linked_issue_id: 'iss-low-mid-phase-dip',
        classification: 'objective_technical',
        action_title: 'Stabilize Sub-140 Hz Mono Compatibility in Bridge',
        beginner_summary:
          'Keep your bass frequencies centered and slightly reduce the stereo widening effect on the bridge synth pad.',
        advanced_dsp_guidance:
          'Apply a 12 dB/oct Side-channel high-pass filter at 140 Hz on the synth/bass group during 01:48–02:04 so 100ms windowed correlation remains >= +0.15.',
        verification_check:
          'Check 01:48–02:04 in Mono Listening mode and verify no low-end drop occurs when toggling Stereo/Mono.',
      },
    ],
    extensions: {
      streaming_estimates: null,
      reference_comparison: null,
      stem_multitrack_report: null,
      device_translation_profiles: null,
      revision_comparison: null,
      ai_interpretation: null,
    },
    timeline: null,
  };
}
