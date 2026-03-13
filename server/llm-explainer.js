const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 8000);

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

function buildSystemPrompt() {
    return [
        "You are assisting Kubernetes on-call debugging.",
        "Deterministic rule-based detection is the source of truth.",
        "Do not override the detected cause.",
        "Avoid hallucinating Kubernetes states not present in the input.",
        "Do not claim certainty.",
        "Keep the answer concise and operational.",
        "Return strict JSON with keys: summary, next_steps, suggested_checks."
    ].join(" ");
}

function buildUserPrompt({ cause, explanation, logSnippet }) {
    return JSON.stringify({
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
}

function parseAiResult(parsed) {
    if (!parsed) return null;
    return {
        summary: String(parsed.summary || ""),
        next_steps: Array.isArray(parsed.next_steps) ? parsed.next_steps.slice(0, 3) : [],
        suggested_checks: Array.isArray(parsed.suggested_checks) ? parsed.suggested_checks.slice(0, 3) : []
    };
}

class NoopExplainer {
    isEnabled() {
        return false;
    }

    async explain() {
        return null;
    }
}

class GroqExplainer {
    constructor(apiKey) {
        this.apiKey = apiKey;
    }

    isEnabled() {
        return Boolean(this.apiKey);
    }

    async explain({ cause, explanation, logSnippet }) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

        try {
            const response = await fetch(GROQ_API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.apiKey}`
                },
                signal: controller.signal,
                body: JSON.stringify({
                    model: "llama-3.3-70b-versatile",
                    messages: [
                        { role: "system", content: buildSystemPrompt() },
                        { role: "user", content: buildUserPrompt({ cause, explanation, logSnippet }) }
                    ],
                    temperature: 0.3,
                    response_format: { type: "json_object" }
                })
            });

            if (!response.ok) {
                const errorBody = await response.text().catch(() => "");
                console.error("[groq] API error:", response.status, errorBody.slice(0, 500));
                return null;
            }

            const payload = await response.json();
            const outputText = payload?.choices?.[0]?.message?.content || "";
            console.log("[groq] raw output:", outputText.slice(0, 500));
            const parsed = safeParseJson(outputText);
            if (!parsed) {
                console.error("[groq] failed to parse JSON from output");
                return null;
            }

            return parseAiResult(parsed);
        } catch (_err) {
            console.error("[groq] request failed:", _err.message);
            return null;
        } finally {
            clearTimeout(timeout);
        }
    }
}

function createAiExplainer() {
    // Groq provider using Llama 3.3 70B.
    // Set GROQ_API_KEY in environment variables.
    if (process.env.GROQ_API_KEY) {
        console.log("[ai-explainer] Using Groq provider");
        return new GroqExplainer(process.env.GROQ_API_KEY);
    }

    console.log("[ai-explainer] No API key found, AI disabled");
    return new NoopExplainer();
}

module.exports = {
    createAiExplainer,
    sanitizeLogSnippet
};
