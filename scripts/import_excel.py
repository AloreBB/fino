#!/usr/bin/env python3
"""One-shot importer: Seguimientos_2026.xlsx -> fino-historial.json + expected.json.

Reads the workbook twice (formulas and cached values) and converts every
quincena table, the template and the 3 distribution scenarios into a BackupV1
file the app restores with its normal restore path. Also writes expected.json
with the sheet's own cached totals so tests/golden.test.ts can compare every
quincena and scenario exactly, in cents.

Usage: python -I scripts/import_excel.py .private/Seguimientos_2026.xlsx .private/

Both outputs stay inside the private dir: they hold real figures and are never
committed. IDs are deterministic so re-running on the same workbook gives the
same file.
"""

import datetime
import json
import re
import sys
from pathlib import Path

import openpyxl
from openpyxl.utils import range_boundaries

MONTH_SHEETS = [
    ("Enero", 1), ("Febrero", 2), ("Marzo", 3), ("Abril", 4), ("Mayo", 5),
    ("Junio", 6), ("Julio", 7), ("Agosto", 8), ("Septiembre", 9), ("Octubre", 10),
]
TEMPLATE_SHEET = "Plantilla"
SCENARIO_SHEETS = ["Distribucion", "Distribucion con ayuda papá ", "Backup distribución"]
YEAR = 2026
VALID_PARTES = {"1ra", "2da", "Completo"}

report_no_amount = 0  # descriptions kept with amount 0


def header_key(value):
    """Column header normalized the way the sheet writes it ('\\nDescripción Ingreso')."""
    if value is None:
        return ""
    return str(value).strip().split("\n")[-1].strip()


def cell_text(cell):
    v = cell.value
    return "" if v is None else str(v).strip()


def cached_number(cell):
    v = cell.value
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return v
    return None


def cents(value):
    """Pesos (cached float) -> integer cents. Halves like 11418.5 stay exact."""
    if value is None:
        return None
    return int(round(float(value) * 100))


def parse_amount(formula_cell, value_cell):
    """Returns (cents_or_None, expr_or_None). Formula text is kept without '='."""
    raw = formula_cell.value
    if isinstance(raw, str) and raw.startswith("="):
        expr = raw[1:]
        if re.match(r"(?i)^\s*(SUM|SUBTOTAL)\s*\(", expr):
            return None, None  # totals-row formula: not a movement
        return cents(cached_number(value_cell)), expr
    return cents(cached_number(value_cell)), None


def iso_date(value):
    if value is None:
        return None
    if isinstance(value, (datetime.datetime, datetime.date)):
        return value.isoformat()[:10] if isinstance(value, datetime.datetime) else value.isoformat()
    text = str(value).strip()
    return text or None


def quincena_date(ws_values, table_min_col, header_row):
    """The date 4 columns right of the 'Fecha' label above the table."""
    for r in range(1, header_row):
        if cell_text(ws_values.cell(r, table_min_col)) == "Fecha":
            return iso_date(ws_values.cell(r, table_min_col + 4).value)
    return None


def totals_below_ingresos(ws_values, table_min_col, header_row):
    """Cached values of the 5 totals in the row below the 'Ingresos' header."""
    for r in range(1, header_row):
        if cell_text(ws_values.cell(r, table_min_col + 1)) == "Ingresos":
            return [cents(cached_number(ws_values.cell(r + 1, table_min_col + 1 + i))) or 0 for i in range(5)]
    return None


def below_table_note(ws_values, min_col, max_col, bottom_row, max_row):
    """Non-empty cells below a table (e.g. Octubre M48:M51) become its note."""
    parts = []
    for r in range(bottom_row + 1, max_row + 1):
        for c in range(min_col, max_col + 1):
            v = ws_values.cell(r, c).value
            if v is None or (isinstance(v, str) and not v.strip()):
                continue
            if isinstance(v, (datetime.datetime, datetime.date)):
                shown = iso_date(v)
            elif isinstance(v, float) and v.is_integer():
                shown = str(int(v))
            else:
                shown = str(v).strip()
            parts.append(f"{ws_values.cell(r, c).coordinate}: {shown}")
    return "; ".join(parts) or None


def import_table(ws_form, ws_values, ref, quincena_id, start_pos, pocket_seen):
    """Converts one quincena table into movements. Returns (movements, next_pos)."""
    global report_no_amount
    min_c, min_r, max_c, max_r = range_boundaries(ref)
    headers = [header_key(ws_form.cell(min_r, c).value) for c in range(min_c, max_c + 1)]

    def col(name):
        return headers.index(name) if name in headers else None

    c_ing, c_ing_d = col("Ingreso"), col("Descripción Ingreso")
    c_egr, c_egr_d = col("Egreso"), col("Descripcion Egreso")
    c_bol, c_par = col("Bolsillo"), col("Parte")
    c_tx, c_est = col("Fecha de transacción"), col("Estado")

    last = max_r
    if last > min_r + 1:
        edge = [ws_form.cell(last, c).value for c in range(min_c, max_c + 1)]
        if any(isinstance(x, str) and re.match(r"(?i)^=\s*(SUM|SUBTOTAL)\s*\(", x) for x in edge if x):
            last -= 1  # the table's totals row is not a movement

    movements = []
    pos = start_pos
    for r in range(min_r + 1, last + 1):
        get = lambda c: ws_form.cell(r, min_c + c) if c is not None else None  # noqa: E731
        getv = lambda c: ws_values.cell(r, min_c + c) if c is not None else None  # noqa: E731
        ing_amt, ing_expr = parse_amount(get(c_ing), getv(c_ing)) if c_ing is not None else (None, None)
        egr_amt, egr_expr = parse_amount(get(c_egr), getv(c_egr)) if c_egr is not None else (None, None)
        ing_d = cell_text(get(c_ing_d)) if c_ing_d is not None else ""
        egr_d = cell_text(get(c_egr_d)) if c_egr_d is not None else ""
        pocket = cell_text(get(c_bol)) if c_bol is not None else ""
        pocket = pocket or None
        if pocket:
            pocket_seen.append(pocket)
        parte_raw = cell_text(get(c_par)) if c_par is not None else ""
        parte = parte_raw if parte_raw in VALID_PARTES else None
        tx = iso_date(getv(c_tx).value) if c_tx is not None and getv(c_tx) is not None else None
        paid = getv(c_est).value is True if c_est is not None and getv(c_est) is not None else False

        row_idx = r - min_r - 1
        if ing_amt is not None or ing_d:
            if ing_amt is None:
                report_no_amount += 1
            movements.append({
                "id": f"mv-{pos:06d}", "quincenaId": quincena_id, "kind": "ingreso",
                "amountCents": ing_amt if ing_amt is not None else 0,
                "amountExpr": ing_expr, "description": ing_d,
                "pocket": None, "parte": None, "transactionDate": None,
                "paid": False, "position": row_idx * 2,
            })
            pos += 1
        if egr_amt is not None or egr_d:
            if egr_amt is None:
                report_no_amount += 1
            movements.append({
                "id": f"mv-{pos:06d}", "quincenaId": quincena_id, "kind": "egreso",
                "amountCents": egr_amt if egr_amt is not None else 0,
                "amountExpr": egr_expr, "description": egr_d,
                "pocket": pocket, "parte": parte, "transactionDate": tx,
                "paid": paid, "position": row_idx * 2 + 1,
            })
            pos += 1
    return movements, pos


def scenario_block(ws_form, ws_values, amount_col, desc_col, header_row, first_row):
    """Amount+description rows until the totals formula or a fully empty tail."""
    rows = []
    r = first_row
    while True:
        amount_cell = ws_form.cell(r, amount_col)
        raw = amount_cell.value
        if isinstance(raw, str) and raw.startswith("="):
            break  # totals row
        desc = cell_text(ws_form.cell(r, desc_col))
        amt, _ = parse_amount(amount_cell, ws_values.cell(r, amount_col))
        if amt is None and not desc:
            if r > first_row + 12:
                break
            r += 1
            continue
        rows.append({"cents": amt, "description": desc})
        r += 1
        if r > first_row + 40:
            break
    return rows


def import_scenario(ws_form, ws_values, name, slug):
    salary = cents(cached_number(ws_values["B3"])) or 0
    real_salary = cents(cached_number(ws_values["B6"])) or 0
    labels = [cell_text(ws_form[f"D{i}"]) for i in (3, 4, 5)]
    pcts = [cached_number(ws_values[f"C{i}"]) or 0 for i in (3, 4, 5)]
    qlabels = [cached_number(ws_values[f"E{i}"]) or 0 for i in (10, 11, 12)]
    basics = scenario_block(ws_form, ws_values, 3, 4, 18, 19)    # C:D
    savings = scenario_block(ws_form, ws_values, 9, 10, 18, 19)  # I:J

    gastos, ayudas = [], []
    gastos_at = ayudas_at = None
    for r in range(28, 70):
        if cell_text(ws_form.cell(r, 1)).startswith("Gastos"):
            gastos_at = r + 1
        if cell_text(ws_form.cell(r, 3)) == "Ayudas":
            ayudas_at = r + 1
    if gastos_at:
        gastos = scenario_block(ws_form, ws_values, 2, 1, gastos_at - 1, gastos_at)
    if ayudas_at:
        ayudas = scenario_block(ws_form, ws_values, 4, 3, ayudas_at - 1, ayudas_at)

    necesito = None
    for r in range(40, 70):
        if cell_text(ws_form.cell(r, 2)).startswith("Necesito"):
            necesito = cents(cached_number(ws_values.cell(r, 3)))
    note_parts = []
    for cell in ("G3", "G4", "G5", "G6"):
        v = ws_values[cell].value
        if v is None or (isinstance(v, str) and not v.strip()):
            continue
        note_parts.append(f"{cell}: {v if not isinstance(v, float) or not v.is_integer() else int(v)}")

    data = {
        "salaryCents": salary, "realSalaryCents": real_salary,
        "allocations": [
            {"label": labels[i], "pctBp": int(round(pcts[i] * 10000)),
             "quincenalLabelBp": int(round(qlabels[i] * 10000))} for i in range(3)],
        "basics": basics, "savings": savings,
        "gastos": gastos, "ayudas": ayudas,
        "note": "; ".join(note_parts) or None,
    }
    expected = {
        "monthly": [cents(cached_number(ws_values[f"C{i}"])) or 0 for i in (10, 11, 12)],
        "quincenal": [cents(cached_number(ws_values[f"F{i}"])) or 0 for i in (10, 11, 12)],
        "basicsMonthlyTotal": cents(cached_number(ws_values["C26"])) or 0,
        "basicsQuincenalTotal": cents(cached_number(ws_values["F26"])) or 0,
        "savingsTotal": cents(cached_number(ws_values["I22"])) or 0,
        "meQueda": cents(cached_number(ws_values["F27"])) or 0,
        "necesito": necesito or 0,
    }
    return {"id": f"s-{slug}", "name": name.strip(), "position": 0, "data": data}, expected


def latest_pocket_list(wb_form):
    """The pocket dropdown of the latest sheet: the quoted-list validation
    that applies to a table's Bolsillo column (no pocket names hardcoded)."""
    for name in ["Octubre", "Plantilla", "Septiembre"]:
        ws = wb_form[name]
        bolsillo_cols = set()
        for t in ws.tables.values():
            t_min_c, t_min_r, t_max_c, _ = range_boundaries(t.ref)
            headers = [header_key(ws.cell(t_min_r, c).value) for c in range(t_min_c, t_max_c + 1)]
            if "Bolsillo" in headers:
                bolsillo_cols.add(t_min_c + headers.index("Bolsillo"))
        for dv in ws.data_validations.dataValidation:
            formula = dv.formula1 or ""
            if not (formula.startswith('"') and "," in formula):
                continue
            cols = {c for r in dv.sqref.ranges for c in range(r.min_col, r.max_col + 1)}
            if cols & bolsillo_cols:
                items = [i.strip() for i in formula.strip().strip('"').split(",") if i.strip()]
                if len(items) >= 2:
                    return items
    return []


def main(xlsx, out_dir):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    wb_form = openpyxl.load_workbook(xlsx, data_only=False)
    wb_val = openpyxl.load_workbook(xlsx, data_only=True)

    months, quincenas, movements = [], [], []
    expected_quincenas = {}
    pocket_seen = []
    pos = 1
    n_quincenas = 0

    sheets = [(name, num, False) for name, num in MONTH_SHEETS] + [(TEMPLATE_SHEET, None, True)]
    for sheet_i, (name, num, is_template) in enumerate(sheets):
        ws_form, ws_val = wb_form[name], wb_val[name]
        tables = sorted(ws_form.tables.values(), key=lambda t: range_boundaries(t.ref)[0])
        mid = f"m-{'template' if is_template else f'{num:02d}'}"
        months.append({
            "id": mid, "name": name, "year": None if is_template else YEAR,
            "monthNumber": None if is_template else num,
            "isTemplate": is_template, "position": sheet_i,
        })
        for qi, table in enumerate(tables, start=1):
            min_c, min_r, max_c, max_r = range_boundaries(table.ref)
            qid = f"q-{'template' if is_template else f'{num:02d}'}-{qi}"
            quincenas.append({
                "id": qid, "monthId": mid, "number": qi,
                "date": quincena_date(ws_val, min_c, min_r),
                "note": below_table_note(ws_val, min_c, max_c, max_r, ws_val.max_row),
            })
            n_quincenas += 0 if is_template else 1
            got, pos = import_table(ws_form, ws_val, table.ref, qid, pos, pocket_seen)
            movements.extend(got)
            totals = totals_below_ingresos(ws_val, min_c, min_r)
            if totals and not is_template:
                keys = ["ingresos", "egresos", "pagado", "saldoActual", "meQuedo"]
                expected_quincenas[qid] = dict(zip(keys, totals))

    latest = latest_pocket_list(wb_form)
    pockets = [{"name": n, "active": True, "position": i} for i, n in enumerate(latest)]
    for p in dict.fromkeys(pocket_seen):
        if p not in latest:
            pockets.append({"name": p, "active": False, "position": len(pockets)})

    scenarios, expected_scenarios = [], {}
    for i, sname in enumerate(SCENARIO_SHEETS):
        slug = ["distribucion", "distribucion-ayuda", "backup-distribucion"][i]
        s, exp = import_scenario(wb_form[sname], wb_val[sname], sname, slug)
        s["position"] = i
        scenarios.append(s)
        expected_scenarios[s["name"]] = exp

    historial = {
        "version": 1, "exportedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "months": months, "quincenas": quincenas, "movements": movements,
        "pockets": pockets, "scenarios": scenarios,
    }
    (out / "fino-historial.json").write_text(json.dumps(historial, ensure_ascii=False, indent=1), encoding="utf-8")
    (out / "expected.json").write_text(json.dumps(
        {"quincenas": expected_quincenas, "scenarios": expected_scenarios},
        ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"months={len(months) - 1} template=1 quincenas={n_quincenas} "
          f"scenarios={len(scenarios)} movements={len(movements)} "
          f"description_without_amount={report_no_amount} pockets={pockets and len(pockets)}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(f"usage: {sys.argv[0]} Seguimientos_2026.xlsx out_dir")
    main(sys.argv[1], sys.argv[2])
