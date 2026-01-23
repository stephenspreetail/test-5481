# Data Platform Security Guidelines

## SQL Injection Prevention (CRITICAL)

**NEVER use string interpolation or concatenation with unsanitized user input in SQL queries.**

### Vulnerable Code (NEVER DO THIS)

```typescript
// ❌ DANGEROUS - SQL injection vulnerability
const query = `SELECT * FROM table WHERE id = '${userInput}'`
const query = "SELECT * FROM table WHERE name = '" + searchTerm + "'"
const query = `SELECT * FROM table WHERE id = '${req.query.id}'`
```

An attacker could input: `'; DROP TABLE users; --` and execute arbitrary SQL.

### Safe Patterns

#### 1. Create Sanitization Utilities

Create `src/server/db/sanitize.ts`:

```typescript
/**
 * Sanitize string input for use in Trino SQL queries.
 * Escapes quotes and removes SQL metacharacters.
 */
export function sanitizeForTrino(value: string): string {
  return value
    .replace(/'/g, "''")              // Escape single quotes
    .replace(/[\\\/*;\-\-]/g, '')     // Remove SQL metacharacters
    .slice(0, 500)                     // Limit length to prevent DoS
}

/**
 * Validate string input before processing.
 * Use in .inputValidator() for server functions.
 */
export function validateStringInput(value: unknown, maxLength = 200): string {
  if (typeof value !== 'string') {
    throw new Error('Invalid input: expected string')
  }

  const trimmed = value.trim()

  if (!trimmed) {
    throw new Error('Invalid input: cannot be empty')
  }

  if (trimmed.length > maxLength) {
    throw new Error(`Invalid input: exceeds ${maxLength} characters`)
  }

  return trimmed
}

/**
 * Validate numeric input.
 */
export function validateNumericInput(value: unknown): number {
  const num = Number(value)

  if (!Number.isFinite(num)) {
    throw new Error('Invalid input: expected number')
  }

  return num
}

/**
 * Validate input is in an allowlist.
 * Use for column names, sort orders, etc.
 */
export function validateAllowlist<T extends string>(
  value: string,
  allowlist: readonly T[],
  fieldName: string
): T {
  if (!allowlist.includes(value as T)) {
    throw new Error(`Invalid ${fieldName}: must be one of ${allowlist.join(', ')}`)
  }
  return value as T
}
```

#### 2. Always Validate Input First

```typescript
export const searchItems = createServerFn({ method: 'GET' })
  .inputValidator((input: string) => validateStringInput(input, 200))  // ✅ Validate first
  .handler(async ({ data: searchTerm }) => {
    const sanitized = sanitizeForTrino(searchTerm)  // ✅ Then sanitize

    const query = `
      SELECT * FROM table
      WHERE name = '${sanitized}'  -- Safe because input is validated + sanitized
      LIMIT 100
    `
    // ...
  })
```

#### 3. Use Allowlists for Dynamic Identifiers

Column names, table names, and sort orders should NEVER come from user input without validation:

```typescript
const ALLOWED_SORT_COLUMNS = ['name', 'date', 'volume', 'price'] as const
const ALLOWED_SORT_ORDERS = ['ASC', 'DESC'] as const

export const getSortedItems = createServerFn({ method: 'GET' })
  .inputValidator((input: { sortBy: string; order: string }) => ({
    sortBy: validateAllowlist(input.sortBy, ALLOWED_SORT_COLUMNS, 'sortBy'),
    order: validateAllowlist(input.order.toUpperCase(), ALLOWED_SORT_ORDERS, 'order'),
  }))
  .handler(async ({ data: { sortBy, order } }) => {
    // Safe because sortBy and order are validated against allowlists
    const query = `
      SELECT * FROM table
      ORDER BY ${sortBy} ${order}
      LIMIT 100
    `
    // ...
  })
```

#### 4. Numeric IDs Don't Need String Escaping

```typescript
export const getItemById = createServerFn({ method: 'GET' })
  .inputValidator((id: number) => {
    if (!Number.isInteger(id) || id < 0) {
      throw new Error('Invalid ID: must be a positive integer')
    }
    return id
  })
  .handler(async ({ data: id }) => {
    // Safe because id is validated as a positive integer
    const query = `
      SELECT * FROM table
      WHERE id = ${id}
      LIMIT 1
    `
    // ...
  })
```

## Additional Security Best Practices

### 1. Always Include LIMIT Clauses

Prevent data exfiltration and DoS by limiting result sizes:

```typescript
// ✅ Good - limited results
const query = `SELECT * FROM table LIMIT 100`

// ❌ Bad - unbounded results
const query = `SELECT * FROM table`
```

### 2. Log Suspicious Inputs

```typescript
export const searchItems = createServerFn({ method: 'GET' })
  .inputValidator((input: string) => {
    const validated = validateStringInput(input, 200)

    // Log potential injection attempts
    if (/[';\\-\\-]/.test(input)) {
      console.warn(`[SECURITY] Suspicious input detected: ${input.slice(0, 50)}`)
    }

    return validated
  })
  .handler(async ({ data }) => {
    // ...
  })
```

### 3. Use Read-Only Connections

The data platform connection is READ-ONLY. Never attempt:
- INSERT statements
- UPDATE statements
- DELETE statements
- DROP statements
- Any DDL operations

### 4. Limit Data Exposure

Only select columns you need:

```typescript
// ✅ Good - specific columns
const query = `SELECT id, name, category FROM table`

// ❌ Bad - exposes all columns
const query = `SELECT * FROM table`
```

### 5. Handle Errors Gracefully

Don't expose internal errors to users:

```typescript
.handler(async ({ data }) => {
  try {
    // ... query logic
  } catch (error) {
    console.error('[DataPlatform] Query failed:', error)
    // Don't expose internal error details to client
    throw new Error('Failed to fetch data. Please try again.')
  }
})
```

## Security Checklist

Before deploying any server function that accepts user input:

- [ ] Input is validated with `.inputValidator()`
- [ ] String inputs are sanitized with `sanitizeForTrino()`
- [ ] Dynamic identifiers use allowlists
- [ ] Query includes `LIMIT` clause
- [ ] Only necessary columns are selected
- [ ] Errors are logged but not exposed to users
- [ ] No INSERT/UPDATE/DELETE statements
