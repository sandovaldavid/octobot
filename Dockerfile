# ==============================================================================
# OctoBot Production Dockerfile
# Base: Official Bun 1.3.14 on Alpine Linux
# ==============================================================================
FROM oven/bun:1.3.14-alpine AS base

WORKDIR /usr/src/app

# Set node environment
ENV NODE_ENV=production

# Install dependencies with frozen lockfile
COPY package.json bun.lock ./
RUN bun ci --frozen-lockfile

# Copy application source code and configuration
COPY tsconfig.json ./
COPY src ./src

# Create non-root runtime permissions
RUN chown -R bun:bun /usr/src/app

USER bun

# Default port
EXPOSE 4000

# Container healthcheck using built-in /ready endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://localhost:' + (process.env.PORT || 4000) + '/ready').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Start OctoBot
CMD ["bun", "run", "src/index.ts"]
