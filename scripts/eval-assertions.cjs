const markdownCandidates = (output) => {
  const text = String(output);
  const inlineCode = [...text.matchAll(/`([^`\n]+)`/g)].map((match) => match[1]);
  const lines = text.split(/\r?\n/).map((line) =>
    line
      .replace(/^\s*```[^\s]*\s*$/, "")
      .replace(/^\s*(?:[-*+] |\d+[.)] )/, "")
      .trim()
  );
  return [text.trim(), ...inlineCode, ...lines].filter(Boolean);
};

exports.commandMatches = (output, context) => {
  const pattern = context.config?.pattern;
  if (typeof pattern !== "string") return false;

  const matcher = new RegExp(pattern);
  return markdownCandidates(output).some((candidate) => matcher.test(candidate));
};

exports.routerMatches = (output, context) => {
  try {
    const text = String(output).trim();
    const fenced = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
    const actual = JSON.parse(fenced ? fenced[1].trim() : text);
    return (
      actual !== null &&
      !Array.isArray(actual) &&
      actual.trigger === context.config?.trigger &&
      actual.selected_skill === context.config?.selectedSkill
    );
  } catch {
    return false;
  }
};
