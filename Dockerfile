FROM node:22-bookworm

# Install dependencies for Playwright
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Install Playwright browsers
RUN npx playwright install --with-deps chromium

# Copy source code
COPY tsconfig.json ./
COPY src/ ./src/

# Build
RUN pnpm build

# Set user (Playwright needs specific permissions, root is often easiest in containers, but node user is safer if configured correctly)
# For simplicity in this robust setup, we use root but you might want to switch to 'node' user and fix permissions for Playwright cache.
# USER node

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

CMD ["node", "dist/cli/index.js", "start"]

EXPOSE 8080
