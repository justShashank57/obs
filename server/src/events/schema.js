/**
 * Shared internal event format used by every widget, regardless of source platform.
 * Widgets should ONLY ever consume objects shaped like this — never raw Twitch/YouTube payloads.
 *
 * {
 *   id: string,                // unique id, used for React keys / de-dupe
 *   type: 'follow'|'sub'|'giftsub'|'cheer'|'donation'|'raid'|'superchat'|'membership'|'like'|'chat',
 *   platform: 'twitch'|'youtube'|'system',
 *   username: string,
 *   amount?: number,           // bits, dollars, gifted-sub count, raid viewer count, etc.
 *   currency?: string,         // for donations/superchats
 *   tier?: string,             // sub tier ('1000'|'2000'|'3000') or membership level name
 *   months?: number,           // cumulative months subbed/member (resubs)
 *   message?: string,          // cheer message, superchat message, chat text, donation note
 *   avatar?: string,           // optional avatar URL
 *   timestamp: number          // ms epoch
 * }
 */

let counter = 0;
export function makeEvent(partial) {
  counter += 1;
  return {
    id: `${Date.now()}-${counter}`,
    timestamp: Date.now(),
    ...partial,
  };
}

export const EVENT_TYPES = [
  'follow',
  'sub',
  'giftsub',
  'cheer',
  'donation',
  'raid',
  'superchat',
  'membership',
  'like',
  'chat',
];
