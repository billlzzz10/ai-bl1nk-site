#!/usr/bin/env node

/**
 * Populate remote KV namespaces with configuration data
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('💾 Populating Remote KV Namespaces\n');

// Load seed data
const modelsData = JSON.parse(
    readFileSync(join(__dirname, '../config/models.json'), 'utf8')
);
const ratesData = JSON.parse(
    readFileSync(join(__dirname, '../config/rate-sheet.json'), 'utf8')
);
const policyData = JSON.parse(
    readFileSync(join(__dirname, '../config/policy.json'), 'utf8')
);

// Populate CONFIG
console.log('📦 Populating CONFIG namespace...');
try {
    // Models
    const modelsJson = JSON.stringify(modelsData.models);
    execSync(`wrangler kv key put --binding=CONFIG --remote models "${modelsJson.replace(/"/g, '\\"')}"`, { stdio: 'inherit' });

    // Guardrails
    const guardrailsJson = JSON.stringify(modelsData.guardrails);
    execSync(`wrangler kv key put --binding=CONFIG --remote guardrails "${guardrailsJson.replace(/"/g, '\\"')}"`, { stdio: 'inherit' });

    // Providers
    for (const [name, config] of Object.entries(modelsData.providers)) {
        const configJson = JSON.stringify(config);
        execSync(`wrangler kv key put --binding=CONFIG --remote "provider:${name}" "${configJson.replace(/"/g, '\\"')}"`, { stdio: 'inherit' });
    }

    console.log('✅ CONFIG populated\n');
} catch (error) {
    console.error(`❌ Failed to populate CONFIG: ${error.message}\n`);
}

// Populate RATES
console.log('💰 Populating RATES namespace...');
try {
    for (const rate of ratesData.rates) {
        const key = `${rate.provider}:${rate.model}`;
        const rateJson = JSON.stringify(rate);
        execSync(`wrangler kv key put --binding=RATES --remote "${key}" "${rateJson.replace(/"/g, '\\"')}"`, { stdio: 'inherit' });
    }
    console.log('✅ RATES populated\n');
} catch (error) {
    console.error(`❌ Failed to populate RATES: ${error.message}\n`);
}

// Populate POLICY
console.log('🔒 Populating POLICY namespace...');
try {
    for (const policy of policyData.policies) {
        let key = 'budget:';
        if (policy.user && policy.project) {
            key += `${policy.user}:${policy.project}`;
        } else if (policy.user) {
            key += policy.user;
        } else if (policy.project) {
            key += `project:${policy.project}`;
        } else {
            key += 'default';
        }
        const policyJson = JSON.stringify(policy);
        execSync(`wrangler kv key put --binding=POLICY --remote "${key}" "${policyJson.replace(/"/g, '\\"')}"`, { stdio: 'inherit' });
    }
    console.log('✅ POLICY populated\n');
} catch (error) {
    console.error(`❌ Failed to populate POLICY: ${error.message}\n`);
}

console.log('🎉 All remote KV namespaces populated successfully!');
process.exit(0);
