# Anchorscape Test

You are an expert test engineer. You will detect the project's test framework, generate tests for findings from the scan report, run them, and report results.

## Instructions

### Step 1: Detect Test Framework

Search for test configuration and existing tests:

```
Glob("**/*.test.{ts,tsx,js,jsx}")
Glob("**/*.spec.{ts,tsx,js,jsx}")
Glob("**/test_*.py")
Glob("**/*_test.go")
Glob("**/*Test.java")
```

Check for test runner configuration:
- `Grep("jest|vitest|mocha|ava|tap", glob: "package.json")`
- `Grep("pytest|unittest|nose", glob: "pyproject.toml,setup.cfg,setup.py")`
- Look for `jest.config.*`, `vitest.config.*`, `.mocharc.*`, `pytest.ini`, `conftest.py`

Determine:
1. **Test framework**: jest, vitest, pytest, go test, cargo test, JUnit, etc.
2. **Test command**: `npm test`, `npx vitest run`, `pytest`, `go test ./...`, etc.
3. **Existing test count**: How many test files exist already?

If no test framework is detected:
- For Node.js projects: recommend and install vitest (lightweight, fast)
- For Python: recommend pytest
- For Go: use built-in `go test`
- For Rust: use built-in `cargo test`

### Step 2: Load Scan Report

Read `.anchorscape/report.json` if it exists. If findings were fixed, generate tests that verify the fixes hold.

If no report exists, generate tests for the most critical code paths instead.

### Step 3: Generate Tests for Fixes

For each fixed finding, generate a test that ensures the vulnerability doesn't regress:

#### Security Fix Tests

| Fixed Issue | Test Strategy |
|------------|---------------|
| SQL Injection | Test that user input is parameterized, not concatenated |
| XSS | Test that HTML special characters are escaped in output |
| Hardcoded secrets | Test that config values come from env vars, not literals |
| Missing auth | Test that protected routes return 401/403 without auth |
| Command injection | Test that shell metacharacters are rejected or escaped |
| Path traversal | Test that `../` sequences are blocked |
| Rate limiting | Test that excessive requests are throttled |

#### Performance Fix Tests

| Fixed Issue | Test Strategy |
|------------|---------------|
| N+1 queries | Test that batch queries return correct results |
| Missing pagination | Test that endpoints respect limit/offset params |
| Missing caching | Test that cache hits return same result as cache misses |

#### Architecture Fix Tests

| Fixed Issue | Test Strategy |
|------------|---------------|
| Error handling | Test that errors are caught and produce proper responses |
| Input validation | Test boundary values, empty strings, null, oversized input |

### Step 4: Write Test Files

Create test files following project conventions:
- Place tests next to source files (`foo.test.ts` next to `foo.ts`) OR in a `__tests__/` directory — match existing project style
- Use the detected framework's syntax (describe/it, test(), etc.)
- Import the actual functions/modules being tested
- Use meaningful test names that describe the security property being verified

Example structure:
```typescript
describe('auth middleware', () => {
  it('should reject requests without auth token', async () => {
    const res = await request(app).get('/api/protected');
    expect(res.status).toBe(401);
  });

  it('should reject expired tokens', async () => {
    // ...
  });
});
```

### Step 5: Run Tests

Execute the test suite:

```bash
# Detect and run
npm test          # Node.js
npx vitest run    # Vitest
npx jest          # Jest
pytest            # Python
go test ./...     # Go
cargo test        # Rust
```

Capture the output. Parse results for:
- Total tests run
- Tests passed
- Tests failed
- Error messages for failures

### Step 6: Fix Failing Tests

If tests fail:
1. Read the error message carefully
2. Determine if the test is wrong or the code is wrong
3. If the **test** is wrong: fix the test (wrong assertion, missing mock, import error)
4. If the **code** is wrong: fix the code (the fix from `/anchorscape:fix` was incomplete)
5. Re-run tests
6. Repeat up to 3 times

### Step 7: Generate Report

Display results:

```
Anchorscape Test Complete

Framework: vitest
Test Command: npx vitest run

Tests Generated: X new test files
Tests Run: X total
  Passed: X
  Failed: X

Coverage:
  Security fixes tested: X of Y
  Performance fixes tested: X of Y
  Architecture fixes tested: X of Y

New test files:
  src/auth/__tests__/middleware.test.ts
  src/db/__tests__/queries.test.ts
  src/api/__tests__/validation.test.ts

To rescan with updated score: /anchorscape:scan
To deploy: /anchorscape:deploy
```

## Important Notes

- **Don't mock everything**: Test real behavior where possible. Only mock external services (databases, APIs).
- **Test the security property**: Don't just test that code runs — test that the vulnerability is actually prevented.
- **Match project style**: Use the same test patterns, naming, and structure as existing tests.
- **Don't break existing tests**: Run the full suite, not just new tests. If existing tests break after fixes, fix them.
- **Minimal dependencies**: Prefer the project's existing test framework. Don't add a new framework if one already exists.
