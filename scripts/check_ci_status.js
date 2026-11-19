async function checkPRsAndRuns() {
  const prUrl = 'https://api.github.com/repos/nilabhhu/aarambhathon-sikandar-k-chukandar-project/pulls?state=all';
  const prRes = await fetch(prUrl, { headers: { 'User-Agent': 'Node-Fetch' } });
  const prs = await prRes.json();
  console.log('Pull Requests:');
  if (Array.isArray(prs) && prs.length > 0) {
    for (const pr of prs) {
      console.log(`- PR #${pr.number}: [${pr.state}] "${pr.title}" (${pr.head.ref} -> ${pr.base.ref})`);
      console.log(`  URL: ${pr.html_url}`);
    }
  } else {
    console.log('  No existing pull requests found.');
  }

  const runsUrl = 'https://api.github.com/repos/nilabhhu/aarambhathon-sikandar-k-chukandar-project/actions/runs?per_page=5';
  const runsRes = await fetch(runsUrl, { headers: { 'User-Agent': 'Node-Fetch' } });
  const runs = await runsRes.json();
  console.log('\nRecent GitHub Actions Runs:');
  for (const run of runs.workflow_runs || []) {
    console.log(`- Run #${run.run_number} on [${run.head_branch}]: status=${run.status}, conclusion=${run.conclusion}, commit=${run.head_sha.slice(0, 7)}`);
    console.log(`  URL: ${run.html_url}`);
  }
}

checkPRsAndRuns();
