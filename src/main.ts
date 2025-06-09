import * as core from '@actions/core';
import { getInput } from './get-input.js';
import {
  CheckSuiteConclusion,
  waitForCheckSuites
} from './wait-for-check-suites.js';

/**
 * The main function for the action.
 *
 * @returns Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    const {
      client,
      owner,
      repo,
      ref,
      checkSuiteID,
      waitForACheckSuite,
      intervalSeconds,
      timeoutSeconds,
      failStepIfUnsuccessful,
      appSlugFilter,
      onlyFirstCheckSuite
    } = await getInput();

    const conclusion = await waitForCheckSuites({
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
    });

    core.info(`Conclusion: ${conclusion}`);

    core.setOutput('conclusion', conclusion);

    if (conclusion !== CheckSuiteConclusion.success && failStepIfUnsuccessful) {
      core.setFailed('One or more of the check suites were unsuccessful.');
    }
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('An unknown error occurred.');
    }
  }
}
