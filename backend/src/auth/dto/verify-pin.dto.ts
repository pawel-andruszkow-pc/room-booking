import { IsIn, IsString, Matches } from 'class-validator';
import { PinScope } from '../../common/require-pin.decorator';

export class VerifyPinDto {
  @IsString()
  @Matches(/^\d{4}$/, { message: 'pin must be exactly 4 digits' })
  pin: string;

  @IsIn(['settings', 'admin'])
  scope: PinScope;
}
