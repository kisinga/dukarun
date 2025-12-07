import { RequestContext } from '@vendure/core';
import { ActionCategory } from '../types/action-category.enum';
import { ChannelActionType } from '../types/action-type.enum';
import { ActionConfig, ActionResult, ChannelEvent } from '../types/channel-event.interface';

/**
 * Channel Action Handler Interface
 *
 * All action handlers must implement this interface to ensure consistent behavior.
 *
 * Handler Pattern:
 * - System events: Use `targetUserId` to identify the user (typically channel admin)
 * - Customer events: Use `targetCustomerId` to identify the customer
 * - Explicit data: `event.data` can contain explicit values (e.g., `phoneNumber`) that override entity lookups
 *
 * Implementation Guidelines:
 * 1. `canHandle()` should check for required identifiers (targetUserId, targetCustomerId, or explicit data)
 *    - Do NOT check for resolved data (e.g., don't check if phone number exists in User entity)
 *    - Check for identifiers that indicate data CAN be resolved
 * 2. `execute()` should fetch required data from the identifier
 *    - If `targetUserId` is set, fetch User entity and extract data (e.g., phone from user.identifier)
 *    - If `targetCustomerId` is set, fetch Customer entity and extract data (e.g., phone from customer.phoneNumber)
 *    - If explicit data is in `event.data`, use it (highest priority)
 * 3. `canHandle()` and `execute()` must be aligned
 *    - If `canHandle()` returns true, `execute()` must be able to resolve required data
 *    - Use centralized utilities (e.g., PhoneNumberResolver) to ensure consistency
 */
export interface IChannelActionHandler {
  /**
   * The action type this handler handles
   */
  type: ChannelActionType;

  /**
   * The category this handler belongs to
   */
  category: ActionCategory;

  /**
   * Execute the action
   *
   * @param ctx Request context
   * @param event Channel event (may have targetUserId or targetCustomerId set)
   * @param config Action configuration
   * @returns ActionResult indicating success/failure
   */
  execute(ctx: RequestContext, event: ChannelEvent, config: ActionConfig): Promise<ActionResult>;

  /**
   * Check if this handler can handle the given event
   *
   * This is a lightweight check that should only verify identifiers are present,
   * not that data can be resolved (that's execute()'s responsibility).
   *
   * Examples:
   * - SMS handler: Check for targetUserId OR targetCustomerId OR event.data?.phoneNumber
   * - Push handler: Check for targetUserId
   * - In-app handler: Can always handle (returns true)
   *
   * @param event Channel event
   * @returns true if handler can potentially handle this event
   */
  canHandle(event: ChannelEvent): boolean;
}
