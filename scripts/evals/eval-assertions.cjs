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
    if (actual === null || Array.isArray(actual) || actual.trigger !== context.config?.trigger) return false;
    if (typeof actual.needs_clarification !== "boolean") return false;
    if (context.config?.trigger === false) {
      return actual.selected_skill === null && actual.needs_clarification === false;
    }

    const selectedSkills = context.config?.selectedSkills ??
      (context.config?.selectedSkill === undefined ? [] : [context.config.selectedSkill]);
    const isClarification = actual.needs_clarification === true && actual.selected_skill === null;
    if (context.config?.allowClarification === true && isClarification) return true;

    return actual.needs_clarification === false && selectedSkills.includes(actual.selected_skill);
  } catch {
    return false;
  }
};

exports.answerQualityMatches = (output, context) => {
  const text = String(output).toLowerCase();
  const config = context.config ?? {};
  const includesAll = (phrases) => phrases.every((phrase) => text.includes(String(phrase).toLowerCase()));
  const includesNone = (phrases) => phrases.every((phrase) => !text.includes(String(phrase).toLowerCase()));

  if (!includesAll(config.requiredConcepts ?? [])) return false;
  if (!includesNone(config.forbiddenClaims ?? [])) return false;
  if (!includesAll(config.safetyExpectations ?? [])) return false;
  if (config.clarification === "required" && !text.includes("?")) return false;
  if (config.clarification === "forbidden" && text.includes("?")) return false;
  return true;
};
