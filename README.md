# Blog Platform Web (Frontend)

Frontend for the Localpress personal blogging platform. Built with React 19, TypeScript, Vite, and Tiptap v3.

## Features

- **Public Blog**: Read published articles, browse tags, search posts.
- **Admin Dashboard**: Private writing dashboard with rich text / Markdown editing powered by Tiptap v3.
- **Authentication**: Session cookie + CSRF protection against Spring Boot backend.
- **PWA Support**: Offline caching and installable progressive web app.

## Requirements

- Node.js 20.19+ or 22+
- npm 10+

## Getting Started

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment (optional):**
   ```bash
   cp .env.example .env
   ```
   During local development, leaving `VITE_API_BASE_URL` empty defaults to the Vite dev proxy (`/api` -> `http://localhost:8080`).

3. **Start the development server:**
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173`.

4. **Build for production:**
   ```bash
   npm run build
   ```
   Outputs static assets to `dist/`.
