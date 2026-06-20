"""WebSocket game endpoints, connection manager, and AFK bot logic."""

import asyncio
import json
import logging
import random
import time
import uuid
from pathlib import Path
from typing import Optional

import sentry_sdk
from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.base import get_db
from app.db.models import User
from app.game.logic import (
    Game,
    GamePhase,
    Player,
    _finalize_order,
    _log,
    _resolve_round,
    _resolve_tiebreak,
    _start_initial_roll,
    classify,
    game_state,
)
from app.game.state import games

router = APIRouter()

logger = logging.getLogger(__name__)

ALGORITHM = "HS256"
_STATIC = Path(__file__).parent.parent.parent / "static"


async def _resolve_user_from_token(token: Optional[str]) -> Optional[str]:
    """Decode JWT from WS query param; returns user UUID string or None for guests."""
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None


class ConnectionManager:
    """Tracks WebSocket connections for both players and spectators per game."""

    def __init__(self):
        self.connections: dict[str, list[tuple]] = {}
        self.spectators: dict[str, list[WebSocket]] = {}

    async def connect(self, game_id: str, ws: WebSocket, player_id: str):
        """Accept and register a player WebSocket; kick any prior socket for the same player_id."""
        await ws.accept()
        existing = self.connections.get(game_id, [])
        # C2: only one live WS per player_id — last connect wins (reconnect / dup-tab semantics)
        for old_ws, pid in existing:
            if pid == player_id:
                try:
                    await old_ws.close(code=4001)
                except Exception:
                    pass
        self.connections[game_id] = [(w, pid) for w, pid in existing if pid != player_id]
        self.connections[game_id].append((ws, player_id))

    async def connect_spectator(self, game_id: str, ws: WebSocket):
        """Accept and register a spectator WebSocket."""
        await ws.accept()
        self.spectators.setdefault(game_id, []).append(ws)

    def disconnect(self, game_id: str, ws: WebSocket):
        """Remove a player WebSocket from the connection list."""
        if game_id in self.connections:
            self.connections[game_id] = [(w, p) for w, p in self.connections[game_id] if w != ws]

    def disconnect_spectator(self, game_id: str, ws: WebSocket):
        """Remove a spectator WebSocket from the connection list."""
        if game_id in self.spectators:
            self.spectators[game_id] = [w for w in self.spectators[game_id] if w != ws]

    def spectator_count(self, game_id: str) -> int:
        """Return the number of active spectators for a game."""
        return len(self.spectators.get(game_id, []))

    async def broadcast(self, game_id: str, data: dict):
        """Send a JSON payload to all players and spectators in a game."""
        targets = list(self.connections.get(game_id, []))
        for ws, _ in targets:
            try:
                await ws.send_json(data)
            except Exception:
                pass
        for ws in list(self.spectators.get(game_id, [])):
            try:
                await ws.send_json(data)
            except Exception:
                pass


manager = ConnectionManager()

# E3: serialize concurrent joins per game so the max_players check + append is atomic
_join_locks: dict[str, asyncio.Lock] = {}


def _join_lock(game_id: str) -> asyncio.Lock:
    """Return (creating if needed) the per-game lock used to serialize joins."""
    lock = _join_locks.get(game_id)
    if lock is None:
        lock = asyncio.Lock()
        _join_locks[game_id] = lock
    return lock


# WebSocket message limits (H1)
_MAX_WS_MSG_BYTES = 1024

# G2: grace window after the AFK bot plays during which the human can
# reconnect or send a play action to cancel the deferred cycle advance and
# reclaim their original turn. Short enough not to slow the table for the
# common "really AFK" case; long enough that a reconnect + click fits.
BOT_HANDBACK_GRACE_SECONDS = 3

# G56: pause between a human turn validating (manual done, auto-validate, or
# tiebreak final throw) and the cycle advance. Without this, the validated
# dice flash off-screen before the player can read what they rolled — the
# right-side journal still records it, but the player's eye is on the piste.
# Mirrors G2's bot-handback grace on the human side, but shorter — humans
# don't need a "reclaim" window, just a beat to register the result.
HUMAN_VALIDATE_HOLD_SECONDS = 1.5

# G2: play actions that should trigger handback abort when arriving from a
# player whose bot turn is still in the grace window. `leave` and `kick` are
# intentionally excluded — neither implies the player is reclaiming their turn.
_HANDBACK_PLAY_ACTIONS = frozenset({"roll", "keep", "done", "tiebreak_roll", "initial_roll"})


def _bot_pick_keepers(dice: list[int]) -> list[bool]:
    """Decide which of three dice to re-roll. Returns a [bool, bool, bool] mask
    (True = re-roll, False = keep).

    G9 heuristic — rules ordered by potential rank ceiling:
      1. Two or more 1s → keep all 1s (path to 111 = 7f or 11x = 2-6f).
      2. A 4 AND a 2 (with or without a 1) → keep them (chase 421 = 8f).
      3. Any pair → keep the pair (chase a triple). If a lone 1 is also
         present, keep it too — cheap upgrade path to 11x / 111.
      4. A lone 1 → keep it + the highest other die (cheap chase at 421/11x).
      5. Two consecutive values → keep them (chase a suite).
      6. Default → keep the highest, re-roll the other two.

    Pure function: caller decides whether to actually use it (e.g. only
    when the bot is still behind its target combo and has throws left).
    """
    counts = [0] * 7
    for d in dice:
        counts[d] += 1

    # Rule 1: 2+ aces. Path to 111 / 11x.
    if counts[1] >= 2:
        return [d != 1 for d in dice]

    # Rule 2: 4 + 2 (421 chase). Also keep any 1 already present.
    if counts[4] >= 1 and counts[2] >= 1:
        kept = {4: 0, 2: 0, 1: 0}
        reroll = [True, True, True]
        for i, d in enumerate(dice):
            if d in (4, 2, 1) and kept[d] < 1:
                reroll[i] = False
                kept[d] += 1
        return reroll

    # Rule 3: any pair. Two paths depending on the third die:
    #   (a) Pair X-X + lone 1 (X != 1): keep 1 + ONE pair member, reroll the
    #       other. Chases 11x (rank 7200+) — much higher EV than committing
    #       to the basic X-X-1 (max rank 661). User playtest showed the
    #       previous "keep all three" was the bot's biggest weakness: it
    #       stopped at nénette / 4-4-1 / 6-6-1 even with throws remaining.
    #   (b) Pair X-X + non-1 third: keep both pair members, reroll the
    #       third. Chases triple X (rank 2200-2600).
    for v in (6, 5, 4, 3, 2):
        if counts[v] >= 2:
            if counts[1] >= 1:
                # Path (a): chase 11x.
                reroll = [True, True, True]
                kept_v = 0
                for i, d in enumerate(dice):
                    if d == 1:
                        reroll[i] = False
                    elif d == v and kept_v < 1:
                        reroll[i] = False
                        kept_v = 1
                return reroll
            # Path (b): chase triple X.
            reroll = [True, True, True]
            kept_v = 0
            for i, d in enumerate(dice):
                if d == v and kept_v < 2:
                    reroll[i] = False
                    kept_v += 1
            return reroll

    # Rule 4: lone 1. Keep it + the highest other die.
    if counts[1] >= 1:
        reroll = [True, True, True]
        for i, d in enumerate(dice):
            if d == 1:
                reroll[i] = False
                break
        non_ones = [(i, d) for i, d in enumerate(dice) if d != 1]
        if non_ones:
            best_i, _ = max(non_ones, key=lambda t: t[1])
            reroll[best_i] = False
        return reroll

    # Rule 5: two consecutive values. Chase a suite (2 fiches).
    sorted_vals = sorted(dice)
    pair_consec = None
    if sorted_vals[2] - sorted_vals[1] == 1:
        pair_consec = (sorted_vals[1], sorted_vals[2])
    elif sorted_vals[1] - sorted_vals[0] == 1:
        pair_consec = (sorted_vals[0], sorted_vals[1])
    if pair_consec:
        a, b = pair_consec
        seen = {a: False, b: False}
        reroll = [True, True, True]
        for i, d in enumerate(dice):
            if d in seen and not seen[d]:
                reroll[i] = False
                seen[d] = True
        return reroll

    # Rule 6: keep the highest, re-roll the rest.
    best_i = max(range(3), key=lambda i: dice[i])
    return [i != best_i for i in range(3)]


# G55: rank threshold below which a starter shouldn't commit if it has throws
# available. Basic figures classify with rank `a*100 + b*10 + c` (max 665);
# the lowest suite is rank 1100. So `>= 1000` means "anything but a basic" —
# the bot's starter-floor target. If a starter has thrown a basic with throws
# still in hand, it should re-roll for a structured combo (the heuristic in
# `_bot_pick_keepers` knows how to chase one). Without this floor, the bot
# was committing to basics like `5-3-2` because `rank > target_rank == 0`
# trivially held — handing the cycle's rhythm to opponents at a basic rank.
_BOT_STARTER_FLOOR_RANK = 1000

# G55 follow-up: cap on the per-game `bot_decisions` buffer so a long-running
# room doesn't grow unbounded. Rolling — newest entries push old ones out.
_BOT_DECISIONS_BUFFER_CAP = 200


def _record_bot_throw(
    game: "Game",
    player: Player,
    throw_num: int,
    dice_before: list[int],
    kept_mask: list[bool],
    dice_after: list[int],
    combo: str,
    rank: int,
    fiches: int,
    target_rank: int,
    is_starter: bool,
    max_throws_allowed: int,
    stop_reason: Optional[str],
) -> None:
    """G55 follow-up: append one per-throw entry to `game.bot_decisions`.

    Captures the full reasoning context for a single bot throw — what dice
    came up, which the heuristic kept, what target was on the table, what
    the post-throw rank/combo became, and (if this throw ends the turn)
    why the bot stopped. Suboptimal sequences can be replayed offline by
    inspecting the buffer via the admin endpoint.

    Also emits a structured `bot_decision` log line (key=value) so server
    operators can grep production logs without touching the admin API.
    """
    entry = {
        "game_id": game.id,
        "player_id": player.id,
        "player_name": player.name,
        "is_starter": is_starter,
        "throw": throw_num,
        "dice_before": list(dice_before),
        "kept_mask": list(kept_mask),
        "dice_after": list(dice_after),
        "combo": combo,
        "rank": rank,
        "fiches": fiches,
        "target_rank": target_rank,
        "max_throws_allowed": max_throws_allowed,
        "stop_reason": stop_reason,
    }
    game.bot_decisions.append(entry)
    if len(game.bot_decisions) > _BOT_DECISIONS_BUFFER_CAP:
        # Drop oldest until back at the cap.
        del game.bot_decisions[: len(game.bot_decisions) - _BOT_DECISIONS_BUFFER_CAP]
    # Structured server log for grep/jq.
    logger.info(
        "bot_decision",
        extra={"bot_decision": entry},
    )


def _bot_take_turn(player: Player, game: Optional[Game] = None) -> None:
    """Bot plays the player's turn.

    G9 introduced game-awareness (read the table, beat the target). G55
    refines the heuristic so a *starter* doesn't lock the cycle's rhythm
    at a basic figure — if the starter has throws left and only a basic
    in hand, push for a structured combo (suite, pair, 11x, 421, ...).
    Non-starter logic stays: beat the highest combo at the table, then
    stop.

    Behavior:
      * If `game` is None (isolated unit tests of the bot helper), roll
        all three dice once and mark done — legacy fallback.
      * If `game` is provided:
          - Compute `target_rank` from players who've already played.
          - For non-starters: stop on `rank > target_rank` (existing).
          - For starters with `target_rank == 0`: stop only when rank
            meets the starter floor (>= 1000, i.e. any non-basic).
          - Always stop on: no throws left, max_throws cap reached, 421
            ceiling, or `_bot_pick_keepers` says keep everything.
      * Emits a `log_bot_decision` event on `game.log_events` summarizing
        the turn (final dice, throws used, target, reason for stopping)
        so the bot's reasoning is inspectable in the journal.

    On exit, `turn.rolls_left` reflects the actual throws used (mirrors
    the human `done` handler) so the caller can read it for starter-
    rhythm lock.
    """
    turn = player.turn
    # G55 follow-up: stash the pre-throw dice so the per-throw decision log
    # can show "what came up" vs "what we kept". For the very first throw
    # the bot rolls all three from a zeroed turn, so dice_before is [0,0,0].
    pre_throw_dice = list(turn.dice)
    first_throw_kept_mask = [False, False, False]

    # Fresh turn → take the first roll.
    if turn.rolls_left == 3:
        for i in range(3):
            turn.dice[i] = random.randint(1, 6)
        turn.rolls_left -= 1
        turn.combo, turn.rank, turn.fiches = classify(turn.dice)

    # Legacy path: no game context → one-shot roll, done.
    if game is None:
        turn.reroll = [False, False, False]
        turn.rolls_left = 0
        turn.done = True
        return

    # Target rank to beat: the highest rank among players who have already
    # played this cycle. Bot wants strictly higher to avoid being the loser.
    target_rank = 0
    for p in game.players:
        if p.id == player.id or not p.turn or not p.turn.done:
            continue
        if p.turn.rank > target_rank:
            target_rank = p.turn.rank

    # Per-turn cap. bank_rule=="sec" + CHARGE = single roll for everyone.
    is_starter = player.id == game.round_starter_id
    if game.phase == GamePhase.CHARGE and game.bank_rule == "sec":
        max_throws_for_me = 1
    elif not is_starter and game.max_throws_this_round > 0:
        max_throws_for_me = game.max_throws_this_round
    else:
        max_throws_for_me = 3

    # G55 follow-up: collect per-throw snapshots here as the bot iterates.
    # We don't write each one to `game.bot_decisions` until the turn ends
    # so the `stop_reason` field can be filled in on the last entry. The
    # buffer holds (throw_num, dice_before, kept_mask, dice_after, combo,
    # rank, fiches) tuples.
    throw_log: list[dict] = []
    # Pre-throw dice for the very first iteration is whatever was on `turn`
    # before this function ran (typically [0,0,0]). The first roll above
    # already happened; treat it as throw #1 with kept_mask = all-True
    # (the bot kept nothing — it rolled everything fresh).
    throw_log.append(
        {
            "throw": 1,
            "dice_before": pre_throw_dice,
            "kept_mask": first_throw_kept_mask,
            "dice_after": list(turn.dice),
            "combo": turn.combo,
            "rank": turn.rank,
            "fiches": turn.fiches,
        }
    )

    # Track why we stopped so the decision event can be inspected.
    stop_reason = "unknown"
    while True:
        rolls_used = 3 - turn.rolls_left
        # G55: the win check differs for starter vs non-starter.
        # - Non-starter (target_rank > 0): any rank above target wins the
        #   cycle, commit it.
        # - Starter (target_rank == 0): a "basic" rank under 1000 hands
        #   the rhythm cheaply; only commit when rank >= STARTER_FLOOR
        #   *or* we're out of throws/options (those break paths below).
        beats_target = turn.rank > target_rank and turn.rank > 0
        meets_starter_floor = turn.rank >= _BOT_STARTER_FLOOR_RANK
        if beats_target and (target_rank > 0 or meets_starter_floor):
            stop_reason = "beats_target" if target_rank > 0 else "starter_floor_met"
            break
        if turn.rolls_left <= 0:
            stop_reason = "no_throws_left"
            break
        if rolls_used >= max_throws_for_me:
            stop_reason = "max_throws_cap"
            break
        if turn.combo == "421":
            stop_reason = "ceiling_421"
            break

        reroll = _bot_pick_keepers(turn.dice)
        if not any(reroll):
            # G55 follow-up: defensive safeguard for the case the heuristic
            # says "hold" with a worse-than-our-goal hand and throws still
            # available. The original logic would commit at a basic rank
            # below the starter floor (or below the non-starter target) —
            # the user's playtest flagged this for pair-plus-lone-1 hands
            # (4-4-1, 6-6-1, 2-2-1). The fix to Rule 3 above resolves those
            # specific dice patterns; this block catches any future
            # heuristic regression that produces the same bad pattern by
            # forcing the lowest die to re-roll.
            below_starter_floor = (
                is_starter
                and target_rank == 0
                and turn.rank > 0
                and turn.rank < _BOT_STARTER_FLOOR_RANK
            )
            below_target = target_rank > 0 and turn.rank <= target_rank
            if turn.rolls_left > 0 and (below_starter_floor or below_target):
                lowest_i = min(range(3), key=lambda i: turn.dice[i])
                reroll = [j == lowest_i for j in range(3)]
            else:
                stop_reason = "keepers_say_hold"
                break
        pre_reroll_dice = list(turn.dice)
        # `reroll[i] == True` means re-roll position i; kept_mask is the
        # inverse so the log reads "what we KEPT" directly.
        kept_mask = [not r for r in reroll]
        for i, do_reroll in enumerate(reroll):
            if do_reroll:
                turn.dice[i] = random.randint(1, 6)
        turn.rolls_left -= 1
        turn.combo, turn.rank, turn.fiches = classify(turn.dice)
        throw_log.append(
            {
                "throw": 3 - turn.rolls_left,
                "dice_before": pre_reroll_dice,
                "kept_mask": kept_mask,
                "dice_after": list(turn.dice),
                "combo": turn.combo,
                "rank": turn.rank,
                "fiches": turn.fiches,
            }
        )

    turn.reroll = [False, False, False]
    turn.done = True

    # G55 follow-up: flush the per-throw log to `game.bot_decisions`. The
    # last entry carries the `stop_reason`; earlier entries get None for
    # that field (they didn't end the turn). Each entry also picks up the
    # static-per-turn context (target_rank, is_starter, max_throws cap).
    for idx, snap in enumerate(throw_log):
        is_last = idx == len(throw_log) - 1
        _record_bot_throw(
            game=game,
            player=player,
            throw_num=snap["throw"],
            dice_before=snap["dice_before"],
            kept_mask=snap["kept_mask"],
            dice_after=snap["dice_after"],
            combo=snap["combo"],
            rank=snap["rank"],
            fiches=snap["fiches"],
            target_rank=target_rank,
            is_starter=is_starter,
            max_throws_allowed=max_throws_for_me,
            stop_reason=stop_reason if is_last else None,
        )

    # G55: surface the bot's reasoning so the journal shows what it did
    # and why. One event per turn — not in HEADLINE_KEYS, so the ticker
    # ignores it; the right-side log renders it via the raw-msg fallback.
    final_throws = 3 - turn.rolls_left
    sorted_dice = sorted(turn.dice, reverse=True)
    _log(
        game,
        "log_bot_decision",
        f"🤖 {player.name} → {turn.combo} en {final_throws} lancer(s) · {stop_reason}",
        name=player.name,
        throws=final_throws,
        dice=sorted_dice,
        combo=turn.combo,
        rank=turn.rank,
        target=target_rank,
        reason=stop_reason,
        is_starter=is_starter,
    )


async def _afk_timer(game: Game, player_id: str, game_id: str):
    """Wait afk_seconds then auto-play for the player if they still haven't acted."""
    from copy import deepcopy

    from app.services.afk_eviction import (
        evict_player,
        is_eviction_due,
        mark_afk_started,
        should_send_warning,
        warning_payload,
    )

    await asyncio.sleep(game.afk_seconds)
    player = next((p for p in game.players if p.id == player_id), None)
    if not player or player.turn is None or player.turn.done:
        return
    if game.current_player() and game.current_player().id != player_id:
        return

    # G93: stamp the start of this AFK episode on first bot-takeover.
    # Idempotent — subsequent bot turns within the same episode are no-ops.
    await mark_afk_started(player)

    # G93: if the AFK clock has run out, evict the player instead of playing
    # another bot turn. The seat frees up; remaining clients see the roster
    # shrink via the post-eviction broadcast.
    if is_eviction_due(player):
        _log(
            game,
            "log_afk_eviction",
            f"{player.name} a été retiré(e) de la partie pour inactivité.",
            name=player.name,
        )
        await evict_player(game, player, broadcaster=manager.broadcast)
        await manager.broadcast(game_id, game_state(game))
        return

    # G93: T-2min warning toast. Idempotent per AFK episode via
    # `afk_warnings_sent`. Targets only the AFK player's sockets so the
    # warning doesn't spam everyone at the table.
    if should_send_warning(player):
        try:
            for ws, pid in list(manager.connections.get(game_id, [])):
                if pid == player_id:
                    try:
                        await ws.send_json(warning_payload(player))
                    except Exception:  # noqa: BLE001
                        pass
        finally:
            player.afk_warnings_sent += 1

    # G2: snapshot BEFORE the bot mutates anything. If the human reconnects /
    # acts during the grace window, we restore this snapshot and the bot's
    # play is undone — they get to play their own turn from where they left off.
    snapshot = deepcopy(player.turn)
    # Surface the AFK takeover separately from the bot's actual play so the table
    # sees who stepped away before the throw appears in the log.
    _log(
        game,
        "log_afk_takeover",
        f"{player.name} est AFK — le bot prend la main.",
        name=player.name,
    )
    _bot_take_turn(player, game)
    t = player.turn
    # G9: if the bot is the starter, lock the rhythm based on how many throws
    # it actually used. Mirrors the human `done` handler so the rest of the
    # table inherits the correct cap for the cycle. Snapshot the prior value
    # so handback can restore it if the human aborts.
    prior_max_throws = game.max_throws_this_round
    rhythm_locked_by_bot = False
    if player_id == game.round_starter_id:
        if game.phase == GamePhase.CHARGE and game.bank_rule == "sec":
            game.max_throws_this_round = 1
        else:
            game.max_throws_this_round = max(3 - t.rolls_left, 1)
        rhythm_locked_by_bot = True
    dice_sorted = sorted(t.dice, reverse=True)
    _log(
        game,
        "log_afk_turn",
        f"{player.name} (AFK): {dice_sorted} → {t.combo} ({t.fiches}f)",
        name=player.name,
        dice=dice_sorted,
        combo=t.combo,
        fiches=t.fiches,
    )
    # G50 follow-up: mark this player as in an open AFK session. Cleared when
    # they take a play action (post-grace return → `log_afk_return`) or when
    # the in-grace handback aborts (covered by `_abort_bot_handback` →
    # `log_bot_handback`). Idempotent on a set, so back-to-back bot turns just
    # keep the player in the session.
    game.afk_session.add(player_id)
    # G2: stash the snapshot + rhythm-restore info before broadcasting so a
    # reconnect-driven abort race always finds it.
    game.bot_handback_snapshots[player_id] = {
        "turn": snapshot,
        "max_throws_this_round": prior_max_throws if rhythm_locked_by_bot else None,
        "log_events_len": len(game.log_events),
        "log_len": len(game.log),
    }
    # Broadcast the bot's play immediately so the table sees what happened.
    await manager.broadcast(game_id, game_state(game))
    # Defer the cycle advance for the grace window. If the human aborts in
    # time, `_abort_bot_handback` cancels this task and restores state.
    task = asyncio.create_task(_finalize_bot_turn(game, player_id, game_id))
    game.bot_handback_tasks[player_id] = task


async def _finalize_bot_turn(game: Game, player_id: str, game_id: str):
    """G2: after the bot's play sits visible for the grace window, run the
    deferred advance + resolve + AFK-reschedule chain. If the human aborted
    in the window this task is cancelled before it gets here."""
    try:
        await asyncio.sleep(BOT_HANDBACK_GRACE_SECONDS)
    except asyncio.CancelledError:
        return
    # Drop our bookkeeping now — past this point, the turn is committed.
    game.bot_handback_tasks.pop(player_id, None)
    game.bot_handback_snapshots.pop(player_id, None)
    game.advance()
    if game.all_done():
        await _resolve_round(game)
    await manager.broadcast(game_id, game_state(game))
    _schedule_afk(game, game_id)


def _abort_bot_handback(game: Game, player_id: str) -> bool:
    """G2: cancel a pending bot-handback for this player and restore the turn
    snapshot the bot was about to commit. Returns True if a handback was
    actually aborted, False if there wasn't one pending (e.g. window already
    expired). Caller is responsible for any post-restore broadcast / logging."""
    task = game.bot_handback_tasks.pop(player_id, None)
    snapshot = game.bot_handback_snapshots.pop(player_id, None)
    if task is None or snapshot is None:
        return False
    if not task.done():
        task.cancel()
    # G50 follow-up: in-grace handback already announces the return via
    # `log_bot_handback`; drop the player from the AFK-session set so the
    # post-grace `log_afk_return` path doesn't double-fire on the next action.
    game.afk_session.discard(player_id)
    player = next((p for p in game.players if p.id == player_id), None)
    if player is not None:
        player.turn = snapshot["turn"]
        # G93: human is back — reset the eviction clock so they get the
        # full timeout window on their next AFK episode.
        player.afk_started_at = None
        player.afk_warnings_sent = 0
    # Restore the rhythm if the bot's play locked it as starter.
    if snapshot.get("max_throws_this_round") is not None:
        game.max_throws_this_round = snapshot["max_throws_this_round"]
    # Roll back the AFK takeover + bot-turn log entries so the human's
    # reclaimed turn isn't shadowed by stale event banners.
    new_log_len = snapshot.get("log_len", len(game.log))
    new_events_len = snapshot.get("log_events_len", len(game.log_events))
    del game.log[new_log_len:]
    del game.log_events[new_events_len:]
    _log(
        game,
        "log_bot_handback",
        f"{player.name if player else player_id} reprend la main.",
        name=player.name if player else "",
    )
    return True


async def _afk_initial_timer(game: Game, player_id: str, game_id: str):
    """Roll an initial die for an AFK player; finalize order if last to roll."""
    await asyncio.sleep(game.afk_seconds)
    if game.phase != GamePhase.INITIAL_ROLL:
        return
    if game.initial_rolls.get(player_id) is not None:
        return
    player = next((p for p in game.players if p.id == player_id), None)
    if not player:
        return
    roll = random.randint(1, 6)
    game.initial_rolls[player_id] = roll
    _log(
        game,
        "log_afk_initial",
        f"{player.name} (AFK) lance {roll}",
        name=player.name,
        roll=roll,
    )
    if all(v is not None for v in game.initial_rolls.values()):
        _finalize_order(game)
    await manager.broadcast(game_id, game_state(game))
    _schedule_afk(game, game_id)


def _cancel_afk(game: Game, player_id: str):
    """Cancel any running AFK timer AND any pending bot-handback for the player.

    G2: leave / kick / disconnect cleanup paths should drop both timers; the
    handback task in particular would otherwise fire later and try to
    `game.advance()` on behalf of a player who's no longer at the table.
    Restoration is NOT performed here — caller intent is "this slot is gone",
    not "the human is back."
    """
    task = game.afk_tasks.pop(player_id, None)
    if task:
        task.cancel()
    handback = game.bot_handback_tasks.pop(player_id, None)
    if handback and not handback.done():
        handback.cancel()
    game.bot_handback_snapshots.pop(player_id, None)
    # G50 follow-up: leave / kick / disconnect releases the slot — don't
    # leave a stale entry that would mis-fire `log_afk_return` if the
    # player_id were ever recycled.
    game.afk_session.discard(player_id)


async def _validate_hold(game: Game, game_id: str) -> None:
    """G56: broadcast the validated state then hold so the player can read
    what they just rolled before the cycle advances.

    Caller has already mutated `turn.done = True` and emitted the `log_turn`
    event but has NOT yet called `game.advance()` / `_resolve_round`. We
    broadcast the held state (dice visible, turn marked done) and sleep —
    the caller resumes after `await` and runs the advance/resolve mutations,
    then broadcasts again.
    """
    await manager.broadcast(game_id, game_state(game))
    await asyncio.sleep(HUMAN_VALIDATE_HOLD_SECONDS)


async def _afk_tiebreak_timer(game: Game, player_id: str, game_id: str):
    """Roll a tiebreak die for an AFK tied player; resolve if last to throw."""
    from app.game.logic import _resolve_tiebreak

    await asyncio.sleep(game.afk_seconds)
    if game.phase != GamePhase.TIEBREAK or not game.tiebreak:
        return
    if player_id != game.tiebreak.get("next_pid"):
        return
    player = next((p for p in game.players if p.id == player_id), None)
    if not player:
        return
    dice = [random.randint(1, 6) for _ in range(3)]
    combo, rank, fiches = classify(dice)
    game.tiebreak["throws"][player_id] = {
        "dice": dice,
        "combo": combo,
        "rank": rank,
        "fiches": fiches,
    }
    sorted_dice = sorted(dice, reverse=True)
    _log(
        game,
        "log_tiebreak_throw",
        f"{player.name} (AFK, départage) : {sorted_dice} → {combo} ({fiches}f)",
        name=player.name,
        dice=sorted_dice,
        combo=combo,
        fiches=fiches,
    )
    tied = game.tiebreak["tied_pids"]
    idx = tied.index(player_id) + 1
    if idx >= len(tied):
        game.tiebreak["next_pid"] = None
        await _resolve_tiebreak(game)
    else:
        game.tiebreak["next_pid"] = tied[idx]
    await manager.broadcast(game_id, game_state(game))
    _schedule_afk(game, game_id)


def _schedule_afk(game: Game, game_id: str):
    """Start AFK timers for the players who need to act in the current phase."""
    if not game.afk_bot:
        game.afk_started_at = None
        return
    if game.phase == GamePhase.INITIAL_ROLL:
        # Each player needs to roll once; one timer per pending player. Skip slots
        # that already have a live task (covers both first-roll and tie re-rolls).
        game.afk_started_at = None
        for p in game.players:
            if game.initial_rolls.get(p.id) is not None:
                continue
            existing = game.afk_tasks.get(p.id)
            if existing and not existing.done():
                continue
            task = asyncio.create_task(_afk_initial_timer(game, p.id, game_id))
            game.afk_tasks[p.id] = task
        return
    if game.phase == GamePhase.TIEBREAK and game.tiebreak:
        next_pid = game.tiebreak.get("next_pid")
        if not next_pid:
            game.afk_started_at = None
            return
        _cancel_afk(game, next_pid)
        task = asyncio.create_task(_afk_tiebreak_timer(game, next_pid, game_id))
        game.afk_tasks[next_pid] = task
        game.afk_started_at = int(time.time() * 1000)
        return
    if game.phase not in (GamePhase.CHARGE, GamePhase.DECHARGE):
        game.afk_started_at = None
        return
    current = game.current_player()
    if not current:
        game.afk_started_at = None
        return
    _cancel_afk(game, current.id)
    task = asyncio.create_task(_afk_timer(game, current.id, game_id))
    game.afk_tasks[current.id] = task
    game.afk_started_at = int(time.time() * 1000)


@router.post("/api/create")
async def create_game(
    is_public: bool = False,
    max_players: int = 5,
    bank_rule: str = "free",
    afk_seconds: int = 45,
    afk_bot: bool = True,
    allow_spectators: bool = True,
    default_lang: str = "fr",
    default_theme: str = "light",
    token: Optional[str] = Query(default=None),
):
    """Create a new game room and return its short ID."""
    if max_players < 2 or max_players > 5:
        max_players = 5
    if bank_rule not in ("sec", "free"):
        bank_rule = "free"
    if afk_seconds < 10 or afk_seconds > 300:
        afk_seconds = 45
    # G46: room-presentation defaults validated at the boundary so the
    # Game dataclass + game_state both stay clean.
    if default_lang not in ("fr", "en"):
        default_lang = "fr"
    if default_theme not in ("light", "dark"):
        default_theme = "light"

    gid = str(uuid.uuid4())[:8].upper()
    games[gid] = Game(
        id=gid,
        is_public=is_public,
        max_players=max_players,
        bank_rule=bank_rule,
        afk_seconds=afk_seconds,
        afk_bot=afk_bot,
        allow_spectators=allow_spectators,
        default_lang=default_lang,
        default_theme=default_theme,
    )
    return {"game_id": gid}


@router.get("/api/join/{game_id}")
async def join_game(
    game_id: str,
    name: str,
    token: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Add a player to a room by name; returns player_id and join status."""
    gid = game_id.upper()
    game = games.get(gid)
    if not game:
        return {"error": "Game not found"}

    user_id = await _resolve_user_from_token(token)
    has_avatar = False
    if user_id:
        row = await db.execute(select(User.avatar_data).where(User.id == user_id))
        has_avatar = row.scalar_one_or_none() is not None

    # E3: serialize the capacity check + mutation so concurrent joins can't overshoot max_players
    async with _join_lock(gid):
        if game.phase in (GamePhase.WAITING, GamePhase.INITIAL_ROLL):
            if len(game.players) >= game.max_players:
                return {"error": "Game is full"}

        pid = str(uuid.uuid4())[:8]
        player = Player(id=pid, name=name)

        if game.phase in (GamePhase.WAITING, GamePhase.INITIAL_ROLL):
            game.players.append(player)
            game.user_ids[pid] = user_id
            game.has_avatars[pid] = has_avatar
            if game.phase == GamePhase.INITIAL_ROLL:
                game.initial_rolls[pid] = None
            if not game.host_player_id:
                game.host_player_id = pid
            return {"player_id": pid, "game_id": game.id, "status": "joined"}

        game.waiting_players.append(player)
        game.user_ids[pid] = user_id
        game.has_avatars[pid] = has_avatar
        return {"player_id": pid, "game_id": game.id, "status": "waiting"}


def _serve(filename: str) -> FileResponse:
    """Return a FileResponse for a static file; raises 500 if missing."""
    path = _STATIC / filename
    if not path.is_file():
        logger.error("Static file not found: %s (STATIC=%s)", path, _STATIC)
        from fastapi import HTTPException

        raise HTTPException(status_code=500, detail=f"Static file missing: {filename}")
    return FileResponse(path)


@router.get("/")
def index():
    """Serve the SPA shell for the root path."""
    return _serve("dist/index.html")


@router.get("/{full_path:path}", include_in_schema=False)
def spa_fallback(full_path: str):
    """Serve static assets by exact path; fall back to SPA shell for all other routes."""
    candidate = _STATIC / "dist" / full_path
    if candidate.is_file():
        return FileResponse(candidate)
    return _serve("dist/index.html")


@router.websocket("/ws/{game_id}/spectate")
async def spectate_endpoint(
    ws: WebSocket,
    game_id: str,
    token: Optional[str] = Query(default=None),
):
    """WebSocket endpoint for read-only spectators; requires allow_spectators=True."""
    game = games.get(game_id.upper())
    if not game or not game.allow_spectators:
        await ws.close()
        return

    await manager.connect_spectator(game_id.upper(), ws)
    try:
        state = game_state(game)
        state["spectator_count"] = manager.spectator_count(game_id.upper())
        await ws.send_json(state)
        # Drain incoming messages (spectators cannot act)
        async for _ in ws.iter_text():
            pass
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("Spectator WS error game=%s", game_id)
    finally:
        manager.disconnect_spectator(game_id.upper(), ws)


async def _dispatch(
    game: Game,
    game_id: str,
    ws: WebSocket,
    player: Player,
    player_id: str,
    action: Optional[str],
    msg: dict,
) -> Optional[str]:
    """Dispatch a single WS message to its action handler.

    Returns ``"break"`` to signal the caller to exit its receive loop (used by
    the ``leave`` action when the room dissolves). Any other return value means
    "keep listening". An exception here is caught by ``websocket_endpoint`` and
    logged without dropping the connection.
    """
    # G2: a play action arriving from a player whose bot turn is still in the
    # grace window means the human is back at the keyboard. Abort the deferred
    # advance and restore the snapshot BEFORE the handler reads/mutates state.
    if action in _HANDBACK_PLAY_ACTIONS and player_id in game.bot_handback_tasks:
        _abort_bot_handback(game, player_id)
    # G50 follow-up: post-grace return — the bot already finished one or more
    # turns for this player and the handback window expired. The G2 branch
    # above didn't fire (no pending task), so we announce the return here so
    # the table sees the player come back. `_abort_bot_handback` already
    # discards from `afk_session`, so the two branches don't double-emit.
    elif action in _HANDBACK_PLAY_ACTIONS and player_id in game.afk_session:
        game.afk_session.discard(player_id)
        returning = next((p for p in game.players if p.id == player_id), None)
        if returning is not None:
            # G93: human is back — reset the eviction clock.
            returning.afk_started_at = None
            returning.afk_warnings_sent = 0
            _log(
                game,
                "log_afk_return",
                f"{returning.name} reprend la main.",
                name=returning.name,
            )

    if action == "start":
        if game.phase != GamePhase.WAITING:
            return None
        if player_id != game.host_player_id:
            return None
        if len(game.players) < 2:
            return None
        _start_initial_roll(game)
        _schedule_afk(game, game_id)
        await manager.broadcast(game_id, game_state(game))
        return None

    if action == "leave":
        _cancel_afk(game, player_id)

        # G18: persist this player's session stats if they were actively
        # playing AND they're a registered user. Snapshot the values FIRST
        # because the cleanup below pops them from the game dicts.
        # G98 follow-up: pass manche counters through so the leave-mid-game
        # path doesn't leave manches_played/manches_lost stuck at zero.
        if game.phase in (GamePhase.CHARGE, GamePhase.DECHARGE, GamePhase.TIEBREAK):
            leaver_user_id = game.user_ids.get(player_id)
            if leaver_user_id:
                from app.services.game_persistence import persist_player_session

                asyncio.create_task(
                    persist_player_session(
                        leaver_user_id,
                        game.id,
                        game.round_points.get(player_id, 0),
                        manches_played=game.manches_played.get(player_id, 0),
                        manches_lost=game.manches_lost.get(player_id, 0),
                    )
                )

        leaver_index = next((i for i, p in enumerate(game.players) if p.id == player_id), -1)
        game.players = [p for p in game.players if p.id != player_id]
        game.user_ids.pop(player_id, None)
        game.match_losses.pop(player_id, None)
        game.round_points.pop(player_id, None)
        game.has_avatars.pop(player_id, None)
        game.initial_rolls.pop(player_id, None)
        game.out_of_match.discard(player_id)

        _log(
            game,
            "log_player_left",
            f"← {player.name} a quitté la salle.",
            name=player.name,
        )

        if not game.players:
            games.pop(game_id.upper(), None)
            _join_locks.pop(game_id.upper(), None)
            await ws.close()
            return "break"
        if game.host_player_id == player_id and game.phase == GamePhase.WAITING:
            games.pop(game_id.upper(), None)
            _join_locks.pop(game_id.upper(), None)
            await manager.broadcast(game_id, game_state(game))
            await ws.close()
            return "break"

        if leaver_index >= 0 and leaver_index < game.current_index:
            game.current_index -= 1
        if game.current_index >= len(game.players):
            game.current_index = 0

        if game.round_starter_id == player_id and game.players:
            game.round_starter_id = game.players[game.current_index].id

        if game.host_player_id == player_id and game.players:
            longest = min(game.players, key=lambda p: p.joined_at)
            game.host_player_id = longest.id

        if game.all_done():
            await _resolve_round(game)
        else:
            _schedule_afk(game, game_id)
        await manager.broadcast(game_id, game_state(game))
        await ws.close()
        return "break"

    if action == "initial_roll":
        if game.phase != GamePhase.INITIAL_ROLL:
            return None
        if player_id not in game.initial_rolls or game.initial_rolls[player_id] is not None:
            return None
        _cancel_afk(game, player_id)
        game.initial_rolls[player_id] = random.randint(1, 6)
        if all(v is not None for v in game.initial_rolls.values()):
            _finalize_order(game)
        _schedule_afk(game, game_id)
        await manager.broadcast(game_id, game_state(game))
        return None

    if action == "roll":
        if game.phase not in (GamePhase.CHARGE, GamePhase.DECHARGE):
            return None
        if game.current_player() is None or game.current_player().id != player_id:
            return None
        t = player.turn
        if t is None or t.done or t.rolls_left <= 0:
            return None
        is_starter = player_id == game.round_starter_id
        rolls_used = 3 - t.rolls_left
        if game.phase == GamePhase.CHARGE and game.bank_rule == "sec":
            if rolls_used >= 1:
                return None
        elif not is_starter and rolls_used >= game.max_throws_this_round:
            return None
        _cancel_afk(game, player_id)
        # Click-to-keep semantics (Yahtzee): reroll[i]=True ⇒ die will be re-rolled.
        # Default after each roll is all-True; player clicks to lock individual dice.
        for i in range(3):
            if t.rolls_left == 3 or t.reroll[i]:
                t.dice[i] = random.randint(1, 6)
        t.reroll = [True, True, True]
        t.rolls_left -= 1
        t.combo, t.rank, t.fiches = classify(t.dice)

        # Auto-validate (G3) when the player has no remaining throws.
        is_at_max = (
            t.rolls_left <= 0
            or (game.phase == GamePhase.CHARGE and game.bank_rule == "sec")
            or (not is_starter and (3 - t.rolls_left) >= game.max_throws_this_round)
        )
        if is_at_max:
            t.done = True
            if (
                player_id == game.round_starter_id
                and game.phase == GamePhase.CHARGE
                and game.bank_rule == "sec"
            ):
                game.max_throws_this_round = 1
            sorted_dice = sorted(t.dice, reverse=True)
            _log(
                game,
                "log_turn",
                f"{player.name}: {sorted_dice} → {t.combo} ({t.fiches}f)",
                name=player.name,
                dice=sorted_dice,
                combo=t.combo,
                fiches=t.fiches,
            )
            # G56: hold the validated dice on the piste so the player can
            # actually read the auto-validated throw before the board advances.
            # This is the path where the original complaint hits hardest —
            # max-throws-reached fires synchronously after the roll, with no
            # intervening human action.
            await _validate_hold(game, game_id)
            game.advance()
            if game.all_done():
                await _resolve_round(game)
        _schedule_afk(game, game_id)
        await manager.broadcast(game_id, game_state(game))
        return None

    if action == "keep":
        if game.phase not in (GamePhase.CHARGE, GamePhase.DECHARGE):
            return None
        if game.current_player() is None or game.current_player().id != player_id:
            return None
        t = player.turn
        if t is None or t.rolls_left == 3 or t.done:
            return None
        is_starter = player_id == game.round_starter_id
        rolls_used = 3 - t.rolls_left
        if not is_starter and rolls_used >= game.max_throws_this_round:
            return None
        _cancel_afk(game, player_id)
        idx = msg.get("index")
        if idx is not None and 0 <= idx < 3:
            t.reroll[idx] = not t.reroll[idx]
        _schedule_afk(game, game_id)
        await manager.broadcast(game_id, game_state(game))
        return None

    if action == "done":
        if game.phase not in (GamePhase.CHARGE, GamePhase.DECHARGE):
            return None
        if game.current_player() is None or game.current_player().id != player_id:
            return None
        t = player.turn
        if t is None or t.rolls_left == 3:
            return None
        _cancel_afk(game, player_id)
        t.done = True
        if player_id == game.round_starter_id:
            if game.phase == GamePhase.CHARGE and game.bank_rule == "sec":
                game.max_throws_this_round = 1
            else:
                game.max_throws_this_round = max(3 - t.rolls_left, 1)
        done_dice = sorted(t.dice, reverse=True)
        _log(
            game,
            "log_turn",
            f"{player.name}: {done_dice} → {t.combo} ({t.fiches}f)",
            name=player.name,
            dice=done_dice,
            combo=t.combo,
            fiches=t.fiches,
        )
        # G56: hold the validated dice on the piste for a beat so the player
        # actually sees what they rolled before the cycle moves on.
        await _validate_hold(game, game_id)
        game.advance()
        if game.all_done():
            await _resolve_round(game)
        _schedule_afk(game, game_id)
        await manager.broadcast(game_id, game_state(game))
        return None

    if action == "tiebreak_roll":
        if game.phase != GamePhase.TIEBREAK or not game.tiebreak:
            return None
        if player_id != game.tiebreak.get("next_pid"):
            return None
        _cancel_afk(game, player_id)
        dice = [random.randint(1, 6) for _ in range(3)]
        combo, rank, fiches = classify(dice)
        game.tiebreak["throws"][player_id] = {
            "dice": dice,
            "combo": combo,
            "rank": rank,
            "fiches": fiches,
        }
        sorted_dice = sorted(dice, reverse=True)
        _log(
            game,
            "log_tiebreak_throw",
            f"{player.name} (départage) : {sorted_dice} → {combo} ({fiches}f)",
            name=player.name,
            dice=sorted_dice,
            combo=combo,
            fiches=fiches,
        )
        tied = game.tiebreak["tied_pids"]
        idx = tied.index(player_id) + 1
        if idx >= len(tied):
            # G56: this throw was the final one of the tiebreak — hold the
            # dice on-piste so the player can see their result before the
            # resolution + cycle advance overwrite the visible state.
            game.tiebreak["next_pid"] = None
            await _validate_hold(game, game_id)
            await _resolve_tiebreak(game)
        else:
            game.tiebreak["next_pid"] = tied[idx]
        _schedule_afk(game, game_id)
        await manager.broadcast(game_id, game_state(game))
        return None

    if action == "kick":
        # Host-only: free a seat by ejecting another player. Default reason is
        # "afk" (intended for bot-took-over situations); the host can pass any
        # short string (future use: chat-moderation, manual reasons).
        if player_id != game.host_player_id:
            return None
        target_id = msg.get("target_id")
        reason = msg.get("reason") or "afk"
        if not target_id or target_id == player_id:
            return None
        target = next((p for p in game.players if p.id == target_id), None)
        if not target:
            return None

        # Tell the target's socket what happened BEFORE closing it so the
        # client can render an explanatory modal.
        target_socks = [
            (w, pid)
            for (w, pid) in manager.connections.get(game_id.upper(), [])
            if pid == target_id
        ]
        for tws, _ in target_socks:
            try:
                await tws.send_json({"type": "kicked", "reason": reason})
            except Exception:
                pass

        _log(
            game,
            "log_player_kicked",
            f"{target.name} a été expulsé par l'hôte ({reason}).",
            name=target.name,
            host=player.name,
            reason=reason,
        )

        # Same cleanup as a voluntary leave — including the G18 stats persistence
        # snapshot when the kicked player was actively playing as a registered user.
        # G98 follow-up: pass manche counters so kick-mid-game records them too.
        if game.phase in (GamePhase.CHARGE, GamePhase.DECHARGE, GamePhase.TIEBREAK):
            target_user_id = game.user_ids.get(target_id)
            if target_user_id:
                from app.services.game_persistence import persist_player_session

                asyncio.create_task(
                    persist_player_session(
                        target_user_id,
                        game.id,
                        game.round_points.get(target_id, 0),
                        manches_played=game.manches_played.get(target_id, 0),
                        manches_lost=game.manches_lost.get(target_id, 0),
                    )
                )

        _cancel_afk(game, target_id)
        leaver_index = next((i for i, p in enumerate(game.players) if p.id == target_id), -1)
        game.players = [p for p in game.players if p.id != target_id]
        game.user_ids.pop(target_id, None)
        game.match_losses.pop(target_id, None)
        game.round_points.pop(target_id, None)
        game.has_avatars.pop(target_id, None)
        game.initial_rolls.pop(target_id, None)
        game.out_of_match.discard(target_id)

        for tws, _ in target_socks:
            try:
                await tws.close(code=4002)
            except Exception:
                pass

        if not game.players:
            games.pop(game_id.upper(), None)
            _join_locks.pop(game_id.upper(), None)
            return None

        if leaver_index >= 0 and leaver_index < game.current_index:
            game.current_index -= 1
        if game.current_index >= len(game.players):
            game.current_index = 0
        if game.round_starter_id == target_id and game.players:
            game.round_starter_id = game.players[game.current_index].id

        if game.all_done():
            await _resolve_round(game)
        else:
            _schedule_afk(game, game_id)
        await manager.broadcast(game_id, game_state(game))
        return None

    if action == "update_room_rules":
        # G45: host queues rule changes for the *next partie*. We validate
        # each field independently and stack into `game.pending_room_rules`;
        # nothing applies live. `_finalize_cycle` picks up the dict and
        # applies + clears it when a partie boundary is reached.
        if player_id != game.host_player_id:
            return None
        payload = msg.get("rules") or {}
        if not isinstance(payload, dict):
            return None

        validators = {
            "bank_rule": lambda v: v if v in ("sec", "free") else None,
            "max_players": lambda v: int(v) if isinstance(v, int) and 2 <= v <= 5 else None,
            "afk_seconds": lambda v: int(v) if isinstance(v, int) and 15 <= v <= 120 else None,
            "afk_bot": lambda v: v if isinstance(v, bool) else None,
            "allow_spectators": lambda v: v if isinstance(v, bool) else None,
        }
        for rule_field, validator in validators.items():
            if rule_field not in payload:
                continue
            valid = validator(payload[rule_field])
            if valid is None:
                continue
            current = getattr(game, rule_field, None)
            if current == valid:
                # Edited back to the current value → drop the pending entry
                # rather than leave a noop sitting around.
                game.pending_room_rules.pop(rule_field, None)
            else:
                game.pending_room_rules[rule_field] = valid

        await manager.broadcast(game_id, game_state(game))
        return None

    return None


@router.websocket("/ws/{game_id}/{player_id}")
async def websocket_endpoint(
    ws: WebSocket,
    game_id: str,
    player_id: str,
    token: Optional[str] = Query(default=None),
):
    """Main player WebSocket: handles all game actions and broadcasts state changes."""
    game = games.get(game_id.upper())
    if not game:
        await ws.close()
        return

    player = next((p for p in game.players if p.id == player_id), None) or next(
        (p for p in game.waiting_players if p.id == player_id), None
    )
    if not player:
        await ws.close()
        return

    # C1: if this player_id was claimed by a logged-in user at join time, require
    # a matching JWT on the WS handshake. Guests (no registered user_id) stay open;
    # the WS token may upgrade a guest slot to authenticated on first connect.
    ws_user_id = await _resolve_user_from_token(token) if token else None
    registered_user_id = game.user_ids.get(player_id)
    if registered_user_id and registered_user_id != ws_user_id:
        await ws.close(code=4003)
        return
    if registered_user_id is None and ws_user_id is not None:
        game.user_ids[player_id] = ws_user_id

    await manager.connect(game_id, ws, player_id)
    player.connected = True
    # G2: a reconnect inside the bot-handback grace window aborts the deferred
    # advance and restores the human's pre-bot turn before they even act.
    _abort_bot_handback(game, player_id)
    await manager.broadcast(game_id, game_state(game))

    try:
        async for raw in ws.iter_text():
            # H1: cap message size
            if len(raw) > _MAX_WS_MSG_BYTES:
                try:
                    await ws.send_json({"error": "message_too_large"})
                except Exception:
                    pass
                continue
            # H2: handle malformed JSON without falling through to the catch-all
            try:
                msg = json.loads(raw)
            except (json.JSONDecodeError, ValueError):
                try:
                    await ws.send_json({"error": "invalid_json"})
                except Exception:
                    pass
                continue
            if not isinstance(msg, dict):
                continue
            action = msg.get("action")

            # Defensive guard: a bug in any single action handler should NOT
            # kill the WS connection (which would lock the player out of the
            # game until they reconnect). Log, notify the client, re-broadcast,
            # then keep listening. `_dispatch` returns "break" to exit the
            # loop (used by the leave handler when the room dissolves).
            try:
                result = await _dispatch(game, game_id, ws, player, player_id, action, msg)
            except Exception:
                logger.exception(
                    "Action %r failed (game=%s player=%s)",
                    action,
                    game_id,
                    player_id,
                )
                sentry_sdk.capture_exception()
                try:
                    await ws.send_json({"error": "action_failed", "action": action})
                except Exception:
                    pass
                try:
                    await manager.broadcast(game_id, game_state(game))
                except Exception:
                    pass
                continue
            if result == "break":
                break

    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("WebSocket error game=%s player=%s", game_id, player_id)
        sentry_sdk.capture_exception()
    finally:
        _cancel_afk(game, player_id)
        player.connected = False
        manager.disconnect(game_id, ws)
        await manager.broadcast(game_id, game_state(game))
