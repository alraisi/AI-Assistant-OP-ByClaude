#!/bin/bash

# Setup Development Environment for Safe Implementation
# This script sets up the feature flag system and development branches

set -e

echo "🚀 Setting up safe development environment..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 1: Check if we're in a git repo
if [ ! -d ".git" ]; then
    echo -e "${RED}❌ Not a git repository. Initializing...${NC}"
    git init
    git add .
    git commit -m "Initial commit"
fi

# Step 2: Create develop branch if not exists
echo -e "${YELLOW}📋 Setting up git branches...${NC}"
git checkout -b develop 2>/dev/null || git checkout develop
git checkout main 2>/dev/null || git checkout master 2>/dev/null || echo "Using current branch as main"

echo -e "${GREEN}✅ Git branches ready${NC}"

# Step 3: Install dependencies
echo -e "${YELLOW}📦 Installing dependencies...${NC}"
npm install

echo -e "${GREEN}✅ Dependencies installed${NC}"

# Step 4: Build project
echo -e "${YELLOW}🔨 Building project...${NC}"
npm run build

echo -e "${GREEN}✅ Build successful${NC}"

# Step 5: Create .env if not exists
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}📝 Creating .env file from template...${NC}"
    cp .env.example .env
    echo -e "${YELLOW}⚠️  Please edit .env and add your API keys${NC}"
fi

# Step 6: Create feature flag section in .env
if ! grep -q "Feature Flags" .env; then
    echo "" >> .env
    echo "# Feature Flags (set to 'true' to enable)" >> .env
    echo "FF_URL_SUMMARIZATION=false" >> .env
    echo "FF_TRANSLATION_MODE=false" >> .env
    echo "FF_MESSAGE_CHUNKING=false" >> .env
    echo "FF_REMINDER_SYSTEM=false" >> .env
    echo "FF_INTENT_CLASSIFICATION=false" >> .env
    echo "FF_SEMANTIC_MEMORY=false" >> .env
    echo "FF_AUTO_MEMORY_EXTRACTION=false" >> .env
    echo "FF_MULTI_IMAGE_ANALYSIS=false" >> .env
    echo "FF_CONVERSATION_SUMMARIES=false" >> .env
    echo "FF_VIDEO_ANALYSIS=false" >> .env
    echo "FF_CODE_EXECUTION=false" >> .env
    echo "FF_CALENDAR_INTEGRATION=false" >> .env
    echo "FF_GROUP_ADMIN_CONTROLS=false" >> .env
    echo "FF_PLUGIN_SYSTEM=false" >> .env
    echo -e "${GREEN}✅ Feature flags added to .env${NC}"
fi

# Step 7: Create necessary directories
echo -e "${YELLOW}📁 Creating directories...${NC}"
mkdir -p scripts
mkdir -p src/tools
mkdir -p backups

echo -e "${GREEN}✅ Directories created${NC}"

# Step 8: Create backup script
cat > scripts/backup.sh << 'EOF'
#!/bin/bash

# Backup script for WhatsApp-Agent

BACKUP_DIR="backups/$(date +%Y%m%d_%H%M%S)"

echo "Creating backup at $BACKUP_DIR..."

mkdir -p "$BACKUP_DIR"

# Backup memory
cp -r buddy-memory "$BACKUP_DIR/" 2>/dev/null || echo "No buddy-memory to backup"

# Backup auth
cp -r auth "$BACKUP_DIR/" 2>/dev/null || echo "No auth to backup"

# Backup env
cp .env "$BACKUP_DIR/" 2>/dev/null || echo "No .env to backup"

# Backup database if exists
cp *.db "$BACKUP_DIR/" 2>/dev/null || echo "No database to backup"

echo "✅ Backup complete: $BACKUP_DIR"
EOF

chmod +x scripts/backup.sh

echo -e "${GREEN}✅ Backup script created${NC}"

# Step 9: Create feature starter script
cat > scripts/start-feature.sh << 'EOF'
#!/bin/bash

# Start a new feature branch

FEATURE_NAME=$1

if [ -z "$FEATURE_NAME" ]; then
    echo "Usage: ./scripts/start-feature.sh <feature-name>"
    echo "Example: ./scripts/start-feature.sh url-summarization"
    exit 1
fi

echo "Starting feature: $FEATURE_NAME"

# Checkout develop
git checkout develop

# Pull latest
git pull origin develop

# Create feature branch
git checkout -b "feature/$FEATURE_NAME"

echo "✅ Feature branch created: feature/$FEATURE_NAME"
echo ""
echo "Next steps:"
echo "1. Implement your feature"
echo "2. Test thoroughly"
echo "3. Run: ./scripts/finish-feature.sh $FEATURE_NAME"
EOF

chmod +x scripts/start-feature.sh

echo -e "${GREEN}✅ Feature starter script created${NC}"

# Step 10: Create feature finish script
cat > scripts/finish-feature.sh << 'EOF'
#!/bin/bash

# Finish a feature and create PR

FEATURE_NAME=$1

if [ -z "$FEATURE_NAME" ]; then
    echo "Usage: ./scripts/finish-feature.sh <feature-name>"
    exit 1
fi

echo "Finishing feature: $FEATURE_NAME"

# Build check
echo "Building project..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed. Fix errors before continuing."
    exit 1
fi

# Add changes
git add .

# Commit
echo "Enter commit message:"
read -r message
git commit -m "feat: $FEATURE_NAME - $message"

# Push
git push origin "feature/$FEATURE_NAME"

echo "✅ Feature pushed to origin"
echo ""
echo "Next steps:"
echo "1. Create a Pull Request to 'develop' branch"
echo "2. Get code review"
echo "3. Merge when approved"
EOF

chmod +x scripts/finish-feature.sh

echo -e "${GREEN}✅ Feature finish script created${NC}"

# Summary
echo ""
echo -e "${GREEN}🎉 Development environment setup complete!${NC}"
echo ""
echo "Quick commands:"
echo "  ./scripts/start-feature.sh <name>    - Start new feature"
echo "  ./scripts/finish-feature.sh <name>   - Finish feature"
echo "  ./scripts/backup.sh                  - Create backup"
echo ""
echo "Next steps:"
echo "1. Edit .env and add your API keys"
echo "2. Run: ./scripts/start-feature.sh url-summarization"
echo "3. Start implementing!"
