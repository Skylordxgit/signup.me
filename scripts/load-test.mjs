import http from 'node:http';
import { performance } from 'node:perf_hooks';

/**
 * Load Test & Benchmarking Script for Signup.me High Concurrency Engine
 * Usage: node scripts/load-test.mjs [targetUrl] [concurrencyLevels]
 */

const TARGET_URL = process.argv[2] || 'http://localhost:3000/';
const CONCURRENCY_LEVELS = [100, 500, 1000];
const REQUESTS_PER_LEVEL = 1000;

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
          success: res.statusCode >= 200 && res.statusCode < 400,
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

  const p50 = latencies[Math.floor(latencies.length * 0.50)]?.toFixed(2) || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)]?.toFixed(2) || 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)]?.toFixed(2) || 0;
  const avg = (latencies.reduce((sum, v) => sum + v, 0) / latencies.length).toFixed(2);

  console.log(`\n📈 Results for ${concurrency} Concurrency:`);
  console.log(`  • Total Duration:      ${totalTimeSec.toFixed(2)}s`);
  console.log(`  • Throughput (RPS):    ${rps} req/sec`);
  console.log(`  • Success / Error:     ${successCount} / ${failCount} (${((successCount / results.length) * 100).toFixed(1)}% success)`);
  console.log(`  • Latency Average:     ${avg} ms`);
  console.log(`  • Latency p50 (Median): ${p50} ms`);
  console.log(`  • Latency p95:         ${p95} ms`);
  console.log(`  • Latency p99:         ${p99} ms`);
}

async function main() {
  console.log(`🚀 High-Concurrency Benchmark starting against: ${TARGET_URL}`);
  for (const concurrency of CONCURRENCY_LEVELS) {
    await runConcurrencyLevel(TARGET_URL, concurrency, REQUESTS_PER_LEVEL);
  }
  console.log(`\n✅ All benchmark tiers completed successfully.`);
}

main().catch(console.error);
