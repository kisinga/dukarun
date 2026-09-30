import { describe, expect, it } from 'vitest';
import { ServerClock } from './server-clock';

describe('canonical server clock', () => {
  const server = Date.parse('2026-09-29T20:59:59Z');
  function setup() {
    let wall = Date.parse('2020-01-01');
    let elapsed = 0;
    const clock = new ServerClock(
      () => wall,
      () => elapsed
    );
    return {
      clock,
      advance(ms: number) {
        wall += ms;
        elapsed += ms;
      },
      changeClock(ms: number) {
        wall += ms;
      },
      reload: () =>
        new ServerClock(
          () => wall,
          () => elapsed
        ),
    };
  }
  it('shares calibrated time across midnight despite an incorrect device date', () => {
    const s = setup();
    expect(s.clock.now()).toBeNull();
    s.clock.observe(new Date(server).toISOString());
    s.advance(1500);
    expect(s.clock.now()).toBe(server + 1500);
  });
  it('does not rewind when a slower response arrives', () => {
    const s = setup();
    s.clock.observe(new Date(server).toISOString());
    s.advance(2000);
    s.clock.observe(new Date(server - 1000).toISOString());
    expect(s.clock.now()).toBe(server + 2000);
  });
  it('invalidates suspicious device-clock changes until the next server response', () => {
    const s = setup();
    s.clock.observe(new Date(server).toISOString());
    s.changeClock(-60000);
    expect(s.clock.now()).toBeNull();
    s.clock.observe(new Date(server + 1000).toISOString());
    expect(s.clock.now()).toBe(server + 1000);
  });
  it('restores elapsed time after reload without renewing an offline expiry', () => {
    const s = setup();
    s.clock.observe(new Date(server).toISOString());
    const snapshot = s.clock.snapshot();
    s.advance(23 * 3600000);
    const reloaded = s.reload();
    reloaded.restore(snapshot);
    expect(reloaded.now()).toBe(server + 23 * 3600000);
    s.advance(3600000);
    expect(reloaded.now()).toBe(server + 24 * 3600000);
    const expired = s.reload();
    expired.restore(snapshot);
    expect(expired.now()).toBeNull();
  });
  it('does not replace a current calibration with an older saved context', () => {
    const s = setup();
    s.clock.observe(new Date(server).toISOString());
    const snapshot = s.clock.snapshot();
    s.advance(500);
    s.clock.observe(new Date(server + 1000).toISOString());
    s.clock.restore(snapshot);
    expect(s.clock.now()).toBe(server + 1000);
  });
});
