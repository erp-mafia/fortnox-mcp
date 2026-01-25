#!/bin/bash
# Release script for fortnox-mcp-server
# Usage: ./scripts/release.sh [patch|minor|major]

set -e

VERSION_TYPE=${1:-patch}

if [[ ! "$VERSION_TYPE" =~ ^(patch|minor|major)$ ]]; then
  echo "Usage: ./scripts/release.sh [patch|minor|major]"
  echo "  patch - Bug fixes (1.0.0 → 1.0.1)"
  echo "  minor - New features (1.0.0 → 1.1.0)"
  echo "  major - Breaking changes (1.0.0 → 2.0.0)"
  exit 1
fi

echo "🚀 Starting release process..."

# 1. Ensure working directory is clean
if [[ -n $(git status --porcelain) ]]; then
  echo "❌ Error: Working directory not clean. Commit or stash changes first."
  exit 1
fi

# 2. Bump version in package.json (this also creates a git tag)
echo "📦 Bumping $VERSION_TYPE version..."
NEW_VERSION=$(npm version $VERSION_TYPE --no-git-tag-version)
echo "New version: $NEW_VERSION"

# 3. Update server.json with new version
echo "📝 Updating server.json..."
if command -v jq &> /dev/null; then
  jq --arg v "${NEW_VERSION#v}" '.version = $v | .packages[0].version = $v' server.json > server.json.tmp && mv server.json.tmp server.json
else
  # Fallback: use sed if jq is not installed
  sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"${NEW_VERSION#v}\"/g" server.json
fi

# 4. Build
echo "🔨 Building..."
npm run build

# 5. Commit and tag
echo "📝 Committing changes..."
git add package.json package-lock.json server.json
git commit -m "Release $NEW_VERSION"
git tag "$NEW_VERSION"

# 6. Publish to npm
echo "📤 Publishing to npm..."
npm publish --access public

# 7. Publish to MCP Registry
echo "📤 Publishing to MCP Registry..."
mcp-publisher publish

# 8. Push to GitHub
echo "📤 Pushing to GitHub..."
git push && git push --tags

echo ""
echo "✅ Release $NEW_VERSION complete!"
echo ""
echo "Published to:"
echo "  - npm: https://www.npmjs.com/package/fortnox-mcp-server"
echo "  - MCP Registry: https://registry.modelcontextprotocol.io"
echo "  - GitHub: https://github.com/jakobwennberg/fortnox-mcp"
