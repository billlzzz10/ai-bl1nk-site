# AI Gateway for bl1nk

A comprehensive AI Gateway deployed on Cloudflare Workers that unifies multiple AI providers with intelligent routing, guardrails, and budget management.

## Features

- **Multi-Provider Support**: AWS Bedrock, OpenAI, Google Gemini, Voyage AI, Cohere, Mistral, XAI, ZAI, Opencode, and local models
- **Intelligent Routing**: Automatic model selection based on tier, use-case, and provider health
- **Guardrails**: Tier-based token limits and premium use-case validation
- **Budget Management**: Daily spend limits per user/project with automatic tier downgrade
- **Health Checks**: Cached provider status with fallback configuration
- **Unified API**: Single interface for chat, vision, tool-use, embedding, and reranking

## Architecture

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────┐
│      Cloudflare Worker (ai.bl1nk.site)      │
│  ┌──────────────────────────────┐  │
│  │  Routing & Guardrails        │  │
│  └──────────────────────────────┘  │
│  ┌──────────────────────────────┐  │
│  │  Provider Factory            │  │
│  └──────────────────────────────┘  │
└─────────────┬───────────────────────┘
              │
    ┌─────────┴─────────┐
    ▼                   ▼
┌─────────┐       ┌──────────┐
│ OpenAI  │  ...  │  Bedrock │
└─────────┘       └──────────┘
```

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Create KV Namespaces

**Automated Approach** (Recommended):

```bash
node scripts/deploy.js
```

This script will:
- Create all three KV namespaces (CONFIG, RATES, POLICY)
- Populate them with seed data
- Display namespace IDs for wrangler.toml
- Show commands for setting up secrets

**Manual Approach**:

```bash
wrangler kv:namespace create CONFIG
wrangler kv:namespace create RATES
wrangler kv:namespace create POLICY
```

Update `wrangler.toml` with the namespace IDs returned, then populate data:

```bash
node scripts/setup-kv.js
```

Copy and run the generated commands to populate KV namespaces with seed data.

### 3. Populate KV Namespaces

Generate commands:

```bash
node scripts/setup-kv.js
```

Copy and run the generated commands to populate KV namespaces with seed data.

### 4. Configure Secrets

```bash
wrangler secret put OPENAI_KEY
wrangler secret put GEMINI_KEY
wrangler secret put VOYAGE_KEY
wrangler secret put COHERE_KEY
wrangler secret put MISTRAL_KEY
wrangler secret put BEDROCK_KEY
wrangler secret put BEDROCK_SECRET
wrangler secret put BEDROCK_REGION
wrangler secret put XAI_KEY
wrangler secret put ZAI_KEY
wrangler secret put OPENCODE_KEY
```

### 5. Deploy

```bash
wrangler deploy
```

### 6. Configure DNS

Add a CNAME record for `ai.bl1nk.site` pointing to your Workers custom domain.

## API Reference

### GET /v1/models

List all available models with provider, tier, and supported modes.

**Response:**

```json
{
  "models": [
    {
      "provider": "openai",
      "model": "gpt-4o",
      "tier": "premium",
      "modes": ["chat", "vision", "tool"],
      "displayName": "GPT-4o",
      "contextWindow": 128000,
      "maxOutputTokens": 4096
    }
  ]
}
```

### POST /v1/quote

Get cost estimate for a request.

**Request:**

```json
{
  "input": "Explain quantum computing",
  "tier": "standard",
  "usecase": "chat",
  "constraints": {
    "max_tokens": 500
  }
}
```

**Response:**

```json
{
  "prompt_tokens": 4,
  "completion_tokens": 0,
  "cost_estimate": 0.00001,
  "model_used": "gpt-4o-mini",
  "provider_used": "openai"
}
```

### POST /v1/route

Execute AI request with intelligent routing.

**Request:**

```json
{
  "input": "Write a haiku about coding",
  "tier": "cheap",
  "usecase": "chat",
  "constraints": {
    "max_tokens": 100,
    "temperature": 0.7
  },
  "meta": {
    "user": "demo_user",
    "project": "demo_project"
  }
}
```

**Response:**

```json
{
  "id": "req_1234567890_abc123",
  "provider": "openai",
  "model": "gpt-4o-mini",
  "created": 1704067200,
  "output_text": "Code flows like stream\nBugs dance in morning sunlight\nDebug brings the peace",
  "usage": {
    "prompt_tokens": 8,
    "completion_tokens": 20,
    "total_tokens": 28,
    "cost_estimate": 0.000013
  }
}
```

## Tiers

- **cheap**: Low-cost models, max 2048 tokens
- **standard**: Balanced performance and cost
- **premium**: High-performance models for vision, tool-use, and complex tasks

## Guardrails

- **Token Limits**: Cheap tier limited to 2048 tokens
- **Use-Case Validation**: Premium tier requires vision, tool, or heavy use-cases
- **Budget Enforcement**: Daily spend limits per user/project
- **Automatic Downgrade**: Switches to cheaper tier when budget is low

## Examples

### Chat with Cheap Tier

```bash
curl -X POST https://ai.bl1nk.site/v1/route \
  -H "Content-Type: application/json" \
  -d '{
    "input": "Hello, how are you?",
    "tier": "cheap",
    "usecase": "chat"
  }'
```

### Vision with Premium Tier

```bash
curl -X POST https://ai.bl1nk.site/v1/route \
  -H "Content-Type: application/json" \
  -d '{
    "input": [
      {
        "text": "What is in this image?",
        "image": "data:image/jpeg;base64,..."
      }
    ],
    "tier": "premium",
    "usecase": "vision"
  }'
```

### Embedding

```bash
curl -X POST https://ai.bl1nk.site/v1/route \
  -H "Content-Type: application/json" \
  -d '{
    "input": ["Hello world", "AI is amazing"],
    "tier": "cheap",
    "usecase": "embed",
    "provider": "openai"
  }'
```

### Specific Provider

```bash
curl -X POST https://ai.bl1nk.site/v1/route \
  -H "Content-Type: application/json" \
  -d '{
    "input": "Explain relativity",
    "provider": "gemini",
    "model": "gemini-1.5-pro",
    "usecase": "chat"
  }'
```

## Local Development

```bash
# Start local dev server
npm run dev

# Run tests
BASE_URL=http://localhost:8787 npm test
```

## Postman Collection

Import `postman/ai-gateway.postman_collection.json` into Postman for ready-to-use API examples.

## Provider-Specific Notes

### AWS Bedrock

Requires AWS credentials configured as secrets. The current implementation uses a simplified approach - for production, implement proper AWS Signature V4 signing.

### Local Models

Configure local Docker models by setting the endpoint in `config/models.json`:

```json
{
  "provider": "local",
  "endpoint": "http://localhost:8080"
}
```

Supports OpenAI-compatible APIs (llama.cpp, vLLM, etc.).

**Docker Compose Setup:**

```bash
# Start local model servers
docker-compose up -d

# Verify services are running
docker-compose ps
```

See `docker-compose.yml` for example configurations with llama.cpp, vLLM, and embedding servers.

### AWS Bedrock

⚠️ **Important**: The current Bedrock implementation requires AWS Signature V4 authentication to work in production.

See [docs/BEDROCK_IMPLEMENTATION.md](docs/BEDROCK_IMPLEMENTATION.md) for detailed implementation guide with three options:
1. Use AWS SDK (recommended)
2. Implement AWS Signature V4 manually
3. Use API Gateway proxy

## Troubleshooting

### Missing Models

If no models are returned, check that KV namespaces are properly populated:

```bash
wrangler kv:key list --binding=CONFIG
```

### Provider Errors

Check health status and fallback configuration in `config/models.json`.

### Budget Exceeded

Adjust daily limits in POLICY KV namespace or use cheaper tiers.

## License

MIT
