/**
 * Script to setup KV namespaces with seed data
 */

const fs = require('fs');
const path = require('path');

async function setupKV() {
    console.log('Setting up KV namespaces...\n');

    // Load seed data
    const modelsData = JSON.parse(
        fs.readFileSync(path.join(__dirname, '../config/models.json'), 'utf8')
    );
    const ratesData = JSON.parse(
        fs.readFileSync(path.join(__dirname, '../config/rate-sheet.json'), 'utf8')
    );
    const policyData = JSON.parse(
        fs.readFileSync(path.join(__dirname, '../config/policy.json'), 'utf8')
    );

    console.log('Seed data loaded:');
    console.log(`- Models: ${modelsData.models.length}`);
    console.log(`- Rates: ${ratesData.rates.length}`);
    console.log(`- Policies: ${policyData.policies.length}\n`);

    console.log('To populate KV namespaces, run these commands:\n');

    // CONFIG namespace
    console.log('# CONFIG namespace');
    console.log(`echo '${JSON.stringify(modelsData.models)}' | wrangler kv:key put --binding=CONFIG "models"`);
    console.log(`echo '${JSON.stringify(modelsData.guardrails)}' | wrangler kv:key put --binding=CONFIG "guardrails"`);

    Object.entries(modelsData.providers).forEach(([name, config]) => {
        console.log(`echo '${JSON.stringify(config)}' | wrangler kv:key put --binding=CONFIG "provider:${name}"`);
    });

    console.log('\n# RATES namespace');
    ratesData.rates.forEach((rate) => {
        const key = `${rate.provider}:${rate.model}`;
        console.log(`echo '${JSON.stringify(rate)}' | wrangler kv:key put --binding=RATES "${key}"`);
    });

    console.log('\n# POLICY namespace');
    policyData.policies.forEach((policy) => {
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
        console.log(`echo '${JSON.stringify(policy)}' | wrangler kv:key put --binding=POLICY "${key}"`);
    });

    console.log('\n✅ Commands generated. Copy and run them to populate KV namespaces.');
}

setupKV().catch(console.error);
