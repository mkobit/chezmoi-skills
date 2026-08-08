import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { extractMetrics, recordMetrics } from "../scripts/record-benchmark-metrics";
import { parseHistoryJsonl, generateHistoryHtml, generateHistoryIndex } from "../scripts/generate-history-index";

describe("record-benchmark-metrics", () => {
  it("extracts metrics from benchmark_run structure", () => {
    const jsonContent = JSON.stringify({
      benchmark_run: {
        timestamp: "2026-08-07T04:59:09.459Z",
        metrics: {
          total_tests: 10,
          passed: 9,
          failed: 1,
          pass_rate: 0.9,
          total_prompt_tokens: 1500,
          total_completion_tokens: 200,
        },
      },
    });

    const record = extractMetrics(jsonContent, "abcdef123456");
    expect(record.timestamp).toBe("2026-08-07T04:59:09.459Z");
    expect(record.commit_sha).toBe("abcdef1");
    expect(record.total_tests).toBe(10);
    expect(record.passed).toBe(9);
    expect(record.failed).toBe(1);
    expect(record.pass_rate).toBe(0.9);
    expect(record.total_prompt_tokens).toBe(1500);
    expect(record.total_completion_tokens).toBe(200);
    expect(record.run_dir).toBe("runs/2026-08-07_abcdef1");
  });

  it("calculates metrics from results array fallback", () => {
    const jsonContent = JSON.stringify({
      results: [
        { status: "PASS", tokens: { prompt_tokens: 100, completion_tokens: 10 } },
        { status: "FAIL", tokens: { prompt_tokens: 200, completion_tokens: 20 } },
        { status: "PASS", tokens: { prompt_tokens: 150, completion_tokens: 15 } },
      ],
    });

    const record = extractMetrics(jsonContent, "123456789", "2026-08-07T12:00:00.000Z");
    expect(record.timestamp).toBe("2026-08-07T12:00:00.000Z");
    expect(record.commit_sha).toBe("1234567");
    expect(record.total_tests).toBe(3);
    expect(record.passed).toBe(2);
    expect(record.failed).toBe(1);
    expect(record.pass_rate).toBe(0.6667);
    expect(record.total_prompt_tokens).toBe(450);
    expect(record.total_completion_tokens).toBe(45);
    expect(record.run_dir).toBe("runs/2026-08-07_1234567");
  });

  it("records metrics and copies run files to target directory", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "benchmark-test-"));
    const resultsFile = join(tempDir, "source_results.json");
    const htmlFile = join(tempDir, "source_index.html");
    const dbFile = join(tempDir, "source_promptfoo.db");

    const jsonContent = JSON.stringify({
      benchmark_run: {
        timestamp: "2026-08-07T10:00:00.000Z",
        metrics: {
          total_tests: 5,
          passed: 5,
          failed: 0,
          pass_rate: 1.0,
          total_prompt_tokens: 500,
          total_completion_tokens: 50,
        },
      },
    });

    writeFileSync(resultsFile, jsonContent);
    writeFileSync(htmlFile, "<html>Report</html>");
    writeFileSync(dbFile, "DB binary content");

    const record = recordMetrics({
      resultsFile,
      htmlFile,
      dbFile,
      targetDir: tempDir,
      commitSha: "fedcba987",
    });

    expect(record.run_dir).toBe("runs/2026-08-07_fedcba9");
    expect(existsSync(join(tempDir, "runs/2026-08-07_fedcba9", "results.json"))).toBe(true);
    expect(existsSync(join(tempDir, "runs/2026-08-07_fedcba9", "index.html"))).toBe(true);
    expect(existsSync(join(tempDir, "runs/2026-08-07_fedcba9", "promptfoo.db"))).toBe(true);

    const historyContent = readFileSync(join(tempDir, "history.jsonl"), "utf-8");
    expect(historyContent).toContain('"commit_sha":"fedcba9"');
  });
});

describe("generate-history-index", () => {
  it("parses history jsonl lines and sorts chronologically", () => {
    const jsonl = [
      JSON.stringify({
        timestamp: "2026-08-06T10:00:00.000Z",
        commit_sha: "sha1111",
        total_tests: 10,
        passed: 8,
        failed: 2,
        pass_rate: 0.8,
        total_prompt_tokens: 1000,
        total_completion_tokens: 100,
        run_dir: "runs/2026-08-06_sha1111",
      }),
      JSON.stringify({
        timestamp: "2026-08-07T10:00:00.000Z",
        commit_sha: "sha2222",
        total_tests: 10,
        passed: 10,
        failed: 0,
        pass_rate: 1.0,
        total_prompt_tokens: 1200,
        total_completion_tokens: 120,
        run_dir: "runs/2026-08-07_sha2222",
      }),
    ].join("\n");

    const records = parseHistoryJsonl(jsonl);
    expect(records).toHaveLength(2);
    expect(records[0].commit_sha).toBe("sha2222");
    expect(records[1].commit_sha).toBe("sha1111");
  });

  it("generates history html index containing summary metrics and run links", () => {
    const records = [
      {
        timestamp: "2026-08-07T10:00:00.000Z",
        commit_sha: "sha2222",
        total_tests: 10,
        passed: 10,
        failed: 0,
        pass_rate: 1.0,
        total_prompt_tokens: 1200,
        total_completion_tokens: 120,
        run_dir: "runs/2026-08-07_sha2222",
      },
    ];

    const html = generateHistoryHtml(records);
    expect(html).toContain("Benchmark history");
    expect(html).toContain("<code>sha2222</code>");
    expect(html).toContain("100.0%");
    expect(html).toContain("runs/2026-08-07_sha2222/index.html");
  });

  it("creates index.html file from target directory history", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "history-test-"));
    const jsonlPath = join(tempDir, "history.jsonl");

    writeFileSync(
      jsonlPath,
      JSON.stringify({
        timestamp: "2026-08-07T10:00:00.000Z",
        commit_sha: "sha3333",
        total_tests: 5,
        passed: 4,
        failed: 1,
        pass_rate: 0.8,
        total_prompt_tokens: 500,
        total_completion_tokens: 50,
        run_dir: "runs/2026-08-07_sha3333",
      }) + "\n"
    );

    const outputPath = generateHistoryIndex(tempDir);
    expect(existsSync(outputPath)).toBe(true);

    const content = readFileSync(outputPath, "utf-8");
    expect(content).toContain("sha3333");
  });
});
