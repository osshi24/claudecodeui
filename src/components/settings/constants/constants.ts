import type { ComponentType } from 'react';
import {
  Bell,
  Bot,
  GitBranch,
  Info,
  KeyRound,
  ListChecks,
  MonitorPlay,
  Palette,
  Plug,
} from 'lucide-react';

import type {
  AgentCategory,
  AgentProvider,
  CodeEditorSettingsState,
  CursorPermissionsState,
  ProjectSortOrder,
  SettingsMainTab,
} from '../types/types';

export type SettingsMainTabMeta = {
  id: SettingsMainTab;
  label: string;
  keywords: string;
  icon: ComponentType<{ className?: string }>;
};

export const SETTINGS_MAIN_TABS: SettingsMainTabMeta[] = [
  { id: 'agents', label: 'Agents', keywords: 'agents subagents claude code', icon: Bot },
  { id: 'appearance', label: 'Appearance', keywords: 'appearance theme dark light language', icon: Palette },
  { id: 'git', label: 'Git', keywords: 'git github commits', icon: GitBranch },
  { id: 'api', label: 'API Tokens', keywords: 'api tokens auth keys', icon: KeyRound },
  { id: 'tasks', label: 'Tasks', keywords: 'tasks taskmaster', icon: ListChecks },
  { id: 'browser', label: 'Browser', keywords: 'browser playwright chromium automation', icon: MonitorPlay },
  { id: 'notifications', label: 'Notifications', keywords: 'notifications alerts push', icon: Bell },
  { id: 'plugins', label: 'Plugins', keywords: 'plugins extensions integrations', icon: Plug },
  { id: 'about', label: 'About', keywords: 'about version info', icon: Info },
];

/**
 * The tabs Settings actually offers.
 *
 * Every other tab stays implemented and rendered by `Settings.tsx` — it is
 * simply unreachable, because three separate places used to list the tabs and
 * trimming them one by one is how a menu entry survives in the command palette
 * after being removed from the sidebar. Those places now filter through this
 * list, so restoring a tab means adding its id back here and nothing else.
 */
export const VISIBLE_SETTINGS_TABS: SettingsMainTab[] = ['appearance', 'git', 'notifications'];

/** Where Settings lands when the caller names no tab, or names a hidden one. */
export const DEFAULT_SETTINGS_TAB: SettingsMainTab = VISIBLE_SETTINGS_TABS[0];

export const isVisibleSettingsTab = (tab: string): tab is SettingsMainTab => (
  VISIBLE_SETTINGS_TABS.includes(tab as SettingsMainTab)
);

export const AGENT_PROVIDERS: AgentProvider[] = ['claude', 'cursor', 'codex', 'opencode'];
export const AGENT_CATEGORIES: AgentCategory[] = ['account', 'permissions', 'mcp'];

export const DEFAULT_PROJECT_SORT_ORDER: ProjectSortOrder = 'name';
export const DEFAULT_SAVE_STATUS = null;
export const DEFAULT_CODE_EDITOR_SETTINGS: CodeEditorSettingsState = {
  wordWrap: false,
  showMinimap: true,
  lineNumbers: true,
  fontSize: '14',
};

export const DEFAULT_CURSOR_PERMISSIONS: CursorPermissionsState = {
  allowedCommands: [],
  disallowedCommands: [],
  skipPermissions: false,
};
