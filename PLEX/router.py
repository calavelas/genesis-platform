from fastapi import APIRouter, HTTPException

from PLEX.universe import PlexUniverse, build_plex_universe

router = APIRouter()


@router.get("/api/plex/universe", response_model=PlexUniverse)
def get_plex_universe() -> PlexUniverse:
    try:
        return build_plex_universe()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
