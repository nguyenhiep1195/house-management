export interface MeterReadingHistoryRow {
  id: number;
  roomId: number;
  year: number;
  month: number;
  electricityReading: number;
  waterReading: number;
  changedByName: string | null;
  changedAt: string;
}
