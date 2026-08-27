import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { closeConnection } from '@/modules/database/connection.js';
import { initializeDatabase } from '@/modules/database/init-db.js';
import { projectsDb } from '@/modules/database/repositories/projects.db.js';

async function withIsolatedDatabase(runTest: () => void | Promise<void>): Promise<void> {
  const previousDatabasePath = process.env.DATABASE_PATH;
  const tempDirectory = await mkdtemp(path.join(tmpdir(), 'projects-db-'));
  const databasePath = path.join(tempDirectory, 'auth.db');

  closeConnection();
  process.env.DATABASE_PATH = databasePath;
  await initializeDatabase();

  try {
    await runTest();
  } finally {
    closeConnection();
    if (previousDatabasePath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = previousDatabasePath;
    }
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

test('projectsDb.createProjectPath returns created for fresh paths', async () => {
  await withIsolatedDatabase(() => {
    const created = projectsDb.createProjectPath('/workspace/new-project');

    assert.equal(created.outcome, 'created');
    assert.ok(created.project);
    assert.equal(created.project?.project_path, '/workspace/new-project');
    assert.equal(created.project?.isArchived, 0);
  });
});

test('projectsDb.createProjectPath returns reactivated_archived for archived duplicates', async () => {
  await withIsolatedDatabase(() => {
    const initial = projectsDb.createProjectPath('/workspace/archived-project', 'Archived Project');
    assert.equal(initial.outcome, 'created');
    assert.ok(initial.project);

    projectsDb.updateProjectIsArchived('/workspace/archived-project', true);

    const reused = projectsDb.createProjectPath('/workspace/archived-project', 'Renamed Project');
    assert.equal(reused.outcome, 'reactivated_archived');
    assert.ok(reused.project);
    assert.equal(reused.project?.project_id, initial.project?.project_id);
    assert.equal(reused.project?.isArchived, 0);
  });
});

test('projectsDb.createProjectPath returns active_conflict for active duplicates', async () => {
  await withIsolatedDatabase(() => {
    const initial = projectsDb.createProjectPath('/workspace/active-project');
    assert.equal(initial.outcome, 'created');
    assert.ok(initial.project);

    const conflict = projectsDb.createProjectPath('/workspace/active-project');
    assert.equal(conflict.outcome, 'active_conflict');
    assert.ok(conflict.project);
    assert.equal(conflict.project?.project_id, initial.project?.project_id);
    assert.equal(conflict.project?.isArchived, 0);
  });
});

async function withWorkspacesRoot(root: string | null, runTest: () => void | Promise<void>): Promise<void> {
  const previousRoot = process.env.WORKSPACES_ROOT;

  if (root === null) {
    delete process.env.WORKSPACES_ROOT;
  } else {
    process.env.WORKSPACES_ROOT = root;
  }

  try {
    await runTest();
  } finally {
    if (previousRoot === undefined) {
      delete process.env.WORKSPACES_ROOT;
    } else {
      process.env.WORKSPACES_ROOT = previousRoot;
    }
  }
}

test('projectsDb.getProjectPaths returns every project when no workspace root is configured', async () => {
  await withIsolatedDatabase(async () => {
    await withWorkspacesRoot(null, () => {
      projectsDb.createProjectPath('/workspace/inside/alpha');
      projectsDb.createProjectPath('/elsewhere/beta');

      const paths = projectsDb.getProjectPaths().map((row) => row.project_path).sort();

      assert.deepEqual(paths, ['/elsewhere/beta', '/workspace/inside/alpha']);
    });
  });
});

test('projectsDb.getProjectPaths hides projects outside the workspace root', async () => {
  await withIsolatedDatabase(async () => {
    await withWorkspacesRoot('/workspace/inside', () => {
      projectsDb.createProjectPath('/workspace/inside/alpha');
      projectsDb.createProjectPath('/workspace/inside');
      projectsDb.createProjectPath('/elsewhere/beta');
      // Shares a string prefix with the root but is a sibling directory.
      projectsDb.createProjectPath('/workspace/inside-other/gamma');

      const paths = projectsDb.getProjectPaths().map((row) => row.project_path).sort();

      assert.deepEqual(paths, ['/workspace/inside', '/workspace/inside/alpha']);
    });
  });
});

test('projectsDb.getArchivedProjectPaths hides archived projects outside the workspace root', async () => {
  await withIsolatedDatabase(async () => {
    await withWorkspacesRoot('/workspace/inside', () => {
      projectsDb.createProjectPath('/workspace/inside/alpha');
      projectsDb.createProjectPath('/elsewhere/beta');
      projectsDb.updateProjectIsArchived('/workspace/inside/alpha', true);
      projectsDb.updateProjectIsArchived('/elsewhere/beta', true);

      const paths = projectsDb.getArchivedProjectPaths().map((row) => row.project_path);

      assert.deepEqual(paths, ['/workspace/inside/alpha']);
    });
  });
});

test('projectsDb id lookups stop resolving projects outside the workspace root', async () => {
  await withIsolatedDatabase(async () => {
    const inside = projectsDb.createProjectPath('/workspace/inside/alpha');
    const outside = projectsDb.createProjectPath('/elsewhere/beta');
    const insideId = inside.project?.project_id as string;
    const outsideId = outside.project?.project_id as string;

    await withWorkspacesRoot('/workspace/inside', () => {
      assert.equal(projectsDb.getProjectPathById(insideId), '/workspace/inside/alpha');
      assert.equal(projectsDb.getProjectPathById(outsideId), null);

      assert.equal(projectsDb.getProjectById(insideId)?.project_path, '/workspace/inside/alpha');
      assert.equal(projectsDb.getProjectById(outsideId), null);
    });
  });
});
