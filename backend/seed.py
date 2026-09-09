from datetime import date

from .models import Setup


SEED_SETUPS = [
    Setup(symbol="NVDA", setup="Breakout", source="Momentum leaders", thesis="Price cleared the base with volume while relative strength stayed near the high.", planned_risk=2.0, created_at=date(2026, 9, 8), status="open"),
    Setup(symbol="CRWD", setup="Pullback", source="Earnings watchlist", thesis="The first pullback held the breakout area after a strong earnings reaction.", planned_risk=1.5, created_at=date(2026, 9, 5), status="open"),
    Setup(symbol="SHOP", setup="Base breakout", source="Weekly review", thesis="A six week base tightened near resistance and volume started returning.", planned_risk=1.8, created_at=date(2026, 8, 29), status="open"),
    Setup(symbol="PLTR", setup="Trend continuation", source="Momentum leaders", thesis="The stock held above the short term average after an orderly three day pause.", planned_risk=2.0, created_at=date(2026, 8, 20), status="closed", return_pct=6.4, followed_plan=True, outcome_note="The continuation worked and I exited into strength according to the plan."),
    Setup(symbol="META", setup="Earnings gap", source="Earnings watchlist", thesis="The gap held through the first session with strong institutional volume.", planned_risk=1.5, created_at=date(2026, 8, 14), status="closed", return_pct=3.1, followed_plan=True, outcome_note="The position moved slowly but never broke the planned invalidation level."),
    Setup(symbol="TSLA", setup="Range breakout", source="Social feed", thesis="Price pushed out of a short range after several high volume sessions.", planned_risk=1.0, created_at=date(2026, 8, 9), status="closed", return_pct=-2.2, followed_plan=False, outcome_note="I entered late and widened the stop after the setup failed."),
    Setup(symbol="AMD", setup="Support reclaim", source="Weekly review", thesis="Price reclaimed the prior support zone while the broader group improved.", planned_risk=1.5, created_at=date(2026, 7, 30), status="closed", return_pct=4.8, followed_plan=True, outcome_note="The reclaim held and the trade reached the planned target."),
    Setup(symbol="SNOW", setup="Breakdown reversal", source="Social feed", thesis="A failed breakdown returned above support, but volume confirmation was weak.", planned_risk=1.0, created_at=date(2026, 7, 22), status="closed", return_pct=-3.4, followed_plan=True, outcome_note="The reversal failed the next day and the stop was respected."),
]


def fresh_seed_setups() -> list[Setup]:
    return [
        Setup(
            symbol=item.symbol,
            setup=item.setup,
            source=item.source,
            thesis=item.thesis,
            planned_risk=item.planned_risk,
            created_at=item.created_at,
            status=item.status,
            return_pct=item.return_pct,
            followed_plan=item.followed_plan,
            outcome_note=item.outcome_note,
        )
        for item in SEED_SETUPS
    ]
