"""
Rule-based diagnostic engine for MixLearn Studio Phase 2.
Evaluates deterministic mathematical measurements against genre and mix-stage targets.
Strictly separates objective technical defects from subjective stylistic notes (Rule 8).
Generates pedagogical 4-step learning guides and prioritized recommendations.
"""

from typing import Any, Dict, List, Optional, Tuple


def evaluate_diagnostics(
    measurements: Dict[str, Any],
    genre: str,
    mix_stage: str,
    duration_seconds: float,
    timeline: Optional[Dict[str, Any]] = None,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Returns (issues, recommendations) adhering strictly to Rule 8 and schema v2.0.0.
    """
    issues: List[Dict[str, Any]] = []
    recommendations: List[Dict[str, Any]] = []

    is_unmastered = mix_stage == "unmastered_mix"
    rec_counter = 1

    # 1. Objective Technical Issue: Sample Clipping Runs
    clip_val = measurements["sample_clipping_events"]["value"]
    if clip_val is not None and clip_val > 0:
        issue_id = "iss-tech-sample-clipping"
        clip_ts = []
        if timeline and "buckets" in timeline:
            for b in timeline["buckets"]:
                if b.get("clipped"):
                    clip_ts.append({
                        "start_sec": b["start_sec"],
                        "end_sec": b["end_sec"],
                        "label": f"Clipping event at {b['start_sec']}s",
                    })
        if not clip_ts:
            clip_ts = [{"start_sec": 0.0, "end_sec": min(duration_seconds, 2.0), "label": "Full mix pass"}]

        issues.append({
            "issue_id": issue_id,
            "classification": "objective_technical",
            "domain": "true_peak_clipping",
            "severity": "critical",
            "confidence": 1.0,
            "title": f"{clip_val} Contiguous Sample Clipping Run(s) Detected",
            "timestamps": clip_ts[:5],
            "evidence": [
                {
                    "metric_key": "sample_clipping_events",
                    "measured_value": float(clip_val),
                    "unit": "count",
                    "target_range": "0",
                    "method": "Contiguous runs >= 3 consecutive samples >= 0.9999 FS",
                }
            ],
            "learning_guide": {
                "what_was_detected": f"Detected {clip_val} instances where 3 or more consecutive samples hit 0.9999 full scale.",
                "why_it_matters": "Contiguous sample flat-topping causes non-linear harmonic distortion, harsh crackling, and DAC reconstruction splatter.",
                "what_to_try": "Lower your mix bus master fader or individual track sub-groups by 1.5–2.0 dB before your final output stage.",
                "how_to_verify": "Re-export and verify that sample_clipping_events returns 0.",
            },
        })

        recommendations.append({
            "recommendation_id": f"rec-{rec_counter}-headroom-trim",
            "priority_rank": rec_counter,
            "linked_issue_id": issue_id,
            "classification": "objective_technical",
            "action_title": "Reduce Pre-Master Output Gain to Eliminate Flat-Topping",
            "beginner_summary": "Pull back your master fader or track volume faders so the meters never hit red.",
            "advanced_dsp_guidance": "Attenuate pre-limiter master bus gain by 2.0 dB. Ensure true peak ceiling remains <= -1.0 dBTP.",
            "verification_check": "Inspect revised audio and confirm sample_clipping_events equals 0.",
        })
        rec_counter += 1

    # 2. Objective Technical Issue: True Peak Headroom
    tp_val = measurements["true_peak_max"]["value"]
    if tp_val is not None:
        target_tp = -3.0 if is_unmastered else -1.0
        if tp_val > target_tp:
            severity = "critical" if tp_val > 0.0 else "warning"
            issue_id = "iss-tech-true-peak-headroom"
            issues.append({
                "issue_id": issue_id,
                "classification": "objective_technical",
                "domain": "true_peak_clipping",
                "severity": severity,
                "confidence": 0.95,
                "title": f"True Peak Ceiling ({tp_val:.2f} dBTP) Exceeds Target ({target_tp:.1f} dBTP)",
                "timestamps": [
                    {"start_sec": 0.0, "end_sec": min(duration_seconds, 4.0), "label": "Loudest transient peaks"}
                ],
                "evidence": [
                    {
                        "metric_key": "true_peak_max",
                        "measured_value": float(tp_val),
                        "unit": "dBTP",
                        "target_range": f"<= {target_tp:.1f} dBTP",
                        "method": "4x oversampled polyphase inter-sample peak detector (ITU-R BS.1770-4)",
                    }
                ],
                "learning_guide": {
                    "what_was_detected": f"Inter-sample true peak measured {tp_val:.2f} dBTP, exceeding the recommended {target_tp:.1f} dBTP ceiling.",
                    "why_it_matters": "When audio is converted to lossy streaming formats (MP3/AAC) or passes through consumer DACs, inter-sample peaks cause audible distortion.",
                    "what_to_try": f"Set your peak limiter ceiling to {target_tp:.1f} dBTP with True Peak oversampling enabled.",
                    "how_to_verify": f"Re-measure to ensure true_peak_max is below {target_tp:.1f} dBTP.",
                },
            })

            recommendations.append({
                "recommendation_id": f"rec-{rec_counter}-true-peak-ceiling",
                "priority_rank": rec_counter,
                "linked_issue_id": issue_id,
                "classification": "objective_technical",
                "action_title": f"Set True Peak Limiter Ceiling to {target_tp:.1f} dBTP",
                "beginner_summary": "Turn down the ceiling knob on your limiter plugin so peaks stay safely below the limit.",
                "advanced_dsp_guidance": f"Engage 4x inter-sample peak oversampling on your master brickwall limiter and set output ceiling to {target_tp:.1f} dBTP.",
                "verification_check": f"Verify True Peak Max drops below {target_tp:.1f} dBTP on subsequent bounce.",
            })
            rec_counter += 1

    # 3. Objective Technical Issue: Stereo Phase Inversion / Cancellation
    min_corr = measurements["phase_correlation_min"]["value"]
    mean_corr = measurements["phase_correlation_mean"]["value"]
    if min_corr is not None and min_corr < -0.2:
        issue_id = "iss-tech-phase-cancellation"
        issues.append({
            "issue_id": issue_id,
            "classification": "objective_technical",
            "domain": "phase_polarity",
            "severity": "warning" if min_corr >= -0.6 else "critical",
            "confidence": 0.9,
            "title": f"Negative Phase Correlation ({min_corr:.2f}) Detected",
            "timestamps": [
                {"start_sec": 0.0, "end_sec": min(duration_seconds, 5.0), "label": "Out-of-phase stereo regions"}
            ],
            "evidence": [
                {
                    "metric_key": "phase_correlation_min",
                    "measured_value": float(min_corr),
                    "unit": "correlation",
                    "target_range": ">= 0.00",
                    "method": "Normalized cross-correlation over 400ms silence-gated windows",
                }
            ],
            "learning_guide": {
                "what_was_detected": f"Stereo phase correlation drops to {min_corr:.2f}, indicating negative polarity between channels.",
                "why_it_matters": "When summed to mono (phones, Bluetooth speakers, clubs), out-of-phase elements cancel out and disappear.",
                "what_to_try": "Check wide synth pads, vocal wideners, or drum room mics. Narrow stereo width below 150 Hz to pure mono.",
                "how_to_verify": "Audition mix in mono and confirm bass and vocals do not drop in volume.",
            },
        })

        recommendations.append({
            "recommendation_id": f"rec-{rec_counter}-mono-folddown",
            "priority_rank": rec_counter,
            "linked_issue_id": issue_id,
            "classification": "objective_technical",
            "action_title": "Fix Out-of-Phase Stereo Elements and Mono Low End",
            "beginner_summary": "Listen in mono and make sure low frequencies are in the center, not stretched too wide.",
            "advanced_dsp_guidance": "Use a bass-management utility to sum all frequency content below 120 Hz to mono, and check widening plugins on synths.",
            "verification_check": "Verify min phase correlation remains >= 0.0 throughout the song.",
        })
        rec_counter += 1

    # 4. Subjective Stylistic Observation: Low-Mid / Mud Density (200-500 Hz)
    mud_val = measurements["mud_band_energy_200_500hz"]["value"]
    if mud_val is not None:
        issue_id = "iss-stylistic-low-mid-density"
        status_note = "warm and full" if mud_val > -20.0 else "clean and scooped"
        issues.append({
            "issue_id": issue_id,
            "classification": "subjective_stylistic",
            "domain": "frequency_balance",
            "severity": "notice",
            "confidence": 0.85,
            "title": f"Low-Mid Acoustic Density ({mud_val:.1f} dBFS) — {status_note.title()}",
            "timestamps": [
                {"start_sec": 0.0, "end_sec": min(duration_seconds, 10.0), "label": "Low-mid frequency zone (200-500 Hz)"}
            ],
            "evidence": [
                {
                    "metric_key": "mud_band_energy_200_500hz",
                    "measured_value": float(mud_val),
                    "unit": "dBFS",
                    "target_range": "-26.0 to -18.0 dBFS",
                    "method": "Integrated Welch PSD power over 200–500 Hz band",
                }
            ],
            "learning_guide": {
                "what_was_detected": f"Energy in the 200–500 Hz range measured {mud_val:.1f} dBFS.",
                "why_it_matters": "The 200–500 Hz range gives body and warmth, but too much build-up masks vocals and makes mixes sound cloudy.",
                "what_to_try": "If the vocal feels veiled, consider a subtle wide dynamic dip (-1 to -2 dB) at 300–400 Hz on rhythm instruments.",
                "how_to_verify": "A/B compare the revised mix against your reference track at matched loudness.",
            },
        })

        recommendations.append({
            "recommendation_id": f"rec-{rec_counter}-low-mid-shaping",
            "priority_rank": rec_counter,
            "linked_issue_id": issue_id,
            "classification": "subjective_stylistic",
            "action_title": "Optional: Shape Low-Mid Warmth for Vocal Separation",
            "beginner_summary": "If guitars or synths compete with the singer, gently dip warm frequencies around 300 Hz.",
            "advanced_dsp_guidance": "Apply a gentle parametric EQ cut (-1.5 dB, Q=1.2) at 320 Hz on rhythm stems to carve pocket for lead elements.",
            "verification_check": "Verify vocal intelligibility improves without sacrificing rhythmic warmth.",
        })
        rec_counter += 1

    # 5. Subjective Stylistic Observation: Sub-Bass Balance (20-60 Hz)
    sub_val = measurements["sub_bass_energy_20_60hz"]["value"]
    if sub_val is not None:
        issue_id = "iss-stylistic-sub-bass-weight"
        issues.append({
            "issue_id": issue_id,
            "classification": "subjective_stylistic",
            "domain": "frequency_balance",
            "severity": "notice",
            "confidence": 0.85,
            "title": f"Sub-Bass Energy Distribution ({sub_val:.1f} dBFS)",
            "timestamps": [
                {"start_sec": 0.0, "end_sec": min(duration_seconds, 10.0), "label": "Sub-bass region (20-60 Hz)"}
            ],
            "evidence": [
                {
                    "metric_key": "sub_bass_energy_20_60hz",
                    "measured_value": float(sub_val),
                    "unit": "dBFS",
                    "target_range": "-32.0 to -22.0 dBFS",
                    "method": "Integrated Welch PSD power over 20–60 Hz band",
                }
            ],
            "learning_guide": {
                "what_was_detected": f"Sub-bass energy below 60 Hz measured {sub_val:.1f} dBFS.",
                "why_it_matters": "Excessive sub-bass eats limiter headroom and distorts smaller speakers, while insufficient sub lacks physical impact.",
                "what_to_try": "Ensure high-pass filtering (24–30 Hz, 12 dB/oct) is applied to non-sub instruments.",
                "how_to_verify": "Check low-end reproduction on both studio monitors and consumer earbuds.",
            },
        })

        recommendations.append({
            "recommendation_id": f"rec-{rec_counter}-sub-bass-anchor",
            "priority_rank": rec_counter,
            "linked_issue_id": issue_id,
            "classification": "subjective_stylistic",
            "action_title": "Calibrate Sub-Bass Weight for Headroom Efficiency",
            "beginner_summary": "Make sure instruments that do not need deep bass are rolled off with a gentle low cut.",
            "advanced_dsp_guidance": "High-pass guitar, vocal, and keys tracks at 80 Hz; keep 20–60 Hz reserved exclusively for kick and sub bass.",
            "verification_check": "Confirm headroom and clarity increase without weakening overall mix weight.",
        })
        rec_counter += 1

    return issues, recommendations
