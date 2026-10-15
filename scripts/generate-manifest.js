#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, val] = arg.replace(/^--/, "").split("=");
  acc[key] = val;
  return acc;
}, {});

const version = args.version || "1.0.0.0";
const checksum = args.checksum || "00000000000000000000000000000000";
const repo = args.repo || "Revine-dev/jellyfin-enhanced-video-previews";
const targetAbi = args.targetAbi || "10.9.0.0";
const changelog =
  args.changelog || `Release version ${version}. See details on GitHub.`;

const manifestPath = path.resolve(__dirname, "..", "manifest.json");
let manifest = [];

if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (e) {
    console.error("Failed to parse existing manifest.json:", e);
  }
}

if (!manifest || manifest.length === 0) {
  manifest = [
    {
      guid: "8a9e2d4f-5b12-4c6e-9a8f-12014f3a9e12",
      name: "Enhanced Video Previews",
      description:
        "Plays video previews on hover over media cards and list items in Jellyfin Web with direct streaming, transcode fallback, and customizable settings.",
      overview:
        "Smooth hover video previews for movies, series, and episodes in Jellyfin Web.",
      owner: repo.split("/")[0] || "Revine-dev",
      category: "General",
      imageUrl: `https://raw.githubusercontent.com/${repo}/main/assets/icon.png`,
      versions: [],
    },
  ];
}

const plugin = manifest[0];
if (!plugin.imageUrl) {
  plugin.imageUrl = `https://raw.githubusercontent.com/${repo}/main/assets/icon.png`;
}
if (!plugin.versions) {
  plugin.versions = [];
}

const sourceUrl = `https://github.com/${repo}/releases/download/v${version}/jellyfin-enhanced-video-previews-${version}.zip`;
const newVersionEntry = {
  version,
  changelog,
  targetAbi,
  sourceUrl,
  checksum,
  timestamp: new Date().toISOString(),
};

// Replace existing version entry if present, otherwise prepend
const existingIndex = plugin.versions.findIndex((v) => v.version === version);
if (existingIndex >= 0) {
  plugin.versions[existingIndex] = newVersionEntry;
} else {
  plugin.versions.unshift(newVersionEntry);
}

fs.writeFileSync(
  manifestPath,
  JSON.stringify(manifest, null, 2) + "\n",
  "utf8",
);
console.log(
  `Successfully updated manifest.json for version ${version} (checksum: ${checksum})`,
);
