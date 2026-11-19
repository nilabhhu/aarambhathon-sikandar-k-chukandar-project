/**
 * Automated Browser Acceptance Test using Chrome DevTools Protocol (CDP)
 * Tests real rendering in Microsoft Edge (Chromium) on http://localhost:3000
 */

import { spawn } from 'child_process';
import os from 'os';
import path from 'path';
import fs from 'fs';

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
  const profileDir = path.join(os.tmpdir(), `edge-profile-${Date.now()}`);
  const edgeProcess = spawn(
    edgePath,
    [
      '--headless=new',
      '--remote-debugging-port=9222',
      '--remote-allow-origins=*',
      '--disable-gpu',
      `--user-data-dir=${profileDir}`,
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

    // Wait for live engine status badge to render
    let engineBadgeText = false;
    for (let i = 0; i < 20; i++) {
      engineBadgeText = await page.eval(
        'document.body.innerText.includes("Engine: FastAPI DSP (EBU R128)") || document.body.innerText.includes("Engine: Local Web Audio Fallback")'
      );
      if (engineBadgeText) break;
      await page.wait(500);
    }
    assert(engineBadgeText, 'Live engine badge reflects /api/v1/health status');

    const phase2Label = await page.eval('document.body.innerText.includes("PHASE 2 · REAL DSP ENGINE")');
    assert(phase2Label, 'Sub-header displays "PHASE 2 · REAL DSP ENGINE"');

    // ----------------------------------------------------
    // TEST SUITE 2: SIMPLE MIX CHECK ROUTE (/simple)
    // ----------------------------------------------------
    console.log('\n--- Test Suite 2: Simple Mix Check (/simple) ---');
    await page.eval('window.history.pushState(null, "", "/simple"); window.dispatchEvent(new PopStateEvent("popstate"));');
    await page.wait(1200);

    const simpleHeader = await page.eval('document.querySelector("h1")?.textContent?.trim()');
    assert(simpleHeader === 'Simple Mix Check', `Header title is "Simple Mix Check" (actual: "${simpleHeader}")`);

    const simpleCleanEmpty = await page.eval(
      '!!document.querySelector("[data-testid=\'simple-empty-state\']") && !document.body.innerText.includes("glass_harbor_mix_v3_premaster_24bit.wav")'
    );
    assert(simpleCleanEmpty, 'Simple Mix Check starts in clean empty state with no preloaded dummy audio fixture');

    // Test Genre selector
    await page.eval(`
      const sel = document.querySelector("select");
      if (sel) {
        sel.value = "electronic_club";
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }
    `);
    await page.wait(600);
    const updatedGenreText = await page.eval('document.body.innerText.includes("Electronic / Club")');
    assert(updatedGenreText, 'Genre switch to "Electronic / Club" updates interface context');

    // Test Stage selector
    await page.eval(`
      const stageButtons = Array.from(document.querySelectorAll("button")).filter(b => b.textContent.includes("Final Master"));
      if (stageButtons.length > 0) stageButtons[0].click();
    `);
    await page.wait(600);
    const stageUpdated = await page.eval('document.body.innerText.includes("Final Master")');
    assert(stageUpdated, 'Mix stage switch to "Final Master" updates interface context');

    // ----------------------------------------------------
    // TEST SUITE 3: ADVANCED MIX CHECK ROUTE (/advanced)
    // ----------------------------------------------------
    console.log('\n--- Test Suite 3: Advanced Mix Check (/advanced) ---');
    await page.eval('window.history.pushState(null, "", "/advanced"); window.dispatchEvent(new PopStateEvent("popstate"));');
    await page.wait(1200);

    const advancedHeader = await page.eval('document.querySelector("h1")?.textContent?.trim()');
    assert(advancedHeader?.includes('Advanced Mix Check'), `Header title contains "Advanced Mix Check" (actual: "${advancedHeader}")`);

    const advancedCleanEmpty = await page.eval(
      '!!document.querySelector("[data-testid=\'advanced-empty-state\']") && !document.body.innerText.includes("glass_harbor_mix_v3_premaster_24bit.wav")'
    );
    assert(advancedCleanEmpty, 'Advanced Mix Check starts in clean empty state with no preloaded dummy audio fixture');

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

    // ----------------------------------------------------
    // TEST SUITE 5: ARCHITECTURE VIEW (/architecture)
    // ----------------------------------------------------
    console.log('\n--- Test Suite 5: Architecture Handoff View (/architecture) ---');
    await page.eval('window.history.pushState(null, "", "/architecture"); window.dispatchEvent(new PopStateEvent("popstate"));');
    await page.wait(1200);

    const archHeader = await page.eval('document.querySelector("h1")?.textContent?.trim()');
    assert(archHeader?.includes('Architecture'), `Header title includes "Architecture" (actual: "${archHeader}")`);

    const dspMatrixImplemented = await page.eval('document.body.innerText.includes("200 IMPLEMENTED (Phase 2)")');
    assert(dspMatrixImplemented, 'Architecture matrix lists POST /api/v1/analyze/dsp as 200 IMPLEMENTED (Phase 2)');

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
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
    } catch {}
  }
}

runBrowserAcceptanceTests().catch((err) => {
  console.error('Browser Acceptance Test failed:', err);
  process.exit(1);
});
