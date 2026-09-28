import assert from "node:assert/strict";
import { test } from "node:test";
import { captureProviderRequest, extractToolCalls } from "../src/index.ts";
import { createSandbox, runPi, startCaptureServer, startMockProvider, waitForRequests } from "./helpers.ts";

test("request snapshot retains long history, options and tool schemas without mutation", () => {
  const payload = { messages: [{ role: "system", content: "policy" }, { role: "user", content: "x".repeat(30000) + "HISTORY_TAIL" }], tools: [{ name: "bash", parameters: { type: "object" } }], temperature: 0.5 };
  const captured = captureProviderRequest(payload) as typeof payload;
  assert.deepEqual(captured, payload);
  payload.messages[0]!.content = "changed";
  assert.equal(captured.messages[0]!.content, "policy");
});

test("full tool arguments survive while fake credentials are redacted", () => {
  const args = { command: "x".repeat(30000), nested: { secret: "sk-lf-canary-fake" } };
  const calls = extractToolCalls([{ type: "toolCall", id: "one", name: "bash", arguments: args }]);
  const captured = JSON.parse(calls[0]!.function.arguments!);
  assert.equal(captured.command, args.command);
  assert.equal(captured.nested.secret, "[redacted-langfuse-secret]");
  assert.equal(args.nested.secret, "sk-lf-canary-fake");
});

test("exported request snapshot matches every body received by the model", async () => {
  const mock = await startMockProvider();
  const capture = await startCaptureServer();
  try {
    const sandbox = createSandbox(mock.port);
    const result = await runPi(sandbox, "Explore this project and summarize it", { env: {
      LANGFUSE_PUBLIC_KEY: "pk-lf-test", LANGFUSE_SECRET_KEY: "sk-lf-test",
      LANGFUSE_BASE_URL: `http://127.0.0.1:${capture.port}`,
    }});
    assert.equal(result.status, 0, result.stderr);
    await waitForRequests(capture, 1);
    const generations = capture.spans().filter(s => s.name === "LLM Call").sort((a,b) => a.startNs < b.startNs ? -1 : 1);
    const wire = mock.payloads();
    assert.equal(generations.length, 3);
    assert.equal(wire.length, generations.length);
    generations.forEach((span,i) => {
      const snapshot = JSON.parse(String(span.attrs["langfuse.observation.metadata.provider_request"]));
      assert.deepEqual(snapshot, wire[i], `request ${i} must match the wire body`);
      assert.equal(String(span.attrs["langfuse.observation.metadata.provider_request_truncated"]), "false");
    });
  } finally { mock.close(); capture.close(); }
});
