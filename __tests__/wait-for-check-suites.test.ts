import {
  waitForCheckSuites,
  CheckSuiteConclusion
} from '../src/wait-for-check-suites.js';
import type { GitHubClient } from '../src/wait-for-check-suites.js';
import type { RequestInterface } from '@octokit/types';
import { jest } from '@jest/globals';

// Helper to create a mock OctokitResponse
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockOctokitResponse<T>(data: T, status = 200): any {
  return {
    status,
    url: 'https://api.github.com/mock',
    headers: {},
    data
  };
}

// Type for the listSuitesForRef mock

function createMockClient(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listSuitesForRefImpl: (params: unknown) => Promise<any>
) {
  return {
    rest: {
      checks: {
        listSuitesForRef: Object.assign(jest.fn(listSuitesForRefImpl), {
          defaults: jest.fn(() => jest.fn()),
          endpoint: jest.fn()
        })
      }
    },
    request: jest.fn() as unknown as RequestInterface<object>,
    paginate: jest.fn()
  } as unknown as GitHubClient;
}

describe('waitForCheckSuites', () => {
  // Use Partial<GitHubClient> for mockClient, and type options inline
  let mockClient: Partial<GitHubClient>;
  let options: Parameters<typeof waitForCheckSuites>[0];

  beforeEach(() => {
    jest.useFakeTimers();
    mockClient = createMockClient(() =>
      Promise.resolve(mockOctokitResponse({ total_count: 0, check_suites: [] }))
    );
    options = {
      // @ts-expect-error These are tests and a mock, so I don't care
      client: mockClient,
      owner: 'owner',
      repo: 'repo',
      ref: 'ref',
      checkSuiteID: null,
      waitForACheckSuite: false,
      intervalSeconds: 1,
      timeoutSeconds: null,
      appSlugFilter: null,
      onlyFirstCheckSuite: false
    };
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('returns success if no check suites exist and waitForACheckSuite is false', async () => {
    options.client = createMockClient(() =>
      Promise.resolve(mockOctokitResponse({ total_count: 0, check_suites: [] }))
    );
    const result = await waitForCheckSuites(options);
    expect(result).toBe(CheckSuiteConclusion.success);
  });

  it('waits if no check suites exist and waitForACheckSuite is true', async () => {
    options.waitForACheckSuite = true;
    options.client = createMockClient(() =>
      Promise.resolve(mockOctokitResponse({ total_count: 0, check_suites: [] }))
    );
    const promise = waitForCheckSuites(options);
    jest.advanceTimersByTime(1100);
    await Promise.resolve();
    await expect(
      Promise.race([promise, Promise.resolve('pending')])
    ).resolves.toBe('pending');
  });

  it('returns success if all check suites are successful', async () => {
    options.client = createMockClient(() =>
      Promise.resolve(
        mockOctokitResponse({
          total_count: 1,
          check_suites: [
            {
              id: 1,
              app: { slug: 'actions' },
              status: 'completed',
              conclusion: 'success',
              created_at: '2020-01-01T00:00:00Z'
            }
          ]
        })
      )
    );
    const result = await waitForCheckSuites(options);
    expect(result).toBe(CheckSuiteConclusion.success);
  });

  it('returns failure if a check suite fails', async () => {
    options.client = createMockClient(() =>
      Promise.resolve(
        mockOctokitResponse({
          total_count: 1,
          check_suites: [
            {
              id: 1,
              app: { slug: 'actions' },
              status: 'completed',
              conclusion: 'failure',
              created_at: '2020-01-01T00:00:00Z'
            }
          ]
        })
      )
    );
    const result = await waitForCheckSuites(options);
    expect(result).toBe(CheckSuiteConclusion.failure);
  });

  it('throws on API error', async () => {
    options.client = createMockClient(() =>
      Promise.resolve(mockOctokitResponse({}, 500))
    );
    await expect(waitForCheckSuites(options)).rejects.toThrow();
  });

  it('rejects on timeout', async () => {
    jest.useRealTimers(); // Use real timers for this test
    options.waitForACheckSuite = true;
    options.timeoutSeconds = 1;
    options.client = createMockClient(() =>
      Promise.resolve(mockOctokitResponse({ total_count: 0, check_suites: [] }))
    );
    await expect(waitForCheckSuites(options)).rejects.toThrow(
      'Timeout of 1 seconds reached.'
    );
  }, 10000); // Explicitly set a higher timeout for this test
});
