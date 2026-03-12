const GEMINI_API_URL =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 5000);

function sanitizeLogSnippet(logText, maxChars = 1200) {
    return String(logText || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxChars);
}

function safeParseJson(text) {
    try {
        return JSON.parse(text);
    } catch (_err) {
        return null;
    }
}

class NoopExplainer {
    isEnabled() {
        return false;
    }

    async explain() {
        return null;
    }
}

class GeminiExplainer {
    constructor(apiKey) {
        this.apiKey = apiKey;
    }

    isEnabled() {
        return Boolean(this.apiKey);
    }

    async explain({ cause, explanation, logSnippet }) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

        const systemPrompt = [
            "You are assisting Kubernetes on-call debugging.",
            "Deterministic rule-based detection is the source of truth.",
            "Do not override the detected cause.",
            "Avoid hallucinating Kubernetes states not present in the input.",
            "Do not claim certainty.",
            "Keep the answer concise and operational.",
            "Return strict JSON with keys: summary, next_steps, suggested_checks."
        ].join(" ");

        const userPrompt = JSON.stringify({
            detected_cause: cause,
            deterministic_explanation: explanation,
            sanitized_log_snippet: logSnippet,
            instructions: [
                "Explain what likely happened in plain English.",
                "Provide 2-3 practical next troubleshooting steps.",
                "Provide 2-3 suggested follow-up checks.",
                "Keep output brief and actionable."
            ]
        });

        try {
            const response = await fetch(`${GEMINI_API_URL}?key=${encodeURIComponent(this.apiKey)}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                signal: controller.signal,
                body: JSON.stringify({
                    systemInstruction: {
                        parts: [{ text: systemPrompt }]
                    },
                    contents: [
                        {
                            role: "user",
                            parts: [{ text: userPrompt }]
                        }
                    ],
                    generationConfig: {
                        responseMimeType: "application/json"
                    }
                })
            });

            if (!response.ok) {
                return null;
            }

            const payload = await response.json();
            const outputText = payload?.candidates?.[0]?.content?.parts?.[0]?.text || "";
            const parsed = safeParseJson(outputText);
            if (!parsed) {
                return null;
            }

            return {
                summary: String(parsed.summary || ""),
                next_steps: Array.isArray(parsed.next_steps) ? parsed.next_steps.slice(0, 3) : [],
                suggested_checks: Array.isArray(parsed.suggested_checks) ? parsed.suggested_checks.slice(0, 3) : []
            };
        } catch (_err) {
            return null;
        } finally {
            clearTimeout(timeout);
        }
    }
}

function createAiExplainer() {
    // Provider switch point: future model providers can be swapped here
    // without changing frontend behavior or deterministic analysis flow.
    if (process.env.GEMINI_API_KEY) {
        return new GeminiExplainer(process.env.GEMINI_API_KEY);
    }

    return new NoopExplainer();
}

module.exports = {
    createAiExplainer,
    sanitizeLogSnippet
};
