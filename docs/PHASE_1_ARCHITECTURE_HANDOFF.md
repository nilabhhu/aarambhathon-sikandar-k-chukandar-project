# MixLearn Studio — Phase 1 Architecture Handoff

**Repository:** `https://github.com/nilabhhu/aarambhathon-sikandar-k-chukandar-project.git`  
**Motto:** *Learn mixing and mastering by doing mixing and mastering, and receive meaningful insights through AI.*  
**Phase Boundary:** Phase 1 Foundation Only (Shared Contracts, Consent & Privacy Gate, Route Layout, Demonstration Fixtures, Test Infrastructure).

> **GitHub Inspection Disclosure:** No remote GitHub network pulls or pushes were executed outside this environment; all files, schemas, and tests were created directly inside this workspace.

---

## 1. Concise Complete Product Specification

MixLearn Studio is a privacy-first educational audio engineering web application that enables independent musicians and producers to inspect their mixes, understand technical defects vs. stylistic trade-offs, audition affected timestamp regions, learn actionable DAW corrections, and verify revisions.

Both user interfaces consume a single canonical `AudioMixAnalysisReport` contract (`contracts/analysis_report.schema.json`):

1. **Simple Mix Check (`/simple`) — For Beginners:**
   - **Inputs:** Music Genre (`indie_rock`, `electronic_club`, `hip_hop_trap`, `pop_vocal`, `acoustic_folk`, `cinematic_orchestral`), Mix Stage (`unmastered_mix` or `final_master`), and Stereo Audio File.
   - **Output:** Prioritized plain-language cards structured into the 4-stage learning loop:
     1. *What was detected*
     2. *Why it matters*
     3. *What to try*
     4. *How to verify the change*
   - **Constraint:** Suppresses dense multi-band graphs and raw DSP jargon while still keeping objective technical warnings distinct from optional stylistic notes.

2. **Advanced Mix Check (`/advanced`) — For Intermediate Producers:**
   - **Inputs:** Genre, Mix Stage, Primary Stereo Mix, Optional Reference Track, Optional Genuine Original Stems/Multitracks (never AI-split), Optional Plugin-Chain Metadata, and 3-Tier Consent Preferences.
   - **Output:** Complete ITU-R BS.1770-4 / EBU R128 loudness, 4x oversampled True Peak (`dBTP`), sample clipping count, Loudness Range (`LU`), crest factor (`dB`), Pearson L/R phase correlation, Mid/Side stereo width, 4-band Welch PSD spectral balance (`dBFS`), clickable issue timestamps synced to the waveform player, separated Objective Technical Warnings vs. Subjective Stylistic Notes, and forward-compatible slots for Phase 3–5 capabilities.

---

## 2. Six-Phase Architectural Dependency Map

| Phase | Scope & Deliverables | Depends On | Status in Phase 1 |
| :--- | :--- | :--- | :--- |
| **Phase 1** | Shared JSON Schema & TypeScript/Pydantic contracts, 3-tier Consent Gate, Home + Simple + Advanced UI route layouts, visibly labeled Demonstration Fixtures, unit & pytest test runners, GitHub Actions CI. | None | **IMPLEMENTED** |
| **Phase 2** | Core Mathematical DSP Engine (`FFmpeg/libebur128`, `pyloudnorm`, `NumPy`, `SciPy`, `soundfile`) computing real LUFS, dBTP, LRA, crest factor, phase correlation, stereo width, and PSD spectrum with timestamped issue detection. | Phase 1 Contracts | `NOT_IMPLEMENTED` (HTTP 501) |
| **Phase 3** | Loudness-matched Reference Track Delta Comparison & Documented Streaming-Platform Normalization Estimates (Spotify, Apple Music, YouTube, Tidal — labeled as documented playback mode estimates per Rule 7). | Phase 2 DSP Engine | `NOT_IMPLEMENTED` (HTTP 501) |
| **Phase 4** | Genuine User-Uploaded Original Stem / Multitrack Masking & Phase Analysis (Rule 1 strictly blocks AI stem separation) + Browser Web Audio Mono & Approximate Device Translation Filters (Rule 6). | Phase 2 DSP Engine | `NOT_IMPLEMENTED` (HTTP 501) |
| **Phase 5** | Before/After Mix Revision Delta Engine + Consent-Gated Gemini Educational Interpretation (Rule 2 & 4: receives structured DSP JSON only; never invents measurements). | Phase 2–4 + Consent Gate | `NOT_IMPLEMENTED` (HTTP 501) |
| **Phase 6** | End-to-End Hardening, Accessibility Audit (WCAG AA), Ephemeral Temp-File Cleanup Verification, and Hackathon Demo Polish. | Phases 1–5 | `NOT_IMPLEMENTED` |
