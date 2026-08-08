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

export function generateSvgChart(records: BenchmarkMetricRecord[]): string {
  if (records.length === 0) {
    return "";
  }

  // Reverse so chronological order goes left to right
  const points = [...records].reverse();
  const width = 800;
  const height = 180;
  const marginTop = 20;
  const marginBottom = 30;
  const marginLeft = 45;
  const marginRight = 25;

  const chartWidth = width - marginLeft - marginRight;
  const chartHeight = height - marginTop - marginBottom;

  const getX = (index: number) => {
    if (points.length === 1) return marginLeft + chartWidth / 2;
    return marginLeft + (index / (points.length - 1)) * chartWidth;
  };

  const getY = (rate: number) => {
    return marginTop + chartHeight - rate * chartHeight;
  };

  const gridYValues = [1.0, 0.8, 0.5, 0.0];
  const gridLinesHtml = gridYValues
    .map((val) => {
      const y = getY(val);
      const percentLabel = `${Math.round(val * 100)}%`;
      return `<line x1="${marginLeft}" y1="${y}" x2="${width - marginRight}" y2="${y}" stroke="#334155" stroke-dasharray="3,3" stroke-width="1" />
      <text x="${marginLeft - 8}" y="${y + 4}" fill="#94a3b8" font-size="11" text-anchor="end">${percentLabel}</text>`;
    })
    .join("\n");

  const svgPoints = points.map((p, i) => `${getX(i).toFixed(1)},${getY(p.pass_rate).toFixed(1)}`).join(" ");

  const pointsHtml = points
    .map((p, i) => {
      const cx = getX(i).toFixed(1);
      const cy = getY(p.pass_rate).toFixed(1);
      let fillColor = "#34d399";
      if (p.pass_rate < 0.8) {
        fillColor = "#f87171";
      } else if (p.pass_rate < 0.95) {
        fillColor = "#fbbf24";
      }
      const label = `${p.timestamp.slice(0, 10)} (${p.commit_sha}): ${(p.pass_rate * 100).toFixed(1)}%`;
      return `<circle cx="${cx}" cy="${cy}" r="4" fill="${fillColor}" stroke="#0f172a" stroke-width="2">
        <title>${label}</title>
      </circle>`;
    })
    .join("\n");

  return `<div class="chart-container">
    <div class="chart-title">Pass rate trend over time</div>
    <svg viewBox="0 0 ${width} ${height}" class="trend-chart">
      ${gridLinesHtml}
      ${points.length > 1 ? `<polyline fill="none" stroke="#38bdf8" stroke-width="2" points="${svgPoints}" />` : ""}
      ${pointsHtml}
    </svg>
  </div>`;
}

export function generateHistoryHtml(records: BenchmarkMetricRecord[]): string {
  const totalRuns = records.length;
  const latestRun = records[0];
  const previousRun = records[1];

  const latestPassRateVal = latestRun ? latestRun.pass_rate : 0;
  const latestPassRate = latestRun ? `${(latestRun.pass_rate * 100).toFixed(1)}%` : "N/A";
  const latestDate = latestRun ? latestRun.timestamp.slice(0, 10) : "N/A";

  let deltaHtml = "";
  if (latestRun && previousRun) {
    const diff = (latestRun.pass_rate - previousRun.pass_rate) * 100;
    if (diff > 0) {
      deltaHtml = ` <span class="trend-up">+${diff.toFixed(1)}%</span>`;
    } else if (diff < 0) {
      deltaHtml = ` <span class="trend-down">${diff.toFixed(1)}%</span>`;
    } else {
      deltaHtml = ` <span class="trend-neutral">0.0%</span>`;
    }
  }

  const avgPassRateVal =
    totalRuns > 0 ? (records.reduce((acc, r) => acc + r.pass_rate, 0) / totalRuns) * 100 : 0;
  const avgPassRate = totalRuns > 0 ? `${avgPassRateVal.toFixed(1)}%` : "N/A";

  const totalTokens = records.reduce(
    (acc, r) => acc + r.total_prompt_tokens + r.total_completion_tokens,
    0
  );

  const svgChartHtml = generateSvgChart(records);

  const rowsHtml = records
    .map((r, index) => {
      const passPercentage = (r.pass_rate * 100).toFixed(1);
      let badgeClass = "badge-pass";
      if (r.pass_rate < 0.8) {
        badgeClass = "badge-fail";
      } else if (r.pass_rate < 0.95) {
        badgeClass = "badge-warn";
      }

      const nextOlderRun = records[index + 1];
      let rowDelta = "";
      if (nextOlderRun) {
        const diff = (r.pass_rate - nextOlderRun.pass_rate) * 100;
        if (diff > 0) {
          rowDelta = `<span class="trend-up">+${diff.toFixed(1)}%</span>`;
        } else if (diff < 0) {
          rowDelta = `<span class="trend-down">${diff.toFixed(1)}%</span>`;
        } else {
          rowDelta = `<span class="trend-neutral">=</span>`;
        }
      } else {
        rowDelta = `<span class="text-muted">-</span>`;
      }

      return `        <tr>
          <td>${r.timestamp.replace("T", " ").slice(0, 16)} UTC</td>
          <td><code>${r.commit_sha}</code></td>
          <td><span class="badge ${badgeClass}">${passPercentage}%</span> ${rowDelta}</td>
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

    .chart-container {
      background-color: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 0.5rem;
      padding: 1.25rem;
      margin-bottom: 2rem;
    }

    .chart-title {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--text-muted);
      margin-bottom: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .trend-chart {
      width: 100%;
      height: auto;
      display: block;
    }

    .trend-up {
      color: var(--pass-text);
      font-size: 0.85rem;
      font-weight: 600;
    }

    .trend-down {
      color: var(--fail-text);
      font-size: 0.85rem;
      font-weight: 600;
    }

    .trend-neutral {
      color: var(--text-muted);
      font-size: 0.85rem;
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

    .text-muted {
      color: var(--text-muted);
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
        <div class="stat-value">${latestPassRate}${deltaHtml}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Average pass rate</div>
        <div class="stat-value">${avgPassRate}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total tokens evaluated</div>
        <div class="stat-value">${totalTokens.toLocaleString()}</div>
      </div>
    </div>

    ${svgChartHtml}

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
