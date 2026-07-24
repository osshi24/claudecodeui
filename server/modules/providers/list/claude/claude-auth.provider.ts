import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import spawn from 'cross-spawn';

import { resolveClaudeCodeExecutablePath } from '@/shared/claude-cli-path.js';
import type { IProviderAuth } from '@/shared/interfaces.js';
import type { ProviderAuthStatus } from '@/shared/types.js';
import { readObjectRecord, readOptionalString } from '@/shared/utils.js';

type ClaudeCredentialsStatus = {
  authenticated: boolean;
  email: string | null;
  method: string | null;
  error?: string;
};

const hasErrorCode = (error: unknown, code: string): boolean => (
  error instanceof Error && 'code' in error && error.code === code
);

export class ClaudeProviderAuth implements IProviderAuth {
  /**
   * Checks whether the Claude Code CLI is available on this host.
   */
  private checkInstalled(): boolean {
    const cliPath = resolveClaudeCodeExecutablePath(process.env.CLAUDE_CLI_PATH);
    try {
      spawn.sync(cliPath, ['--version'], { stdio: 'ignore', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Returns Claude installation and credential status using Claude Code's auth priority.
   */
  async getStatus(): Promise<ProviderAuthStatus> {
    const installed = this.checkInstalled();

    if (!installed) {
      return {
        installed,
        provider: 'claude',
        authenticated: false,
        email: null,
        method: null,
        error: 'Claude Code CLI is not installed',
      };
    }

    const credentials = await this.checkCredentials();

    return {
      installed,
      provider: 'claude',
      authenticated: credentials.authenticated,
      email: credentials.authenticated ? credentials.email || 'Authenticated' : credentials.email,
      method: credentials.method,
      error: credentials.authenticated ? undefined : credentials.error || 'Not authenticated',
    };
  }

  /**
   * Reads Claude settings env values that the CLI can use even when the server process env is empty.
   */
  private async loadSettingsEnv(): Promise<Record<string, unknown>> {
    try {
      const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
      const content = await readFile(settingsPath, 'utf8');
      const settings = readObjectRecord(JSON.parse(content));
      return readObjectRecord(settings?.env) ?? {};
    } catch {
      return {};
    }
  }

  /**
   * Checks Claude credentials in the same priority order used by Claude Code.
   */
  private async checkCredentials(): Promise<ClaudeCredentialsStatus> {
    const missingCredentialsError = 'Claude CLI is not authenticated. Run claude /login or configure ANTHROPIC_API_KEY.';

    if (process.env.ANTHROPIC_AUTH_TOKEN?.trim()) {
      return { authenticated: true, email: 'Auth Token', method: 'api_key' };
    }

    if (process.env.ANTHROPIC_API_KEY?.trim()) {
      return { authenticated: true, email: 'API Key Auth', method: 'api_key' };
    }

    const settingsEnv = await this.loadSettingsEnv();
    if (readOptionalString(settingsEnv.ANTHROPIC_API_KEY)) {
      return { authenticated: true, email: 'API Key Auth', method: 'api_key' };
    }

    if (readOptionalString(settingsEnv.ANTHROPIC_AUTH_TOKEN)) {
      return { authenticated: true, email: 'Configured via settings.json', method: 'api_key' };
    }

    let fileError: string | null = null;
    let creds: Record<string, unknown> | null = null;
    let method = 'credentials_file';

    try {
      const credPath = path.join(os.homedir(), '.claude', '.credentials.json');
      const content = await readFile(credPath, 'utf8');
      creds = readObjectRecord(JSON.parse(content)) ?? {};
    } catch (error) {
      if (hasErrorCode(error, 'ENOENT')) {
        fileError = missingCredentialsError;
      } else if (error instanceof SyntaxError) {
        fileError = 'Claude credentials are unreadable. Run claude /login again.';
      } else {
        fileError = 'Unable to read Claude credentials. Run claude /login again.';
      }
    }

    if (!readOptionalString(readObjectRecord(creds?.claudeAiOauth)?.accessToken)) {
      const keychainCreds = this.readKeychainCredentials();
      if (keychainCreds) {
        creds = keychainCreds;
        method = 'keychain';
      }
    }

    if (!creds) {
      return {
        authenticated: false,
        email: null,
        method: null,
        error: fileError ?? missingCredentialsError,
      };
    }

    const oauth = readObjectRecord(creds.claudeAiOauth);
    const accessToken = readOptionalString(oauth?.accessToken);

    if (!accessToken) {
      return {
        authenticated: false,
        email: null,
        method: null,
        error: fileError ?? missingCredentialsError,
      };
    }

    const expiresAt = typeof oauth?.expiresAt === 'number' ? oauth.expiresAt : undefined;
    const email = readOptionalString(creds.email) ?? readOptionalString(creds.user) ?? null;

    if (!expiresAt || Date.now() < expiresAt) {
      return {
        authenticated: true,
        email,
        method,
      };
    }

    return {
      authenticated: false,
      email: null,
      method: null,
      error: 'Claude login has expired. Run claude /login again.',
    };
  }

  /**
   * On macOS, Claude Code stores OAuth credentials in the login Keychain
   * ("Claude Code-credentials" item) instead of ~/.claude/.credentials.json.
   */
  private readKeychainCredentials(): Record<string, unknown> | null {
    if (process.platform !== 'darwin') {
      return null;
    }

    try {
      const result = spawn.sync(
        'security',
        ['find-generic-password', '-w', '-s', 'Claude Code-credentials'],
        { encoding: 'utf8', timeout: 5000 },
      );

      if (result.status !== 0 || !result.stdout?.trim()) {
        return null;
      }

      return readObjectRecord(JSON.parse(result.stdout.trim()));
    } catch {
      return null;
    }
  }
}
