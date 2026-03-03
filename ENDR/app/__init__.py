from __future__ import annotations

import sys
from pathlib import Path

# Keep legacy app package entrypoints working while code lives under ENDR/TARS/.
_endr_root = Path(__file__).resolve().parents[1]
_repo_root = _endr_root.parent
for _path in (_endr_root, _repo_root):
    if str(_path) not in sys.path:
        sys.path.insert(0, str(_path))
