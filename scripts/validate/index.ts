import { Command } from "commander";
import type { ValidationResult } from "./types";
import { validateSkills } from "./skills";
import { validateMarketplaceSkillParity, validatePlugins, validatePortablePluginManifests, validateVersionSync } from "./manifests";
import { validateContractCoverage } from "./coverage";
import { reportTokenEfficiency } from "./tokens";

export const handleResults = (results: ValidationResult[]): boolean => {
  let hasErrors = false;
  results.forEach((res) => {
    if (!res.valid) {
      console.error(`❌ Validation failed for ${res.name}:`, res.details);
      hasErrors = true;
    } else {
      console.log(`✅ Validated ${res.name}`);
    }
  });
  return hasErrors;
};

export const run = async (): Promise<void> => {
  const program = new Command();

  program
    .option("--claude-plugin-dir <dir>", "Directory containing claude plugin configs", ".claude-plugin")
    .parse(process.argv);

  const options = program.opts();
  const claudePluginDir = options.claudePluginDir;

  const skillResults = await validateSkills(claudePluginDir);
  const pluginResults = await validatePlugins(claudePluginDir);
  const portablePluginResults = await validatePortablePluginManifests();
  const marketplaceSkillResults = await validateMarketplaceSkillParity(claudePluginDir);
  const versionResults = await validateVersionSync(claudePluginDir);
  const coverageResults = await validateContractCoverage(claudePluginDir);

  const failed = handleResults([...skillResults, ...pluginResults, ...portablePluginResults, ...marketplaceSkillResults, ...versionResults, ...coverageResults]);

  if (failed) {
    process.exit(1);
  } else {
    await reportTokenEfficiency(claudePluginDir);
    console.log("All validations passed!");
  }
};

run();
