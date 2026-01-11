/**
 * Metrics tracking utilities
 */

import type { Env, ProviderName, ModelMode } from '../types';

export interface MetricsData {
    provider: ProviderName;
    model: string;
    mode: ModelMode;
    tier: string;
    success: boolean;
    latency_ms: number;
    tokens: number;
    cost: number;
    timestamp: number;
}

/**
 * Track request metrics in KV
 */
export async function trackMetrics(
    env: Env,
    data: MetricsData
): Promise<void> {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Aggregate metrics by provider/model/day
    const key = `metrics:${date}:${data.provider}:${data.model}`;

    try {
        const existing = await env.POLICY.get(key);
        const metrics = existing ? JSON.parse(existing) : {
            provider: data.provider,
            model: data.model,
            date,
            total_requests: 0,
            successful_requests: 0,
            failed_requests: 0,
            total_tokens: 0,
            total_cost: 0,
            avg_latency_ms: 0,
            latencies: [],
        };

        // Update metrics
        metrics.total_requests++;
        if (data.success) {
            metrics.successful_requests++;
        } else {
            metrics.failed_requests++;
        }
        metrics.total_tokens += data.tokens;
        metrics.total_cost += data.cost;
        metrics.latencies.push(data.latency_ms);

        // Calculate average latency
        metrics.avg_latency_ms = metrics.latencies.reduce((a: number, b: number) => a + b, 0) / metrics.latencies.length;

        // Keep only last 100 latencies to avoid growing too large
        if (metrics.latencies.length > 100) {
            metrics.latencies = metrics.latencies.slice(-100);
        }

        // Store updated metrics
        await env.POLICY.put(key, JSON.stringify(metrics), {
            expirationTtl: 7 * 24 * 60 * 60, // Keep for 7 days
        });
    } catch (error) {
        // Don't fail the request if metrics tracking fails
        console.error('Failed to track metrics:', error);
    }
}

/**
 * Get metrics for a provider/model
 */
export async function getMetrics(
    env: Env,
    provider: ProviderName,
    model: string,
    date?: string
): Promise<any> {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const key = `metrics:${targetDate}:${provider}:${model}`;

    const data = await env.POLICY.get(key);
    return data ? JSON.parse(data) : null;
}

/**
 * Track budget utilization
 */
export async function trackBudgetUtilization(
    env: Env,
    user?: string,
    project?: string
): Promise<void> {
    const date = new Date().toISOString().split('T')[0];
    const key = `budget_util:${date}:${user || 'default'}:${project || 'default'}`;

    try {
        // Get current policy
        const policyKey = user && project
            ? `budget:${user}:${project}`
            : user
                ? `budget:${user}`
                : project
                    ? `budget:project:${project}`
                    : 'budget:default';

        const policyData = await env.POLICY.get(policyKey);
        if (!policyData) return;

        const policy = JSON.parse(policyData);
        const utilization = (policy.current_spend_usd / policy.daily_limit_usd) * 100;

        await env.POLICY.put(key, JSON.stringify({
            user,
            project,
            date,
            current_spend: policy.current_spend_usd,
            daily_limit: policy.daily_limit_usd,
            utilization_percent: utilization,
            timestamp: Date.now(),
        }), {
            expirationTtl: 30 * 24 * 60 * 60, // Keep for 30 days
        });
    } catch (error) {
        console.error('Failed to track budget utilization:', error);
    }
}
