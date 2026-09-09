"""Small, credential-free image promotion contract shared by CI and operators."""
import json
import os
from pathlib import Path
import re
import sys
from datetime import datetime, timezone

REPOSITORY = 'ghcr.io/life2launchlabs/launch-lms'


def validate(data, *, commit=None, branch=None):
    if data.get('image_repository') != REPOSITORY:
        raise ValueError('Unexpected image repository')
    if not re.fullmatch(r'sha256:[a-f0-9]{64}', data.get('image_digest', '')):
        raise ValueError('A full image digest is required')
    if not re.fullmatch(r'[a-f0-9]{40}', data.get('commit_sha', '')):
        raise ValueError('A full source commit is required')
    if data.get('image_ref') != f"{REPOSITORY}@{data['image_digest']}":
        raise ValueError('Image reference does not match digest')
    if data.get('source_branch') not in ('dev', 'main'):
        raise ValueError('Candidate must come from dev or main')
    if commit and data['commit_sha'] != commit:
        raise ValueError('Candidate belongs to another commit')
    if branch and data['source_branch'] != branch:
        raise ValueError('Candidate belongs to another branch')
    return data


def promote(data, tag, commit):
    validate(data, commit=commit, branch='main')
    if not re.fullmatch(r'v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)', tag):
        raise ValueError('Production requires a stable vMAJOR.MINOR.PATCH tag')
    return {**data, 'version': tag, 'image_tag': tag, 'released_at': datetime.now(timezone.utc).isoformat()}


def main():
    mode, path = sys.argv[1:3]
    if mode == 'candidate':
        sha = os.environ['GITHUB_SHA']
        digest = os.environ['IMAGE_DIGEST']
        data = validate(dict(image_repository=REPOSITORY, image_digest=digest,
            image_ref=f'{REPOSITORY}@{digest}', commit_sha=sha,
            source_branch=os.environ['SOURCE_BRANCH'], version=f'sha-{sha}',
            image_tag=f'sha-{sha}', build_run_id=os.environ['GITHUB_RUN_ID'],
            released_at=datetime.now(timezone.utc).isoformat()))
        Path(path).write_text(json.dumps(data, indent=2)+'\n')
    elif mode == 'promote':
        data = promote(json.loads(Path(path).read_text()), os.environ['GITHUB_REF_NAME'], os.environ['GITHUB_SHA'])
        Path(sys.argv[3]).write_text(json.dumps(data, indent=2)+'\n')
    elif mode == 'reuse':
        data = validate(json.loads(Path(path).read_text()), commit=os.environ['GITHUB_SHA'])
        print(data['image_digest'])
    elif mode == 'dispatch':
        data = validate(json.loads(Path(path).read_text()), branch='dev')
        print(json.dumps({'event_type': 'unstable-candidate', 'client_payload': data}))
    else:
        raise ValueError('Unknown operation')


if __name__ == '__main__':
    main()
