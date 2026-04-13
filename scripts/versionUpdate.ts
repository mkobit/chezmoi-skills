import { Command, Option } from "commander";
import { exec } from "child_process";
import { promisify } from "util";
import { readFile, writeFile } from "fs/promises";
import matter from "gray-matter";
import semver from "semver";
import path from "path";

const execAsync = promisify(exec);

const program = new Command();

program
  .name("versionUpdate")
  .description("Automatically update versions of modified SKILL.md files")
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

async function getModifiedSkillFiles(): Promise<string[]> {
  try {
    // Get both tracked and untracked modifications, plus staged ones compared to base branch
    // 1. Get changed files compared to base branch
    const { stdout } = await execAsync(`git diff --name-only origin/${baseBranch}...HEAD || git diff --name-only ${baseBranch}...HEAD || git diff --name-only HEAD`);

    // Also include files that are modified in working tree but not staged
    const { stdout: workingStdout } = await execAsync(`git diff --name-only`);

    // Also include untracked files
    const { stdout: untrackedStdout } = await execAsync(`git ls-files --others --exclude-standard`);

    const allFiles = [
      ...stdout.split("\n"),
      ...workingStdout.split("\n"),
      ...untrackedStdout.split("\n")
    ];

    const uniqueFiles = [...new Set(allFiles)].filter(Boolean);

    return uniqueFiles.filter(
      (file) => file.startsWith("skills/") && file.endsWith("SKILL.md")
    );
  } catch (error) {
    console.error("Failed to get modified files from git.", error);
    process.exit(1);
  }
}

async function updateFileVersion(filePath: string, releaseType: semver.ReleaseType) {
  try {
    const fileContent = await readFile(filePath, "utf-8");
    const parsed = matter(fileContent);

    if (!parsed.data || !parsed.data.version) {
      console.log(`[Skipped] ${filePath}: No version found in frontmatter.`);
      return;
    }

    const currentVersion = parsed.data.version.toString();
    const cleanVersion = semver.clean(currentVersion) || semver.coerce(currentVersion)?.version;

    if (!cleanVersion || !semver.valid(cleanVersion)) {
      console.warn(`[Warning] ${filePath}: Invalid semver '${currentVersion}'.`);
      return;
    }

    const newVersion = semver.inc(cleanVersion, releaseType);
    if (!newVersion) {
      console.error(`[Error] ${filePath}: Failed to increment version.`);
      return;
    }

    parsed.data.version = newVersion;

    // Use matter to convert back to string
    // Gray-matter's stringify sometimes changes formatting, so doing it manually if possible is safer for just one field
    // However, gray-matter handles it cleanly usually. Let's use stringify.
    const newContent = matter.stringify(parsed.content, parsed.data);
    await writeFile(filePath, newContent, "utf-8");
    console.log(`[Updated] ${filePath}: ${currentVersion} -> ${newVersion}`);
  } catch (error) {
    console.error(`[Error] processing ${filePath}:`, error);
  }
}

async function main() {
  const modifiedFiles = await getModifiedSkillFiles();

  if (modifiedFiles.length === 0) {
    console.log("No modified SKILL.md files found.");
    return;
  }

  console.log(`Found ${modifiedFiles.length} modified SKILL.md file(s). Applying ${bumpType} version bump...`);

  await Promise.all(
    modifiedFiles.map((file) => updateFileVersion(file, bumpType))
  );
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
