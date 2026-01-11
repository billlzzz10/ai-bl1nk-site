/**
 * GET /v1/models handler
 */

import type { Env, ModelsResponse } from '../types';
import { ModelSelector } from '../routing/selector';
import { HealthChecker } from '../health/checker';
import { ProviderFactory } from '../providers/factory';

export async function handleModels(env: Env): Promise<Response> {
    const providerFactory = new ProviderFactory(env);
    const healthChecker = new HealthChecker(env, providerFactory);
    const selector = new ModelSelector(env, healthChecker);

    const models = await selector.getAllModels();

    const response: ModelsResponse = {
        models,
    };

    return new Response(JSON.stringify(response), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
        },
    });
}
