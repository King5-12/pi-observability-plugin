# Full request tracing fork

Based on upstream commit `5f3c083`. Original MIT license and attribution are retained.

## What is captured

- `LLM Call` Input retains upstream's readable conversation history, system prompt and tool definitions.
- `LLM Call` Metadata → `provider_request` contains a detached snapshot of Pi's `before_provider_request.payload`, including provider-specific options. It is not reconstructed from chat history and has no local character truncation.
- `LLM Call` Output → `tool_calls[].function.arguments` contains the full JSON argument string. This uses the standard OpenAI tool-call shape.
- Independent tool spans continue to show execution inputs and results.
- Metadata identifies the source hook and `provider_request_truncated: false`.

The snapshot does not mutate or replace the request. Existing Langfuse-key masking remains enabled. No HTTP auth headers are captured. Other secrets embedded in messages are not comprehensively detected. Images may become SDK media references.

“Complete” means the body visible at the Pi hook, after context compaction/filtering. It does not restore discarded history or guarantee that later extensions cannot modify the body. Internal summarization calls and transport headers are outside this change. Langfuse server limits still apply.

## Development

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm typecheck
node --experimental-strip-types --test test/*.test.ts
```

The added integration test compares each exported request snapshot with the body actually received by a local mock model. Regression tests cover long payloads and fake credential masking. Existing tests cover histories, sessions, tool failures, retry, images and summaries.

## Local configuration

Continue using `~/.pi/agent/langfuse.json`. Never commit credentials, session files or exported user traces. `LANGFUSE_TRACING_ENABLED=false pi` disables tracing.

Register only this fork, removing the upstream npm registration to avoid duplicate exports. Restart Pi after replacement. To roll back, register `npm:@langfuse/pi-observability-plugin@0.1.2` instead.
