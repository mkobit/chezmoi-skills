export const checkSingleSentencePerLine = (content: string): string[] => {
  const lines = content.split("\n");
  const errors: string[] = [];

  let inFrontmatter = false;
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (i === 0 && trimmed === "---") {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      if (trimmed === "---") {
        inFrontmatter = false;
      }
      continue;
    }

    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) {
      continue;
    }

    if (!trimmed) {
      continue;
    }

    const snippets = trimmed.includes("|")
      ? trimmed.split("|").map((cell) => cell.trim()).filter(Boolean)
      : [trimmed];

    for (const snippet of snippets) {
      let clean = snippet
        .replace(/^#+\s*/, "")
        .replace(/^>\s*/, "")
        .replace(/^[-*+]\s+/, "")
        .replace(/^\d+\.\s+/, "");

      clean = clean.replace(/`[^`]+`/g, " ");
      clean = clean.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
      clean = clean.replace(/https?:\/\/\S+/g, " ");
      clean = clean.replace(/\b(e\.g\.|i\.e\.|etc\.|vs\.|v\d+(\.\d+)*|no\.|dr\.|mr\.|ms\.|inc\.|corp\.|ltd\.|st\.|fig\.|approx\.|dept\.)/gi, " ");
      clean = clean.replace(/\d+\.\d+/g, " ");
      clean = clean.replace(/\.\.\./g, " ").replace(/\.\./g, " ");

      if (/[.!?][)'"\]`]*\s+\S/.test(clean)) {
        errors.push(`Line ${i + 1}: Multiple sentences found on a single line: "${line}"`);
        break;
      }
    }
  }

  return errors;
};
