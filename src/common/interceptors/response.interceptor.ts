import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface ServiceResult<T> {
  data?: T;
  message?: string;
  pagination?: PaginationMeta;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
  pagination?: PaginationMeta;
}

@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((result) => {
        const typed = result as ServiceResult<T>;
        const response: ApiResponse<T> = {
          success: true,
          data: typed?.data !== undefined ? typed.data : result,
          message: typed?.message ?? 'Success',
        };
        if (typed?.pagination) {
          response.pagination = typed.pagination;
        }
        return response;
      }),
    );
  }
}
