# K8s CrashLoop Analyzer

A Kubernetes CrashLoopBackOff debugging tool that combines deterministic failure-pattern detection with optional AI-assisted explanation.

![K8s CrashLoop Analyzer Screenshot](docs/screenshot.png)

## Problem Statement

Debugging `CrashLoopBackOff` is often slow and manual. Engineers switch between `kubectl describe`, prior container logs, and cluster events to identify root causes under pressure.

## Feature Overview

- Deterministic rule engine is the primary source of truth.
- Rule matching detects common failure patterns from pasted logs/describe output.
- Returns:
  - likely cause
  - deterministic explanation
  - suggested `kubectl` commands
- Optional Groq-based AI explanation adds concise guidance if configured.
- AI calls are server-side only.

## Example Input / Output

### Input

```text
State:          Waiting
  Reason:       CrashLoopBackOff
Last State:     Terminated
  Reason:       OOMKilled
```

### Deterministic Output

```json
{
  "cause": "OOMKilled",
  "explanation": "The container exceeded its memory limit and the kernel OOM killer terminated it.",
  "suggestedCommands": [
    "kubectl describe pod <pod>",
    "kubectl logs <pod> --previous",
    "kubectl top pod <pod>"
  ]
}
```

### Optional AI-assisted Output

```json
{
  "summary": "The container likely exceeded memory limits during startup and was restarted.",
  "next_steps": [
    "Inspect previous container logs for memory spikes",
    "Compare pod memory limits against observed usage",
    "Adjust limits/requests and redeploy"
  ],
  "suggested_checks": [
    "kubectl top pod <pod>",
    "kubectl describe pod <pod>"
  ]
}
```

## Architecture Overview

1. Frontend (`public/analyzer.js`) runs deterministic detection first. This mirrors typical Kubernetes debugging workflows where engineers first identify common failure patterns before investigating deeper system causes.
2. UI immediately renders deterministic output.
3. Optional step calls `/api/ai-explanation` for AI explanation.
4. Server-side explainer (`server/llm-explainer.js`) returns concise JSON or gracefully skips.

Deterministic analysis still works when no API key is configured.

## Supported Failure Patterns

- `OOMKilled`
- `ImagePullBackOff` / `ErrImagePull`
- `CreateContainerConfigError` (missing ConfigMap or Secret)
- `CrashLoopBackOff` caused by missing environment/config values
- Generic `CrashLoopBackOff` fallback
- Port binding failure (for example, `address already in use`)

## AI Setup (Groq — free tier)

Get a free API key: https://console.groq.com

Uses `llama-3.3-70b-versatile` with 30 RPM / 14,400 RPD on the free tier.

Set environment variable `GROQ_API_KEY`.

### Local Development

1. Copy `.env.example` to `.env`.
2. Set `GROQ_API_KEY` in `.env`.
3. Install dependencies:

```bash
npm install
```

4. Start local server:

```bash
npm start
```

5. Open:

```text
http://localhost:8000
```

If `GROQ_API_KEY` is missing or the provider fails, deterministic output still works and AI output is skipped.

### Vercel Deployment

Set `GROQ_API_KEY` in Vercel Dashboard:

`Project Settings -> Environment Variables`

Vercel injects this env var at runtime; `dotenv` is only for local dev.

## Rate Limiting

`/api/ai-explanation` is limited to 10 requests per minute per IP (in-memory).

## Project Structure

- `public/` static frontend (`index.html`, `analyzer.js`)
- `api/ai-explanation.js` Vercel serverless AI endpoint
- `server/llm-explainer.js` provider integration and fallback
- `server.js` local development server (serves only `public/`)

## Testing

```bash
npm test
```
