import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { GenerateInvoicesDto } from './dto/generate-invoices.dto';
import { PayInvoiceDto } from './dto/pay-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { InvoicesService } from './invoices.service';

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  findAll(
    @Query('year', new ParseIntPipe({ optional: true })) year?: number,
    @Query('month', new ParseIntPipe({ optional: true })) month?: number,
    @Query('roomId', new ParseIntPipe({ optional: true })) roomId?: number,
  ) {
    return this.invoicesService.findAll({ year, month, roomId });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateInvoiceDto) {
    return this.invoicesService.create(dto);
  }

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  generate(@Body() dto: GenerateInvoicesDto) {
    return this.invoicesService.generateForMonth(dto.month, dto.year);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInvoiceDto,
  ) {
    return this.invoicesService.update(id, dto);
  }

  @Patch(':id/pay')
  pay(@Param('id', ParseIntPipe) id: number, @Body() dto: PayInvoiceDto) {
    return this.invoicesService.pay(id, dto);
  }

  @Patch(':id/unpay')
  unpay(@Param('id', ParseIntPipe) id: number) {
    return this.invoicesService.unpay(id);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.invoicesService.remove(id);
  }
}
