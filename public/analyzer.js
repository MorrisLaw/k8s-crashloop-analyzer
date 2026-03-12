class K8sCrashLoopAnalyzer {
    constructor() {
        // Rule catalog for the deterministic analysis engine.
        // This keeps behavior predictable and easy to maintain for SRE workflows.
        this.rules = [
            {
                cause: "OOMKilled",
                regex: /OOMKilled|out of memory|killed by oom-killer/i,
                explanation:
                    "The container exceeded its memory limit and the kernel OOM killer terminated it.",
                suggestedCommands: [
                    "kubectl describe pod <pod>",
                    "kubectl logs <pod> --previous",
                    "kubectl top pod <pod>"
                ]
            },
            {
                cause: "ImagePullBackOff",
                regex: /ImagePullBackOff|ErrImagePull|Failed to pull image|pull access denied/i,
                explanation:
                    "Kubernetes could not pull the container image from the registry.",
                suggestedCommands: [
                    "kubectl describe pod <pod>",
                    "kubectl get pod <pod> -o yaml",
                    "kubectl get secret"
                ]
            },
            {
                cause: "CrashLoopBackOff (missing env)",
                regex: /CrashLoopBackOff|Back-off restarting failed container/i,
                extraRegex: /environment variable.*not set|missing env|secret.*not found|configmap.*not found/i,
                explanation:
                    "The container is restarting because required environment configuration appears to be missing.",
                suggestedCommands: [
                    "kubectl describe pod <pod>",
                    "kubectl logs <pod> --previous",
                    "kubectl get deploy <deployment> -o yaml"
                ]
            },
            {
                cause: "CrashLoopBackOff",
                regex: /CrashLoopBackOff|Back-off restarting failed container/i,
                explanation:
                    "The container is repeatedly crashing. Check previous container logs for the root cause.",
                suggestedCommands: [
                    "kubectl logs <pod> --previous",
                    "kubectl describe pod <pod>",
                    "kubectl get events --sort-by=.lastTimestamp"
                ]
            },
            {
                cause: "Port binding failure",
                regex: /address already in use|bind: permission denied|listen tcp.*bind/i,
                explanation:
                    "The application failed to bind to its configured port at startup.",
                suggestedCommands: [
                    "kubectl logs <pod> --previous",
                    "kubectl describe pod <pod>",
                    "kubectl get pod <pod> -o yaml"
                ]
            }
        ];
    }

    analyze(logText) {
        const lines = logText.split("\n");

        // Analysis pipeline:
        // 1) Normalize and inspect the incoming text.
        // 2) Run each deterministic rule in priority order.
        // 3) Return the first matching root-cause object.
        // This is where an AI-assisted ranking/scoring layer could be added later.
        for (const rule of this.rules) {
            if (!rule.regex.test(logText)) {
                continue;
            }

            if (rule.extraRegex && !rule.extraRegex.test(logText)) {
                continue;
            }

            return {
                cause: rule.cause,
                explanation: rule.explanation,
                suggestedCommands: rule.suggestedCommands,
                matchingLines: this.findMatchingLines(lines, [rule.regex, rule.extraRegex].filter(Boolean))
            };
        }

        return {
            cause: "Unknown",
            explanation:
                "No supported failure pattern matched this input. Check recent events and previous container logs.",
            suggestedCommands: [
                "kubectl describe pod <pod>",
                "kubectl logs <pod> --previous",
                "kubectl get events --sort-by=.lastTimestamp"
            ],
            matchingLines: []
        };
    }

    findMatchingLines(lines, regexes) {
        const matches = [];

        for (const line of lines) {
            if (regexes.some((regex) => regex.test(line))) {
                matches.push(line);
            }
            if (matches.length >= 3) {
                break;
            }
        }

        return matches;
    }
}

async function analyzeLogs() {
    const logInput = document.getElementById("logInput").value.trim();
    const resultsDiv = document.getElementById("results");

    if (!logInput) {
        alert("Please paste your kubectl logs or describe output");
        return;
    }

    const analyzer = new K8sCrashLoopAnalyzer();
    const result = analyzer.analyze(logInput);
    const aiExplanation = await fetchAiAssistedExplanation(result, logInput);

    const evidenceBlock = result.matchingLines.length
        ? `
            <div style="margin: 10px 0; padding: 10px; background: #2c3e50; color: white; border-radius: 3px; font-family: monospace; font-size: 12px;">
                ${result.matchingLines.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}
            </div>
        `
        : "";

    resultsDiv.innerHTML = `
        <h2>Analysis Result</h2>
        <div class="issue ${result.cause === "Unknown" ? "info" : "error"}">
            <h3>${result.cause}</h3>
            <p>${result.explanation}</p>
            ${evidenceBlock}
            <div class="suggestions">
                <strong>Suggested kubectl commands:</strong>
                ${result.suggestedCommands
                    .map((command) => `<div class="suggestion"><code>${escapeHtml(command)}</code></div>`)
                    .join("")}
            </div>
            <div style="margin-top: 10px;">
<pre style="margin:0; white-space:pre-wrap; word-break:break-word;">${escapeHtml(JSON.stringify({
    cause: result.cause,
    explanation: result.explanation,
    suggestedCommands: result.suggestedCommands
}, null, 2))}</pre>
            </div>
        </div>
        ${renderAiExplanation(aiExplanation)}
    `;

    resultsDiv.style.display = "block";
    resultsDiv.scrollIntoView({ behavior: "smooth" });
}

async function fetchAiAssistedExplanation(result, fullLogText) {
    // Deterministic output is primary. This optional AI call is best-effort only.
    // If unavailable, disabled, or failing, we return null and keep core behavior unchanged.
    try {
        const response = await fetch("/api/ai-explanation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                cause: result.cause,
                explanation: result.explanation,
                logText: fullLogText.slice(0, 4000)
            })
        });

        console.log("AI API response status:", response.status);

        if (response.status === 204) {
            console.warn("AI assist is disabled on the server (no API key configured).");
            return null;
        }

        if (!response.ok) {
            console.warn("AI API returned error status:", response.status);
            return null;
        }

        const payload = await response.json();
        console.log("AI API payload:", payload);
        return payload?.ai || null;
    } catch (_err) {
        console.warn("AI API fetch failed:", _err);
        return null;
    }
}

function renderAiExplanation(ai) {
    if (!ai) {
        return "";
    }

    const nextSteps = Array.isArray(ai.next_steps) ? ai.next_steps : [];
    const suggestedChecks = Array.isArray(ai.suggested_checks) ? ai.suggested_checks : [];

    return `
        <div class="issue info">
            <h3>AI-assisted explanation</h3>
            <p>${escapeHtml(ai.summary || "")}</p>
            <div class="suggestions">
                <strong>Likely next troubleshooting steps:</strong>
                ${nextSteps.map((step) => `<div class="suggestion">${escapeHtml(step)}</div>`).join("")}
            </div>
            <div class="suggestions">
                <strong>Suggested follow-up checks:</strong>
                ${suggestedChecks.map((check) => `<div class="suggestion">${escapeHtml(check)}</div>`).join("")}
            </div>
        </div>
    `;
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", function() {
        const textarea = document.getElementById("logInput");

        const sampleButton = document.createElement("button");
        sampleButton.textContent = "Load Sample Data";
        sampleButton.style.marginLeft = "10px";
        sampleButton.style.background = "#95a5a6";
        sampleButton.onclick = function() {
            textarea.value = `Name:         my-app-5d4b7c8f9b-xyz12
Namespace:    default
Status:       Running
Containers:
  my-app:
    State:          Waiting
      Reason:       CrashLoopBackOff
    Last State:     Terminated
      Reason:       OOMKilled
    Restart Count:  8
Events:
  Type     Reason     Age    From               Message
  ----     ------     ----   ----               -------
  Warning  BackOff    4m     kubelet            Back-off restarting failed container`;
        };

        textarea.parentNode.insertBefore(sampleButton, textarea.nextSibling);
    });
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { K8sCrashLoopAnalyzer };
}
