# Complete and Containerize PDF API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a runnable Docker Compose PDF API with authenticated health, asynchronous Redis-backed report generation, worker, download, shared storage, and local verification before Tailscale exposure.

**Architecture:** The HTTP container validates `x-api-key`, creates and reads BullMQ jobs, and streams completed PDFs. A separate worker container consumes the same Redis queue, reads the calculation datapool, renders HTML, and writes PDFs to a shared volume. Tailscale runs on the host and proxies HTTPS to the API's loopback-bound port only after local health succeeds.

**Tech Stack:** NestJS 11, TypeScript 6, BullMQ, Redis 7, Puppeteer 25, Docker Compose, Jest.

## Global Constraints

- Never expose Redis publicly.
- Bind the PDF API host port to `127.0.0.1`.
- Require `x-api-key` on health and report routes.
- Never log API keys or datapool passwords.
- Keep the calculation API read-only from this service.
- Store PDFs for 30 minutes in one volume shared by API and worker.
- Validate locally before enabling Tailscale Serve.

### Task 1: Runtime configuration, API-key guard, and health

**Files:** Modify `src/config/app-config.schema.ts`, `.env.example`, `src/app.module.ts`; create `src/auth/api-key.guard.ts`, `src/health/health.controller.ts`, `src/health/health.module.ts`; test corresponding unit files.

- [ ] Write failing tests for comma-separated `API_KEYS`, missing/invalid `x-api-key`, and authenticated `{ status: 'ok' }`.
- [ ] Add `apiKeys: string[]` to config, reject empty or placeholder-only production keys, and compare keys with timing-safe equality.
- [ ] Register the guard globally and expose authenticated `GET /health`.
- [ ] Run focused tests and `npm.cmd run build`.

### Task 2: BullMQ queue and report processor

**Files:** Create `src/reports/bullmq-reports.queue.ts`, `src/reports/report.processor.ts`, `src/reports/reports.module.ts`, `src/worker.module.ts`, `src/worker.ts`; modify `src/reports/reports.queue.ts`; test queue mapping and processor orchestration.

- [ ] Add BullMQ dependency and write failing tests for queued/active/progress/completed/failed job mappings.
- [ ] Implement the API queue adapter using `REDIS_URL` and named queue `battery-pdf-reports`.
- [ ] Implement processor states: `fetching-data`, `processing-data`, `rendering-html`, `generating-pdf`, then return stored artifact metadata.
- [ ] Start a BullMQ Worker only from `worker.ts`, with configured concurrency and graceful shutdown.
- [ ] Run focused unit/integration tests.

### Task 3: Status expiration and authenticated download

**Files:** Modify `src/reports/reports.service.ts`, `src/reports/reports.controller.ts`, `src/reports/report-status.presenter.ts`; test service/controller/download.

- [ ] Write failing tests for not-ready, ready, expired, missing, safe job IDs, and PDF streaming.
- [ ] Add `GET /reports/:jobId/download`, opening only a ready unexpired artifact from `ReportStorageService`.
- [ ] Map BullMQ results to existing public states without exposing internal errors.
- [ ] Run report tests and integration tests.

### Task 4: Compose runtime and local validation

**Files:** Create `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `docs/operations.md`; modify `package.json`, `src/app.module.ts`.

- [ ] Build a production image with Chromium requirements and commands for API and worker.
- [ ] Define `pdf-api`, `pdf-worker`, and internal `redis`, shared report volume, healthchecks, restart policies, and loopback port binding.
- [ ] Wire `ReportsModule`, `HealthModule`, and existing actuator module in `AppModule`.
- [ ] Run unit/integration tests and build.
- [ ] Run `docker compose up -d --build`, `docker compose ps`, `docker compose logs --tail 100`, then authenticated local `/health`.

### Task 5: Tailscale and launcher handoff

**Files:** Modify the launcher `.env` outside this repository only after HTTPS is live.

- [ ] Verify `tailscale status` and choose the host's existing `*.ts.net` name.
- [ ] Run Tailscale Serve HTTPS proxy to `http://127.0.0.1:3000` without Funnel/public internet.
- [ ] Verify authenticated `https://<host>.ts.net/health` from the support tailnet.
- [ ] Set launcher `API_URL` to that HTTPS URL and keep its `API_KEY` external.
- [ ] Execute `Relatorios.exe` and verify create, poll, download, and `%PDF-`.
