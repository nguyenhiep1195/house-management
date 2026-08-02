// Per-room meter reading state for one billing period, as the readings dialog
// needs it: what the baseline is, whether this period has been entered yet, and
// whether it may still be edited.
export interface RoomPeriodReading {
  roomId: number;
  roomName: string;
  prevElectricity: number;
  prevWater: number;
  electricityReading: number | null;
  waterReading: number | null;
  recorded: boolean;
  editable: boolean;
  lockReason: string | null;
}
