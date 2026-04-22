from __future__ import annotations

from pathlib import Path
import ast


def _load_metadata(path: Path) -> tuple[str | None, object]:
    tree = ast.parse(path.read_text(), filename=str(path))
    revision: str | None = None
    down_revision: object = None

    for node in tree.body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if not isinstance(target, ast.Name):
                    continue
                if target.id == "revision":
                    revision = ast.literal_eval(node.value)
                elif target.id == "down_revision":
                    down_revision = ast.literal_eval(node.value)
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            if node.target.id == "revision":
                revision = ast.literal_eval(node.value)
            elif node.target.id == "down_revision":
                down_revision = ast.literal_eval(node.value)

    return revision, down_revision


def main() -> None:
    versions_dir = Path(__file__).resolve().parents[1] / "migrations" / "versions"

    revisions: set[str] = set()
    referenced: set[str] = set()

    for path in versions_dir.glob("*.py"):
        revision, down_revision = _load_metadata(path)
        if revision:
            revisions.add(revision)

        if isinstance(down_revision, str):
            referenced.add(down_revision)
        elif isinstance(down_revision, tuple):
            referenced.update(item for item in down_revision if isinstance(item, str))

    heads = sorted(revisions - referenced)
    if len(heads) != 1:
        raise SystemExit(f"Expected exactly 1 Alembic head, found {len(heads)}: {heads}")

    print(heads[0])


if __name__ == "__main__":
    main()
