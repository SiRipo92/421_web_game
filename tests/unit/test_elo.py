from app.services.elo import ELO_FLOOR, START_ELO, updated_elo


def test_no_opponents_unchanged():
    assert updated_elo(1200, [], won=True) == 1200
    assert updated_elo(1200, [], won=False) == 1200


def test_equal_elo_win_gains_points():
    result = updated_elo(1200, [1200], won=True)
    assert result > 1200


def test_equal_elo_loss_loses_points():
    result = updated_elo(1200, [1200], won=False)
    assert result < 1200


def test_equal_elo_symmetric():
    gain = updated_elo(1200, [1200], won=True) - 1200
    loss = 1200 - updated_elo(1200, [1200], won=False)
    assert gain == loss


def test_higher_elo_opponent_win_gains_more():
    gain_vs_stronger = updated_elo(1200, [1600], won=True) - 1200
    gain_vs_equal = updated_elo(1200, [1200], won=True) - 1200
    assert gain_vs_stronger > gain_vs_equal


def test_lower_elo_opponent_loss_loses_more():
    loss_vs_weaker = 1200 - updated_elo(1200, [800], won=False)
    loss_vs_equal = 1200 - updated_elo(1200, [1200], won=False)
    assert loss_vs_weaker > loss_vs_equal


def test_elo_floor_enforced():
    result = updated_elo(ELO_FLOOR + 1, [3000], won=False)
    assert result >= ELO_FLOOR


def test_start_elo_is_1200():
    assert START_ELO == 1200


def test_multiple_opponents():
    result = updated_elo(1200, [1200, 1200, 1200], won=True)
    assert result > 1200


# ---------------- G91 partie-level ELO ----------------


def test_partie_elo_two_player_equal():
    """Classic 1v1: survivor gains ~16, loser loses ~15 (95% drain)."""
    from app.services.elo import compute_partie_elo

    survivors, loser = compute_partie_elo([(1200, 0)], 1200, 0)
    assert survivors[0] > 1200
    assert loser < 1200
    # Drain math: survivor gain × 0.95 ≈ loser loss
    assert (1200 - loser) == round((survivors[0] - 1200) * 0.95)


def test_partie_elo_three_player_equal():
    """3p equal: each survivor gains the same, loser bleeds for both."""
    from app.services.elo import compute_partie_elo

    survivors, loser = compute_partie_elo([(1200, 0), (1200, 0)], 1200, 0)
    assert survivors[0] == survivors[1]
    assert (1200 - loser) > (survivors[0] - 1200)  # loser bleeds more than any one survivor


def test_partie_elo_bigger_field_punishes_loser_more():
    """5p loss > 2p loss for the same loser. More survivors = more pain."""
    from app.services.elo import compute_partie_elo

    _, loser_5p = compute_partie_elo([(1200, 0)] * 4, 1200, 0)
    _, loser_2p = compute_partie_elo([(1200, 0)], 1200, 0)
    assert (1200 - loser_5p) > (1200 - loser_2p)


def test_partie_elo_k_factor_smaller_for_established():
    """K=24 for ≥30 parties, K=32 for new players → smaller deltas for veterans."""
    from app.services.elo import compute_partie_elo

    # Same matchup, different parties_played → smaller gain for veteran
    new_survivors, _ = compute_partie_elo([(1200, 0)], 1200, 0)
    veteran_survivors, _ = compute_partie_elo([(1200, 100)], 1200, 0)
    assert (veteran_survivors[0] - 1200) < (new_survivors[0] - 1200)


def test_partie_elo_higher_rated_survivor_gains_less():
    """Standard ELO: stronger player surviving against weaker loser gains little."""
    from app.services.elo import compute_partie_elo

    # 1500 survivor vs 1100 loser — strong vs weak, expected outcome.
    survivors, _ = compute_partie_elo([(1500, 0)], 1100, 0)
    # 1200 survivor vs 1100 loser — closer, less expected.
    survivors_closer, _ = compute_partie_elo([(1200, 0)], 1100, 0)
    assert (survivors[0] - 1500) < (survivors_closer[0] - 1200)


def test_partie_elo_floor_enforced():
    """Loser's ELO never drops below ELO_FLOOR."""
    from app.services.elo import ELO_FLOOR, compute_partie_elo

    _, loser = compute_partie_elo([(2500, 0)] * 4, ELO_FLOOR + 5, 50)
    assert loser >= ELO_FLOOR


def test_partie_elo_empty_survivors_no_change():
    """Edge case: no survivors → loser unchanged (defensive)."""
    from app.services.elo import compute_partie_elo

    survivors, loser = compute_partie_elo([], 1200, 0)
    assert survivors == []
    assert loser == 1200
