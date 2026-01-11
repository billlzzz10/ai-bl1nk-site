/**
 * POST /v1/quote handler
 */

import type { Env, QuoteRequest, QuoteResponse, RateEntry } from '../types';
import { ValidationError } from '../utils/errors';
import { estimateTokens, normalizeToMessages, extractTextFromMessages } from '../utils/normalize';
import { ModelSelector } from '../routing/selector';
import { HealthChecker } from '../health/checker';
import { ProviderFactory } from '../providers/factory';

export async function handleQuote(request: Request, env: Env): Promise<Response> {
    const body: QuoteRequest = await request.json();

    if (!body.input) {
        throw new ValidationError('Missing required field: input');
    }

    const providerFactory = new ProviderFactory(env);
    const healthChecker = new HealthChecker(env, providerFactory);
    const selector = new ModelSelector(env, healthChecker);

    // Select model
    const modelConfig = await selector.selectModel(
        body.provider,
        body.model,
        body.tier,
        body.usecase
    );

    // Estimate tokens
    let promptTokens = 0;

    if (typeof body.input === 'string') {
        promptTokens = estimateTokens(body.input);
    } else if (Array.isArray(body.input)) {
        if (typeof body.input[0] === 'string') {
            promptTokens = estimateTokens((body.input as string[]).join('\n'));
        } else {
            const messages = normalizeToMessages(body.input);
            const text = extractTextFromMessages(messages);
            promptTokens = estimateTokens(text);
        }
    }

    // Get rate from RATES KV
    const rateKey = `${modelConfig.provider}:${modelConfig.model}`;
    const rateJson = await env.RATES.get(rateKey);

    let costEstimate = 0;

    if (rateJson) {
        const rate: RateEntry = JSON.parse(rateJson);

        if (rate.input_price_per_1k) {
            costEstimate = (promptTokens / 1000) * rate.input_price_per_1k;
        } else if (rate.request_price) {
            costEstimate = rate.request_price;
        }
    }

    const response: QuoteResponse = {
        prompt_tokens: promptTokens,
        completion_tokens: 0,
        cost_estimate: costEstimate,
        model_used: modelConfig.model,
        provider_used: modelConfig.provider,
    };

    return new Response(JSON.stringify(response), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
        },
    });
}
