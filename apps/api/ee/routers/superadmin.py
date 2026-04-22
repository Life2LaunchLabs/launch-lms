"""Compatibility shim for the legacy EE superadmin router.

The canonical implementation now lives in `src.routers.superadmin`.
Keep this module as a thin re-export so any stale imports continue to work
without creating a second divergent implementation.
"""

from src.routers.superadmin import router

__all__ = ["router"]
