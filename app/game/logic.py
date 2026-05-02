import asyncio
from collections import Counter
from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Optional

BASIC_FIGURES_SET = {
    (2, 2, 1),
    (3, 3, 1), (3, 3, 2),
    (4, 4, 1), (4, 4, 2), (4, 4, 3),
    (5, 2, 1), (5, 2, 2), (5, 3, 2),
    (5, 5, 1), (5, 5, 2), (5, 5, 3), (5, 5, 4),
    (6, 6, 1), (6, 6, 2), (6, 6, 3), (6, 6, 4), (6, 6, 5),
}


def classify(dice: list[int]) -> tuple[str, int, int]:
    """(combo_name, rank, fiches). Higher rank = stronger play."""
    if not all(d > 0 for d in dice):
        return "", 0, 0
    s = sorted(dice, reverse=True)
    t = tuple(s)

    if t == (4, 2, 1):
        return "421", 4000, 8

    if t[0] == t[1] == t[2]:
        v = t[0]
        if v == 1:
            return "111", 3007, 7
        return f"{v}{v}{v}", 2000 + v, v

    if t[1] == 1 and t[2] == 1:
        x = t[0]
        return f"11{x}", 3000 + x, x

    if t in BASIC_FIGURES_SET:
        rank = 1000 + t[0] * 100 + t[1] * 10 + t[2]
        name = "nénette" if t == (2, 2, 1) else f"{t[0]}{t[1]}{t[2]}"
        return name, rank, 1

    rank = t[0] * 100 + t[1] * 10 + t[2]
    return f"{t[0]}{t[1]}{t[2]}", rank, 0


class GamePhase(str, Enum):
    WAITING      = "waiting"
    INITIAL_ROLL = "initial_roll"
    CHARGE       = "charge"
    DECHARGE     = "decharge"
    FINISHED     = "finished"


@dataclass
class PlayerTurn:
    dice:       list[int]  = field(default_factory=lambda: [0, 0, 0])
    reroll:     list[bool] = field(default_factory=lambda: [False, False, False])
    rolls_left: int  = 3
    combo:      str  = ""
    rank:       int  = 0
    fiches:     int  = 0
    done:       bool = False


@dataclass
class Player:
    id:        str
    name:      str
    tokens:    int  = 0
    connected: bool = True
    turn:      Optional[PlayerTurn] = None


@dataclass
class Game:
    id:                    str
    phase:                 GamePhase = GamePhase.WAITING
    players:               list = field(default_factory=list)
    waiting_players:       list = field(default_factory=list)
    current_index:         int  = 0
    round_num:             int  = 0
    pool:                  int  = 11
    log:                   list = field(default_factory=list)
    initial_rolls:         dict = field(default_factory=dict)
    last_round_plays:      list = field(default_factory=list)
    max_throws_this_round: int  = 3
    round_starter_id:      str  = ""
    sets_lost:             dict = field(default_factory=dict)
    # player_id → user UUID (future DB use)
    user_ids:              dict = field(default_factory=dict)

    def current_player(self) -> Optional[Player]:
        if self.players:
            return self.players[self.current_index % len(self.players)]
        return None

    def all_done(self) -> bool:
        return all(p.turn and p.turn.done for p in self.players)

    def advance(self):
        self.current_index = (self.current_index + 1) % len(self.players)


def game_state(game: Game) -> dict:
    return {
        "type":              "state",
        "game_id":           game.id,
        "phase":             game.phase,
        "round":             game.round_num,
        "pool":              game.pool,
        "current_player_id": game.current_player().id if game.current_player() else None,
        "max_throws":        game.max_throws_this_round,
        "round_starter_id":  game.round_starter_id,
        "players": [
            {
                "id":           p.id,
                "name":         p.name,
                "tokens":       p.tokens,
                "connected":    p.connected,
                "turn":         asdict(p.turn) if p.turn else None,
                "initial_roll": game.initial_rolls.get(p.id),
                "sets_lost":    game.sets_lost.get(p.id, 0),
            }
            for p in game.players
        ],
        "waiting_players": [{"id": p.id, "name": p.name} for p in game.waiting_players],
        "current_round_plays": [
            {
                "player_id":  p.id,
                "name":       p.name,
                "dice":       p.turn.dice[:],
                "combo":      p.turn.combo,
                "rank":       p.turn.rank,
                "fiches":     p.turn.fiches,
                "is_starter": p.id == game.round_starter_id,
                "rolls_used": 3 - p.turn.rolls_left,
            }
            for p in game.players if p.turn and p.turn.done
        ],
        "last_round_plays": game.last_round_plays,
        "log":              game.log[-40:],
    }


def new_turn() -> PlayerTurn:
    return PlayerTurn(dice=[0, 0, 0], reroll=[False, False, False], rolls_left=3)


def _start_initial_roll(game: Game):
    game.phase = GamePhase.INITIAL_ROLL
    game.initial_rolls = {p.id: None for p in game.players}
    game.log.append("Lancez un dé pour déterminer l'ordre de jeu !")


def _finalize_order(game: Game):
    rolls = game.initial_rolls
    counts = Counter(rolls[p.id] for p in game.players)
    tied_vals = {v for v, c in counts.items() if c > 1}

    if tied_vals:
        for p in game.players:
            if rolls[p.id] in tied_vals:
                game.initial_rolls[p.id] = None
        tied_names = ", ".join(p.name for p in game.players if game.initial_rolls[p.id] is None)
        game.log.append(f"Égalité ! {tied_names} doivent relancer.")
        return

    game.players.sort(key=lambda p: rolls[p.id])
    summary = " · ".join(f"{p.name}:{rolls[p.id]}" for p in game.players)
    game.log.append(f"{summary} — {game.players[0].name} commence (plus bas).")
    _do_start(game)


def _do_start(game: Game):
    game.phase = GamePhase.CHARGE
    game.round_num = 1
    game.pool = 11
    game.current_index = 0
    game.max_throws_this_round = 3
    for p in game.players:
        p.tokens = 0
        p.turn = new_turn()
        game.sets_lost.setdefault(p.id, 0)
    game.round_starter_id = game.players[0].id if game.players else ""
    starter_name = game.players[0].name if game.players else ""
    game.log.append(f"Round {game.round_num} – Charge · {starter_name} donne le rythme")


def _admit_waiting(game: Game):
    if not game.waiting_players:
        return
    for p in game.waiting_players:
        game.players.append(p)
        game.sets_lost[p.id] = 0
        p.turn = new_turn()
        game.log.append(f"✦ {p.name} rejoint la partie !")
    game.waiting_players.clear()


def _start_new_set(game: Game, set_loser_id: str):
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
    game.log.append(f"Nouveau set · Round {game.round_num} · {loser_name} donne le rythme")


async def _resolve_round(game: Game):
    players = game.players

    game.last_round_plays = [
        {
            "player_id":  p.id,
            "name":       p.name,
            "dice":       p.turn.dice[:],
            "combo":      p.turn.combo,
            "rank":       p.turn.rank,
            "fiches":     p.turn.fiches,
            "is_starter": p.id == game.round_starter_id,
            "rolls_used": 3 - p.turn.rolls_left,
        }
        for p in players if p.turn
    ]

    ranks   = [(p, p.turn.rank) for p in players]
    winner  = max(ranks, key=lambda x: x[1])[0]
    loser   = min(ranks, key=lambda x: x[1])[0]
    penalty = max(winner.turn.fiches, 1)

    if game.phase == GamePhase.CHARGE:
        if game.pool > 0:
            taken = min(penalty, game.pool)
            loser.tokens += taken
            game.pool -= taken
            game.log.append(f"{loser.name} prend {taken} jeton(s) · Pool: {game.pool}")
        if game.pool == 0:
            game.phase = GamePhase.DECHARGE
            game.log.append("Pool vide → Décharge !")

    else:  # DECHARGE
        if winner.id != loser.id:
            transfer = min(penalty, winner.tokens)
            winner.tokens -= transfer
            loser.tokens  += transfer
            game.log.append(f"{winner.name} donne {transfer} jeton(s) à {loser.name}")

        set_winner = next((p for p in players if p.tokens == 0), None)
        if set_winner:
            set_loser = max(players, key=lambda p: p.tokens)
            sl_id = set_loser.id
            game.sets_lost[sl_id] = game.sets_lost.get(sl_id, 0) + 1
            sl_count = game.sets_lost[sl_id]
            _admit_waiting(game)
            game.log.append(
                f"{set_loser.name} a les 11 jetons — set perdu ({sl_count}/2) · "
                f"{set_loser.name} donne le rythme au prochain set."
            )
            if sl_count >= 2:
                game.phase = GamePhase.FINISHED
                game.log.append(f"Fin de partie ! {set_winner.name} gagne !")
                asyncio.create_task(_persist_game(game))
                return
            _start_new_set(game, sl_id)
            return

    # Normal next round
    game.round_num += 1
    game.max_throws_this_round = 3
    game.round_starter_id = game.current_player().id if game.current_player() else ""
    for p in players:
        p.turn = new_turn()
    starter_name = next((p.name for p in game.players if p.id == game.round_starter_id), "")
    game.log.append(f"Round {game.round_num} · {starter_name} donne le rythme")


async def _persist_game(game: "Game") -> None:
    from app.services.game_persistence import persist_completed_game
    await persist_completed_game(game)
