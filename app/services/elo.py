K = 32
START_ELO = 1200
ELO_FLOOR = 100


def expected(a: int, b: int) -> float:
    return 1 / (1 + 10 ** ((b - a) / 400))


def updated_elo(player_elo: int, opponent_elos: list[int], won: bool) -> int:
    if not opponent_elos:
        return player_elo
    score = 1.0 if won else 0.0
    avg_expected = sum(expected(player_elo, opp) for opp in opponent_elos) / len(opponent_elos)
    delta = round(K * (score - avg_expected))
    return max(ELO_FLOOR, player_elo + delta)
