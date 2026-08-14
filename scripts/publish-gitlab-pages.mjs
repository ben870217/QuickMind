import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repository = process.env.GITLAB_PAGES_REPOSITORY;
const token = process.env.GITLAB_PAGES_TOKEN;
const branch = process.env.GITLAB_PAGES_BRANCH || 'main';

if (!repository || !token) {
  throw new Error('GITLAB_PAGES_REPOSITORY and GITLAB_PAGES_TOKEN are required for publishing');
}

if (!/^[\w.-]+\/[\w./-]+$/.test(repository)) {
  throw new Error('GITLAB_PAGES_REPOSITORY must use the namespace/project format');
}

const cloneDirectory = await mkdtemp(join(tmpdir(), 'quickmind-pages-'));
const gitArguments = ['-c', `http.extraHeader=PRIVATE-TOKEN: ${token}`];

try {
  await execFileAsync('git', [
    ...gitArguments,
    'clone',
    '--depth=1',
    '--branch',
    branch,
    `https://gitlab.com/${repository}.git`,
    cloneDirectory,
  ]);

  await rm(join(cloneDirectory, 'public'), { recursive: true, force: true });
  await cp('dist', join(cloneDirectory, 'public'), { recursive: true });

  const pipelineFile = join(cloneDirectory, '.gitlab-ci.yml');
  try {
    await readFile(pipelineFile);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }

    await writeFile(
      pipelineFile,
      [
        'create-pages:',
        '  script:',
        '    - echo "Publishing QuickMind static site"',
        '  pages: true',
        '  rules:',
        '    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH',
        '',
      ].join('\n'),
    );
  }

  await execFileAsync('git', ['-C', cloneDirectory, 'config', 'user.name', 'QuickMind CI']);
  await execFileAsync('git', ['-C', cloneDirectory, 'config', 'user.email', 'quickmind-ci@users.noreply.github.com']);
  await execFileAsync('git', ['-C', cloneDirectory, 'add', 'public', '.gitlab-ci.yml']);

  const status = await execFileAsync('git', ['-C', cloneDirectory, 'status', '--porcelain']);
  if (!status.stdout.trim()) {
    console.log('GitLab Pages already contains this artifact');
    process.exit(0);
  }

  await execFileAsync('git', ['-C', cloneDirectory, 'commit', '-m', 'chore: publish QuickMind static site']);
  await execFileAsync('git', [...gitArguments, '-C', cloneDirectory, 'push', 'origin', branch]);
} finally {
  await rm(cloneDirectory, { recursive: true, force: true });
}
