import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { Command } from "commander";
import { z } from "zod";
import type { BenchmarkMetricRecord } from "./record-benchmark-metrics";

const metricRecordSchema = z.object({
  timestamp: z.string(),
  commit_sha: z.string(),
  total_tests: z.number(),
  passed: z.number(),
  failed: z.number(),
  pass_rate: z.number(),
  total_prompt_tokens: z.number(),
  total_completion_tokens: z.number(),
  run_dir: z.string(),
});

export function parseHistoryJsonl(content: string): BenchmarkMetricRecord[] {
  const lines = content.split("\n").filter((line) => line.trim().length > 0);
  const records: BenchmarkMetricRecord[] = [];

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      const validated = metricRecordSchema.parse(parsed);
      records.push(validated);
    } catch {
      // Ignore invalid or corrupted lines
    }
  }

  return records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export function generateHistoryHtml(records: BenchmarkMetricRecord[]): string {
  const totalRuns = records.length;
  const latestRun = records[0];
  const latestPassRate = latestRun ? `${(latestRun.pass_rate * 100).toFixed(1)}%` : "N/A";
  const latestDate = latestRun ? latestRun.timestamp.slice(0, 10) : "N/A";

  const rowsHtml = records
    .map((r) => {
      const passPercentage = (r.pass_rate * 100).toFixed(1);
      let badgeClass = "badge-pass";
      if (r.pass_rate < 0.8) {
        badgeClass = "badge-fail";
      } else if (r.pass_rate < 0.95) {
        badgeClass = "badge-warn";
      }

      return `        <tr>
          <td>${r.timestamp.replace("T", " ").slice(0, 16)} UTC</td>
          <td><code>${r.commit_sha}</code></td>
          <td><span class="badge ${badgeClass}">${passPercentage}%</span></td>
          <td>${r.passed} / ${r.total_tests}</td>
          <td>${r.total_prompt_tokens.toLocaleString()} / ${r.total_completion_tokens.toLocaleString()}</td>
          <td class="links">
            <a href="${r.run_dir}/index.html">Report</a>
            <a href="${r.run_dir}/results.json">JSON</a>
          </td>
        </tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Chezmoi skills LLM benchmark evaluation history dashboard">
  <title>Benchmark history</title>
  <style>
    :root {
      --bg-color: #0f172a;
      --card-bg: #1e293b;
      --border-color: #334155;
      --text-color: #f8fafc;
      --text-muted: #94a3b8;
      --primary-color: #38bdf8;
      --pass-bg: #064e3b;
      --pass-text: #34d399;
      --warn-bg: #78350f;
      --warn-text: #fbbf24;
      --fail-bg: #7f1d1d;
      --fail-text: #f87171;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background-color: var(--bg-color);
      color: var(--text-color);
      line-height: 1.5;
      padding: 2rem;
    }

    .container {
      max-width: 1100px;
      margin: 0 auto;
    }

    header {
      margin-bottom: 2rem;
    }

    h1 {
      font-size: 1.875rem;
      font-weight: 700;
      color: var(--text-color);
      margin-bottom: 0.5rem;
    }

    p.subtitle {
      color: var(--text-muted);
      font-size: 0.95rem;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }

    .stat-card {
      background-color: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 0.5rem;
      padding: 1.25rem;
    }

    .stat-label {
      font-size: 0.875rem;
      color: var(--text-muted);
      margin-bottom: 0.25rem;
    }

    .stat-value {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--primary-color);
    }

    .table-container {
      background-color: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 0.5rem;
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.9rem;
    }

    th, td {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--border-color);
    }

    th {
      background-color: rgba(0, 0, 0, 0.2);
      color: var(--text-muted);
      font-weight: 600;
      text-transform: uppercase;
      font-size: 0.75rem;
      letter-spacing: 0.05em;
    }

    tr:last-child td {
      border-bottom: none;
    }

    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.85rem;
      background-color: rgba(0, 0, 0, 0.3);
      padding: 0.15rem 0.4rem;
      border-radius: 0.25rem;
    }

    .badge {
      display: inline-block;
      padding: 0.2rem 0.5rem;
      border-radius: 0.25rem;
      font-size: 0.8rem;
      font-weight: 600;
    }

    .badge-pass {
      background-color: var(--pass-bg);
      color: var(--pass-text);
    }

    .badge-warn {
      background-color: var(--warn-bg);
      color: var(--warn-text);
    }

    .badge-fail {
      background-color: var(--fail-bg);
      color: var(--fail-text);
    }

    .links a {
      color: var(--primary-color);
      text-decoration: none;
      margin-right: 0.75rem;
    }

    .links a:hover {
      text-decoration: underline;
    }

    .empty-state {
      padding: 3rem;
      text-align: center;
      color: var(--text-muted);
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Benchmark history</h1>
      <p class="subtitle">Historical record of LLM evaluation runs for chezmoi-skills</p>
    </header>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total runs</div>
        <div class="stat-value">${totalRuns}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Latest pass rate</div>
        <div class="stat-value">${latestPassRate}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Latest run date</div>
        <div class="stat-value">${latestDate}</div>
      </div>
    </div>

    <div class="table-container">
      ${
        records.length === 0
          ? '<div class="empty-state">No benchmark records found.</div>'
          : `<table>
        <thead>
          <tr>
            <th>Date & time</th>
            <th>Commit</th>
            <th>Pass rate</th>
            <th>Passed / total</th>
            <th>Prompt / completion tokens</th>
            <th>Artifacts</th>
          </tr>
        </thead>
        <tbody>
${rowsHtml}
        </tbody>
      </table>`
      }
    </div>
  </div>
</body>
</html>`;
}

export function generateHistoryIndex(targetDir: string, outputFile?: string): string {
  const historyPath = join(targetDir, "history.jsonl");
  const outputPath = outputFile || join(targetDir, "index.html");

  let records: BenchmarkMetricRecord[] = [];
  if (existsSync(historyPath)) {
    const content = readFileSync(historyPath, "utf-8");
    records = parseHistoryJsonl(content);
  }

  const html = generateHistoryHtml(records);
  writeFileSync(outputPath, html, "utf-8");
  return outputPath;
}

if (import.meta.main) {
  const program = new Command();
  program
    .option("--target-dir <path>", "Directory containing history.jsonl and runs/", ".")
    .option("--output-file <path>", "Path to write output HTML file")
    .parse(process.argv);

  const opts = program.opts();

  try {
    const outputPath = generateHistoryIndex(opts.targetDir, opts.outputFile);
    console.log(`Generated history index HTML at ${outputPath}`);
  } catch (error) {
    console.error(`Error generating history index: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
