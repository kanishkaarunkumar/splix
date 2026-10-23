from app.domain.errors import DomainError
from app.domain.splits import Share, equal_split, exact_split, percentage_split, weighted_split


def test_equal_split():
    assert equal_split(100, ["c", "a", "b"]) == [Share("a", 34), Share("b", 33), Share("c", 33)]


def test_percentage_conserves():
    assert (
        sum(x.amount_paise for x in percentage_split(100, [("a", 3333), ("b", 3333), ("c", 3334)]))
        == 100
    )


def test_exact_rejects_wrong_total():
    try:
        exact_split(100, [Share("a", 99)])
    except DomainError:
        return
    assert False


def test_weighted_split_conserves_and_is_deterministic():
    result = weighted_split(100, [("c", 1), ("a", 2), ("b", 1)])
    assert result == [Share("a", 50), Share("b", 25), Share("c", 25)]
