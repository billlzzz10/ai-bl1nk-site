# AWS Bedrock Provider - Production Implementation Guide

## Current Status

The current Bedrock implementation uses a simplified approach without AWS Signature V4 authentication. **This will not work in production** and requires proper AWS authentication.

## Production Implementation Options

### Option 1: Use AWS SDK (Recommended)

Install the AWS SDK for Bedrock Runtime:

```bash
npm install @aws-sdk/client-bedrock-runtime
```

Update `src/providers/bedrock.ts`:

```typescript
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

export class BedrockProvider extends BaseProvider {
  private client: BedrockRuntimeClient;

  constructor(env: Env) {
    super('bedrock', env);
    
    this.client = new BedrockRuntimeClient({
      region: env.BEDROCK_REGION || 'us-east-1',
      credentials: {
        accessKeyId: env.BEDROCK_KEY || '',
        secretAccessKey: env.BEDROCK_SECRET || '',
      },
    });
  }

  async chat(request: ProviderRequest): Promise<ProviderResponse> {
    const command = new ConverseCommand({
      modelId: 'us.amazon.nova-pro-v1:0',
      messages: this.convertMessages(request.messages || []),
      inferenceConfig: {
        maxTokens: request.max_tokens || 1024,
        temperature: request.temperature ?? 0.7,
      },
    });

    const response = await this.client.send(command);
    const output = response.output?.message?.content?.[0]?.text || '';

    return {
      text: output,
      usage: {
        prompt_tokens: response.usage?.inputTokens || 0,
        completion_tokens: response.usage?.outputTokens || 0,
        total_tokens: response.usage?.totalTokens || 0,
      },
      raw: response,
    };
  }
}
```

### Option 2: Implement AWS Signature V4

If you cannot use the AWS SDK (e.g., bundle size constraints), implement AWS Signature V4:

```typescript
import { SignatureV4 } from '@aws-sdk/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';

async function signRequest(
  request: Request,
  credentials: { accessKeyId: string; secretAccessKey: string },
  region: string
): Promise<Request> {
  const signer = new SignatureV4({
    service: 'bedrock',
    region,
    credentials,
    sha256: Sha256,
  });

  const signed = await signer.sign(request);
  return new Request(request.url, {
    ...request,
    headers: signed.headers,
  });
}
```

### Option 3: Use Bedrock via API Gateway

Set up an AWS API Gateway endpoint that proxies to Bedrock with proper IAM authentication, then call that endpoint from the worker.

## Required Secrets

```bash
wrangler secret put BEDROCK_KEY        # AWS Access Key ID
wrangler secret put BEDROCK_SECRET     # AWS Secret Access Key
wrangler secret put BEDROCK_REGION     # AWS Region (e.g., us-east-1)
```

## Testing

After implementing authentication:

```bash
# Test with curl
curl -X POST https://ai.bl1nk.site/v1/route \
  -H "Content-Type: application/json" \
  -d '{
    "input": "Hello from Bedrock!",
    "provider": "bedrock",
    "model": "us.amazon.nova-pro-v1:0",
    "usecase": "chat"
  }'
```

## Notes

- The current implementation is a **placeholder** for structure only
- AWS Signature V4 is required for all Bedrock API calls
- Consider using AWS SDK for simplicity and reliability
- Bedrock embedding support can be added using Titan models
