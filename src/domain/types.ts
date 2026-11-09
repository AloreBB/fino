export type MovementKind = 'ingreso' | 'egreso';
export type Parte = '1ra' | '2da' | 'Completo';

export interface Movement {
  id: string; quincenaId: string; kind: MovementKind;
  amountCents: number; amountExpr: string | null; description: string;
  pocket: string | null; parte: Parte | null;
  transactionDate: string | null; // YYYY-MM-DD
  paid: boolean; position: number;
}
export interface Month { id: string; name: string; year: number | null; monthNumber: number | null; isTemplate: boolean; position: number }
export interface Quincena { id: string; monthId: string; number: 1 | 2; date: string | null; note: string | null }
export interface Pocket { name: string; active: boolean; position: number }
export interface QuincenaTotals { ingresos: number; egresos: number; pagado: number; saldoActual: number; meQuedo: number }
export interface ScenarioRow { cents: number | null; description: string }
export interface ScenarioData {
  salaryCents: number; realSalaryCents: number;
  allocations: { label: string; pctBp: number; quincenalLabelBp: number }[]; // basis points; exactly 3
  basics: ScenarioRow[]; savings: ScenarioRow[];
  gastos: ScenarioRow[]; ayudas: ScenarioRow[]; // empty when the sheet lacks them
  note: string | null;
}
export interface Scenario { id: string; name: string; position: number; data: ScenarioData }
export interface BackupV1 { version: 1; exportedAt: string; months: Month[]; quincenas: Quincena[]; movements: Movement[]; pockets: Pocket[]; scenarios: Scenario[] }
