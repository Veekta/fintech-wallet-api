import {
  Controller,
  Get,
  Query,
  UseGuards,
  Param,
  Patch,
  Body,
  Req,
} from '@nestjs/common';
import { AdminService } from './admin.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';

import type { Request } from 'express';

interface AuthenticatedRequest extends Request {
  user: {
    sub: string;
    role: string;
  };
}

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  getUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('role') role?: string,
    @Query('status') status?: string,
  ) {
    return this.adminService.getUsers({
      page: page === undefined ? undefined : Number(page),
      limit: limit === undefined ? undefined : Number(limit),
      search,
      role,
      status,
    });
  }

  @Get('users/:id')
  getUserById(@Param('id') id: string) {
    return this.adminService.findUserById(id);
  }

  @Patch('users/:id/status')
  updateUserStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.adminService.updateUserStatus(id, status, request.user.sub);
  }

  @Get('transactions')
  getTransactions(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.adminService.getTransactions({
      page: page === undefined ? undefined : Number(page),
      limit: limit === undefined ? undefined : Number(limit),
      type,
      status,
      startDate,
      endDate,
    });
  }
}
