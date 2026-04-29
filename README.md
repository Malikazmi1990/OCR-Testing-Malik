# Identity Lens Monorepo

Intelligent document processing and record management.

## Project Structure

```text
.
├── apps/
│   └── web/          # React + Vite application
├── packages/
│   └── shared/       # Shared TypeScript types & constants
├── Dockerfile        # Multi-stage production build
├── docker-compose.yml # Local orchestration
└── package.json      # Monorepo configuration (npm workspaces)
```

## Local Development

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Run Dev Server**:
   ```bash
   npm run dev
   ```
   The application will be available at `http://localhost:3000`.

## Docker Usage

### Build and Run with Compose

```bash
docker-compose up --build
```
The production build will be served via Nginx at `http://localhost:8080`.

### Manual Docker Build

```bash
docker build -t identity-lens .
docker run -p 8080:80 identity-lens
```

## Security & Database
- **Firebase**: Configuration located in `apps/web/firebase-applet-config.json`.
- **Rules**: Security rules located in `apps/web/firestore.rules`.
