#!/usr/bin/env node

/**
 * Deployment script for AI Gateway (Wrangler v3 compatible)
 * Automates KV namespace creation and data population
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🚀 AI Gateway Deployment Script\n');

// Step 1: Login check
console.log('🔐 Step 1: Checking Wrangler authentication...');
try {
    execSync('wrangler whoami', { stdio: 'inherit' });
    console.log('  ✅ Authenticated\n');
} catch (error) {
    console.log('  ⚠️  Not logged in. Please run: wrangler login\n');
    process.exit(1);
}

// Step 2: Create KV namespaces
console.log('📦 Step 2: Creating KV namespaces...');

const namespaces = ['CONFIG', 'RATES', 'POLICY'];
const namespaceIds = {};

for (const ns of namespaces) {
    try {
        console.log(`  Creating ${ns} namespace...`);
        const output = execSync(`wrangler kv namespace create ${ns}`, { encoding: 'utf-8' });
        console.log(`  ✅ Created`);

        // Extract ID from output
        const match = output.match(/id = "([^"]+)"/);
        if (match) {
            namespaceIds[ns] = match[1];
            console.log(`     ID: ${match[1]}`);
        }
    } catch (error) {
        console.error(`  ❌ Failed to create ${ns}: ${error.message}`);
    }
}

console.log('\n📝 Step 3: Update wrangler.toml with namespace IDs...');
if (Object.keys(namespaceIds).length > 0) {
    console.log('  Copy these lines to wrangler.toml (uncomment kv_namespaces section):');
    console.log('  kv_namespaces = [');
    Object.entries(namespaceIds).forEach(([name, id]) => {
        console.log(`    { binding = "${name}", id = "${id}", preview_id = "" },`);
    });
    console.log('  ]');
} else {
    console.log('  ⚠️  No namespace IDs extracted. You may need to create them manually.');
}

console.log('\n  ⚠️  IMPORTANT: Update wrangler.toml before continuing!');
console.log('  Press Ctrl+C to cancel, or press Enter to continue...');

// Wait for user input
await new Promise(resolve => {
    process.stdin.once('data', () => resolve());
});

// Step 4: Populate KV data
console.log('\n💾 Step 4: Populating KV namespaces...');

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

console.log('  Populating CONFIG namespace...');
try {
    // Models
    const modelsJson = JSON.stringify(modelsData.models);
    execSync(`wrangler kv key put --binding=CONFIG models "${modelsJson.replace(/"/g, '\\"')}"`, { stdio: 'inherit' });

    // Guardrails
    const guardrailsJson = JSON.stringify(modelsData.guardrails);
    execSync(`wrangler kv key put --binding=CONFIG guardrails "${guardrailsJson.replace(/"/g, '\\"')}"`, { stdio: 'inherit' });

    // Providers
    for (const [name, config] of Object.entries(modelsData.providers)) {
        const configJson = JSON.stringify(config);
        execSync(`wrangler kv key put --binding=CONFIG "provider:${name}" "${configJson.replace(/"/g, '\\"')}"`, { stdio: 'inherit' });
    }

    console.log('  ✅ CONFIG populated');
} catch (error) {
    console.error(`  ❌ Failed to populate CONFIG: ${error.message}`);
}

console.log('\n  Populating RATES namespace...');
try {
    for (const rate of ratesData.rates) {
        const key = `${rate.provider}:${rate.model}`;
        const rateJson = JSON.stringify(rate);
        execSync(`wrangler kv key put --binding=RATES "${key}" "${rateJson.replace(/"/g, '\\"')}"`, { stdio: 'inherit' });
    }
    console.log('  ✅ RATES populated');
} catch (error) {
    console.error(`  ❌ Failed to populate RATES: ${error.message}`);
}

console.log('\n  Populating POLICY namespace...');
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
        execSync(`wrangler kv key put --binding=POLICY "${key}" "${policyJson.replace(/"/g, '\\"')}"`, { stdio: 'inherit' });
    }
    console.log('  ✅ POLICY populated');
} catch (error) {
    console.error(`  ❌ Failed to populate POLICY: ${error.message}`);
}

// Step 5: Configure secrets
console.log('\n🔐 Step 5: Configure secrets...');
console.log('  Run these commands to set up API keys:');
console.log('  wrangler secret put OPENAI_KEY');
console.log('  wrangler secret put GEMINI_KEY');
console.log('  wrangler secret put VOYAGE_KEY');
console.log('  wrangler secret put COHERE_KEY');
console.log('  wrangler secret put MISTRAL_KEY');
console.log('  wrangler secret put BEDROCK_KEY');
console.log('  wrangler secret put BEDROCK_SECRET');
console.log('  wrangler secret put BEDROCK_REGION');
console.log('  wrangler secret put XAI_KEY');
console.log('  wrangler secret put ZAI_KEY');
console.log('  wrangler secret put OPENCODE_KEY');

// Step 6: Deploy
console.log('\n🚢 Step 6: Deploy to Cloudflare Workers...');
console.log('  Run: wrangler deploy');

console.log('\n✅ Deployment preparation complete!');
console.log('\nNext steps:');
console.log('1. Configure secrets using the commands listed above');
console.log('2. Run: wrangler deploy');
console.log('3. Configure DNS: CNAME ai.bl1nk.site → your-worker.workers.dev');

process.exit(0);
