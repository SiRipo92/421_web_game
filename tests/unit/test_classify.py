import pytest

from app.game.logic import classify


def test_421():
    name, rank, fiches = classify([4, 2, 1])
    assert name == "421"
    assert fiches == 8
    assert rank == 4000


def test_421_any_order():
    assert classify([1, 4, 2]) == classify([4, 2, 1])
    assert classify([2, 1, 4]) == classify([4, 2, 1])


def test_triple_ones():
    name, rank, fiches = classify([1, 1, 1])
    assert name == "111"
    assert fiches == 7


def test_triple_sixes():
    name, rank, fiches = classify([6, 6, 6])
    assert name == "666"
    assert fiches == 6


def test_triple_value_equals_fiches():
    for v in range(2, 7):
        _, _, fiches = classify([v, v, v])
        assert fiches == v


def test_triple_rank_ordering():
    _, rank_2, _ = classify([2, 2, 2])
    _, rank_6, _ = classify([6, 6, 6])
    _, rank_1, _ = classify([1, 1, 1])
    assert rank_1 > rank_6 > rank_2


def test_double_one_accroche():
    name, rank, fiches = classify([6, 1, 1])
    assert name == "116"
    assert fiches == 6


def test_double_one_with_two():
    name, rank, fiches = classify([2, 1, 1])
    assert name == "112"
    assert fiches == 2


def test_nenette():
    name, rank, fiches = classify([2, 2, 1])
    assert name == "nénette"
    assert fiches == 1


def test_basic_figure_one_fiche():
    _, _, fiches = classify([6, 6, 1])
    assert fiches == 1


def test_plain_combination_zero_fiches():
    _, _, fiches = classify([6, 5, 3])
    assert fiches == 0


def test_421_beats_all():
    _, rank_421, _ = classify([4, 2, 1])
    for a in range(1, 7):
        for b in range(1, 7):
            for c in range(1, 7):
                dice = [a, b, c]
                if sorted(dice, reverse=True) != [4, 2, 1]:
                    _, other_rank, _ = classify(dice)
                    assert rank_421 > other_rank, f"421 must beat {dice}"


def test_zeros_return_empty():
    name, rank, fiches = classify([0, 0, 0])
    assert name == ""
    assert rank == 0
    assert fiches == 0


@pytest.mark.parametrize(
    "dice,expected_fiches",
    [
        ([4, 2, 1], 8),
        ([1, 1, 1], 7),
        ([6, 6, 6], 6),
        ([5, 5, 5], 5),
        ([1, 1, 6], 6),
        ([2, 2, 1], 1),
        ([6, 5, 4], 0),
    ],
)
def test_fiches_parametrized(dice, expected_fiches):
    _, _, fiches = classify(dice)
    assert fiches == expected_fiches
