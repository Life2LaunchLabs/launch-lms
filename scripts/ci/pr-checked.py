"""Let a push to dev or main reuse what its pull request or merge queue run already built and checked on the same code.

What CI checks depends only on the code (the git tree), not on the commit wrapped around it. A pull
request run that passed records the tree it checked and, for a branch of this repository, the image
it built and smoke-tested. A push whose commit came from that merged pull request with the same tree
skips the tests and, when there is an image, publishes that image as the pushed commit instead of
building another. The image keeps the commit it was built from (`build_commit_sha`); the release
records both, and the deploy checks the image against the commit it was built from.

Through dev's merge queue, the commit pushed to dev is the very commit the queue's `merge_group` run
checked, so that run is looked up first; the pull request's own run usually checked older code. The
queue merges as soon as the required checks pass, before the run has recorded what it checked, so a
queue run still going is waited for (up to QUEUE_WAIT seconds) instead of skipped.

  record PATH     write this run's checked tree and image (pull request and merge queue runs, after every check)
  find WORKFLOW   print `run_id=`, `image_digest=` and `build_commit=` lines (empty when nothing fits)
"""
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ARTIFACT = 'checked-tree'
SHA = re.compile(r'[0-9a-f]{40}')
DIGEST = re.compile(r'sha256:[0-9a-f]{64}')
QUEUE_WAIT = 20 * 60
QUEUE_POLL = 20


def git_tree():
    return subprocess.run(['git', 'rev-parse', 'HEAD^{tree}'], check=True, capture_output=True, text=True).stdout.strip()


def merged_pull(pulls, sha, repo):
    """The pull request whose merge made this commit, from a branch of this repository."""
    for pull in pulls:
        if pull.get('merged_at') and pull.get('merge_commit_sha') == sha and ((pull.get('head') or {}).get('repo') or {}).get('full_name') == repo:
            return pull
    return None


def same_code(record, tree):
    return isinstance(record, dict) and bool(SHA.fullmatch(tree)) and record.get('tree') == tree


def reusable_image(record):
    """The checked image and the commit it was built from, when the record has a well-formed one."""
    digest, commit = record.get('image_digest', ''), record.get('sha', '')
    if isinstance(digest, str) and DIGEST.fullmatch(digest) and isinstance(commit, str) and SHA.fullmatch(commit):
        return digest, commit
    return '', ''


def gh(*args):
    return subprocess.run(['gh', *args], check=True, capture_output=True, text=True).stdout


def finished(repo, run, wait=QUEUE_WAIT, poll=QUEUE_POLL, sleep=time.sleep):
    """The run once it has completed, waiting up to `wait` seconds for one still going."""
    waited = 0
    while run.get('status') != 'completed' and waited < wait:
        sleep(poll)
        waited += poll
        run = json.loads(gh('api', f"repos/{repo}/actions/runs/{run['id']}"))
    return run


def checked_runs(repo, workflow, sha, **waiting):
    """Successful runs that may have checked this commit's code: its merge queue run, then its pull request's."""
    runs = json.loads(gh('api', f"repos/{repo}/actions/workflows/{workflow}/runs?event=merge_group&head_sha={sha}&per_page=20"))
    for run in runs.get('workflow_runs', []):
        if str(run.get('head_branch') or '').startswith('gh-readonly-queue/'):
            run = finished(repo, run, **waiting)
            if run.get('conclusion') == 'success':
                yield run, 'Merge queue'
    pull = merged_pull(json.loads(gh('api', f'repos/{repo}/commits/{sha}/pulls')), sha, repo)
    if pull:
        runs = json.loads(gh('api', f"repos/{repo}/actions/workflows/{workflow}/runs?event=pull_request&head_sha={pull['head']['sha']}&status=success&per_page=20"))
        for run in runs.get('workflow_runs', []):
            yield run, f"Pull request #{pull['number']}"


def find(workflow):
    """(run id, image digest, build commit) of the queue or pull request run that checked this code, or empties."""
    none = ('', '', '')
    if os.environ.get('GITHUB_EVENT_NAME') in ('pull_request', 'merge_group'):
        return none
    repo, sha, tree = os.environ['GITHUB_REPOSITORY'], os.environ['GITHUB_SHA'], git_tree()
    for run, source in checked_runs(repo, workflow, sha):
        with tempfile.TemporaryDirectory() as folder:
            try:
                gh('run', 'download', str(run['id']), '--repo', repo, '--name', ARTIFACT, '--dir', folder)
                record = json.loads((Path(folder) / 'checked.json').read_text())
            except (subprocess.CalledProcessError, OSError, ValueError):
                continue
        if same_code(record, tree):
            print(f"{source} run {run['id']} passed on this exact code (tree {tree}).", file=sys.stderr)
            return (str(run['id']), *reusable_image(record))
    return none


def main():
    mode, arg = sys.argv[1:3]
    if mode == 'record':
        record = {'tree': git_tree(), 'sha': os.environ.get('GITHUB_SHA', ''), 'run_id': os.environ.get('GITHUB_RUN_ID', '')}
        if os.environ.get('IMAGE_DIGEST'):
            record['image_digest'] = os.environ['IMAGE_DIGEST']
        Path(arg).write_text(json.dumps(record, indent=2) + '\n')
    elif mode == 'find':
        try:
            run_id, digest, commit = find(arg)
        except (subprocess.CalledProcessError, KeyError, ValueError) as error:
            # When in doubt, build and check everything.
            print(f'Could not look up the pull request run: {error}', file=sys.stderr)
            run_id = digest = commit = ''
        print(f'run_id={run_id}\nimage_digest={digest}\nbuild_commit={commit}')
    else:
        raise ValueError('Unknown operation')


if __name__ == '__main__':
    main()
