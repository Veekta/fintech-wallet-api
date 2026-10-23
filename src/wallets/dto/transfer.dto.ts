import { IsString, IsUUID, Matches } from 'class-validator';

export class TransferDto {
  @IsUUID()
  destinationWalletId!: string;

  @IsString()
  @Matches(/^(?=.*[1-9])(?:0|[1-9]\d{0,16})(?:\.\d{1,2})?$/, {
    message:
      'amount must be a positive monetary amount with up to 17 integer digits and 2 decimal places',
  })
  amount!: string;
}
