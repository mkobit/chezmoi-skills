import { createHash } from "crypto";
import { readFileSync, readdirSync } from "fs";
import { join, relative } from "path";

export const sha256 = (content: string | Uint8Array): string =>
  createHash("sha256").update(content).digest("hex");

export const fileSha256 = (path: string): string => sha256(readFileSync(path));

export const listedFiles = (directory: string, suffix: string): string[] =>
  readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => join(directory, entry.name))
    .sort();

export const listedFilesRecursive = (
  directory: string,
  suffix: string,
): string[] =>
  readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory()
        ? listedFilesRecursive(path, suffix)
        : entry.isFile() && entry.name.endsWith(suffix)
          ? [path]
          : [];
    })
    .sort();

export const corpusHash = (files: string[], rootDir: string): string => {
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(relative(rootDir, file));
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
};
