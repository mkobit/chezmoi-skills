import { execSync } from "child_process";
import { readFileSync } from "fs";
import semver from "semver";

const baseBranch = process.env.BASE_BRANCH || "origin/main";
const pluginPath = ".claude-plugin/plugin.json";

try {
  // Check if any files in skills/ were modified
  const diffStdout = execSync(`git diff --name-only ${baseBranch}...HEAD`).toString();
  const hasSkillChanges = diffStdout.split('\n').some(f => f.startsWith('skills/'));

  if (!hasSkillChanges) {
    console.log("✅ No changes in skills/ detected. Version bump check passed.");
    process.exit(0);
  }

  // Get current version
  const currentData = JSON.parse(readFileSync(pluginPath, "utf-8"));
  const currentVersion = currentData.version;

  // Get base version
  const baseContent = execSync(`git show ${baseBranch}:${pluginPath}`).toString();
  const baseVersion = JSON.parse(baseContent).version;

  if (semver.gt(currentVersion, baseVersion)) {
    console.log(`✅ Plugin version bumped correctly: ${baseVersion} -> ${currentVersion}`);
  } else {
    console.error(`❌ Plugin version must be bumped due to changes in skills/!`);
    console.error(`Base version: ${baseVersion}`);
    console.error(`Current version: ${currentVersion}`);
    console.error(`Please run \`bun run versionUpdate\` to update it.`);
    process.exit(1);
  }
} catch (error) {
  console.error("Failed to check version bump:", error);
  process.exit(1);
}
