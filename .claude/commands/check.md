---
description: Run TypeScript type checking and linting
argument-hint: [check-type|check-lint|check-all]
allowed-tools: run_command, view_file
---

# Type and Lint Checker

Runs TypeScript type checking and/or ESLint to validate code quality.

## Usage:

`/check [check-type|check-lint|check-all]`

## Arguments:

- `check-type` - Run TypeScript type checking only
- `check-lint` - Run ESLint checking only  
- `check-all` - Run both type and lint checks (default)
- No argument - Same as `check-all`

## Process:

1. Parse the argument to determine which checks to run
2. Run TypeScript compiler (`tsc --noEmit`) for type checking
3. Run ESLint for code quality checks (if available)
4. Report results with clear error messages
5. Provide suggestions for fixing common issues

## Implementation:

When invoked:

1. **Determine Check Type:**
   - If argument is "check-type" → Run only `tsc --noEmit`
   - If argument is "check-lint" → Run only linting
   - If argument is "check-all" or empty → Run both

2. **Type Checking:**
   ```bash
   npx tsc --noEmit
   ```
   - Reports type errors with file locations
   - No output = success

3. **Lint Checking (if ESLint configured):**
   ```bash
   npx eslint src/ --ext .ts,.tsx
   ```
   - Reports code quality issues
   - Suggests auto-fixes where available

4. **Report Results:**
   - ✅ Success: "All checks passed!"
   - ❌ Errors: Show error count and locations
   - 💡 Suggestions: Offer to run auto-fix if applicable

## Examples:

- `/check` - Run all checks
- `/check check-type` - Only check TypeScript types
- `/check check-lint` - Only run linter
- `/check check-all` - Explicitly run all checks

## Notes:

- TypeScript must be installed (`typescript` in devDependencies)
- ESLint is optional but recommended
- Type checking uses project's `tsconfig.json`
- For Cloudflare Workers, some global types may need `@cloudflare/workers-types`
- This command does NOT modify files (use auto-fix separately)

## Common Fixes:

**Type Errors:**
- Missing types: Add proper type annotations
- Cannot find name 'X': Import missing types or add to `@types`
- Workers types: Ensure `@cloudflare/workers-types` is installed

**Lint Errors:**
- Unused variables: Remove or prefix with `_`
- Missing semicolons: Run `eslint --fix`
- Import order: Run `eslint --fix` if configured
