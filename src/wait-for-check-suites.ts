import * as core from '@actions/core';
import { getOctokit } from '@actions/github';
import { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods';

export type GitHubClient = ReturnType<typeof getOctokit>;

// All possible Check Suite conclusions in descending order of priority
enum CheckSuiteStatus {
  queued = 'queued',
  in_progress = 'in_progress',
  completed = 'completed',
  waiting = 'waiting',
  requested = 'requested',
  pending = 'pending'
}

export enum CheckSuiteConclusion {
  action_required = 'action_required',
  cancelled = 'cancelled',
  timed_out = 'timed_out',
  startup_failure = 'startup_failure',
  failure = 'failure',
  neutral = 'neutral',
  success = 'success',
  skipped = 'skipped',
  stale = 'stale'
}

interface WaitForCheckSuitesOptions {
  client: GitHubClient;
  owner: string;
  repo: string;
  ref: string;
  checkSuiteID: number | null;
  waitForACheckSuite: boolean;
  intervalSeconds: number;
  timeoutSeconds: number | null;
  appSlugFilter: string | null;
  onlyFirstCheckSuite: boolean;
}

interface CheckTheCheckSuitesOptions {
  client: GitHubClient;
  owner: string;
  repo: string;
  ref: string;
  checkSuiteID: number | null;
  waitForACheckSuite: boolean;
  appSlugFilter: string | null;
  onlyFirstCheckSuite: boolean;
}

interface GetCheckSuitesOptions {
  client: GitHubClient;
  owner: string;
  repo: string;
  ref: string;
}

interface SimpleCheckSuiteMeta {
  id: number;
  app: {
    slug: string | null;
  };
  status: CheckSuiteStatus | null;
  conclusion: CheckSuiteConclusion | null;
}

type ChecksListSuitesForRefResponse =
  RestEndpointMethodTypes['checks']['listSuitesForRef']['response']['data'];
type ChecksListSuitesForRefResponseCheckSuitesItem =
  ChecksListSuitesForRefResponse['check_suites'][number];

export async function waitForCheckSuites(
  options: WaitForCheckSuitesOptions
): Promise<CheckSuiteConclusion> {
  const {
    client,
    owner,
    repo,
    ref,
    checkSuiteID,
    waitForACheckSuite,
    intervalSeconds,
    timeoutSeconds,
    appSlugFilter,
    onlyFirstCheckSuite
  } = options;

  let response = await checkTheCheckSuites({
    client,
    owner,
    repo,
    ref,
    checkSuiteID,
    waitForACheckSuite,
    appSlugFilter,
    onlyFirstCheckSuite
  });
  if (response === CheckSuiteConclusion.success) {
    return CheckSuiteConclusion.success;
  } else if (
    response !== CheckSuiteStatus.queued &&
    response !== CheckSuiteStatus.in_progress
  ) {
    return response as CheckSuiteConclusion;
  }

  return new Promise<CheckSuiteConclusion>((resolve, reject) => {
    let timeoutId: NodeJS.Timeout | undefined;

    const intervalId = setInterval(async () => {
      try {
        response = await checkTheCheckSuites({
          client,
          owner,
          repo,
          ref,
          checkSuiteID,
          waitForACheckSuite,
          appSlugFilter,
          onlyFirstCheckSuite
        });
        if (response === CheckSuiteConclusion.success) {
          if (timeoutId) clearTimeout(timeoutId);
          clearInterval(intervalId);
          resolve(CheckSuiteConclusion.success);
        } else if (
          response !== CheckSuiteStatus.queued &&
          response !== CheckSuiteStatus.in_progress
        ) {
          if (timeoutId) clearTimeout(timeoutId);
          clearInterval(intervalId);
          resolve(response as CheckSuiteConclusion);
        }
      } catch (err) {
        if (timeoutId) clearTimeout(timeoutId);
        clearInterval(intervalId);
        reject(err);
      }
    }, intervalSeconds * 1000);

    if (timeoutSeconds) {
      timeoutId = setTimeout(() => {
        clearInterval(intervalId);
        reject(new Error(`Timeout of ${timeoutSeconds} seconds reached.`));
      }, timeoutSeconds * 1000);
    }
  });
}

async function checkTheCheckSuites(
  options: CheckTheCheckSuitesOptions
): Promise<
  Exclude<CheckSuiteStatus, CheckSuiteStatus.completed> | CheckSuiteConclusion
> {
  const {
    client,
    owner,
    repo,
    ref,
    checkSuiteID,
    waitForACheckSuite,
    appSlugFilter,
    onlyFirstCheckSuite
  } = options;

  const checkSuitesAndMeta = await getCheckSuites({
    client,
    owner,
    repo,
    ref
  });

  if (
    checkSuitesAndMeta.total_count === 0 ||
    checkSuitesAndMeta.check_suites.length === 0
  ) {
    if (waitForACheckSuite) {
      core.debug(
        `No check suites exist for this commit. Waiting for one to show up.`
      );
      return CheckSuiteStatus.queued;
    } else {
      core.info('No check suites exist for this commit.');
      return CheckSuiteConclusion.success;
    }
  }

  // Filter for Check Suites that match the app slug
  let checkSuites = appSlugFilter
    ? checkSuitesAndMeta.check_suites.filter(
        (checkSuite: ChecksListSuitesForRefResponseCheckSuitesItem) =>
          checkSuite.app && checkSuite.app.slug === appSlugFilter
      )
    : checkSuitesAndMeta.check_suites;

  // Ignore this Check Run's Check Suite
  checkSuites = checkSuites.filter(
    (checkSuite: ChecksListSuitesForRefResponseCheckSuitesItem) =>
      checkSuiteID !== checkSuite.id
  );

  // Check if there are no more Check Suites after the app slug and Check Suite ID filters
  if (checkSuites.length === 0) {
    let message = '';
    if (appSlugFilter && checkSuiteID !== null) {
      message = `No check suites (excluding this one) with the app slug '${appSlugFilter}' exist for this commit.`;
    } else if (checkSuiteID !== null) {
      message = `No check suites (excluding this one) exist for this commit.`;
    } else if (appSlugFilter) {
      message = `No check suites with the app slug '${appSlugFilter}' exist for this commit.`;
    } else {
      throw new Error(
        "A Check Suite should exist, but it doesn't. Please submit an issue on this action's GitHub repo."
      );
    }
    if (waitForACheckSuite) {
      core.debug(`${message} Waiting for one to show up.`);
      return CheckSuiteStatus.queued;
    } else {
      core.info(message);
      return CheckSuiteConclusion.success;
    }
  }

  // Only take into account the first Check Suite created that matches the `appSlugFilter`
  if (onlyFirstCheckSuite) {
    const firstCheckSuite = checkSuites.reduce(
      (
        previous: ChecksListSuitesForRefResponseCheckSuitesItem,
        current: ChecksListSuitesForRefResponseCheckSuitesItem
      ) => {
        const previousDateString = previous['created_at'] as string;
        const currentDateString = current['created_at'] as string;
        if (
          typeof previousDateString !== 'string' ||
          typeof currentDateString !== 'string'
        ) {
          throw new Error(
            `Expected ChecksListSuitesForRefResponseCheckSuitesItem to have the property 'created_at' with type 'string' but got '${
              typeof previousDateString === typeof currentDateString
                ? typeof previousDateString
                : `${typeof previousDateString} and ${typeof currentDateString}`
            }'. Please submit an issue on this action's GitHub repo.`
          );
        }
        return Date.parse(previousDateString) < Date.parse(currentDateString)
          ? previous
          : current;
      }
    );

    // Set the array of Check Suites to an array of one containing the first Check Suite created
    checkSuites = [firstCheckSuite];
  }

  const highestPriorityCheckSuiteStatus =
    getHighestPriorityCheckSuiteStatus(checkSuites);
  if (highestPriorityCheckSuiteStatus === CheckSuiteStatus.completed) {
    const highestPriorityCheckSuiteConclusion =
      getHighestPriorityCheckSuiteConclusion(checkSuites);
    if (highestPriorityCheckSuiteConclusion === CheckSuiteConclusion.success) {
      return CheckSuiteConclusion.success;
    } else {
      core.error(
        'One or more check suites were unsuccessful. Below is some metadata on the check suites.'
      );
      core.error(JSON.stringify(diagnose(checkSuites)));
      return highestPriorityCheckSuiteConclusion;
    }
  } else {
    return highestPriorityCheckSuiteStatus;
  }
}

async function getCheckSuites(
  options: GetCheckSuitesOptions
): Promise<ChecksListSuitesForRefResponse> {
  const { client, owner, repo, ref } = options;
  const response = await client.rest.checks.listSuitesForRef({
    owner,
    repo,
    ref
  });
  if (response.status !== 200) {
    throw new Error(
      `Failed to list check suites for ${owner}/${repo}@${ref}. ` +
        `Expected response code 200, got ${response.status}.`
    );
  }
  return response.data as unknown as ChecksListSuitesForRefResponse;
}

function diagnose(
  checkSuites: ChecksListSuitesForRefResponseCheckSuitesItem[]
): SimpleCheckSuiteMeta[] {
  return checkSuites.map((checkSuite) => ({
    id: checkSuite.id,
    app: {
      slug:
        checkSuite.app && typeof checkSuite.app.slug === 'string'
          ? checkSuite.app.slug
          : null
    },
    status: checkSuite.status as CheckSuiteStatus | null,
    conclusion: checkSuite.conclusion as CheckSuiteConclusion | null
  }));
}

function getHighestPriorityCheckSuiteStatus(
  checkSuites: ChecksListSuitesForRefResponseCheckSuitesItem[]
): CheckSuiteStatus {
  return checkSuites
    .map(
      (checkSuite) =>
        CheckSuiteStatus[checkSuite.status as keyof typeof CheckSuiteStatus]
    )
    .reduce(
      (
        previous: CheckSuiteStatus,
        current: CheckSuiteStatus,
        currentIndex: number
      ) => {
        for (const status of Object.keys(CheckSuiteStatus)) {
          if (current === undefined) {
            throw new Error(
              `Check suite status '${checkSuites[currentIndex].status}' ('${
                CheckSuiteStatus[
                  checkSuites[currentIndex]
                    .status as keyof typeof CheckSuiteStatus
                ]
              }') can't be mapped to one of the CheckSuiteStatus enum's keys. ` +
                "Please submit an issue on this action's GitHub repo."
            );
          }
          if (previous === status) {
            return previous;
          } else if (current === status) {
            return current;
          }
        }
        return current;
      },
      CheckSuiteStatus.completed
    );
}

function getHighestPriorityCheckSuiteConclusion(
  checkSuites: ChecksListSuitesForRefResponseCheckSuitesItem[]
): CheckSuiteConclusion {
  return checkSuites
    .map(
      (checkSuite) =>
        CheckSuiteConclusion[
          checkSuite.conclusion as keyof typeof CheckSuiteConclusion
        ]
    )
    .reduce(
      (
        previous: CheckSuiteConclusion,
        current: CheckSuiteConclusion,
        currentIndex: number
      ) => {
        for (const conclusion of Object.keys(CheckSuiteConclusion)) {
          if (current === undefined) {
            throw new Error(
              `Check suite conclusion '${checkSuites[currentIndex].conclusion}' ('${
                CheckSuiteConclusion[
                  checkSuites[currentIndex]
                    .conclusion as keyof typeof CheckSuiteConclusion
                ]
              }') can't be mapped to one of the CheckSuiteConclusion enum's keys. ` +
                "Please submit an issue on this action's GitHub repo."
            );
          }
          if (previous === conclusion) {
            return previous;
          } else if (current === conclusion) {
            return current;
          }
        }
        return current;
      },
      CheckSuiteConclusion.success
    );
}
