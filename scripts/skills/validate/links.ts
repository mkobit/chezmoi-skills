import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";

export const toSlug = (heading: string): string => {
  return heading
    .trim()
    .replace(/^#+\s*/, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
};

export const extractHeadings = (fileContent: string): Set<string> => {
  const lines = fileContent.split("\n");
  const slugs = new Set<string>();
  let inCodeBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    if (trimmed.startsWith("#")) {
      slugs.add(toSlug(trimmed));
    }
  }
  return slugs;
};

export const checkInternalLinks = (content: string, filePath: string): string[] => {
  const lines = content.split("\n");
  const errors: string[] = [];

  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) {
      continue;
    }

    const linkRegex = /\[(?:[^\]]|\\\])*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
    let match: RegExpExecArray | null;

    while ((match = linkRegex.exec(line)) !== null) {
      const rawTarget = match[1];
      if (
        rawTarget.startsWith("http://") ||
        rawTarget.startsWith("https://") ||
        rawTarget.startsWith("mailto:") ||
        rawTarget.startsWith("ftp://")
      ) {
        continue;
      }

      const parts = rawTarget.split("#");
      const targetPathWithoutAnchor = parts[0];
      const anchor = parts[1];

      let targetFilePath = filePath;
      if (targetPathWithoutAnchor) {
        targetFilePath = join(dirname(filePath), targetPathWithoutAnchor);
        if (!existsSync(targetFilePath)) {
          errors.push(`Line ${i + 1}: Referenced link target "${rawTarget}" does not exist (${targetFilePath})`);
          continue;
        }
      }

      if (anchor) {
        const targetContent = targetFilePath === filePath ? content : readFileSync(targetFilePath, "utf-8");
        const slugs = extractHeadings(targetContent);
        if (!slugs.has(anchor.toLowerCase())) {
          errors.push(`Line ${i + 1}: Referenced anchor "#${anchor}" not found in target file (${targetFilePath})`);
        }
      }
    }
  }

  return errors;
};
