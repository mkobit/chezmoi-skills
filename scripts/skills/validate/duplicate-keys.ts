import { readFile } from "fs/promises";
import { join } from "path";
import { parseAllDocuments } from "yaml";
import type { ValidationResult } from "./types";

const CONFIG_FILE_PATTERN = /\.(json|jsonc|ya?ml)$/i;

const skipWhitespaceAndComments = (
  content: string,
  startIndex: number,
  startLine: number,
): { index: number; line: number } => {
  let index = startIndex;
  let line = startLine;

  while (index < content.length) {
    const ch = content[index];
    if (ch === "\n") {
      line++;
      index++;
    } else if (ch === " " || ch === "\t" || ch === "\r") {
      index++;
    } else if (ch === "/" && content[index + 1] === "/") {
      index += 2;
      while (index < content.length && content[index] !== "\n") {
        index++;
      }
    } else if (ch === "/" && content[index + 1] === "*") {
      index += 2;
      while (
        index < content.length &&
        !(content[index] === "*" && content[index + 1] === "/")
      ) {
        if (content[index] === "\n") {
          line++;
        }
        index++;
      }
      index += 2;
    } else {
      break;
    }
  }

  return { index, line };
};

export const findJsonDuplicateKeys = (content: string): string[] => {
  try {
    Bun.JSONC.parse(content);
  } catch (error) {
    return [`Invalid JSON/JSONC: ${String(error)}`];
  }

  const errors: string[] = [];
  const containers: Array<Set<string> | null> = [];
  let index = 0;
  let line = 1;

  while (index < content.length) {
    ({ index, line } = skipWhitespaceAndComments(content, index, line));
    if (index >= content.length) {
      break;
    }

    const ch = content[index];
    if (ch === "{") {
      containers.push(new Set<string>());
      index++;
    } else if (ch === "[") {
      containers.push(null);
      index++;
    } else if (ch === "}" || ch === "]") {
      containers.pop();
      index++;
    } else if (ch === '"') {
      const tokenStart = index;
      const tokenLine = line;
      index++;
      while (index < content.length) {
        const inner = content[index];
        if (inner === "\\") {
          index += 2;
          continue;
        }
        if (inner === '"') {
          index++;
          break;
        }
        if (inner === "\n") {
          line++;
        }
        index++;
      }

      const currentContainer = containers[containers.length - 1];
      if (currentContainer) {
        const after = skipWhitespaceAndComments(content, index, line);
        if (content[after.index] === ":") {
          const rawToken = content.slice(tokenStart, index);
          const key = JSON.parse(rawToken) as string;
          if (currentContainer.has(key)) {
            errors.push(`Duplicate key "${key}" at line ${tokenLine}`);
          } else {
            currentContainer.add(key);
          }
        }
      }
    } else {
      index++;
    }
  }

  return errors;
};

export const findYamlDuplicateKeys = (content: string): string[] => {
  const docs = parseAllDocuments(content);
  const errors: string[] = [];
  for (const doc of docs) {
    for (const err of doc.errors) {
      errors.push(err.message.trim());
    }
  }
  return errors;
};

export const listConfigFiles = (rootDir: string = "."): string[] => {
  const result = Bun.spawnSync(["bun", "fmt", "--no-script", "--list-files"], {
    cwd: rootDir,
    stdout: "pipe",
    stderr: "pipe",
  });

  if (result.exitCode !== 0) {
    const stderr = result.stderr.toString().trim();
    throw new Error(`bun fmt --list-files failed: ${stderr}`);
  }

  return result.stdout
    .toString()
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && CONFIG_FILE_PATTERN.test(line));
};

export const validateDuplicateKeys = async (
  rootDir: string = ".",
): Promise<ValidationResult[]> => {
  try {
    const files = listConfigFiles(rootDir);
    const failures: string[] = [];

    for (const file of files) {
      const content = await readFile(join(rootDir, file), "utf-8");
      const errors = /\.ya?ml$/i.test(file)
        ? findYamlDuplicateKeys(content)
        : findJsonDuplicateKeys(content);

      for (const error of errors) {
        failures.push(`${file}: ${error}`);
      }
    }

    if (failures.length > 0) {
      return [
        {
          valid: false,
          name: `duplicate keys (${files.length} files)`,
          details: failures.join("\n"),
        },
      ];
    }

    return [
      {
        valid: true,
        name: `duplicate keys (${files.length} files)`,
      },
    ];
  } catch (error) {
    return [
      {
        valid: false,
        name: "duplicate keys",
        details: String(error),
      },
    ];
  }
};
