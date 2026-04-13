import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import semver from "semver";

const baseBranch = process.argv.includes("--base") ? process.argv[process.argv.indexOf("--base") + 1] : "origin/main";
const bumpType = process.argv.includes("--major") ? "major" : process.argv.includes("--minor") ? "minor" : "patch";

try {
  // Get tracked modifications vs base branch
  let diffStdout = "";
  try {
    diffStdout = execSync(`git diff --name-only ${baseBranch}...HEAD`).toString();
  } catch {
    diffStdout = execSync(`git diff --name-only`).toString();
  }

  // Get untracked files
  const untrackedStdout = execSync(`git ls-files --others --exclude-standard`).toString();

  const allFiles = [...diffStdout.split('\n'), ...untrackedStdout.split('\n')];
  const hasSkillChanges = allFiles.some(f => f.startsWith('skills/'));

  if (!hasSkillChanges) {
    console.log("No changes in skills/ detected. Skipping version bump.");
    process.exit(0);
  }

  // Update plugin.json
  const pluginPath = ".claude-plugin/plugin.json";
  const pluginData = JSON.parse(readFileSync(pluginPath, "utf-8"));
  const newVersion = semver.inc(pluginData.version, bumpType as semver.ReleaseType);
  if (!newVersion) throw new Error("Failed to increment version");

  pluginData.version = newVersion;
  writeFileSync(pluginPath, JSON.stringify(pluginData, null, 2) + "\n");
  console.log(`Updated ${pluginPath} to ${newVersion}`);

  // Update marketplace.json
  const marketPath = ".claude-plugin/marketplace.json";
  const marketData = JSON.parse(readFileSync(marketPath, "utf-8"));
  if (marketData.plugins?.[0]) {
    marketData.plugins[0].version = newVersion;
    writeFileSync(marketPath, JSON.stringify(marketData, null, 2) + "\n");
    console.log(`Updated ${marketPath} to ${newVersion}`);
  }
} catch (error) {
  console.error("Failed to update version:", error);
  process.exit(1);
}
