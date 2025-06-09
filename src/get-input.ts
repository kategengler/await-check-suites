import * as core from '@actions/core';
import { context, getOctokit } from '@actions/github';
import { parseBoolean } from './parse-boolean.js';

export type GitHubClient = ReturnType<typeof getOctokit>;

interface WorkflowRunResponseData {
  check_suite_url?: string;
  [key: string]: unknown;
}

interface Inputs {
  client: GitHubClient;
  owner: string;
  repo: string;
  ref: string;
  checkSuiteID: number | null;
  waitForACheckSuite: boolean;
  intervalSeconds: number;
  timeoutSeconds: number | null;
  failStepIfUnsuccessful: boolean;
  appSlugFilter: string | null;
  onlyFirstCheckSuite: boolean;
}

export async function getInput(): Promise<Inputs> {
  core.debug(
    JSON.stringify({
      repository: `${context.repo.owner}/${context.repo.repo}`,
      ref: context.ref,
      sha: context.sha
    })
  );

  const client = getOctokit(core.getInput('token', { required: true }));

  const repository = core.getInput('repository', { required: true });
  const ref = core.getInput('ref', { required: true });

  const [owner, repo] = splitRepoName(repository);

  const RUN_ID = process.env.GITHUB_RUN_ID;

  // checkSuiteID is the ID of this Check Run's Check Suite
  // if repository is different from this Check Run's repository, then checkSuiteID is null
  const checkSuiteID = await findCheckSuiteID(RUN_ID, owner, repo, client);

  // Default the timeout to null
  const timeoutSecondsInput = core.getInput('timeoutSeconds');
  const timeoutSeconds = normalizeTimeoutSeconds(timeoutSecondsInput);

  // Default the check suites filter to null
  let appSlugFilter: string | null = core.getInput('appSlugFilter');
  appSlugFilter = appSlugFilter?.length ? appSlugFilter : null;

  return {
    client,
    owner,
    repo,
    ref,
    waitForACheckSuite: parseBoolean(
      core.getInput('waitForACheckSuite', { required: true })
    ),
    checkSuiteID,
    intervalSeconds: Number(
      core.getInput('intervalSeconds', { required: true })
    ),
    timeoutSeconds,
    failStepIfUnsuccessful: parseBoolean(
      core.getInput('failStepIfUnsuccessful', { required: true })
    ),
    appSlugFilter,
    onlyFirstCheckSuite: parseBoolean(
      core.getInput('onlyFirstCheckSuite', { required: true })
    )
  };
}

function splitRepoName(repository: string): [string, string] {
  const [owner, repo] = repository.split('/');
  if (!owner || !repo) {
    throw new Error(
      `Invalid repository '${repository}'. Expected format {owner}/{repo}.`
    );
  }
  return [owner, repo];
}

async function findCheckSuiteID(
  RUN_ID: string | null | undefined,
  owner: string,
  repo: string,
  client: GitHubClient
) {
  if (!RUN_ID) {
    throw new Error(
      `Expected the environment variable $GITHUB_RUN_ID to be set to a truthy value, but it isn't (${
        RUN_ID
      } as ${typeof RUN_ID}). Please submit an issue on this action's GitHub repo.`
    );
  }

  let checkSuiteID: number | null = null;
  if (owner === context.repo.owner && repo === context.repo.repo) {
    const workflowRunID = Number(RUN_ID);
    const response = await client.rest.actions.getWorkflowRun({
      owner,
      repo,
      run_id: workflowRunID
    });
    if (response.status !== 200) {
      throw new Error(
        `Failed to get workflow run from ${owner}/${repo} with workflow run ID ${workflowRunID}. ` +
          `Expected response code 200, got ${response.status}.`
      );
    }

    const data = response.data as WorkflowRunResponseData;
    const checkSuiteIDString: string | undefined = data.check_suite_url
      ?.split('/')
      .pop();
    if (!checkSuiteIDString) {
      throw new Error(
        `Expected the check_suite_url property to be returned in the getWorkflowRun API call, but it isn't (${data.check_suite_url} as ${typeof data.check_suite_url}). Please submit an issue on this action's GitHub repo.`
      );
    }
    checkSuiteID = Number(checkSuiteIDString);
  }

  if (checkSuiteID !== null && Number.isNaN(checkSuiteID)) {
    throw new Error(
      `Expected the environment variable $GITHUB_RUN_ID to be a number but it isn't (${checkSuiteID} as ${typeof checkSuiteID}). ` +
        "Please submit an issue on this action's GitHub repo."
    );
  }
  return checkSuiteID;
}

function normalizeTimeoutSeconds(input: string) {
  const timeoutSeconds: number | null =
    input && input.length > 0 ? Number(input) : null;
  if (timeoutSeconds && timeoutSeconds <= 0) {
    return null;
  }
  return timeoutSeconds;
}
