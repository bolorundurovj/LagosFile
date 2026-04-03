"""
Deadline proximity utility.

Computes the number of days remaining until the March 31 filing deadline
for a given Year of Assessment (YOA).

The deadline is March 31 of the year AFTER the filing year:
  filing_year=2025 → deadline=2026-03-31

Requirements: 15.1, 15.4
"""

from datetime import date


def days_until_deadline(current_date: date, filing_year: int) -> int | None:
    """Return days remaining until the March 31 filing deadline.

    The deadline is March 31 of (filing_year + 1).

    Args:
        current_date: The date to measure from.
        filing_year: The Year of Assessment (e.g. 2025).

    Returns:
        - ``None`` if the deadline is more than 45 days away.
        - The number of days remaining (>= 1) if within 45 days of the deadline.
        - ``0`` if the deadline has already passed (current_date >= deadline).

    Requirements: 15.1, 15.4
    """
    deadline = date(filing_year + 1, 3, 31)

    if current_date >= deadline:
        return 0

    days_remaining = (deadline - current_date).days

    if days_remaining > 45:
        return None

    return days_remaining
