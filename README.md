# K8s CrashLoop Analyzer

Lightweight rule-based Kubernetes troubleshooting assistant for platform engineers and SREs.

## Problem Statement

Debugging `CrashLoopBackOff` incidents is often slow and manual. Engineers usually jump between `kubectl describe`, previous logs, events, and resource metrics to find a likely root cause. This tool speeds up first-pass triage by matching common failure patterns in pod logs and describe output.

## Example Input/Output

### Input

Kubernetes pod logs / describe output:

```text
State:          Waiting
  Reason:       CrashLoopBackOff
Last State:     Terminated
  Reason:       OOMKilled
```

### Output

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

Likely cause: `OOMKilled`  
Explanation: container exceeded memory limits and was terminated  
Suggested kubectl commands: describe, previous logs, and resource usage

## Architecture Overview

1. Input ingestion: paste `kubectl logs` and/or `kubectl describe pod` output.
2. Rule matching: deterministic regex checks for known Kubernetes failure signatures.
3. Structured result: returns `cause`, `explanation`, and `suggestedCommands`.
4. UI rendering: displays matching evidence lines and command runbook hints.

## Supported Failure Patterns

- `OOMKilled`
- `ImagePullBackOff` / `ErrImagePull`
- `CrashLoopBackOff` caused by missing environment/config values
- Port binding failure (for example, `address already in use`)

## Screenshot

Add a UI screenshot after running the analyzer locally:

1. Start the static page (for example, `python3 -m http.server 8000`).
2. Open `http://localhost:8000`.
3. Paste sample logs and click **Analyze Logs**.
4. Capture the output and save it as `docs/screenshot.png`.
5. Reference it here:

```md
![K8s CrashLoop Analyzer UI](docs/screenshot.png)
```

## Future Improvements

- Multi-signal correlation across logs, events, and pod spec fields
- Namespace-aware and workload-aware command suggestions
- Optional AI-assisted ranking of likely causes (on top of current deterministic rules)
- Exportable incident report output for on-call handoffs

## Local Testing

Run the rule-mapping tests with:

```bash
node tests/analyzer.test.js
```
