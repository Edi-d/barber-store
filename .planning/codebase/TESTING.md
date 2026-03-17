# Testing Patterns

**Analysis Date:** 2026-03-17

## Test Framework

**Runner:**
- Not detected - No test framework currently configured in project
- No test scripts defined in `package.json` (only `start`, `android`, `ios`, `web`)

**Assertion Library:**
- Not detected - No testing dependencies in `devDependencies`

**Run Commands:**
```bash
# Testing is not currently configured
# To add testing, consider:
npm install --save-dev jest @testing-library/react-native
npm install --save-dev typescript @types/jest
```

## Test File Organization

**Location:**
- Not applicable - no test files exist in codebase
- Convention should be: co-located with source files using `.test.ts` or `.spec.ts` suffix

**Naming:**
- Recommended pattern: `[ComponentName].test.tsx` for component tests
- Recommended pattern: `[moduleName].test.ts` for utility/store tests

**Structure:**
```
app/
  [screens].tsx
components/
  [ComponentName].tsx
  [ComponentName].test.tsx    <- Test file co-located
stores/
  [storeName].ts
  [storeName].test.ts         <- Test file co-located
lib/
  [utilityName].ts
  [utilityName].test.ts       <- Test file co-located
```

## Test Structure

**Recommended Test Suite Organization:**
Based on codebase patterns, suggested structure:

```typescript
// authStore.test.ts
describe('useAuthStore', () => {
  describe('initialize', () => {
    it('should load session from Supabase', async () => {
      // test
    });

    it('should fetch profile when session exists', async () => {
      // test
    });
  });

  describe('signIn', () => {
    it('should return error if credentials invalid', async () => {
      // test
    });

    it('should set isSubmitting during operation', async () => {
      // test
    });
  });
});
```

**Patterns:**
- Describe blocks organize by function/feature
- Test names start with "should" for clarity
- Setup/teardown not heavily used given store-based state management
- Assertion should verify state changes and side effects

## Mocking

**Framework:**
- Jest mocking recommended for Supabase calls
- Mock fetch/HTTP requests to isolate store logic from API
- Mock React Native modules that are platform-specific

**Patterns:**
```typescript
// Mocking Supabase client
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signIn: jest.fn(),
      getSession: jest.fn(),
      onAuthStateChange: jest.fn()
    },
    from: jest.fn()
  }
}));

// Mocking async operations in stores
const mockSignIn = jest.fn().mockResolvedValue({ data: null, error: null });
```

**What to Mock:**
- Supabase database calls (`supabase.from().select()`, `.update()`, `.delete()`)
- Supabase auth operations (`signIn()`, `signUp()`, `resetPassword()`)
- Platform-specific modules (SecureStore, ImagePicker)
- Navigation/routing

**What NOT to Mock:**
- Core utility functions like `formatPrice()`, `timeAgo()`, `getInitials()`
- Type/interface definitions
- Local computation logic (reducing arrays, filtering)
- React hooks behavior (unless testing store integration)

## Fixtures and Factories

**Test Data:**
Not currently in use. Recommended approach based on database types:

```typescript
// Test data factories for Supabase types
const createMockProfile = (overrides?: Partial<Profile>): Profile => ({
  id: 'test-id-123',
  username: 'testuser',
  display_name: 'Test User',
  avatar_url: null,
  bio: 'Test bio',
  role: 'user',
  created_at: new Date().toISOString(),
  ...overrides,
});

const createMockSession = (overrides?: Partial<Session>): Session => ({
  user: {
    id: 'user-id-123',
    email: 'test@example.com',
    ...overrides?.user,
  },
  ...overrides,
});
```

**Location:**
- Recommended: `tests/fixtures/` directory or `[moduleName].fixtures.ts` co-located with tests
- Import factories in test files as needed
- Centralize common mock data to reduce duplication

## Coverage

**Requirements:**
- Not enforced - No coverage config in project
- Recommended target: 80% for store/utility logic, 70% for components

**View Coverage:**
```bash
# After Jest setup
jest --coverage

# Generate HTML report
jest --coverage --collectCoverageFrom='src/**/*.{ts,tsx}'
```

## Test Types

**Unit Tests:**
- Scope: Individual functions, store actions, utility functions
- Approach: Test pure functions and isolated store methods
- Example targets: `formatPrice()`, `getInitials()`, Zustand store actions
- Setup: Mock external dependencies (Supabase), test state mutations

**Integration Tests:**
- Scope: Store + Supabase interaction, component + store interaction
- Approach: Mock Supabase at database level, test full action flow
- Example: Test `signIn()` -> profile fetch -> state update
- Setup: Mock Supabase responses, verify state chain

**E2E Tests:**
- Framework: Detox or Expo's testing utilities (not currently configured)
- Not in use - Would test full user flows on actual device
- Recommended for: Authentication flow, booking appointment, cart checkout

## Common Patterns

**Async Testing:**
```typescript
// Zustand stores return Promises
it('should fetch profile when session exists', async () => {
  const store = useAuthStore();

  // Mock successful fetch
  jest.mocked(supabase.from).mockReturnValue({
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        maybeSingle: jest.fn().mockResolvedValue({
          data: mockProfile,
          error: null,
        }),
      }),
    }),
  });

  await store.fetchProfile();

  expect(store.getState().profile).toEqual(mockProfile);
});
```

**Error Testing:**
```typescript
// Test error handling pattern used throughout codebase
it('should return error when signIn fails', async () => {
  const store = useAuthStore();
  const mockError = new Error('Invalid credentials');

  jest.mocked(supabase.auth.signIn).mockRejectedValue(mockError);

  const { error } = await store.signIn('test@test.com', 'wrong');

  expect(error).toEqual(mockError);
  expect(store.getState().isSubmitting).toBe(false);
});
```

**Component Testing:**
```typescript
// Components with forwardRef pattern
it('should render Button with loading state', () => {
  const { getByTestId } = render(
    <Button loading={true}>Submit</Button>
  );

  expect(getByTestId('activity-indicator')).toBeTruthy();
});

// Props variants
it('should apply danger variant styles', () => {
  const { getByText } = render(
    <Button variant="danger">Delete</Button>
  );

  const button = getByText('Delete').parent;
  expect(button).toHaveStyle({ backgroundColor: '#E53935' });
});
```

## Test Configuration Recommendations

**jest.config.js** (to be added):
```javascript
module.exports = {
  preset: 'react-native',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/?(*.)+(spec|test).ts',
  ],
  collectCoverageFrom: [
    'app/**/*.{ts,tsx}',
    'components/**/*.{ts,tsx}',
    'stores/**/*.{ts,tsx}',
    'lib/**/*.{ts,tsx}',
    '!**/*.test.{ts,tsx}',
    '!**/index.ts',
  ],
};
```

---

*Testing analysis: 2026-03-17*
