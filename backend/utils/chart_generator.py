"""
Chart Generator Utility
Generates PNG chart images for sending via WhatsApp.
Uses matplotlib with dark theme to match the Cortex Brasil brand.
"""
import logging
import tempfile
import os

logger = logging.getLogger(__name__)


def generate_expense_pie_chart(categories: dict[str, float], title: str = "Gastos por Categoria") -> str:
    """
    Generates a pie chart of expenses by category.
    Returns the file path of the generated PNG.
    """
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt

        # Dark theme matching Cortex Brasil brand
        plt.style.use('dark_background')
        fig, ax = plt.subplots(figsize=(8, 6))
        fig.patch.set_facecolor('#18181b')

        labels = list(categories.keys())
        sizes = list(categories.values())
        colors = [
            '#8b5cf6', '#10b981', '#f43f5e', '#f59e0b',
            '#06b6d4', '#ec4899', '#84cc16', '#6366f1',
            '#14b8a6', '#a855f7',
        ]

        wedges, texts, autotexts = ax.pie(
            sizes, labels=labels, autopct='%1.1f%%',
            colors=colors[:len(labels)],
            textprops={'color': '#ffffff', 'fontsize': 10},
            pctdistance=0.8, startangle=90,
        )

        for autotext in autotexts:
            autotext.set_fontsize(9)
            autotext.set_color('#e4e4e7')

        ax.set_title(title, color='#ffffff', fontsize=14, fontweight='bold', pad=20)

        filepath = os.path.join(tempfile.gettempdir(), 'cortex_pie_chart.png')
        fig.savefig(filepath, dpi=150, bbox_inches='tight', facecolor='#18181b')
        plt.close(fig)

        logger.info(f"Pie chart generated: {filepath}")
        return filepath
    except ImportError:
        logger.error("matplotlib not installed")
        return ""


def generate_balance_projection_chart(
    projections: list[dict],
    scenario_projections: list[dict] = None,
    title: str = "Projeção de Saldo"
) -> str:
    """
    Generates a line chart with balance projections.
    Optionally overlays a what-if scenario line.
    Returns the file path of the generated PNG.
    """
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt

        plt.style.use('dark_background')
        fig, ax = plt.subplots(figsize=(10, 5))
        fig.patch.set_facecolor('#18181b')
        ax.set_facecolor('#232326')

        months = [p["month"] for p in projections]
        balances = [p.get("projected_balance", p.get("balance", 0)) for p in projections]

        ax.plot(months, balances, color='#10b981', linewidth=2, marker='o', markersize=5, label='Projeção Normal')
        ax.fill_between(months, balances, alpha=0.1, color='#10b981')

        if scenario_projections:
            scenario_balances = [p["balance"] for p in scenario_projections]
            ax.plot(months[:len(scenario_balances)], scenario_balances, color='#f43f5e', linewidth=2, marker='s', markersize=5, linestyle='--', label='Com Compra')
            ax.fill_between(months[:len(scenario_balances)], scenario_balances, alpha=0.1, color='#f43f5e')

        ax.axhline(y=0, color='#3f3f46', linewidth=1, linestyle='-')
        ax.set_title(title, color='#ffffff', fontsize=14, fontweight='bold')
        ax.set_ylabel('R$', color='#a1a1aa')
        ax.tick_params(colors='#a1a1aa')
        ax.grid(axis='y', alpha=0.15, color='#3f3f46')
        ax.legend(facecolor='#232326', edgecolor='#3f3f46')

        plt.xticks(rotation=45)

        filepath = os.path.join(tempfile.gettempdir(), 'cortex_projection.png')
        fig.savefig(filepath, dpi=150, bbox_inches='tight', facecolor='#18181b')
        plt.close(fig)

        logger.info(f"Projection chart generated: {filepath}")
        return filepath
    except ImportError:
        logger.error("matplotlib not installed")
        return ""


def generate_net_worth_evolution(history: list[dict], title: str = "Evolução do Patrimônio") -> str:
    """
    Generates a line chart showing net worth evolution over time.
    """
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt

        plt.style.use('dark_background')
        fig, ax = plt.subplots(figsize=(10, 5))
        fig.patch.set_facecolor('#18181b')
        ax.set_facecolor('#232326')

        dates = [h["date"] for h in history]
        values = [h["net_worth"] for h in history]

        ax.plot(dates, values, color='#8b5cf6', linewidth=2.5, marker='o', markersize=4)
        ax.fill_between(dates, values, alpha=0.15, color='#8b5cf6')

        ax.set_title(title, color='#ffffff', fontsize=14, fontweight='bold')
        ax.set_ylabel('R$', color='#a1a1aa')
        ax.tick_params(colors='#a1a1aa')
        ax.grid(axis='y', alpha=0.15, color='#3f3f46')

        plt.xticks(rotation=45)

        filepath = os.path.join(tempfile.gettempdir(), 'cortex_net_worth.png')
        fig.savefig(filepath, dpi=150, bbox_inches='tight', facecolor='#18181b')
        plt.close(fig)

        logger.info(f"Net worth chart generated: {filepath}")
        return filepath
    except ImportError:
        logger.error("matplotlib not installed")
        return ""
