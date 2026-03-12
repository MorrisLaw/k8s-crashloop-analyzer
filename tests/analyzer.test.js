const assert = require("assert");
const { K8sCrashLoopAnalyzer } = require("../public/analyzer.js");

function run() {
    const analyzer = new K8sCrashLoopAnalyzer();

    const cases = [
        {
            name: "detects OOMKilled",
            input: "Last State: Terminated\nReason: OOMKilled\nBack-off restarting failed container",
            expectedCause: "OOMKilled",
            expectedCommand: "kubectl top pod <pod>"
        },
        {
            name: "detects ImagePullBackOff",
            input: "Warning Failed to pull image \"org/app:bad-tag\"\nReason: ImagePullBackOff",
            expectedCause: "ImagePullBackOff",
            expectedCommand: "kubectl describe pod <pod>"
        },
        {
            name: "detects CrashLoopBackOff due to missing env",
            input: "Back-off restarting failed container\nerror: environment variable DB_URL not set",
            expectedCause: "CrashLoopBackOff (missing env)",
            expectedCommand: "kubectl get deploy <deployment> -o yaml"
        },
        {
            name: "detects generic CrashLoopBackOff",
            input: "Back-off restarting failed container",
            expectedCause: "CrashLoopBackOff",
            expectedCommand: "kubectl logs <pod> --previous"
        },
        {
            name: "detects port binding failure",
            input: "listen tcp :8080: bind: address already in use",
            expectedCause: "Port binding failure",
            expectedCommand: "kubectl logs <pod> --previous"
        },
        {
            name: "returns Unknown for unmatched logs",
            input: "application started successfully",
            expectedCause: "Unknown",
            expectedCommand: "kubectl get events --sort-by=.lastTimestamp"
        }
    ];

    for (const testCase of cases) {
        const result = analyzer.analyze(testCase.input);

        assert.strictEqual(result.cause, testCase.expectedCause, `${testCase.name}: unexpected cause`);
        assert.ok(
            Array.isArray(result.suggestedCommands) && result.suggestedCommands.length >= 2,
            `${testCase.name}: expected 2+ suggested commands`
        );
        assert.ok(
            result.suggestedCommands.includes(testCase.expectedCommand),
            `${testCase.name}: missing expected command`
        );
        assert.ok(result.explanation && typeof result.explanation === "string", `${testCase.name}: missing explanation`);
    }

    console.log(`PASS: ${cases.length} analyzer test cases`);
}

run();
