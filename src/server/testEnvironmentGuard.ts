/**
 * Test Environment Safety Guard
 * 
 * Guarantees zero unintentional connection to the operational production database.
 * Strictly prevents automated tests or sandbox configurations from targeting production.
 */

export const OPERATIONAL_PROJECT_ID = 'ai-studio-namafoodproducts-a1be8d3c-7518-4626-974a-8d2a563dca26';
export const OPERATIONAL_DATABASE_ID = 'ai-studio-namafoodproducts-a1be8d3c-7518-4626-974a-8d2a563dca26';

export class OperationalSafetyError extends Error {
  constructor(message: string) {
    super(`[SAFETY ALERT] ${message}`);
    this.name = 'OperationalSafetyError';
  }
}

export interface TestEnvironmentCheckResult {
  isSafe: boolean;
  targetProjectId: string;
  isEmulator: boolean;
  error?: string;
}

/**
 * Validates that the target project configuration is safe for testing
 * and cannot mutate or connect to the operational production project.
 */
export function validateTestTargetProject(options: {
  targetProjectId?: string;
  isCloudTest?: boolean;
  expectedTestProjectId?: string;
  confirmationFlag?: string;
  emulatorHost?: string;
}): TestEnvironmentCheckResult {
  const {
    targetProjectId,
    isCloudTest = false,
    expectedTestProjectId,
    confirmationFlag,
    emulatorHost,
  } = options;

  // 1. Emulator mode: 100% offline, guaranteed zero production connection
  if (emulatorHost) {
    const safeEmuProject = targetProjectId || 'demo-nama-test';
    if (safeEmuProject === OPERATIONAL_PROJECT_ID) {
      throw new OperationalSafetyError(
        'Even in emulator mode, targeting the operational project ID is forbidden to prevent cross-contamination.'
      );
    }
    return {
      isSafe: true,
      targetProjectId: safeEmuProject,
      isEmulator: true,
    };
  }

  // 2. Absolute barrier: Target project ID matches operational production ID
  if (!targetProjectId) {
    throw new OperationalSafetyError(
      'Target project ID is undefined. Test aborted to prevent fallback to production.'
    );
  }

  if (targetProjectId === OPERATIONAL_PROJECT_ID) {
    throw new OperationalSafetyError(
      `CRITICAL: Target project ID matches operational production database (${OPERATIONAL_PROJECT_ID}). All test execution is strictly BLOCKED!`
    );
  }

  if (targetProjectId.includes('ai-studio-namafoodproducts')) {
    throw new OperationalSafetyError(
      'CRITICAL: Target project ID belongs to the production AI Studio namespace. All test execution is strictly BLOCKED!'
    );
  }

  // 3. For live cloud sandbox testing: Require explicit multi-variable confirmation
  if (isCloudTest) {
    if (!expectedTestProjectId || expectedTestProjectId.trim().length === 0) {
      throw new OperationalSafetyError(
        'Cloud testing requires EXPECTED_TEST_PROJECT_ID to be explicitly defined.'
      );
    }

    if (targetProjectId !== expectedTestProjectId) {
      throw new OperationalSafetyError(
        `Target project ID (${targetProjectId}) does not match EXPECTED_TEST_PROJECT_ID (${expectedTestProjectId}). Aborting.`
      );
    }

    if (confirmationFlag !== 'true') {
      throw new OperationalSafetyError(
        'Cloud testing requires explicit confirmation: CONFIRM_NON_PRODUCTION_PROJECT=true must be set.'
      );
    }
  }

  return {
    isSafe: true,
    targetProjectId,
    isEmulator: false,
  };
}
