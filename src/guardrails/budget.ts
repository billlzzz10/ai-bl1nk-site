/**
 * Budget tracking and policy enforcement
 */

import type { Env, BudgetPolicy } from '../types';
import { BudgetExceededError } from '../utils/errors';

export class BudgetManager {
    constructor(private env: Env) { }

    /**
     * Get budget policy for user/project
     */
    async getPolicy(user?: string, project?: string): Promise<BudgetPolicy | null> {
        const key = this.getPolicyKey(user, project);
        const policyJson = await this.env.POLICY.get(key);

        if (!policyJson) {
            return null;
        }

        return JSON.parse(policyJson);
    }

    /**
     * Check if request is within budget
     */
    async checkBudget(
        costEstimate: number,
        user?: string,
        project?: string
    ): Promise<void> {
        const policy = await this.getPolicy(user, project);

        if (!policy) {
            return; // No policy = no limits
        }

        // Check if policy needs reset (daily)
        const now = new Date();
        const resetAt = new Date(policy.reset_at);

        if (now > resetAt) {
            // Reset the policy
            policy.current_spend_usd = 0;
            policy.reset_at = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
            await this.updatePolicy(policy, user, project);
        }

        // Check if adding this cost would exceed limit
        if (policy.current_spend_usd + costEstimate > policy.daily_limit_usd) {
            throw new BudgetExceededError(
                `Daily budget limit of $${policy.daily_limit_usd} exceeded. Current: $${policy.current_spend_usd.toFixed(4)}, Request: $${costEstimate.toFixed(4)}`
            );
        }
    }

    /**
     * Record spend
     */
    async recordSpend(
        cost: number,
        user?: string,
        project?: string
    ): Promise<void> {
        const policy = await this.getPolicy(user, project);

        if (!policy) {
            return; // No policy = no tracking
        }

        policy.current_spend_usd += cost;
        await this.updatePolicy(policy, user, project);
    }

    /**
     * Update policy in KV
     */
    private async updatePolicy(
        policy: BudgetPolicy,
        user?: string,
        project?: string
    ): Promise<void> {
        const key = this.getPolicyKey(user, project);
        await this.env.POLICY.put(key, JSON.stringify(policy));
    }

    /**
     * Generate policy key
     */
    private getPolicyKey(user?: string, project?: string): string {
        if (user && project) {
            return `budget:${user}:${project}`;
        }
        if (user) {
            return `budget:${user}`;
        }
        if (project) {
            return `budget:project:${project}`;
        }
        return 'budget:default';
    }

    /**
     * Get suggested tier downgrade based on remaining budget
     */
    async suggestTierDowngrade(
        user?: string,
        project?: string
    ): Promise<'cheap' | 'standard' | null> {
        const policy = await this.getPolicy(user, project);

        if (!policy) {
            return null;
        }

        const remaining = policy.daily_limit_usd - policy.current_spend_usd;
        const percentRemaining = (remaining / policy.daily_limit_usd) * 100;

        if (percentRemaining < 10) {
            return 'cheap'; // Less than 10% remaining, use cheap tier
        }
        if (percentRemaining < 30) {
            return 'standard'; // Less than 30% remaining, use standard tier
        }

        return null; // No downgrade needed
    }
}
