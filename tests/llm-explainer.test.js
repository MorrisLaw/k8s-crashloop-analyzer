const assert = require("assert");
const { createAiExplainer, sanitizeLogSnippet } = require("../server/llm-explainer");

function run() {
    const originalGroq = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;

    const explainer = createAiExplainer();
    assert.strictEqual(explainer.isEnabled(), false, "explainer should be disabled without any API key");

    const snippet = sanitizeLogSnippet("line1\n\nline2\tline3", 20);
    assert.strictEqual(snippet, "line1 line2 line3", "snippet should normalize whitespace");

    const longSnippet = sanitizeLogSnippet("a".repeat(2000), 100);
    assert.strictEqual(longSnippet.length, 100, "snippet should be truncated to maxChars");

    // Verify Groq explainer is enabled with key
    process.env.GROQ_API_KEY = "test-groq-key";
    const groqExplainer = createAiExplainer();
    assert.strictEqual(groqExplainer.isEnabled(), true, "explainer should be enabled with GROQ_API_KEY");

    // Clean up
    delete process.env.GROQ_API_KEY;
    if (originalGroq !== undefined) process.env.GROQ_API_KEY = originalGroq;

    console.log("PASS: llm explainer helper test cases");
}

run();
