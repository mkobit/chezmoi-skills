import { readFileSync, writeFileSync } from "fs";

const newVersion = process.argv[2];

if (!newVersion) {
  console.error("No version provided.");
  process.exit(1);
}

try {
  // Update plugin.json
  const pluginPath = ".claude-plugin/plugin.json";
  const pluginData = JSON.parse(readFileSync(pluginPath, "utf-8"));
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
