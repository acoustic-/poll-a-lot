import { GaugeRingComponent } from './gauge-ring.component';

describe('GaugeRingComponent', () => {
  const circumference = 2 * Math.PI * 17;

  it('derives dashArray from progress', () => {
    const component = new GaugeRingComponent();
    component.progress = 0.5;
    const [arc, total] = component.dashArray.split(' ').map(Number);
    expect(arc).toBeCloseTo(circumference * 0.5, 5);
    expect(total).toBeCloseTo(circumference, 5);
  });

  it('clamps progress above 1 down to a full ring', () => {
    const component = new GaugeRingComponent();
    component.progress = 1.4;
    expect(component.progress).toBe(1);
    const [arc] = component.dashArray.split(' ').map(Number);
    expect(arc).toBeCloseTo(circumference, 5);
  });

  it('clamps negative progress up to 0', () => {
    const component = new GaugeRingComponent();
    component.progress = -0.2;
    expect(component.progress).toBe(0);
    const [arc] = component.dashArray.split(' ').map(Number);
    expect(arc).toBeCloseTo(0, 5);
  });

  it('falls back to 0 for a non-finite progress value rather than propagating NaN into dashArray', () => {
    const component = new GaugeRingComponent();
    component.progress = NaN;
    expect(component.progress).toBe(0);
    expect(component.dashArray).not.toContain('NaN');
  });

  // Regression: a 0-length dash with a round linecap still paints a
  // full-diameter dot (the caps meet with nothing between them), which
  // visibly orbits the ring during the wipe-in animation.
  it('uses a butt linecap at progress 0, and round once there is a visible arc', () => {
    const component = new GaugeRingComponent();
    component.progress = 0;
    expect(component.strokeLinecap).toBe('butt');

    component.progress = 0.01;
    expect(component.strokeLinecap).toBe('round');
  });
});
