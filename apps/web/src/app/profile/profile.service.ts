import { Injectable, inject, signal } from '@angular/core';
import type { Database } from '@dukarun/shared-types';
import { environment } from '../../environments/environment';
import { SupabaseService } from '../core/supabase.service';
import { rpcError } from '../pos/pos.service';

export type StaffProfile = Database['public']['Tables']['company_staff_profiles']['Row'];

/** Self-service profile: the signed-in member's own display name + avatar. */
@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly supabase = inject(SupabaseService);

  /** Cached own profile so the shell can render name/photo without refetching. */
  readonly me = signal<StaffProfile | null>(null);

  private get db() {
    return this.supabase.client;
  }

  /** Load (and cache) the own staff-profile row, or null when none exists yet. */
  async myProfile(): Promise<StaffProfile | null> {
    const userId = this.supabase.session()?.user.id;
    if (!userId) return null;
    const { data, error } = await this.db
      .from('company_staff_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    this.me.set(data);
    return data;
  }

  /** null leaves a field unchanged; '' clears the avatar. Errors are P0001 — display verbatim. */
  async updateMyProfile(changes: { displayName?: string; avatarPath?: string }): Promise<string> {
    const { data, error } = await this.db.rpc('update_my_profile', {
      ...(changes.displayName !== undefined ? { p_display_name: changes.displayName } : {}),
      ...(changes.avatarPath !== undefined ? { p_avatar_path: changes.avatarPath } : {}),
    });
    if (error) throw rpcError(error);
    // Keep the shell avatar/name in sync with the saved profile.
    await this.myProfile().catch(() => null);
    return data;
  }

  // --- Avatars (bucket: staff-avatars, public) ---

  /** Public URL for a stored avatar path. */
  avatarUrl(path: string | null | undefined): string | null {
    if (!path) return null;
    return `${environment.supabaseUrl}/storage/v1/object/public/staff-avatars/${path}`;
  }

  /**
   * Upload under the mandatory <company_id>/ prefix (storage policies allow
   * writes only under the caller's company). Returns the storage PATH.
   */
  async uploadAvatar(companyId: string, blob: Blob, ext: string): Promise<string> {
    const path = `${companyId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await this.db.storage.from('staff-avatars').upload(path, blob, {
      contentType: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg',
      upsert: false,
    });
    if (error) throw new Error(error.message);
    return path;
  }

  async removeAvatar(path: string): Promise<void> {
    const { error } = await this.db.storage.from('staff-avatars').remove([path]);
    if (error) throw new Error(error.message);
  }
}
