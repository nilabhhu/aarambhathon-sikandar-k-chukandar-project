async function testEndpoints() {
  console.log('--- Testing Backend Direct Endpoints ---');
  const backendUrls = [
    'http://127.0.0.1:8000/health',
    'http://127.0.0.1:8000/api/v1/health',
    'http://127.0.0.1:8000/api/v1/capabilities',
    'http://127.0.0.1:8000/api/v1/contracts/schema',
    'http://127.0.0.1:8000/api/v1/demo/report',
  ];

  for (const url of backendUrls) {
    try {
      const res = await fetch(url);
      const isJson = res.headers.get('content-type')?.includes('application/json');
      console.log(`[PASS] ${res.status} ${res.statusText} - ${url}`);
      if (isJson) {
        const body = await res.json();
        const snippet = JSON.stringify(body).slice(0, 90);
        console.log(`       Preview: ${snippet}...`);
      }
    } catch (err) {
      console.error(`[FAIL] ${url} -> ${err.message}`);
    }
  }

  console.log('\n--- Testing Frontend Routes (Vite Dev Server) ---');
  const frontendUrls = [
    'http://localhost:3000/',
    'http://localhost:3000/simple',
    'http://localhost:3000/advanced',
    'http://localhost:3000/architecture',
  ];

  for (const url of frontendUrls) {
    try {
      const res = await fetch(url);
      console.log(`[PASS] ${res.status} ${res.statusText} - ${url}`);
      const text = await res.text();
      const hasRoot = text.includes('id="root"');
      const hasTitle = text.includes('MixLearn Studio');
      console.log(`       HTML Check: hasRoot=${hasRoot}, hasTitle=${hasTitle}`);
    } catch (err) {
      console.error(`[FAIL] ${url} -> ${err.message}`);
    }
  }

  console.log('\n--- Testing Vite Proxy to Backend ---');
  const proxiedUrls = [
    'http://localhost:3000/health',
    'http://localhost:3000/api/v1/health',
    'http://localhost:3000/api/v1/capabilities',
    'http://localhost:3000/api/v1/contracts/schema',
    'http://localhost:3000/api/v1/demo/report',
  ];

  for (const url of proxiedUrls) {
    try {
      const res = await fetch(url);
      console.log(`[PASS] ${res.status} ${res.statusText} - ${url}`);
      if (res.ok) {
        const body = await res.json();
        console.log(`       Proxy Response Status: ${body.status || 'OK'}, Phase: ${body.phase || body.schema_version || 'N/A'}`);
      }
    } catch (err) {
      console.error(`[FAIL] ${url} -> ${err.message}`);
    }
  }

  console.log('\n--- Testing POST /api/v1/analyze/demo via Vite Proxy ---');
  try {
    const postRes = await fetch('http://localhost:3000/api/v1/analyze/demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        interface_mode: 'advanced',
        genre: 'electronic_club',
        mix_stage: 'final_master',
        consent_state: {
          audio_analysis_consent: true,
          external_ai_transfer_consent: false,
          ai_numerical_metrics_transfer_consent: false,
          ai_audio_content_inspection_consent: false,
          raw_audio_transfer_consent: false,
          model_training_opt_in: false,
          consent_timestamp: new Date().toISOString(),
        },
      }),
    });

    console.log(`[PASS] POST /api/v1/analyze/demo -> ${postRes.status} ${postRes.statusText}`);
    const reportData = await postRes.json();
    console.log(`       Report ID: ${reportData.report_id}`);
    console.log(`       Is Demo Data: ${reportData.is_demonstration_data}`);
    console.log(`       Input Context: Genre=${reportData.input_context?.genre}, Stage=${reportData.input_context?.mix_stage}`);
    console.log(`       Consent Training: ${reportData.consent_state?.model_training_opt_in}`);
  } catch (err) {
    console.error(`[FAIL] POST /api/v1/analyze/demo -> ${err.message}`);
  }

  console.log('\n--- Testing Consent Denial (Rule 4 Enforcement) ---');
  try {
    const deniedRes = await fetch('http://localhost:3000/api/v1/analyze/demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        interface_mode: 'simple',
        genre: 'pop_vocal',
        mix_stage: 'unmastered_mix',
        consent_state: {
          audio_analysis_consent: false,
          external_ai_transfer_consent: false,
          ai_numerical_metrics_transfer_consent: false,
          ai_audio_content_inspection_consent: false,
          raw_audio_transfer_consent: false,
          model_training_opt_in: false,
          consent_timestamp: new Date().toISOString(),
        },
      }),
    });

    console.log(`[PASS] Denied consent returned ${deniedRes.status} ${deniedRes.statusText} (Expected: 403 Forbidden)`);
    const errBody = await deniedRes.json();
    console.log(`       Error Body: ${JSON.stringify(errBody)}`);
  } catch (err) {
    console.error(`[FAIL] Consent Denial -> ${err.message}`);
  }
}

testEndpoints();
