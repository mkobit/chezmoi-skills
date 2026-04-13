import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import semver from "semver";
import { Command, Option } from "commander";

const program = new Command();

program
  .name("versionUpdate")
  .description("Automatically update versions of modified plugins")
  .addOption(new Option("--major", "Bump major version").conflicts(["minor", "patch"]))
  .addOption(new Option("--minor", "Bump minor version").conflicts(["major", "patch"]))
  .addOption(new Option("--patch", "Bump patch version").conflicts(["major", "minor"]))
  .option("--base <branch>", "Base branch to compare against", "main")
  .parse(process.argv);

const options = program.opts();
const bumpType: semver.ReleaseType = options.major
  ? "major"
  : options.minor
  ? "minor"
  : "patch";
const baseBranch = options.base;

const getDiffStdout = (): string => {
  try {
    return execSync(`git diff --name-only origin/${baseBranch}...HEAD`).toString();
  } catch {
    return execSync(`git diff --name-only`).toString();
  }
};

try {
  const diffStdout = getDiffStdout();
  const untrackedStdout = execSync(`git ls-files --others --exclude-standard`).toString();

  const allFiles = [...diffStdout.split('\n'), ...untrackedStdout.split('\n')];
  const hasSkillChanges = allFiles.some(f => f.startsWith('skills/'));

  if (!hasSkillChanges) {
    console.log("No changes in skills/ detected. Skipping version bump.");
    process.exit(0);
  }

  const pluginPath = ".claude-plugin/plugin.json";
  const pluginData = JSON.parse(readFileSync(pluginPath, "utf-8"));
  const newVersion = semver.inc(pluginData.version, bumpType);
  if (!newVersion) throw new Error("Failed to increment version");

  pluginData.version = newVersion;
  writeFileSync(pluginPath, JSON.stringify(pluginData, null, 2) + "\n");
  console.log(`Updated ${pluginPath} to ${newVersion}`);

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
