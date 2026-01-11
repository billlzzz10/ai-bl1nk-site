/**
 * POST /v1/route handler
 */

import type { Env, RouteRequest, RouteResponse, RateEntry } from '../types';
import { ValidationError, parseProviderError, shouldTriggerFallback } from '../utils/errors';
import { normalizeRequest, generateRequestId, calculateCost } from '../utils/normalize';
import { logRequest, logError, logWarning } from '../utils/logger';
import { trackMetrics, trackBudgetUtilization } from '../utils/metrics';
import { ModelSelector } from '../routing/selector';
import { HealthChecker } from '../health/checker';
import { ProviderFactory } from '../providers/factory';
import { GuardrailsEngine } from '../guardrails/engine';

export async function handleRoute(request: Request, env: Env): Promise<Response> {
    const startTime = Date.now();
    const body: RouteRequest = await request.json();

    if (!body.input) {
        throw new ValidationError('Missing required field: input');
    }

    const providerFactory = new ProviderFactory(env);
    const healthChecker = new HealthChecker(env, providerFactory);
    const selector = new ModelSelector(env, healthChecker);
    const guardrails = new GuardrailsEngine(env);

    // Load guardrails config
    await guardrails.loadConfig();

    // Determine mode from usecase or infer from input
    const mode = body.usecase || 'chat';

    // Get recommended tier based on budget
    let tier = body.tier || 'standard';
    const originalTier = tier;
    tier = await guardrails.getRecommendedTier(
        tier,
        body.meta?.user,
        body.meta?.project
    );

    // Log tier downgrade
    if (tier !== originalTier) {
        logWarning('Tier downgraded due to budget', {
            original_tier: originalTier,
            downgraded_tier: tier,
            user: body.meta?.user,
            project: body.meta?.project,
        });
    }

    // Select model
    const modelConfig = await selector.selectModel(
        body.provider,
        body.model,
        tier,
        mode
    );

    // Adjust max_tokens based on tier
    const maxTokens = guardrails.adjustMaxTokens(
        tier,
        body.constraints?.max_tokens
    );

    // Get rate for cost estimation
    const rateKey = `${modelConfig.provider}:${modelConfig.model}`;
    const rateJson = await env.RATES.get(rateKey);
    let inputPricePer1k = 0;
    let outputPricePer1k = 0;

    if (rateJson) {
        const rate: RateEntry = JSON.parse(rateJson);
        inputPricePer1k = rate.input_price_per_1k || 0;
        outputPricePer1k = rate.output_price_per_1k || 0;
    }

    // Normalize request
    const providerRequest = normalizeRequest(mode, body.input, {
        max_tokens: maxTokens,
        temperature: body.constraints?.temperature,
    });

    // Estimate cost for guardrails check
    const estimatedPromptTokens = providerRequest.messages
        ? providerRequest.messages.reduce((sum, msg) => {
            const text = typeof msg.content === 'string' ? msg.content : '';
            return sum + Math.ceil(text.length / 4);
        }, 0)
        : 0;

    const estimatedCost = calculateCost(
        estimatedPromptTokens,
        maxTokens,
        inputPricePer1k,
        outputPricePer1k
    );

    // Validate against guardrails
    await guardrails.validateRequest(
        tier,
        mode,
        maxTokens,
        estimatedCost,
        body.meta?.user,
        body.meta?.project
    );

    // Get provider instance
    const provider = providerFactory.getProvider(modelConfig.provider);

    // Execute request
    let providerResponse;
    try {
        switch (mode) {
            case 'chat':
            case 'vision':
            case 'tool':
                providerResponse = await provider.chat(providerRequest);
                break;
            case 'embed':
                providerResponse = await provider.embed(providerRequest);
                break;
            case 'rerank':
                providerResponse = await provider.rerank(providerRequest);
                break;
            default:
                throw new ValidationError(`Unsupported mode: ${mode}`);
        }
    } catch (error: any) {
        // Parse error with comprehensive detection
        const parsedError = parseProviderError(error, modelConfig.provider);

        // Only fallback for infrastructure issues
        const shouldFallback = shouldTriggerFallback(parsedError);

        if (shouldFallback) {
            const fallback = await healthChecker.getFallback(
                modelConfig.provider,
                modelConfig.model,
                parsedError.category === 'timeout' ? 'timeout' : 'rate_limit'
            );

            if (fallback) {
                // Check if fallback provider has API key
                const keyName = `${fallback.provider.toUpperCase()}_KEY`;
                const hasFallbackKey = env[keyName as keyof Env];

                if (!hasFallbackKey) {
                    logWarning('Fallback provider has no API key configured', {
                        fallback_provider: fallback.provider,
                        original_provider: modelConfig.provider,
                        original_error: parsedError.category,
                    });
                    throw error; // Return original error instead of trying invalid fallback
                }

                // Verify fallback provider supports the required mode
                const fallbackModelConfig = await selector.getModel(
                    fallback.provider,
                    fallback.model
                );

                if (!fallbackModelConfig || !fallbackModelConfig.modes.includes(mode)) {
                    logWarning('Fallback provider does not support required mode', {
                        fallback_provider: fallback.provider,
                        fallback_model: fallback.model,
                        required_mode: mode,
                        supported_modes: fallbackModelConfig?.modes || [],
                    });
                    throw error; // Can't fallback, re-throw original error
                }

                // Log fallback usage
                logWarning('Using fallback provider', {
                    original_provider: modelConfig.provider,
                    fallback_provider: fallback.provider,
                    reason: parsedError.category,
                    mode,
                });

                // Retry with fallback provider using the same mode
                const fallbackProvider = providerFactory.getProvider(fallback.provider);

                try {
                    switch (mode) {
                        case 'chat':
                        case 'vision':
                        case 'tool':
                            providerResponse = await fallbackProvider.chat(providerRequest);
                            break;
                        case 'embed':
                            providerResponse = await fallbackProvider.embed(providerRequest);
                            break;
                        case 'rerank':
                            providerResponse = await fallbackProvider.rerank(providerRequest);
                            break;
                        default:
                            throw error;
                    }

                    // Mark that fallback was used
                    providerResponse.provider = fallback.provider;
                    providerResponse.model = fallback.model;
                    (providerResponse as any).fallback_used = true;
                    (providerResponse as any).original_provider = modelConfig.provider;
                } catch (fallbackError) {
                    // Fallback also failed, log and re-throw original error
                    logError(
                        fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError)),
                        {
                            context: 'fallback_failed',
                            original_provider: modelConfig.provider,
                            fallback_provider: fallback.provider,
                        }
                    );
                    throw error; // Throw original error, not fallback error
                }
            } else {
                throw error;
            }
        } else {
            throw error;
        }
    }

    // Calculate actual cost
    const actualCost = calculateCost(
        providerResponse.usage.prompt_tokens,
        providerResponse.usage.completion_tokens,
        inputPricePer1k,
        outputPricePer1k
    );

    // Record usage
    await guardrails.recordUsage(
        actualCost,
        body.meta?.user,
        body.meta?.project
    );

    // Build response
    const response: RouteResponse = {
        id: generateRequestId(),
        provider: modelConfig.provider,
        model: modelConfig.model,
        created: Math.floor(Date.now() / 1000),
        output_text: providerResponse.text,
        output_embeddings: providerResponse.embeddings,
        output_rerank: providerResponse.rerank_results,
        usage: {
            prompt_tokens: providerResponse.usage.prompt_tokens,
            completion_tokens: providerResponse.usage.completion_tokens,
            total_tokens: providerResponse.usage.total_tokens,
            cost_estimate: actualCost,
        },
    };

    // Log request for analytics
    logRequest(body, response);

    // Track metrics
    const latency = Date.now() - startTime;
    await trackMetrics(env, {
        provider: modelConfig.provider,
        model: modelConfig.model,
        mode,
        tier,
        success: true,
        latency_ms: latency,
        tokens: response.usage.total_tokens,
        cost: actualCost,
        timestamp: Date.now(),
    });

    // Track budget utilization
    await trackBudgetUtilization(env, body.meta?.user, body.meta?.project);

    return new Response(JSON.stringify(response), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
        },
    });
}
