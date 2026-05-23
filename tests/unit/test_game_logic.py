"""Unit tests for game logic: phase transitions, round resolution, and serialization."""

import asyncio

import pytest

from app.game.logic import (
    Game,
    GamePhase,
    Player,
    PlayerTurn,
    _admit_waiting,
    _do_start,
    _finalize_order,
    _resolve_round,
    _start_initial_roll,
    _start_new_set,
    game_state,
    new_turn,
)


def _make_game(n: int = 2) -> Game:
    """Return a Game with n guest players (no user_ids)."""
    game = Game(id="TESTGAME")
    for i in range(n):
        p = Player(id=f"p{i}", name=f"Player{i}")
        game.players.append(p)
        game.user_ids[f"p{i}"] = None
        game.sets_lost[f"p{i}"] = 0
    return game


def _done_turn(rank: int, fiches: int, dice: list[int] | None = None) -> PlayerTurn:
    """Return a PlayerTurn already marked done with the given rank/fiches."""
    return PlayerTurn(
        dice=dice or [4, 2, 1],
        rolls_left=0,
        combo="test",
        rank=rank,
        fiches=fiches,
        done=True,
    )


# ---------------------------------------------------------------------------
# Game methods
# ---------------------------------------------------------------------------


class TestGameMethods:
    """Tests for Game.current_player, all_done, and advance."""

    def test_current_player_no_players(self):
        """Returns None when the player list is empty."""
        assert Game(id="X").current_player() is None

    def test_current_player_index_zero(self):
        """Returns the first player when index is 0."""
        game = _make_game(2)
        assert game.current_player() is game.players[0]

    def test_current_player_after_advance(self):
        """Returns the second player after one advance call."""
        game = _make_game(2)
        game.advance()
        assert game.current_player() is game.players[1]

    def test_advance_wraps(self):
        """Wraps back to first player after all players have gone."""
        game = _make_game(2)
        game.advance()
        game.advance()
        assert game.current_player() is game.players[0]

    def test_all_done_true(self):
        """all_done() is True when every player's turn is done."""
        game = _make_game(2)
        for p in game.players:
            p.turn = PlayerTurn(done=True)
        assert game.all_done()

    def test_all_done_false_partial(self):
        """all_done() is False when at least one player is still going."""
        game = _make_game(2)
        game.players[0].turn = PlayerTurn(done=True)
        game.players[1].turn = PlayerTurn(done=False)
        assert not game.all_done()

    def test_all_done_no_turns(self):
        """all_done() is False when turns are None (before round starts)."""
        game = _make_game(2)
        assert not game.all_done()


# ---------------------------------------------------------------------------
# new_turn
# ---------------------------------------------------------------------------


def test_new_turn_defaults():
    """new_turn returns a PlayerTurn with 3 rolls and no dice."""
    t = new_turn()
    assert t.rolls_left == 3
    assert t.dice == [0, 0, 0]
    assert t.done is False
    assert t.reroll == [False, False, False]


# ---------------------------------------------------------------------------
# _start_initial_roll
# ---------------------------------------------------------------------------


def test_start_initial_roll_phase_and_dict():
    """Sets INITIAL_ROLL phase and creates a None-valued roll for each player."""
    game = _make_game(2)
    _start_initial_roll(game)
    assert game.phase == GamePhase.INITIAL_ROLL
    assert set(game.initial_rolls) == {"p0", "p1"}
    assert all(v is None for v in game.initial_rolls.values())
    assert game.log  # log entry added


# ---------------------------------------------------------------------------
# _finalize_order
# ---------------------------------------------------------------------------


def test_finalize_order_sorts_by_roll():
    """Players are sorted ascending by initial roll; lowest-roll player goes first."""
    game = _make_game(2)
    _start_initial_roll(game)
    game.initial_rolls["p0"] = 5
    game.initial_rolls["p1"] = 2
    _finalize_order(game)
    assert game.phase == GamePhase.CHARGE
    assert game.players[0].id == "p1"  # lower roll first


def test_finalize_order_tie_resets():
    """Tied players get their rolls set back to None for a re-roll."""
    game = _make_game(2)
    _start_initial_roll(game)
    game.initial_rolls["p0"] = 4
    game.initial_rolls["p1"] = 4
    _finalize_order(game)
    assert game.phase == GamePhase.INITIAL_ROLL
    assert all(v is None for v in game.initial_rolls.values())


def test_finalize_order_three_players_partial_tie():
    """Tied players are reset; non-tied player keeps their original roll."""
    game = _make_game(3)
    _start_initial_roll(game)
    game.initial_rolls["p0"] = 3
    game.initial_rolls["p1"] = 3
    game.initial_rolls["p2"] = 1
    _finalize_order(game)
    assert game.phase == GamePhase.INITIAL_ROLL
    # p0 and p1 tied — they get reset; p2 keeps their roll (non-tied)
    assert game.initial_rolls["p0"] is None
    assert game.initial_rolls["p1"] is None
    assert game.initial_rolls["p2"] == 1


# ---------------------------------------------------------------------------
# _do_start
# ---------------------------------------------------------------------------


def test_do_start_transitions_and_resets():
    """_do_start switches to CHARGE, sets round_num=1, pool=11, and gives each player a turn."""
    game = _make_game(2)
    _do_start(game)
    assert game.phase == GamePhase.CHARGE
    assert game.round_num == 1
    assert game.pool == 11
    assert game.max_throws_this_round == 3
    for p in game.players:
        assert p.tokens == 0
        assert p.turn is not None
        assert p.turn.rolls_left == 3
    assert game.round_starter_id == "p0"


# ---------------------------------------------------------------------------
# _admit_waiting
# ---------------------------------------------------------------------------


def test_admit_waiting_empty():
    """_admit_waiting is a no-op when waiting_players is empty."""
    game = _make_game(2)
    _admit_waiting(game)
    assert len(game.players) == 2


def test_admit_waiting_moves_players():
    """Waiting players are added to active list with a fresh turn."""
    game = _make_game(2)
    wp = Player(id="w0", name="Waiter")
    game.waiting_players.append(wp)
    _admit_waiting(game)
    assert len(game.players) == 3
    assert len(game.waiting_players) == 0
    assert wp.turn is not None
    assert game.sets_lost.get("w0") == 0


# ---------------------------------------------------------------------------
# _start_new_set
# ---------------------------------------------------------------------------


def test_start_new_set_resets_state():
    """Starts a new set: clears tokens, resets pool, and sets loser as starter."""
    game = _make_game(2)
    game.players[0].tokens = 11
    game.players[1].tokens = 3
    game.round_num = 5
    _start_new_set(game, "p0")
    assert game.phase == GamePhase.CHARGE
    assert game.pool == 11
    assert game.round_starter_id == "p0"
    assert game.round_num == 6
    for p in game.players:
        assert p.tokens == 0
        assert p.turn is not None


# ---------------------------------------------------------------------------
# _resolve_round — CHARGE
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_resolve_round_charge_loser_takes_tokens():
    """In CHARGE, the player with the lowest rank takes fiches from the pool."""
    game = _make_game(2)
    game.phase = GamePhase.CHARGE
    game.pool = 11
    game.round_num = 1
    # p0 wins (421=rank 9000, 8 fiches); p1 loses (111=rank 8000)
    game.players[0].turn = _done_turn(9000, 8)
    game.players[1].turn = _done_turn(8000, 7)
    game.round_starter_id = "p0"
    await _resolve_round(game)
    assert game.players[1].tokens > 0
    assert game.pool < 11


@pytest.mark.asyncio
async def test_resolve_round_charge_pool_empty_switches_phase():
    """Pool reaching zero switches the game to DECHARGE."""
    game = _make_game(2)
    game.phase = GamePhase.CHARGE
    game.pool = 1  # only 1 fiche left
    game.round_num = 1
    game.players[0].turn = _done_turn(9000, 8)
    game.players[1].turn = _done_turn(100, 1)
    game.round_starter_id = "p0"
    await _resolve_round(game)
    assert game.pool == 0
    assert game.phase == GamePhase.DECHARGE


@pytest.mark.asyncio
async def test_resolve_round_decharge_winner_gives_tokens():
    """In DECHARGE, the winner transfers fiches to the loser."""
    game = _make_game(2)
    game.phase = GamePhase.DECHARGE
    game.round_num = 1
    game.players[0].tokens = 3
    game.players[1].tokens = 5
    # p0 wins with 421; p1 loses
    game.players[0].turn = _done_turn(9000, 8)
    game.players[1].turn = _done_turn(100, 1)
    game.round_starter_id = "p0"
    prev_p0_tokens = game.players[0].tokens
    await _resolve_round(game)
    assert game.players[0].tokens < prev_p0_tokens


@pytest.mark.asyncio
async def test_resolve_round_set_win_increments_counter():
    """A player reaching 0 tokens ends the set; sets_lost counter increments."""
    game = _make_game(2)
    game.phase = GamePhase.DECHARGE
    game.round_num = 1
    game.players[0].tokens = 0
    game.players[1].tokens = 11
    game.players[0].turn = _done_turn(9000, 8)
    game.players[1].turn = _done_turn(100, 1)
    game.round_starter_id = "p0"
    await _resolve_round(game)
    assert game.sets_lost.get("p1", 0) == 1
    assert game.phase != GamePhase.FINISHED  # only 1 set lost, not 2


@pytest.mark.asyncio
async def test_resolve_round_game_end():
    """Two sets lost by same player ends the game (FINISHED phase)."""
    game = _make_game(2)
    game.phase = GamePhase.DECHARGE
    game.round_num = 3
    game.sets_lost["p1"] = 1  # already lost one set
    game.players[0].tokens = 0
    game.players[1].tokens = 11
    game.players[0].turn = _done_turn(9000, 8)
    game.players[1].turn = _done_turn(100, 1)
    game.round_starter_id = "p0"
    await _resolve_round(game)
    # Give the background persist task a tick to start (it'll fail silently — no DB)
    await asyncio.sleep(0)
    assert game.phase == GamePhase.FINISHED


# ---------------------------------------------------------------------------
# game_state
# ---------------------------------------------------------------------------


def test_game_state_minimal():
    """game_state returns a dict with required keys for a game with no turns."""
    game = _make_game(2)
    state = game_state(game)
    assert state["type"] == "state"
    assert state["game_id"] == "TESTGAME"
    assert state["phase"] == GamePhase.WAITING
    assert len(state["players"]) == 2
    assert state["current_round_plays"] == []


def test_game_state_with_turns():
    """game_state includes turn data and current_round_plays for done turns."""
    game = _make_game(2)
    game.phase = GamePhase.CHARGE
    game.round_starter_id = "p0"
    for p in game.players:
        p.turn = new_turn()
    game.players[0].turn = _done_turn(9000, 8, [4, 2, 1])
    state = game_state(game)
    assert state["players"][0]["turn"] is not None
    assert len(state["current_round_plays"]) == 1


def test_game_state_no_current_player_when_empty():
    """current_player_id is None when there are no players."""
    game = Game(id="EMPTY")
    state = game_state(game)
    assert state["current_player_id"] is None
