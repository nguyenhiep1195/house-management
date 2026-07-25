export interface DashboardTrendPoint {
  year: number;
  month: number;
  electricityConsumption: number;
  waterConsumption: number;
  revenue: number;
}

export interface DashboardStats {
  period: { year: number; month: number };
  rooms: {
    total: number;
    available: number;
    occupied: number;
    maintenance: number;
  };
  occupants: number;
  motorbikes: number;
  utilities: { electricityConsumption: number; waterConsumption: number };
  invoices: { paid: number; unpaid: number; total: number; revenue: number };
  trend: DashboardTrendPoint[];
}
