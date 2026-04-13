import { exec } from "child_process";
import { promisify } from "util";
import { readFile } from "fs/promises";
import matter from "gray-matter";
import semver from "semver";

const execAsync = promisify(exec);

const baseBranch = process.env.BASE_BRANCH || "origin/main";

async function getSkillFilesStatus(): Promise<{ newFiles: string[]; modifiedFiles: string[] }> {
  try {
    // Files added
    const { stdout: addedStdout } = await execAsync(`git diff --name-only --diff-filter=A ${baseBranch}...HEAD`);
    const newFiles = addedStdout.split("\n").filter((file) => file.startsWith("skills/") && file.endsWith("SKILL.md"));

    // Files modified
    const { stdout: modifiedStdout } = await execAsync(`git diff --name-only --diff-filter=M ${baseBranch}...HEAD`);
    const modifiedFiles = modifiedStdout.split("\n").filter((file) => file.startsWith("skills/") && file.endsWith("SKILL.md"));

    return { newFiles, modifiedFiles };
  } catch (error) {
    console.error(`Failed to get diff against ${baseBranch}. Make sure you have fetched the base branch history.`);
    console.error(error);
    process.exit(1);
  }
}

async function getBaseFileContent(filePath: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`git show ${baseBranch}:${filePath}`);
    return stdout;
  } catch {
    return null;
  }
}

function getVersionFromContent(content: string): string | null {
  try {
    const parsed = matter(content);
    if (!parsed.data || !parsed.data.version) {
      return null;
    }
    const version = parsed.data.version.toString();
    const cleanVersion = semver.clean(version) || semver.coerce(version)?.version;
    return cleanVersion && semver.valid(cleanVersion) ? cleanVersion : null;
  } catch {
    return null;
  }
}

async function main() {
  const { newFiles, modifiedFiles } = await getSkillFilesStatus();
  let hasErrors = false;

  console.log(`Checking ${newFiles.length} new and ${modifiedFiles.length} modified SKILL.md files...`);

  for (const file of newFiles) {
    const content = await readFile(file, "utf-8");
    const version = getVersionFromContent(content);
    if (!version) {
      console.error(`❌ [Error] New file ${file} must have a valid semver version in its frontmatter.`);
      hasErrors = true;
    } else {
      console.log(`✅ [Pass] New file ${file} has valid version ${version}`);
    }
  }

  for (const file of modifiedFiles) {
    const currentContent = await readFile(file, "utf-8");
    const currentVersion = getVersionFromContent(currentContent);

    if (!currentVersion) {
      console.error(`❌ [Error] Modified file ${file} is missing a valid semver version in its frontmatter.`);
      hasErrors = true;
      continue;
    }

    const baseContent = await getBaseFileContent(file);
    if (!baseContent) {
      // If base content doesn't exist, treat it as a new file validation
      console.log(`✅ [Pass] File ${file} has valid version ${currentVersion} (could not find base file to compare)`);
      continue;
    }

    const baseVersion = getVersionFromContent(baseContent);
    if (!baseVersion) {
      // Base file had no valid version, any valid version now is an improvement
      console.log(`✅ [Pass] File ${file} has valid version ${currentVersion} (base file had no valid version)`);
      continue;
    }

    if (semver.gt(currentVersion, baseVersion)) {
      console.log(`✅ [Pass] File ${file} version bumped: ${baseVersion} -> ${currentVersion}`);
    } else {
      console.error(`❌ [Error] Modified file ${file} must have its version bumped. Base version: ${baseVersion}, Current version: ${currentVersion}`);
      hasErrors = true;
    }
  }

  if (hasErrors) {
    console.error("\n❌ Version bump check failed!");
    console.error("Please run \`bun run versionUpdate\` to automatically bump the versions of modified skill files.");
    process.exit(1);
  } else {
    console.log("\n✅ All modified skill files have correctly bumped versions.");
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
