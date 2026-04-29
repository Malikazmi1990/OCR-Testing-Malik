# Stage 1: Build
FROM node:20-slim AS builder

WORKDIR /app

# Enable corepack for pnpm if needed, but we use npm workspaces here
# COPY package*.json ./
# COPY apps/web/package*.json ./apps/web/
# COPY packages/shared/package*.json ./packages/shared/

# Copy the entire monorepo
COPY . .

# Install dependencies for all workspaces
RUN npm install

# Build the web app
RUN npm run build -w @id-lens/web

# Stage 2: Serve with Nginx
FROM nginx:alpine

# Copy built assets from builder stage
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Custom nginx config to handle SPA routing if needed
RUN echo 'server { \
    listen 80; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html index.htm; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
