"""Core game logic: scoring, game/player dataclasses, round resolution."""

import asyncio
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from enum import Enum
from typing import Optional

_SUITE_RANKS = {(3, 2, 1): 1100, (4, 3, 2): 1200, (5, 4, 3): 1300, (6, 5, 4): 1400}


def classify(dice: list[int]) -> tuple[str, int, int]:
    """Return (combo_name, rank, fiches). Higher rank = stronger play.

    Hierarchy (low → high):
      basic figures (1f)  < suites 1100-1400 (2f)  < triples 2200-2600 (2-6f)
      < 11x 7200-7600 (2-6f)  < 111 8000 (7f)  < 421 9000 (8f)
    """
    if not all(d > 0 for d in dice):
        return "", 0, 0
    a, b, c = sorted(dice, reverse=True)

    if (a, b, c) == (4, 2, 1):
        return "421", 9000, 8

    if a == b == c == 1:
        return "111", 8000, 7

    # 11x — pair of aces plus a figure (must check before triple)
    if b == 1 and c == 1:
        return f"11{a}", 7000 + a * 100, a

    # Triple / Brelan
    if a == b == c:
        return f"{a}{a}{a}", 2000 + a * 100, a

    # Suite — three consecutive dice
    if a - b == 1 and b - c == 1:
        name = "l'amour" if (a, b, c) == (6, 5, 4) else f"{c}{b}{a}"
        return name, _SUITE_RANKS[(a, b, c)], 2

    # Basic figure — everything else scores 1 fiche
    name = "nénette" if (a, b, c) == (2, 2, 1) else f"{a}{b}{c}"
    return name, a * 100 + b * 10 + c, 1


class GamePhase(str, Enum):
    """Ordered lifecycle phases a game moves through (CHARGE↔DECHARGE can cycle)."""

    WAITING = "waiting"
    INITIAL_ROLL = "initial_roll"
    CHARGE = "charge"
    DECHARGE = "decharge"
    # Mid-cycle re-throw to break ties at the loser position (charge or décharge).
    # Only the tied players roll. The lowest hand by combo hierarchy takes the
    # original cycle's penalty. Recursive if still tied.
    TIEBREAK = "tiebreak"
    FINISHED = "finished"


@dataclass
class PlayerTurn:
    """Mutable state for one player's turn: current dice, reroll flags, and result."""

    dice: list[int] = field(default_factory=lambda: [0, 0, 0])
    reroll: list[bool] = field(default_factory=lambda: [False, False, False])
    rolls_left: int = 3
    combo: str = ""
    rank: int = 0
    fiches: int = 0
    done: bool = False


@dataclass
class Player:
    """A player seat in an active game; turn is None outside their turn."""

    id: str
    name: str
    tokens: int = 0
    connected: bool = True
    turn: Optional[PlayerTurn] = None
    # Wall-clock join time. Used to pick the longest-tenured player when the
    # host leaves mid-game; `game.players` may have been reordered by the
    # initial-roll sort, so list position is unreliable for tenure.
    joined_at: datetime = field(default_factory=lambda: datetime.now(UTC))


@dataclass
class Game:
    """Complete in-memory state for one live game room."""

    id: str
    phase: GamePhase = GamePhase.WAITING
    players: list = field(default_factory=list)
    waiting_players: list = field(default_factory=list)
    current_index: int = 0
    round_num: int = 0
    pool: int = 11
    log: list = field(default_factory=list)
    log_events: list = field(default_factory=list)
    initial_rolls: dict = field(default_factory=dict)
    last_round_plays: list = field(default_factory=list)
    max_throws_this_round: int = 3
    round_starter_id: str = ""
    # Match losses in the CURRENT round (resets to 0 for all players when any
    # player reaches 2 — that player takes a round point, see `round_points`).
    match_losses: dict = field(default_factory=dict)
    # Round points accumulated this session (one per 2 match losses). Persisted
    # to the DB at end-of-session for logged-in users.
    round_points: dict = field(default_factory=dict)
    user_ids: dict = field(default_factory=dict)
    has_avatars: dict = field(default_factory=dict)
    # Players who hit 0 tokens during the current match — they sit out the rest
    # of the match (no turns), but rejoin on match-end. Cleared when a new match
    # starts.
    out_of_match: set = field(default_factory=set)
    # Tiebreak context when phase == TIEBREAK. None otherwise. Shape:
    #   {
    #     "tied_pids": [pid, ...],   # in throw order: most recent first
    #     "throws":    {pid: {dice, combo, rank, fiches}},
    #     "next_pid":  pid | None,
    #     "penalty":   int,           # original winning combo's fiches
    #     "return_phase": "charge" | "decharge",
    #     "original_winner_id": pid | None,
    #   }
    tiebreak: Optional[dict] = None
    # Room configuration
    is_public: bool = False
    max_players: int = 5
    bank_rule: str = "free"  # "sec" | "free"
    afk_seconds: int = 45
    afk_bot: bool = True
    allow_spectators: bool = True
    host_player_id: str = ""
    # Runtime state — not serialized
    afk_tasks: dict = field(default_factory=dict, compare=False, repr=False)
    # G1: epoch-ms timestamp of the current player's active AFK timer. Stamped by
    # `_schedule_afk` whenever the per-turn timer (re-)starts for CHARGE/DECHARGE.
    # Client AfkBar reads this + `afk_seconds` to compute remaining time, so the
    # countdown actually resets when the server resets the timer (which happens on
    # every action — `roll`/`keep`/`done` — not just on player change).
    afk_started_at: Optional[int] = None

    def current_player(self) -> Optional[Player]:
        """Return the player whose turn it is, skipping sat-out players.

        Players in `out_of_match` (0 tokens during the current match) are
        skipped — we walk forward from `current_index` and return the first
        active seat. Returns None when no active players remain.
        """
        if not self.players:
            return None
        n = len(self.players)
        for offset in range(n):
            idx = (self.current_index + offset) % n
            if self.players[idx].id not in self.out_of_match:
                return self.players[idx]
        return None

    def all_done(self) -> bool:
        """True when every active (non-sat-out) player has marked their turn done."""
        return all(p.id in self.out_of_match or (p.turn and p.turn.done) for p in self.players)

    def advance(self):
        """Move the turn index to the next active (non-sat-out) player."""
        if not self.players:
            return
        n = len(self.players)
        for _ in range(n):
            self.current_index = (self.current_index + 1) % n
            if self.players[self.current_index].id not in self.out_of_match:
                return


def game_state(game: Game) -> dict:
    """Serialize the full game to a dict suitable for sending over WebSocket."""
    return {
        "type": "state",
        "game_id": game.id,
        "phase": game.phase,
        "round": game.round_num,
        "pool": game.pool,
        "current_player_id": game.current_player().id if game.current_player() else None,
        "max_throws": game.max_throws_this_round,
        "round_starter_id": game.round_starter_id,
        "afk_started_at": game.afk_started_at,
        "room": {
            "is_public": game.is_public,
            "max_players": game.max_players,
            "bank_rule": game.bank_rule,
            "afk_seconds": game.afk_seconds,
            "afk_bot": game.afk_bot,
            "allow_spectators": game.allow_spectators,
            "host_player_id": game.host_player_id,
        },
        "players": [
            {
                "id": p.id,
                "user_id": game.user_ids.get(p.id),
                "has_avatar": game.has_avatars.get(p.id, False),
                "name": p.name,
                "tokens": p.tokens,
                "connected": p.connected,
                "turn": asdict(p.turn) if p.turn else None,
                "initial_roll": game.initial_rolls.get(p.id),
                "match_losses": game.match_losses.get(p.id, 0),
                "round_points": game.round_points.get(p.id, 0),
                "out_of_match": p.id in game.out_of_match,
            }
            for p in game.players
        ],
        "waiting_players": [{"id": p.id, "name": p.name} for p in game.waiting_players],
        "current_round_plays": [
            {
                "player_id": p.id,
                "name": p.name,
                "dice": p.turn.dice[:],
                "combo": p.turn.combo,
                "rank": p.turn.rank,
                "fiches": p.turn.fiches,
                "is_starter": p.id == game.round_starter_id,
                "rolls_used": 3 - p.turn.rolls_left,
            }
            for p in game.players
            if p.turn and p.turn.done
        ],
        "last_round_plays": game.last_round_plays,
        "log": game.log[-40:],
        "log_events": game.log_events[-40:],
        "tiebreak": game.tiebreak,
    }


def _log(game: "Game", key: str, fr_msg: str, **params) -> None:
    """Append both a raw French log string and a structured i18n event."""
    game.log.append(fr_msg)
    game.log_events.append({"key": key, **params})


def new_turn() -> PlayerTurn:
    """Return a fresh PlayerTurn with all dice unset and 3 rolls available."""
    return PlayerTurn(dice=[0, 0, 0], reroll=[False, False, False], rolls_left=3)


def _start_initial_roll(game: Game):
    """Transition to INITIAL_ROLL and prompt players to roll for order."""
    game.phase = GamePhase.INITIAL_ROLL
    game.initial_rolls = {p.id: None for p in game.players}
    _log(game, "log_initial_roll", "Lancez un dé pour déterminer l'ordre de jeu !")


def _finalize_order(game: Game):
    """Sort players by initial-roll result; re-roll only players tied for the lowest."""
    rolls = game.initial_rolls
    values = [rolls[p.id] for p in game.players]
    min_val = min(values)
    low_tied_ids = {p.id for p in game.players if rolls[p.id] == min_val}

    if len(low_tied_ids) > 1:
        # Only the players tied for the lowest re-roll; higher rolls stand.
        for pid in low_tied_ids:
            game.initial_rolls[pid] = None
        tied_names = ", ".join(p.name for p in game.players if p.id in low_tied_ids)
        _log(game, "log_tie", f"Égalité ! {tied_names} doivent relancer.", names=tied_names)
        return

    game.players.sort(key=lambda p: rolls[p.id])
    summary = " · ".join(f"{p.name}:{rolls[p.id]}" for p in game.players)
    first = game.players[0].name
    _log(
        game,
        "log_order_set",
        f"{summary} — {first} commence (plus bas).",
        summary=summary,
        first=first,
    )
    _do_start(game)


def _do_start(game: Game):
    """Transition to CHARGE phase and reset all player state for round 1."""
    game.phase = GamePhase.CHARGE
    game.round_num = 1
    game.pool = 11
    game.current_index = 0
    game.max_throws_this_round = 3
    game.out_of_match.clear()
    for p in game.players:
        p.tokens = 0
        p.turn = new_turn()
        game.match_losses.setdefault(p.id, 0)
        game.round_points.setdefault(p.id, 0)
    game.round_starter_id = game.players[0].id if game.players else ""
    starter_name = game.players[0].name if game.players else ""
    _log(
        game,
        "log_round_start",
        f"Tour {game.round_num} – Charge · {starter_name} donne le rythme",
        num=game.round_num,
        phase="charge",
        starter=starter_name,
    )


def _admit_waiting(game: Game):
    """Move all waiting_players into the active players list mid-game."""
    if not game.waiting_players:
        return
    for p in game.waiting_players:
        game.players.append(p)
        game.match_losses[p.id] = 0
        game.round_points.setdefault(p.id, 0)
        p.turn = new_turn()
        _log(game, "log_player_joins", f"✦ {p.name} rejoint la partie !", name=p.name)
    game.waiting_players.clear()


def _start_new_set(game: Game, set_loser_id: str):
    """Reset tokens/pool for a new match; the manché starts the new match."""
    game.out_of_match.clear()
    for p in game.players:
        p.tokens = 0
        p.turn = new_turn()
    game.pool = 11
    game.phase = GamePhase.CHARGE
    game.max_throws_this_round = 3
    loser_idx = next((i for i, p in enumerate(game.players) if p.id == set_loser_id), 0)
    game.current_index = loser_idx
    game.round_starter_id = set_loser_id
    game.round_num += 1
    loser_name = next((p.name for p in game.players if p.id == set_loser_id), "?")
    _log(
        game,
        "log_new_set",
        f"Nouvelle manche · Tour {game.round_num} · {loser_name} donne le rythme",
        num=game.round_num,
        starter=loser_name,
    )


def _play_order(game: Game) -> list[str]:
    """Active player IDs in this cycle's play order (round starter first)."""
    if not game.players:
        return []
    n = len(game.players)
    starter_idx = next(
        (i for i, p in enumerate(game.players) if p.id == game.round_starter_id),
        0,
    )
    order: list[str] = []
    for offset in range(n):
        idx = (starter_idx + offset) % n
        if game.players[idx].id not in game.out_of_match:
            order.append(game.players[idx].id)
    return order


def _enter_tiebreak(
    game: Game,
    tied_pids_set: set[str],
    *,
    penalty: int,
    return_phase: GamePhase,
    original_winner_id: Optional[str],
) -> None:
    """Switch the game into TIEBREAK so tied players can re-throw."""
    # Throw order = reverse of this cycle's play order, restricted to tied players.
    order = [pid for pid in reversed(_play_order(game)) if pid in tied_pids_set]
    game.phase = GamePhase.TIEBREAK
    game.tiebreak = {
        "tied_pids": order,
        "throws": {},
        "next_pid": order[0] if order else None,
        "penalty": penalty,
        "return_phase": return_phase.value,
        "original_winner_id": original_winner_id,
    }
    # Tied players need a fresh slot; non-tied players' turns already done.
    for p in game.players:
        if p.id in tied_pids_set:
            p.turn = new_turn()
    tied_names = ", ".join(p.name for p in game.players if p.id in tied_pids_set)
    _log(
        game,
        "log_tiebreak_start",
        f"Égalité au plus bas — {tied_names} relancent.",
        names=tied_names,
    )


async def _resolve_tiebreak(game: Game) -> None:
    """Pick a single loser from the tiebreak throws. Recursive if still tied."""
    tb = game.tiebreak
    if not tb:
        return
    throws = tb["throws"]
    # Lowest rank in tiebreak = the loser. Use combo hierarchy (rank field).
    ranked = [(pid, info["rank"]) for pid, info in throws.items()]
    min_rank = min(r for _, r in ranked)
    still_tied = {pid for pid, r in ranked if r == min_rank}
    if len(still_tied) > 1:
        # Recursive tiebreak with the still-tied subset; carry penalty/context.
        _enter_tiebreak(
            game,
            still_tied,
            penalty=tb["penalty"],
            return_phase=GamePhase(tb["return_phase"]),
            original_winner_id=tb["original_winner_id"],
        )
        return

    loser_id = next(iter(still_tied))
    loser = next(p for p in game.players if p.id == loser_id)
    penalty = tb["penalty"]
    return_phase = GamePhase(tb["return_phase"])

    # Apply the ORIGINAL combo's penalty (not the tiebreak combo).
    if return_phase == GamePhase.CHARGE:
        taken = min(penalty, game.pool)
        loser.tokens += taken
        game.pool -= taken
        _log(
            game,
            "log_charge_takes",
            f"{loser.name} (départage) prend {taken} jeton(s) · Banque : {game.pool}",
            name=loser.name,
            n=taken,
            pool=game.pool,
        )
        if game.pool == 0:
            game.phase = GamePhase.DECHARGE
            _log(game, "log_pool_empty", "Banque vide → Décharge !")
        else:
            game.phase = GamePhase.CHARGE
    else:  # DECHARGE
        winner_id = tb["original_winner_id"]
        if winner_id:
            winner = next((p for p in game.players if p.id == winner_id), None)
            if winner and winner.tokens > 0:
                transfer = min(penalty, winner.tokens)
                winner.tokens -= transfer
                loser.tokens += transfer
                _log(
                    game,
                    "log_decharge_gives",
                    f"{winner.name} donne {transfer} jeton(s) à {loser.name} (départage)",
                    winner=winner.name,
                    n=transfer,
                    loser=loser.name,
                )
        game.phase = GamePhase.DECHARGE

    game.tiebreak = None
    await _finalize_cycle(game, next_starter_id=loser_id)


async def _finalize_cycle(game: Game, next_starter_id: Optional[str]) -> None:
    """Common post-resolution work: sit-outs, match-end check, next cycle setup."""
    all_players = game.players

    if game.phase == GamePhase.DECHARGE:
        for p in all_players:
            if p.tokens == 0 and p.id not in game.out_of_match:
                game.out_of_match.add(p.id)
                _log(
                    game,
                    "log_player_sits_out",
                    f"{p.name} n'a plus de fiches — pause jusqu'à la prochaine manche.",
                    name=p.name,
                )

    manche = next((p for p in all_players if p.tokens >= 11), None)
    if manche:
        ml_id = manche.id
        game.match_losses[ml_id] = game.match_losses.get(ml_id, 0) + 1
        ml_count = game.match_losses[ml_id]
        _admit_waiting(game)
        _log(
            game,
            "log_match_lost",
            f"{manche.name} a les 11 jetons — manché ({ml_count}/2)",
            name=manche.name,
            count=ml_count,
        )
        if ml_count >= 2:
            game.round_points[ml_id] = game.round_points.get(ml_id, 0) + 1
            rp_count = game.round_points[ml_id]
            for pid in list(game.match_losses.keys()):
                game.match_losses[pid] = 0
            _log(
                game,
                "log_round_point",
                f"{manche.name} prend un point de partie ({rp_count}).",
                name=manche.name,
                count=rp_count,
            )
        _start_new_set(game, ml_id)
        return

    game.round_num += 1
    game.max_throws_this_round = 3
    if next_starter_id is not None:
        game.round_starter_id = next_starter_id
        game.current_index = next(
            (i for i, p in enumerate(all_players) if p.id == next_starter_id), 0
        )
    for p in all_players:
        if p.id in game.out_of_match:
            p.turn = None
        else:
            p.turn = new_turn()
    starter_name = next((p.name for p in all_players if p.id == game.round_starter_id), "")
    _log(
        game,
        "log_round_start",
        f"Tour {game.round_num} · {starter_name} donne le rythme",
        num=game.round_num,
        phase=game.phase.value,
        starter=starter_name,
    )


async def _resolve_round(game: Game):
    """Settle fiche transfers after every active player has played this table cycle.

    A "table cycle" is one full pass: each non-sat-out player rolls, the loser
    takes the penalty, the winner gives (in décharge), and we set up the next
    pass. The match ends only when one player ends up holding all 11 chips
    (the « manché »); only then do match losses / round transitions fire.
    Sat-out players (0 chips) are skipped from rank comparison and turn order.
    Tied losers trigger TIEBREAK; the result determines the single loser.
    """
    all_players = game.players

    # E1: only one player remaining (everyone else left/disconnected) → they win
    if len(all_players) == 1:
        survivor = all_players[0]
        game.phase = GamePhase.FINISHED
        _log(
            game,
            "log_game_over",
            f"Fin de partie ! {survivor.name} gagne (seul restant).",
            winner=survivor.name,
        )
        asyncio.create_task(_persist_game(game))
        return

    # Only active (non-sat-out) players are scored this cycle.
    active = [p for p in all_players if p.id not in game.out_of_match and p.turn]

    game.last_round_plays = [
        {
            "player_id": p.id,
            "name": p.name,
            "dice": p.turn.dice[:],
            "combo": p.turn.combo,
            "rank": p.turn.rank,
            "fiches": p.turn.fiches,
            "is_starter": p.id == game.round_starter_id,
            "rolls_used": 3 - p.turn.rolls_left,
        }
        for p in active
    ]

    # Edge case: <2 active players → no comparison, just advance to next cycle.
    if len(active) < 2:
        await _finalize_cycle(game, next_starter_id=None)
        return

    ranks = [(p, p.turn.rank) for p in active]
    max_rank = max(r for _, r in ranks)
    min_rank = min(r for _, r in ranks)

    if max_rank == min_rank:
        # Everyone tied at the same rank → tiebreak among ALL active players.
        # Per the actual rules, the lowest re-throw takes the original combo's penalty.
        penalty = max(active[0].turn.fiches, 1)
        _enter_tiebreak(
            game,
            {p.id for p in active},
            penalty=penalty,
            return_phase=game.phase,
            original_winner_id=None,
        )
        return

    winners = [p for p, r in ranks if r == max_rank]
    losers = [p for p, r in ranks if r == min_rank]
    penalty = max(winners[0].turn.fiches, 1)

    # Tiebreak when multiple players share the lowest rank — common case the rules
    # actually call out. Tied winners at the top in décharge with the exact same
    # combo also warrant a tiebreak; that's the next commit.
    if len(losers) > 1:
        _enter_tiebreak(
            game,
            {p.id for p in losers},
            penalty=penalty,
            return_phase=game.phase,
            original_winner_id=winners[0].id if len(winners) == 1 else None,
        )
        return

    # Single loser, direct resolution
    loser = losers[0]
    if game.phase == GamePhase.CHARGE:
        taken = min(penalty, game.pool)
        loser.tokens += taken
        game.pool -= taken
        _log(
            game,
            "log_charge_takes",
            f"{loser.name} prend {taken} jeton(s) · Banque : {game.pool}",
            name=loser.name,
            n=taken,
            pool=game.pool,
        )
        if game.pool == 0:
            game.phase = GamePhase.DECHARGE
            _log(game, "log_pool_empty", "Banque vide → Décharge !")
    else:  # DECHARGE
        # Multiple winners → no transfer this cycle (tied-winner tiebreak is the
        # next commit). Single winner → standard transfer.
        if len(winners) == 1:
            winner = winners[0]
            if winner.tokens > 0:
                transfer = min(penalty, winner.tokens)
                winner.tokens -= transfer
                loser.tokens += transfer
                _log(
                    game,
                    "log_decharge_gives",
                    f"{winner.name} donne {transfer} jeton(s) à {loser.name}",
                    winner=winner.name,
                    n=transfer,
                    loser=loser.name,
                )

    await _finalize_cycle(game, next_starter_id=loser.id)


async def _persist_game(game: "Game") -> None:
    """Fire-and-forget task: persist a finished game to the DB."""
    from app.services.game_persistence import persist_completed_game

    await persist_completed_game(game)
