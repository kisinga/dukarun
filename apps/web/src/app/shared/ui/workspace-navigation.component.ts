import { Component, computed, inject, input } from '@angular/core';
import { WorkspaceKey, WorkspaceNavigationService } from '../../core/workspace-navigation.service';
import { RouteNavigationComponent } from './route-navigation.component';

@Component({
  selector: 'app-workspace-navigation',
  imports: [RouteNavigationComponent],
  template: ` <app-route-navigation [items]="items()" [label]="label()" /> `,
})
export class WorkspaceNavigationComponent {
  private readonly navigationService = inject(WorkspaceNavigationService);

  readonly workspace = input.required<WorkspaceKey>();
  readonly label = input.required<string>();
  protected readonly items = computed(() => this.navigationService.items(this.workspace()));
}
