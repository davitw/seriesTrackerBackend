import { IsString, MinLength } from 'class-validator';

export class RefreshDto {
  @IsString()
  @MinLength(1, { message: 'Informe a credencial de renovação.' })
  refreshToken!: string;
}
