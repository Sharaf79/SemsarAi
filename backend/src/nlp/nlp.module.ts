import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { NlpService } from './nlp.service';

@Module({
  imports: [HttpModule],
  providers: [NlpService],
  exports: [NlpService],
})
export class NlpModule {}
