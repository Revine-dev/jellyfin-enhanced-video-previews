#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const newVersion = process.argv[2];
if (!newVersion) {
  console.error('Usage: node scripts/update-version.js <version>');
  process.exit(1);
}

// 1. Update csproj
const csprojPath = path.resolve(__dirname, '..', 'Jellyfin.Plugin.EnhancedVideoPreviews', 'Jellyfin.Plugin.EnhancedVideoPreviews.csproj');
if (fs.existsSync(csprojPath)) {
  let content = fs.readFileSync(csprojPath, 'utf8');
  content = content.replace(/<AssemblyVersion>.*?<\/AssemblyVersion>/, `<AssemblyVersion>${newVersion}</AssemblyVersion>`);
  content = content.replace(/<FileVersion>.*?<\/FileVersion>/, `<FileVersion>${newVersion}</FileVersion>`);
  content = content.replace(/<Version>.*?<\/Version>/, `<Version>${newVersion}</Version>`);
  fs.writeFileSync(csprojPath, content, 'utf8');
  console.log(`Updated csproj version to ${newVersion}`);
}

// 2. Update build.yaml
const buildYamlPath = path.resolve(__dirname, '..', 'build.yaml');
if (fs.existsSync(buildYamlPath)) {
  let yamlContent = fs.readFileSync(buildYamlPath, 'utf8');
  yamlContent = yamlContent.replace(/version:\s*"[^"]*"/, `version: "${newVersion}"`);
  fs.writeFileSync(buildYamlPath, yamlContent, 'utf8');
  console.log(`Updated build.yaml version to ${newVersion}`);
}

// 3. Update package.json
const pkgPath = path.resolve(__dirname, '..', 'package.json');
if (fs.existsSync(pkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.version = newVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log(`Updated package.json version to ${newVersion}`);
}
