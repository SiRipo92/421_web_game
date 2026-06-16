"""Survival-based ELO for 421 (G91).

Conceptual model: each partie produces exactly ONE loser (the player stuck
with all the fiches) and N-1 survivors. ELO is updated as if each
survivor "beat" the loser in a 1v1 pairwise sense — same maths as classic
chess ELO, applied N-1 times against the same loser.

The loser's total ELO loss = 95% of the sum of survivors' gains. The 5%
drain prevents long-run inflation: without it, total ELO across the
playerbase grows monotonically (because the 32 K-factor is asymmetric
when survivor count > 1).

K is K=32 for new players (≤ 30 parties played) to let their rating
settle quickly, K=24 once established.
"""

K_NEW = 32
K_ESTABLISHED = 24
PARTIES_FOR_ESTABLISHED = 30
START_ELO = 1200
ELO_FLOOR = 100
INFLATION_DRAIN = 0.95


def expected(a: int, b: int) -> float:
    """Expected score probability for player A against player B (classic ELO)."""
    return 1 / (1 + 10 ** ((b - a) / 400))


def _k_for(parties_played: int) -> int:
    """K-factor: larger while a player's rating is still settling."""
    return K_NEW if parties_played < PARTIES_FOR_ESTABLISHED else K_ESTABLISHED


def compute_partie_elo(
    survivor_elos_with_parties: list[tuple[int, int]],
    loser_elo: int,
    loser_parties_played: int,
) -> tuple[list[int], int]:
    """Compute new ELOs for one resolved partie.

    Args:
        survivor_elos_with_parties: [(elo, parties_played_before_this_one), ...] for each survivor.
            Order matters — the returned survivor_new_elos list is in the same order.
        loser_elo: Loser's ELO before this partie.
        loser_parties_played: Loser's parties_played before this partie (for K-factor).

    Returns:
        (survivor_new_elos, loser_new_elo). Floored at ELO_FLOOR.
    """
    if not survivor_elos_with_parties:
        # Solo partie shouldn't happen — defensive: no change.
        return [], loser_elo

    survivor_new_elos: list[int] = []
    total_survivor_gain = 0
    for s_elo, s_parties in survivor_elos_with_parties:
        k = _k_for(s_parties)
        exp = expected(s_elo, loser_elo)
        # Survivor "beat" the loser → actual score = 1.
        delta = round(k * (1 - exp))
        new_elo = max(ELO_FLOOR, s_elo + delta)
        survivor_new_elos.append(new_elo)
        # Track actual delta applied (not raw delta — important for floored survivors).
        total_survivor_gain += new_elo - s_elo

    # Loser pays 95% of total survivor gain. Drain prevents inflation.
    loser_loss = round(total_survivor_gain * INFLATION_DRAIN)
    loser_new_elo = max(ELO_FLOOR, loser_elo - loser_loss)
    return survivor_new_elos, loser_new_elo


# --- Legacy single-survivor API (kept for transition + simpler tests) ---


def updated_elo(player_elo: int, opponent_elos: list[int], won: bool) -> int:
    """Legacy single-player ELO update.

    DEPRECATED: prefer compute_partie_elo() which handles the full table
    in one call. This helper is retained because some test paths and
    the `persist_player_session` mid-game-leave flow still call it.

    Treats `won=True` as "this player survived" and `won=False` as "this
    player lost". Computes against the average opponent ELO.
    """
    if not opponent_elos:
        return player_elo
    avg_opp = sum(opponent_elos) // len(opponent_elos)
    if won:
        # Surviving against the field — gain based on expected.
        delta = round(K_NEW * (1 - expected(player_elo, avg_opp)))
    else:
        # Losing — pay based on expected.
        delta = -round(K_NEW * expected(player_elo, avg_opp))
    return max(ELO_FLOOR, player_elo + delta)
