"""Let a push to dev or main skip tests its pull request already passed on exactly the same code.

Tests depend only on the code (the git tree), not on the commit wrapped around it. A pull request
run that passed records the tree it checked; a push whose commit came from that merged pull request
and has the same tree reuses that result instead of running the tests again. Images are not reused
this way: every push still builds, smoke-tests and publishes its own image for its own commit.

  record PATH          write the checked tree of this run (pull request runs, after every check)
  find WORKFLOW        print `run_id=<id>` of the passed pull request run, or `run_id=` (push runs)
"""
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ARTIFACT = 'checked-tree'


def git_tree():
    return subprocess.run(['git', 'rev-parse', 'HEAD^{tree}'], check=True, capture_output=True, text=True).stdout.strip()


def merged_pull(pulls, sha, repo):
    """The pull request whose merge made this commit, from a branch of this repository."""
    for pull in pulls:
        if pull.get('merged_at') and pull.get('merge_commit_sha') == sha and ((pull.get('head') or {}).get('repo') or {}).get('full_name') == repo:
            return pull
    return None


def same_code(record, tree):
    return isinstance(record, dict) and len(tree) == 40 and record.get('tree') == tree


def gh(*args):
    return subprocess.run(['gh', *args], check=True, capture_output=True, text=True).stdout


def find(workflow):
    if os.environ.get('GITHUB_EVENT_NAME') == 'pull_request':
        return ''
    repo, sha, tree = os.environ['GITHUB_REPOSITORY'], os.environ['GITHUB_SHA'], git_tree()
    pull = merged_pull(json.loads(gh('api', f'repos/{repo}/commits/{sha}/pulls')), sha, repo)
    if not pull:
        return ''
    runs = json.loads(gh('api', f"repos/{repo}/actions/workflows/{workflow}/runs?event=pull_request&head_sha={pull['head']['sha']}&status=success&per_page=20"))
    for run in runs.get('workflow_runs', []):
        with tempfile.TemporaryDirectory() as folder:
            try:
                gh('run', 'download', str(run['id']), '--repo', repo, '--name', ARTIFACT, '--dir', folder)
                record = json.loads((Path(folder) / 'checked.json').read_text())
            except (subprocess.CalledProcessError, OSError, ValueError):
                continue
        if same_code(record, tree):
            print(f"Pull request #{pull['number']} run {run['id']} passed on this exact code (tree {tree}).", file=sys.stderr)
            return str(run['id'])
    return ''


def main():
    mode, arg = sys.argv[1:3]
    if mode == 'record':
        Path(arg).write_text(json.dumps({'tree': git_tree(), 'sha': os.environ.get('GITHUB_SHA', ''), 'run_id': os.environ.get('GITHUB_RUN_ID', '')}, indent=2) + '\n')
    elif mode == 'find':
        try:
            print(f'run_id={find(arg)}')
        except (subprocess.CalledProcessError, KeyError, ValueError) as error:
            # When in doubt, run everything.
            print(f'Could not look up the pull request run: {error}', file=sys.stderr)
            print('run_id=')
    else:
        raise ValueError('Unknown operation')


if __name__ == '__main__':
    main()
