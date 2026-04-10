import { IsUUID, IsNotEmpty, IsIn } from 'class-validator';
import type { NegotiationAction } from '../negotiation.types';

const VALID_ACTIONS: NegotiationAction[] = ['accept', 'reject', 'request_counter'];

export class HandleActionDto {
  @IsNotEmpty({ message: 'negotiationId is required' })
  @IsUUID('4', { message: 'negotiationId must be a valid UUID v4' })
  readonly negotiationId: string;

  @IsNotEmpty({ message: 'action is required' })
  @IsIn(VALID_ACTIONS, {
    message: `action must be one of: ${VALID_ACTIONS.join(', ')}`,
  })
  readonly action: NegotiationAction;
}

/** @deprecated Use HandleActionDto instead */
export { HandleActionDto as NegotiationActionDto };
