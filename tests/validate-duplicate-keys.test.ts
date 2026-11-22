import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  findJsonDuplicateKeys,
  findYamlDuplicateKeys,
  listConfigFiles,
  validateDuplicateKeys,
} from "../scripts/skills/validate/duplicate-keys";

const temporaryDirectories: string[] = [];

const createTempRoot = () => {
  const root = mkdtempSync(join(tmpdir(), "chezmoi-skills-dupe-keys-"));
  temporaryDirectories.push(root);
  return root;
};

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const dir = temporaryDirectories.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("findJsonDuplicateKeys", () => {
  it("detects top-level and nested duplicate keys in JSON", () => {
    const errors = findJsonDuplicateKeys(
      '{\n  "a": 1,\n  "nested": {\n    "x": true,\n    "x": false\n  },\n  "a": 2\n}\n',
    );
    expect(errors).toEqual([
      'Duplicate key "x" at line 5',
      'Duplicate key "a" at line 7',
    ]);
  });

  it("allows identical keys in separate objects and array items", () => {
    const errors = findJsonDuplicateKeys(
      '{"items": [{"id": 1}, {"id": 2}], "other": {"id": 3}}',
    );
    expect(errors).toEqual([]);
  });

  it("handles JSONC comments and trailing commas without false positives", () => {
    const errors = findJsonDuplicateKeys(
      [
        "{",
        '  // "a": 1,',
        '  /* "a": 2, */',
        '  "a": "https://example.com:8080",',
        '  "b": "value with \\"quote\\": 1",',
        "}",
      ].join("\n"),
    );
    expect(errors).toEqual([]);
  });

  it("detects duplicate keys in JSONC", () => {
    const errors = findJsonDuplicateKeys(
      '{\n  // comment\n  "a": 1,\n  "a": 2,\n}\n',
    );
    expect(errors).toEqual(['Duplicate key "a" at line 4']);
  });
});

describe("findYamlDuplicateKeys", () => {
  it("detects duplicate keys in block and flow mappings", () => {
    const blockErrors = findYamlDuplicateKeys("a: 1\na: 2\n");
    expect(blockErrors.length).toBe(1);
    expect(blockErrors[0]).toContain("Map keys must be unique");

    const flowErrors = findYamlDuplicateKeys("obj: { a: 1, a: 2 }\n");
    expect(flowErrors.length).toBe(1);
    expect(flowErrors[0]).toContain("Map keys must be unique");
  });

  it("ignores key-like lines inside block scalars", () => {
    const errors = findYamlDuplicateKeys(
      "steps:\n  - run: |\n      a: 1\n      a: 2\n",
    );
    expect(errors).toEqual([]);
  });
});

describe("validateDuplicateKeys", () => {
  it("discovers .github/workflows/*.yml and .sbx/*.yaml via bun fmt", () => {
    const files = listConfigFiles(".");
    expect(files).toContain(".github/workflows/ci.yml");
    expect(files).toContain(".sbx/sbxenv.yaml");
    expect(files).toContain(".markdownlint-cli2.jsonc");
    expect(files).toContain("package.json");
  });

  it("reports duplicate keys across JSON, JSONC, and YAML files", async () => {
    const root = createTempRoot();
    mkdirSync(join(root, ".github", "workflows"), { recursive: true });
    mkdirSync(join(root, ".sbx"), { recursive: true });

    writeFileSync(join(root, "config.jsonc"), '{\n  "k": 1,\n  "k": 2,\n}\n');
    writeFileSync(
      join(root, ".github", "workflows", "ci.yml"),
      "name: CI\nname: Duplicate\n",
    );
    writeFileSync(join(root, ".sbx", "sbxenv.yaml"), "name: ok\n");

    const results = await validateDuplicateKeys(root);
    expect(results).toHaveLength(1);
    const result = results[0];
    expect(result?.valid).toBe(false);
    if (result && !result.valid) {
      expect(String(result.details)).toContain("config.jsonc:");
      expect(String(result.details)).toContain(".github/workflows/ci.yml:");
    }
  });

  it("passes when all config files have unique keys", async () => {
    const root = createTempRoot();
    writeFileSync(join(root, "a.json"), '{"x": 1}\n');
    writeFileSync(join(root, "b.yaml"), "y: 2\n");

    const results = await validateDuplicateKeys(root);
    expect(results).toEqual([
      { valid: true, name: "duplicate keys (2 files)" },
    ]);
  });
});
