/**
 * Automated Browser Acceptance Test using Chrome DevTools Protocol (CDP)
 * Tests real rendering in Microsoft Edge (Chromium) on http://localhost:3000
 */

import { spawn } from 'child_process';

const WebSocket = globalThis.WebSocket;

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.callbacks = new Map();
    this.events = [];
    this.consoleErrors = [];
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.addEventListener('open', () => resolve());
      this.ws.addEventListener('error', (err) => reject(err));
      this.ws.addEventListener('message', (event) => {
        const raw = typeof event.data === 'string' ? event.data : event.data.toString();
        const data = JSON.parse(raw);
        if (data.id && this.callbacks.has(data.id)) {
          const { resolve, reject } = this.callbacks.get(data.id);
          this.callbacks.delete(data.id);
          if (data.error) reject(data.error);
          else resolve(data.result);
        } else if (data.method) {
          if (data.method === 'Runtime.consoleAPICalled') {
            if (data.params.type === 'error') {
              this.consoleErrors.push(data.params.args.map((a) => a.value || a.description).join(' '));
            }
          } else if (data.method === 'Runtime.exceptionThrown') {
            this.consoleErrors.push(data.params.exceptionDetails?.text || 'Uncaught error');
          }
          this.events.push(data);
        }
      });
    });
  }

  async send(method, params = {}, sessionId = null) {
    const id = this.id++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
    });
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function runBrowserAcceptanceTests() {
  console.log('=== STARTING AUTOMATED BROWSER ACCEPTANCE TESTS VIA EDGE CDP ===\n');

  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const edgeProcess = spawn(
    edgePath,
    [
      '--headless=new',
      '--remote-debugging-port=9222',
      '--remote-allow-origins=*',
      '--disable-gpu',
      `--user-data-dir=${process.cwd()}\\.edge-profile`,
      'http://localhost:3000/',
    ],
    { stdio: 'ignore' }
  );

  let browserWsUrl = null;
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9222/json/version');
      if (res.ok) {
        const data = await res.json();
        browserWsUrl = data.webSocketDebuggerUrl;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }

  if (!browserWsUrl) {
    edgeProcess.kill();
    throw new Error('Failed to connect to Edge remote debugging port 9222 after 10 seconds');
  }

  console.log(`Connected to Edge CDP at ${browserWsUrl}`);
  const browserClient = new CDPClient(browserWsUrl);
  await browserClient.connect();

  let targetId = null;
  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`  ✔ [PASS] ${message}`);
      passedTests++;
    } else {
      console.error(`  ✘ [FAIL] ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  try {
    // Query existing targets or create one
    const targets = await browserClient.send('Target.getTargets');
    const existingPage = targets.targetInfos.find((t) => t.type === 'page');
    targetId = existingPage ? existingPage.targetId : (await browserClient.send('Target.createTarget', { url: 'http://localhost:3000/' })).targetId;

    const { sessionId } = await browserClient.send('Target.attachToTarget', { targetId, flatten: true });

    const page = {
      send: (method, params = {}) => browserClient.send(method, params, sessionId),
      eval: async (expr) => {
        let code = expr.trim();
        if (code.includes('return ') && !code.startsWith('(() =>') && !code.startsWith('(function')) {
          code = `(() => { ${code} })()`;
        }
        const res = await browserClient.send('Runtime.evaluate', { expression: code, returnByValue: true, awaitPromise: true }, sessionId);
        if (res.exceptionDetails) {
          const detail = res.exceptionDetails.exception?.description || res.exceptionDetails.text || 'Eval error';
          throw new Error(`Eval error: ${detail} in: ${code}`);
        }
        return res.result?.value;
      },
      wait: (ms) => new Promise((r) => setTimeout(r, ms)),
      setViewport: async (width, height, isMobile = false) => {
        await browserClient.send('Emulation.setDeviceMetricsOverride', {
          width,
          height,
          deviceScaleFactor: 1,
          mobile: isMobile,
        }, sessionId);
      },
    };

    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('DOM.enable');

    // Wait for initial page hydration
    await page.wait(2000);

    // ----------------------------------------------------
    // TEST SUITE 1: HOME PAGE & GLOBAL SHELL
    // ----------------------------------------------------
    console.log('\n--- Test Suite 1: Home Page & Global Shell ---');
    await page.setViewport(1280, 800);

    const title = await page.eval('document.title');
    assert(title.includes('MixLearn Studio'), `Page title contains "MixLearn Studio" (actual: "${title}")`);

    const isLightMode = await page.eval('!document.documentElement.classList.contains("dark")');
    assert(isLightMode, 'Default theme is Light Mode (html tag does NOT contain "dark")');

    const brandWordmark = await page.eval('document.querySelector("header a")?.textContent?.trim()');
    assert(brandWordmark === 'MixLearn Studio', `Header wordmark is "MixLearn Studio"`);

    const hasSimpleLink = await page.eval('!!document.querySelector("a[href=\'/simple\']")');
    const hasAdvancedLink = await page.eval('!!document.querySelector("a[href=\'/advanced\']")');
    const hasArchLink = await page.eval('!!document.querySelector("a[href=\'/architecture\']")');
    assert(hasSimpleLink && hasAdvancedLink && hasArchLink, 'All 3 main navigation routes are discoverable in header');

    const statusBadge = await page.eval('document.querySelector("div[class*=\'inline-flex\'][class*=\'border\'] span")?.textContent || "NOT_FOUND"');
    console.log(`  ℹ Status Badge text: "${statusBadge}"`);
    console.log('  ℹ Recorded console errors so far:', browserClient.consoleErrors);
    const backendOnlineText = await page.eval('document.body.innerText.includes("Backend API: Online")');
    if (!backendOnlineText) {
      const fullText = await page.eval('document.body.innerText');
      console.log('  [DEBUG BODY TEXT SNIPPET]:', fullText.slice(0, 400));
    }
    assert(backendOnlineText, 'Backend API status shows "Backend API: Online" via Vite proxy');

    // ----------------------------------------------------
    // TEST SUITE 2: SIMPLE MIX CHECK ROUTE (/simple)
    // ----------------------------------------------------
    console.log('\n--- Test Suite 2: Simple Mix Check (/simple) ---');
    await page.eval('window.history.pushState(null, "", "/simple"); window.dispatchEvent(new PopStateEvent("popstate"));');
    await page.wait(1200);

    const simpleHeader = await page.eval('document.querySelector("h1")?.textContent?.trim()');
    assert(simpleHeader === 'Simple Mix Check', `Header title is "Simple Mix Check" (actual: "${simpleHeader}")`);

    const simpleDemoBanner = await page.eval('document.querySelector("[data-testid=\'demo-data-banner-simple\']")?.textContent');
    assert(simpleDemoBanner && simpleDemoBanner.includes('DEMONSTRATION DATA'), 'Demo data disclosure banner is prominently rendered');
    assert(simpleDemoBanner.includes('FASTAPI') || simpleDemoBanner.includes('OFFLINE'), 'Provenance (FastAPI Backend or Offline) is indicated');

    // Test Genre selector
    await page.eval(`
      const sel = document.querySelector("select");
      if (sel) {
        sel.value = "electronic_club";
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }
    `);
    await page.wait(1000);
    const updatedGenreText = await page.eval('document.body.innerText.includes("Electronic / Club")');
    assert(updatedGenreText, 'Genre switch to "Electronic / Club" updates interface context');

    // Test Stage selector
    await page.eval(`
      const stageButtons = Array.from(document.querySelectorAll("button")).filter(b => b.textContent.includes("Final Master"));
      if (stageButtons.length > 0) stageButtons[0].click();
    `);
    await page.wait(1000);
    const stageUpdated = await page.eval('document.body.innerText.includes("FINAL MASTER") || document.body.innerText.includes("Final Master")');
    assert(stageUpdated, 'Mix stage switch to "Final Master" updates interface context');

    // Verify 4-step action cards
    const stepsCheck = await page.eval(`
      const upper = document.body.innerText.toUpperCase();
      return {
        detected: upper.includes("WHAT WAS DETECTED"),
        matters: upper.includes("WHY IT MATTERS"),
        tryDAW: upper.includes("WHAT TO TRY IN YOUR DAW"),
        verify: upper.includes("HOW TO VERIFY THE CHANGE") || upper.includes("HOW TO VERIFY"),
      };
    `);
    const has4Steps = stepsCheck.detected && stepsCheck.matters && stepsCheck.tryDAW && stepsCheck.verify;
    assert(has4Steps, 'Simple Mix Check features all 4 steps of beginner educational learning loop');

    // ----------------------------------------------------
    // TEST SUITE 3: ADVANCED MIX CHECK ROUTE (/advanced)
    // ----------------------------------------------------
    console.log('\n--- Test Suite 3: Advanced Mix Check (/advanced) ---');
    await page.eval('window.history.pushState(null, "", "/advanced"); window.dispatchEvent(new PopStateEvent("popstate"));');
    await page.wait(1200);

    const advancedHeader = await page.eval('document.querySelector("h1")?.textContent?.trim()');
    assert(advancedHeader?.includes('Advanced Mix Check'), `Header title contains "Advanced Mix Check" (actual: "${advancedHeader}")`);

    const advancedDemoBanner = await page.eval('document.querySelector("[data-testid=\'demo-data-banner-advanced\']")?.textContent');
    assert(advancedDemoBanner && advancedDemoBanner.includes('DEMONSTRATION DATA'), 'Demo data disclosure banner is prominently rendered in Advanced view');

    // Verify 14 DSP measurements with standardized engineering units
    const dspUnitsPresent = await page.eval(`
      const text = document.body.innerText;
      return text.includes("LUFS") &&
             text.includes("dBTP") &&
             text.includes("LU") &&
             text.includes("dB");
    `);
    assert(dspUnitsPresent, 'Standardized mathematical DSP units (LUFS, dBTP, LU, dB) are displayed');

    // Verify synthetic waveform envelope disclosure
    const syntheticWaveformNotice = await page.eval(`
      const text = document.body.innerText;
      return text.includes("SYNTHETIC DEMO ENVELOPE") &&
             text.includes("No real audio playback engine");
    `);
    assert(syntheticWaveformNotice, 'Synthetic waveform envelope and no-audio-playback notice are explicitly displayed');

    // Test Stereo / Mono toggle labels
    const curveLabelsPresent = await page.eval(`
      const text = document.body.innerText;
      return text.includes("Visual Simulation: Stereo Curve") ||
             text.includes("Visual Simulation: Mono Sum Curve");
    `);
    assert(curveLabelsPresent, 'Curve toggle explicitly describes simulated visual curves, not audio auditioning');

    // Test Rule 1: Stem source boundary (Reject AI Stem Splitting)
    console.log('  ℹ Testing Rule 1 Original-Stem Validator in UI...');
    await page.eval(`
      const selects = Array.from(document.querySelectorAll("select"));
      const stemSelect = selects.find(s => Array.from(s.options).some(o => o.value === "ai_separated_stem"));
      if (stemSelect) {
        stemSelect.value = "ai_separated_stem";
        stemSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
      const stemInputs = Array.from(document.querySelectorAll("input[type='text']"));
      if (stemInputs.length > 0) {
        const lastInput = stemInputs[stemInputs.length - 1];
        lastInput.value = "demucs_vocal_split.wav";
        lastInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
      const submitButtons = Array.from(document.querySelectorAll("button[type='submit']"));
      if (submitButtons.length > 0) submitButtons[0].click();
    `);
    await page.wait(800);

    const stemRejectionText = await page.eval(`
      const text = document.body.innerText;
      return text.includes("REJECTED") || text.includes("RULE 1 VIOLATION") || text.includes("AI stem separation");
    `);
    assert(stemRejectionText, 'Original Stem Validator actively catches and rejects AI stem separation candidate');

    // Verify Phase 3-5 capability panels are visibly marked NOT IMPLEMENTED
    const futureCapsMarked = await page.eval(`
      const text = document.body.innerText;
      return text.includes("Streaming Gain Estimates") &&
             text.includes("NOT_IMPLEMENTED") &&
             text.includes("Reference Track Matching");
    `);
    assert(futureCapsMarked, 'Future phase capabilities (Phase 3-5) are clearly marked as NOT IMPLEMENTED with product disclosures');

    // ----------------------------------------------------
    // TEST SUITE 4: FIVE-TIER PRIVACY CONTROLS
    // ----------------------------------------------------
    console.log('\n--- Test Suite 4: Five-Tier Consent Controls ---');
    const modelTrainingDefaultOff = await page.eval(`
      const trainingToggle = document.getElementById("consent-model-training");
      return trainingToggle ? trainingToggle.checked === false : false;
    `);
    assert(modelTrainingDefaultOff, 'Rule 5: Model training is disabled (checked=false) by default');

    const fivePermissionsPresent = await page.eval(`
      const text = document.body.innerText;
      return text.includes("1. Ephemeral Mathematical DSP Analysis") &&
             text.includes("2. AI Numerical Metrics Coaching") &&
             text.includes("3. AI Audio Feature Inspection") &&
             text.includes("4. External Raw Audio File Transfer") &&
             text.includes("5. Model Training on User Audio");
    `);
    assert(fivePermissionsPresent, 'All 5 granular permission dimensions are rendered independently');

    // Test unchecking audio_analysis_consent
    await page.eval(`
      (() => {
        const toggle = document.getElementById("consent-local-dsp");
        if (toggle) toggle.click();
      })()
    `);
    await page.wait(800);

    const consentRevokedNotice = await page.eval(`
      const text = document.body.innerText;
      return text.includes("AUDIO ANALYSIS CONSENT REQUIRED") || text.includes("Permission 1") || text.includes("Analysis Blocked");
    `);
    assert(consentRevokedNotice, 'Unchecking audio analysis consent blocks analysis view immediately');

    // Re-check audio_analysis_consent
    await page.eval(`
      (() => {
        const toggle = document.getElementById("consent-local-dsp");
        if (toggle && !toggle.checked) toggle.click();
      })()
    `);
    await page.wait(800);

    // ----------------------------------------------------
    // TEST SUITE 5: ARCHITECTURE VIEW (/architecture)
    // ----------------------------------------------------
    console.log('\n--- Test Suite 5: Architecture Handoff View (/architecture) ---');
    await page.eval('window.history.pushState(null, "", "/architecture"); window.dispatchEvent(new PopStateEvent("popstate"));');
    await page.wait(1200);

    const archHeader = await page.eval('document.querySelector("h1")?.textContent?.trim()');
    assert(archHeader?.includes('Phase 1 Architecture'), `Header title includes "Phase 1 Architecture" (actual: "${archHeader}")`);

    const contractValidatorPass = await page.eval('document.body.innerText.includes("Contract Validator: PASS (0 Errors)")');
    assert(contractValidatorPass, 'Live contract validator reports "PASS (0 Errors)"');

    // ----------------------------------------------------
    // TEST SUITE 6: RESPONSIVENESS & ZERO CONSOLE ERRORS
    // ----------------------------------------------------
    console.log('\n--- Test Suite 6: Viewport Responsiveness & Console Errors ---');

    // Tablet: 768 x 1024
    await page.setViewport(768, 1024);
    await page.wait(500);
    const tabletNavRendered = await page.eval('!!document.querySelector("header")');
    assert(tabletNavRendered, 'Tablet viewport (768px) renders clean layout without crashing');

    // Mobile: 375 x 667
    await page.setViewport(375, 667, true);
    await page.wait(500);
    const mobileNavRendered = await page.eval('!!document.querySelector("header")');
    assert(mobileNavRendered, 'Mobile viewport (375px) renders responsive shell');

    // Restore desktop viewport
    await page.setViewport(1280, 800);

    // Check console errors
    console.log(`  ℹ Total console errors recorded: ${browserClient.consoleErrors.length}`);
    if (browserClient.consoleErrors.length > 0) {
      console.warn('Console error messages:', browserClient.consoleErrors);
    }
    assert(browserClient.consoleErrors.length === 0, 'Zero runtime exceptions or uncaught console errors detected');

    console.log(`\n=== BROWSER ACCEPTANCE SUMMARY: ${passedTests}/${totalTests} TESTS PASSED ===\n`);
  } finally {
    if (targetId) {
      try {
        await browserClient.send('Target.closeTarget', { targetId });
      } catch {}
    }
    browserClient.close();
    edgeProcess.kill();
  }
}

runBrowserAcceptanceTests().catch((err) => {
  console.error('Browser Acceptance Test failed:', err);
  process.exit(1);
});
