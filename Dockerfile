# Stage 1: Build the application
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json (or similar)
COPY package.json ./
# Assuming npm is used, copy lock file if it exists
COPY package-lock.json* ./

# Install dependencies
RUN npm install

# Copy the rest of the application source code
COPY . .

# Build the Next.js application
RUN npm run build

# Stage 2: Create the production image
FROM node:20-alpine AS runner

WORKDIR /app

# Set environment variables for production
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED 1
# The standalone output runs on port 3000 by default
ENV PORT 3000

# Copy the standalone Next.js server from the builder stage
COPY --from=builder /app/.next/standalone ./

# Copy the static assets from the builder stage
COPY --from=builder /app/.next/static ./.next/static

# Expose the port the app runs on
EXPOSE 3000

# The command to run the application
CMD ["node", "server.js"]
