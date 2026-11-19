# MixLearn Studio — Design System & Visual Specification

## 1. Design Philosophy: Restraint, Clarity & Professionalism

Audio engineering tools often suffer from dark skeuomorphic overload, excessive 3D knob renderings, or trendy neon gradients with illegible contrast. MixLearn Studio rejects these distractions in favor of a restrained, light-first editorial aesthetic reminiscent of high-end acoustic laboratory documentation.

### Anti-Patterns Strictly Prohibited:
- ❌ Dark-first default themes.
- ❌ Neon glowing gradients or "AI sparkles".
- ❌ Skeuomorphic photorealistic knobs with poor accessibility.
- ❌ Glassmorphism / backdrop-blur overlays that reduce readability.
- ❌ Color-only status signaling without accompanying text.

---

## 2. Color Tokens & Palette

### Primary Light Mode (Default)
The default presentation is designed for clarity in daylight studios and desktop workstations:

| Token Name | CSS / Hex Value | Role & Usage |
| :--- | :--- | :--- |
| `--surface-canvas` | `#FFFFFF` | Main page background |
| `--surface-subtle` | `#F7F9F8` | Secondary panels, cards, and container fills |
| `--surface-muted` | `#EFF3F1` | Inactive buttons, table headers, tag fills |
| `--text-primary` | `#18181B` (Zinc-900) | Headings, primary metrics, active text |
| `--text-secondary` | `#52525B` (Zinc-600) | Secondary educational prose, descriptions |
| `--text-muted` | `#71717A` (Zinc-500) | Timecodes, units, metadata labels |
| `--border-subtle` | `#E4E8E6` (Zinc-200) | 1px clean card and divider boundaries |
| `--accent-sage-dark` | `#115E59` (Teal-800) | Primary CTA buttons, active route underline |
| `--accent-sage-surface`| `#EAF2F0` (Teal-50) | Verification tags, notice banners |
| `--status-warning-bg` | `#FEF3C7` (Amber-50) | Technical notice banner fill |
| `--status-warning-text`| `#92400E` (Amber-800)| Objective warning text |
| `--status-critical-bg` | `#FEE2E2` (Red-50) | Intersample clipping banner fill |
| `--status-critical-text`| `#991B1B` (Red-800) | Critical DSP overshoot alerts |

### Secondary Dark Mode (Explicit Opt-In)
For producers working in darkened control rooms, an optional dark theme is toggled via the toolbar:
- Canvas background: `#0F1413`
- Card surfaces: `#161D1B`
- Subtle borders: `#26312E`
- Primary text: `#F4F6F5`
- Primary sage accent: `#459B8D`

---

## 3. Typography: The 2+1 Font Rule

To maintain clear visual hierarchy without font fatigue:

```
Headings & Wordmarks:  Plus Jakarta Sans (600 SemiBold / 700 Bold)
Body & Educational Prose: Public Sans (400 Regular / 500 Medium / 600 SemiBold)
Measurements & Codes:     JetBrains Mono with font-variant-numeric: tabular-nums
```

- **Headings (`font-display`):** Plus Jakarta Sans provides geometric authority with modern legibility.
- **Body (`font-sans`):** Public Sans provides neutral, highly legible reading for instructional guidance.
- **Measurements (`font-mono`):** JetBrains Mono ensures that numerical columns (LUFS, dBTP, Hz) align precisely without jittering across dynamic recalculations.

---

## 4. Layout Grid & Spacing Rhythm

- **Base Rhythm:** 4px / 8px grid (Tailwind `p-2`, `p-4`, `p-6`, `gap-4`, `gap-6`).
- **Maximum Content Width:** `max-w-7xl` (1280px), centered with `mx-auto` and horizontal padding (`px-6`).
- **Card Styling:** Moderate border radius (`rounded-lg` / 8px), subtle 1px border (`border-zinc-200`), minimal shadow (`shadow-xs` or flat border definition).

---

## 5. Accessibility (WCAG AA Compliance)

1. **Color Contrast:**
   - Body text against canvas exceeds 7:1 (well above the 4.5:1 WCAG AA minimum).
   - Large headings exceed 4.5:1 (well above the 3:1 minimum).
2. **Zero Color-Only Signaling:**
   - Every metric status pairs color with explicit uppercase text: `OPTIMAL`, `WARNING`, `CRITICAL`.
   - Every issue classification is labeled with text: `Objective Technical Issue` or `Optional Stylistic Suggestion`.
3. **Form Controls:**
   - All `<input>` and `<select>` controls have native semantic markup and explicit `<label htmlFor="...">`.
4. **Live Regions:**
   - Demonstration banners carry `role="status"`.
   - Security and Rule 1 violation warnings carry `role="alert"`.
