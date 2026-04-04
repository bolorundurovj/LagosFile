from datetime import date


def days_until_deadline(current_date: date, filing_year: int) -> int | None:
    deadline = date(filing_year + 1, 3, 31)
    if current_date >= deadline:
        return 0
    days_remaining = (deadline - current_date).days
    if days_remaining > 45:
        return None
    return days_remaining
