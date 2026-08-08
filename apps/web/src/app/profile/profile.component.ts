import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';
import { ButtonComponent } from '../shared/ui/button.component';
import { IconComponent } from '../shared/ui/icon.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { EntityAvatarComponent } from '../shared/ui/entity-avatar.component';
import { resizeImage, imageExtension } from '../shared/ui/image.util';
import { SupabaseService } from '../core/supabase.service';
import { ProfileService } from './profile.service';

@Component({
  selector: 'app-profile',
  imports: [
    ReactiveFormsModule,
    PageLayoutComponent,
    ButtonComponent,
    IconComponent,
    FormFieldComponent,
    EntityAvatarComponent,
  ],
  template: `
    <app-page title="My profile" subtitle="Your name and photo as your team sees them.">
      @if (error()) {
        <div role="alert" class="alert alert-error mb-3 text-sm">
          <app-icon name="heroExclamationTriangle" />
          <span>{{ error() }}</span>
        </div>
      }
      @if (notice()) {
        <div role="status" class="alert alert-success mb-3 text-sm">
          <app-icon name="heroCheckCircle" />
          <span>{{ notice() }}</span>
        </div>
      }

      <div class="card bg-base-100 max-w-lg">
        <div class="card-body p-4">
          <div class="flex items-center gap-4">
            <app-entity-avatar
              size="lg"
              [firstName]="displayName.value"
              [imageUrl]="photoPreview() ?? avatarUrl()"
            />
            <div class="flex flex-col gap-2">
              <input
                #photoInput
                type="file"
                accept="image/*"
                class="hidden"
                (change)="onPhotoSelected($any($event.target).files?.[0])"
              />
              <button
                appButton
                variant="outline"
                size="sm"
                type="button"
                [disabled]="busy()"
                (click)="photoInput.click()"
              >
                <app-icon name="heroCamera" />
                {{ avatarUrl() || photoPreview() ? 'Change photo' : 'Add photo' }}
              </button>
              @if (avatarUrl() || photoPreview()) {
                <button
                  appButton
                  variant="ghost"
                  size="sm"
                  type="button"
                  class="text-error"
                  [disabled]="busy()"
                  (click)="removePhoto()"
                >
                  Remove photo
                </button>
              }
            </div>
          </div>
          @if (photoPreview()) {
            <p class="type-caption mt-2">New photo — save to apply it.</p>
          }

          <form (submit)="$event.preventDefault(); save()" class="mt-4 flex flex-col gap-3">
            <app-form-field label="Display name" [required]="true">
              <input
                type="text"
                class="input input-bordered input-sm w-full"
                maxlength="120"
                placeholder="e.g. Amina Wanjiku"
                [formControl]="displayName"
              />
            </app-form-field>
            <div>
              <button
                appButton
                type="submit"
                size="sm"
                [loading]="busy()"
                [disabled]="busy() || (!dirty() && !photoDirty())"
              >
                Save profile
              </button>
            </div>
          </form>
        </div>
      </div>
    </app-page>
  `,
})
export class ProfileComponent implements OnInit {
  private readonly profile = inject(ProfileService);
  private readonly supabase = inject(SupabaseService);

  protected readonly displayName = new FormControl('', { nonNullable: true });
  protected readonly avatarPath = signal<string | null>(null);
  protected readonly photoPreview = signal<string | null>(null);
  private readonly pendingPhoto = signal<{ blob: Blob; ext: string } | null>(null);
  // FormControl values aren't reactive — mirror into signals so `dirty` recomputes.
  private readonly nameValue = toSignal(this.displayName.valueChanges, {
    initialValue: this.displayName.value,
  });
  private readonly savedName = signal('');

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected readonly avatarUrl = computed(() => this.profile.avatarUrl(this.avatarPath()));
  protected readonly dirty = computed(() => this.nameValue().trim() !== this.savedName());
  protected readonly photoDirty = computed(() => this.pendingPhoto() !== null);

  async ngOnInit(): Promise<void> {
    try {
      const me = await this.profile.myProfile();
      if (me) {
        this.displayName.setValue(me.display_name);
        this.savedName.set(me.display_name);
        this.avatarPath.set(me.avatar_path);
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load profile');
    }
  }

  protected async onPhotoSelected(file: File | undefined): Promise<void> {
    if (!file) return;
    this.error.set(null);
    try {
      const blob = await resizeImage(file, 400);
      this.revokePreview();
      this.pendingPhoto.set({ blob, ext: imageExtension(file) });
      this.photoPreview.set(URL.createObjectURL(blob));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Could not read that image');
    }
  }

  protected async removePhoto(): Promise<void> {
    this.pendingPhoto.set(null);
    this.revokePreview();
    const path = this.avatarPath();
    if (!path) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.profile.updateMyProfile({ avatarPath: '' });
      // Best-effort: the profile no longer references the file, so a storage
      // failure only leaves a harmless orphan, not inconsistent state.
      await this.profile.removeAvatar(path).catch(() => {});
      this.avatarPath.set(null);
      this.notice.set('Photo removed');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Remove failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async save(): Promise<void> {
    const name = this.displayName.value.trim();
    if (!name) {
      this.error.set('Enter your name');
      return;
    }
    const companyId = this.supabase.offlineIdentity()?.companyId;
    if (!companyId) {
      this.error.set('No company session — reload and try again');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const photo = this.pendingPhoto();
      if (photo) {
        const previousPath = this.avatarPath();
        const path = await this.profile.uploadAvatar(companyId, photo.blob, photo.ext);
        try {
          await this.profile.updateMyProfile({ displayName: name, avatarPath: path });
        } catch (err) {
          // Best-effort: don't orphan the just-uploaded object if the RPC failed.
          await this.profile.removeAvatar(path).catch(() => {});
          throw err;
        }
        if (previousPath) await this.profile.removeAvatar(previousPath);
        this.avatarPath.set(path);
        this.pendingPhoto.set(null);
        this.revokePreview();
      } else {
        await this.profile.updateMyProfile({ displayName: name });
      }
      this.savedName.set(name);
      this.notice.set('Profile saved');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Save failed');
    } finally {
      this.busy.set(false);
    }
  }

  private revokePreview(): void {
    const url = this.photoPreview();
    if (url) URL.revokeObjectURL(url);
    this.photoPreview.set(null);
  }
}
