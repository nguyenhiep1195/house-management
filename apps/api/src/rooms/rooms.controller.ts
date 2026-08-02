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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user';
import { BulkUpdateReadingsDto } from './dto/bulk-update-readings.dto';
import { CreateRoomDto } from './dto/create-room.dto';
import { PeriodQueryDto } from './dto/period-query.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { RoomsService } from './rooms.service';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get()
  findAll() {
    return this.roomsService.findAll();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateRoomDto) {
    return this.roomsService.create(dto);
  }

  // MUST be declared before ':id' routes
  @Patch('meter-readings')
  bulkUpdateReadings(
    @Body() dto: BulkUpdateReadingsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.roomsService.bulkUpdateReadings(dto, user);
  }

  // MUST stay above ':id' routes — otherwise Nest matches 'meter-readings'
  // as an :id and ParseIntPipe rejects it.
  @Get('meter-readings')
  findPeriodReadings(@Query() query: PeriodQueryDto) {
    return this.roomsService.findPeriodReadings(query.year, query.month);
  }

  @Get(':id/meter-readings/history')
  getReadingHistory(@Param('id', ParseIntPipe) id: number) {
    return this.roomsService.getReadingHistory(id);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.roomsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRoomDto) {
    return this.roomsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.roomsService.remove(id);
  }
}
