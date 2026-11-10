import { Injectable } from '@nestjs/common';

/** Server time source. Official attendance time comes from here, never from the client (DS2 §2.7.6). */
@Injectable()
export class ClockService {
  now(): Date {
    return new Date();
  }
}
