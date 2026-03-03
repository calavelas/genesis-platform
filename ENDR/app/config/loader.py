from TARS.config.loader import *  # noqa: F401,F403
from TARS.config.loader import _main as _tars_loader_main


if __name__ == "__main__":
    raise SystemExit(_tars_loader_main())
