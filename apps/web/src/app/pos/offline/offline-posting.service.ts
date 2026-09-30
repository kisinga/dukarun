import { ServerClockService } from '../../core/server-clock.service';
import { Injectable, inject } from '@angular/core';
import type { Json } from '@dukarun/shared-types';
import { SupabaseService } from '../../core/supabase.service';
import { PosRpcError } from '../pos.service';
import {
  parseOfflineResult,
  type OfflineRequest,
  type OfflineReview,
  type OfflineReviewSummary,
} from './offline-contract';

@Injectable({ providedIn: 'root' })
export class OfflinePostingService {
  private readonly clock = inject(ServerClockService);
  private readonly supabase = inject(SupabaseService);

  async submit(request: OfflineRequest) {
    const { data, error } = await this.supabase.client.rpc('submit_offline_sale', {
      p_request: request as unknown as Json,
    });
    if (error) throw new PosRpcError(error.message, error.code ?? '');
    return parseOfflineResult(data);
  }

  async list(): Promise<OfflineReviewSummary[]> {
    const { data, error } = await this.supabase.client.rpc('list_offline_sale_reviews');
    if (error) throw new Error(error.message);
    if (!Array.isArray(data)) throw new Error('Could not load held sales.');
    return data as unknown as OfflineReviewSummary[];
  }

  async review(
    id: string,
    destination?: string,
    proposed?: OfflineRequest
  ): Promise<OfflineReview> {
    const { data, error } = await this.supabase.client.rpc('get_offline_sale_review', {
      p_request_id: id,
      p_destination_session_id: destination,
      p_proposed: proposed as unknown as Json | undefined,
    });
    if (error) throw new Error(error.message);
    const review = data as unknown as OfflineReview;
    this.clock.observe(review.server_time);
    return review;
  }

  async confirm(
    review: OfflineReview,
    key: string,
    reason: string,
    crossover: boolean,
    cash?: { included_amount: number; closing_count_id?: string; reason: string }
  ) {
    const destination = review.destination_session?.id;
    if (!destination) throw new Error('Select an open destination session.');
    const { data, error } = await this.supabase.client.rpc('confirm_offline_sale_review', {
      p_request_id: review.request_id,
      p_confirmation_key: key,
      p_review_fingerprint: review.review_fingerprint,
      p_destination_session_id: destination,
      p_reason: reason,
      p_proposed: review.proposed_request as unknown as Json,
      p_confirm_crossover: crossover,
      p_cash_resolution: cash as unknown as Json | undefined,
    });
    if (error) throw new Error(error.message);
    return parseOfflineResult(data);
  }

  async cancel(id: string, reason: string, paymentResolution: Json) {
    const { data, error } = await this.supabase.client.rpc('cancel_offline_sale', {
      p_request_id: id,
      p_reason: reason,
      p_payment_resolution: paymentResolution,
    });
    if (error) throw new Error(error.message);
    return parseOfflineResult(data);
  }
}
