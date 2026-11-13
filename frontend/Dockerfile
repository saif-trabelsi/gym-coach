# Stage 1: Build static web assets
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies with clean cache
COPY package.json package-lock.json ./
RUN npm ci

# Pass API URL at build time for Vite client bundle
ARG VITE_API_URL=http://localhost:8000
ENV VITE_API_URL=$VITE_API_URL

# Copy source and build
COPY . .
RUN npm run build

# Stage 2: Serve via Nginx
FROM nginx:alpine AS runner

# Remove default nginx configurations
RUN rm -rf /etc/nginx/conf.d/*

# Copy custom Nginx configuration with SPA fallback, gzip & security headers
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy production assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
