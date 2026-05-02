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
