# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++ ffmpeg

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache ffmpeg

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Copy necessary files
COPY --from=builder /app/assets ./assets

# Create directories for runtime
RUN mkdir -p temp output credentials

# Set environment
ENV NODE_ENV=production

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "dist/main"]
