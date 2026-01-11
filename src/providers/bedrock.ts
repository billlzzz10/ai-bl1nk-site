/**
 * AWS Bedrock provider adapter
 */

import { BaseProvider } from './base';
import type { ProviderRequest, ProviderResponse, Env, ChatMessage } from '../types';
import { UpstreamError } from '../utils/errors';
import { getErrorMessage, isApiResponse } from '../utils/type-guards';
import { signBedrockRequest } from '../utils/aws-signature';

export class BedrockProvider extends BaseProvider {
    constructor(env: Env) {
        super('bedrock', env);
    }

    private convertMessages(messages: ChatMessage[]): any[] {
        return messages.map((msg) => ({
            role: msg.role,
            content: typeof msg.content === 'string'
                ? [{ text: msg.content }]
                : msg.content.map((c) => {
                    if (c.type === 'text') {
                        return { text: c.text };
                    }
                    return {
                        image: {
                            format: 'jpeg',
                            source: {
                                bytes: c.image_url?.url.split(',')[1] || '',
                            },
                        },
                    };
                }),
        }));
    }

    async chat(request: ProviderRequest): Promise<ProviderResponse> {
        const region = this.env.BEDROCK_REGION || 'us-east-1';
        const model = 'us.amazon.nova-pro-v1:0'; // Default to Nova Pro

        const body = {
            messages: this.convertMessages(request.messages || []),
            inferenceConfig: {
                maxTokens: request.max_tokens || 1024,
                temperature: request.temperature ?? 0.7,
            },
        };

        const endpoint = `https://bedrock-runtime.${region}.amazonaws.com/model/${model}/converse`;
        const bodyString = JSON.stringify(body);

        // Sign request with AWS Signature V4
        const headers = await signBedrockRequest('POST', endpoint, bodyString, this.env);

        const response = await this.fetchWithTimeout(
            endpoint,
            {
                method: 'POST',
                headers,
                body: bodyString,
            }
        );

        if (!response.ok) {
            const error: unknown = await response.json();
            throw new UpstreamError(
                getErrorMessage(error, 'Bedrock request failed'),
                'bedrock'
            );
        }

        const data: unknown = await response.json();
        if (!isApiResponse(data)) {
            throw new UpstreamError('Invalid response from bedrock', 'bedrock');
        }
        
        const output = data.output?.message?.content?.[0]?.text || '';

        return {
            text: output,
            usage: {
                prompt_tokens: data.usage?.inputTokens || 0,
                completion_tokens: data.usage?.outputTokens || 0,
                total_tokens: data.usage?.totalTokens || 0,
            },
            raw: data,
        };
    }

    async embed(request: ProviderRequest): Promise<ProviderResponse> {
        const region = this.env.BEDROCK_REGION || 'us-east-1';
        const model = 'amazon.titan-embed-text-v1';

        const texts = Array.isArray(request.input)
            ? request.input
            : [request.input as string];

        const embeddings: number[][] = [];
        let totalTokens = 0;

        // Process each text
        for (const text of texts) {
            const body = { inputText: text };
            const endpoint = `https://bedrock-runtime.${region}.amazonaws.com/model/${model}/invoke`;
            const bodyString = JSON.stringify(body);

            const headers = await signBedrockRequest('POST', endpoint, bodyString, this.env);

            const response = await this.fetchWithTimeout(
                endpoint,
                {
                    method: 'POST',
                    headers,
                    body: bodyString,
                }
            );

            if (!response.ok) {
                const error: unknown = await response.json();
                throw new UpstreamError(
                    getErrorMessage(error, 'Bedrock embedding failed'),
                'bedrock'
            );
            }

            const data: unknown = await response.json();
        if (!isApiResponse(data)) {
            throw new UpstreamError('Invalid response from bedrock', 'bedrock');
        }
        
            embeddings.push(data.embedding || []);
            totalTokens += data.inputTextTokenCount || Math.ceil(text.length / 4);
        }

        return {
            embeddings,
            usage: {
                prompt_tokens: totalTokens,
                completion_tokens: 0,
                total_tokens: totalTokens,
            },
        };
    }

    async rerank(_request: ProviderRequest): Promise<ProviderResponse> {
        throw new Error('Bedrock does not support reranking');
    }
}

