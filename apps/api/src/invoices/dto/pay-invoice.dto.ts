import { IsEnum } from 'class-validator';
import { PaymentMethod } from '../../generated/enums';

export class PayInvoiceDto {
  @IsEnum(PaymentMethod, { message: 'Hình thức thanh toán không hợp lệ' })
  paymentMethod!: PaymentMethod;
}
