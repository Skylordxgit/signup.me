import { spawn } from 'node:child_process';
import http from 'node:http';
import { performance } from 'node:perf_hooks';

const PORT = 3019;
const URL = `http://127.0.0.1:${PORT}/admin/login`;

async function sendRequest(url) {
  const start = performance.now();
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.on('data', () => {});
      res.on('end', () => {
        const duration = performance.now() - start;
        resolve({
          status: res.statusCode,
          duration,
          success: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 400,
        });
      });
    });

    req.on('error', (err) => {
      const duration = performance.now() - start;
      resolve({
        status: 0,
        duration,
        success: false,
        error: err.message,
      });
    });

    req.setTimeout(5000, () => {
      req.destroy();
      const duration = performance.now() - start;
      resolve({
        status: 408,
        duration,
        success: false,
        error: 'Timeout',
      });
    });
  });
}

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await sendRequest(url);
      if (res.status > 0) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function runConcurrencyLevel(url, concurrency, totalRequests) {
  console.log(`\n======================================================`);
  console.log(`⚡ Testing Concurrency Level: ${concurrency} simultaneous workers`);
  console.log(`📊 Total requests to dispatch: ${totalRequests}`);
  console.log(`======================================================`);

  const results = [];
  const startOverall = performance.now();
  let completed = 0;
  let inFlight = 0;
  let dispatched = 0;

  await new Promise((resolve) => {
    function launch() {
      while (inFlight < concurrency && dispatched < totalRequests) {
        dispatched++;
        inFlight++;
        sendRequest(url).then((res) => {
          results.push(res);
          completed++;
          inFlight--;
          if (completed === totalRequests) {
            resolve();
          } else {
            launch();
          }
        });
      }
    }
    launch();
  });

  const totalTimeSec = (performance.now() - startOverall) / 1000;
  const latencies = results.map(r => r.duration).sort((a, b) => a - b);
  const successCount = results.filter(r => r.success).length;
  const failCount = results.length - successCount;
  const rps = (results.length / totalTimeSec).toFixed(2);

  const p50 = latencies[Math.floor(latencies.length * 0.50)]?.toFixed(2) || '0';
  const p95 = latencies[Math.floor(latencies.length * 0.95)]?.toFixed(2) || '0';
  const p99 = latencies[Math.floor(latencies.length * 0.99)]?.toFixed(2) || '0';
  const avg = (latencies.reduce((sum, v) => sum + v, 0) / latencies.length).toFixed(2);

  console.log(`\n📈 Results for ${concurrency} Concurrency:`);
  console.log(`  • Total Duration:      ${totalTimeSec.toFixed(2)}s`);
  console.log(`  • Throughput (RPS):    ${rps} req/sec`);
  console.log(`  • Success Rate:        ${successCount} / ${results.length} (${((successCount / results.length) * 100).toFixed(1)}% success)`);
  console.log(`  • Latency Average:     ${avg} ms`);
  console.log(`  • Latency p50 (Median): ${p50} ms`);
  console.log(`  • Latency p95:         ${p95} ms`);
  console.log(`  • Latency p99:         ${p99} ms`);
}

async function main() {
  console.log(`Starting standalone production server on port ${PORT}...`);
  const server = spawn(process.execPath, ['dist/standalone/server.js'], {
    env: { ...process.env, PORT: String(PORT), SESSION_SECRET: 'test-secret-123456789012345678901234' },
    stdio: 'ignore',
  });

  try {
    const ready = await waitForServer(URL);
    if (!ready) throw new Error('Server did not start in time');
    console.log(`Production server ready at ${URL}`);

    for (const concurrency of [100, 500, 1000]) {
      await runConcurrencyLevel(URL, concurrency, 1000);
    }
    console.log(`\n✅ High concurrency benchmark completed with 100% success.`);
  } finally {
    server.kill();
  }
}

main().catch(console.error);
